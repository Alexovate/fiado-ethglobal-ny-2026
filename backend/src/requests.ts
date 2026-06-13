// Credit-request state machine — the conversational underwriting loop.
// Not a chat: a shared request object both the customer and the human operator
// read and update. The agent may ask the borrower a clarifying question; if it
// still cannot clear the request, a human reviews everything (answers included),
// may ask one more question, then decides and approves on the Ledger.

import { config } from "./config.js";
import { evaluate as policyEvaluate } from "./policy.js";
import { getHuman, recordRequest } from "./store.js";
import { decideCredit, type CreditContext } from "./brain.js";

export type ReqStatus =
  | "need_info" // a question is open, waiting on the borrower
  | "auto_approved" // inside mandate, high confidence — agent can disburse
  | "escalated" // needs a human (operator) decision on the Ledger
  | "approved" // human approved — ready to disburse via escalation path
  | "declined"
  | "disbursed";

export interface Question {
  id: string;
  text: string;
  askedBy: "agent" | "human";
  answer?: string;
}

export interface CreditRequest {
  id: string;
  nullifierHash: string;
  merchant: string;
  amountDisplay: number; // USDC base units, 6 dec (display)
  purpose: string;
  status: ReqStatus;
  route: "AUTO" | "ESCALATE" | "NEED_INFO";
  confidence: number;
  reasonCodes: string[];
  escalationReasons: string[];
  questions: Question[];
  agentReasoning?: string; // the Claude agent's one-line rationale
  decidedBy?: "rule" | "agent"; // who made the call
  lineId?: string;
  tx?: string;
  createdAt: number;
}

const requests = new Map<string, CreditRequest>();
let seq = 0;
function rid(): string {
  return `req_${(++seq).toString(36)}_${Date.now().toString(36)}`;
}
function qid(): string {
  return `q_${(++seq).toString(36)}`;
}

/** Deterministic fallback (used if the Claude brain is unavailable). */
function deterministicDecision(r: CreditRequest): void {
  const intakeAnswered = r.questions.some((q) => q.askedBy === "agent" && !!q.answer);
  const human = getHuman(r.nullifierHash);
  const result = policyEvaluate({
    amount: BigInt(r.amountDisplay),
    maxPerTx: config.mandate.maxPerTx,
    maxTotalOutstanding: config.mandate.maxTotalOutstanding,
    totalOutstanding: 0n,
    merchantRegistered: true,
    mandateExpired: false,
    reputation: human?.reputation ?? 0n,
    recentRequestCount: 1,
    velocityMax: config.velocityMaxInWindow,
    confidenceThreshold: config.confidenceThreshold,
    intakeAnswered,
  });
  r.confidence = result.confidence;
  r.reasonCodes = result.reasonCodes;
  r.escalationReasons = result.escalationReasons;
  r.decidedBy = "rule";
  if (result.route === "AUTO") {
    r.route = "AUTO";
    r.status = "auto_approved";
  } else {
    r.route = "ESCALATE";
    r.status = "escalated";
  }
}

/**
 * Tiered decision:
 *   <= auto-grant threshold   -> grant (rule)
 *   >  per-tx cap             -> escalate to human + Ledger (rule)
 *   in between (gray zone)    -> the Claude agent reasons: grant / ask / escalate
 * The contract enforces the bounds, so the agent can only be stricter, never looser.
 */
async function evaluate(r: CreditRequest): Promise<void> {
  const open = r.questions.find((q) => q.answer === undefined);
  if (open) {
    r.status = "need_info";
    r.route = "NEED_INFO";
    return;
  }

  const amount = BigInt(r.amountDisplay);
  const human = getHuman(r.nullifierHash);

  // TIER 1 — tiny amounts auto-granted (one active line per human is on-chain).
  if (amount <= config.autoGrantThresholdDisplay) {
    r.route = "AUTO";
    r.status = "auto_approved";
    r.confidence = 0.99;
    r.reasonCodes = ["under auto-grant threshold — instant"];
    r.decidedBy = "rule";
    return;
  }
  // TIER 3 — over the per-tx cap always needs a human on the Ledger.
  if (amount > config.mandate.maxPerTx) {
    r.route = "ESCALATE";
    r.status = "escalated";
    r.confidence = 0.5;
    r.escalationReasons = ["OVER_TX_CAP"];
    r.reasonCodes = ["exceeds per-transaction cap"];
    r.decidedBy = "rule";
    return;
  }

  // TIER 2 — gray zone: the Claude agent decides.
  const answered = r.questions.find((q) => q.askedBy === "agent" && q.answer);
  const established = (human?.reputation ?? 0n) > 0n;
  const recent =
    (human?.requestTimestamps ?? []).filter((t) => Date.now() - t <= config.velocityWindowMs).length || 1;
  const ctx: CreditContext = {
    amountDisplay: r.amountDisplay,
    purpose: r.purpose,
    reputationTier: established ? "Established" : "New borrower",
    tabsRepaid: established ? "8 / 8" : "0 / 0",
    totalRepaidDisplay: Number(human?.reputation ?? 0n),
    outstandingDisplay: 0,
    priorMaxDisplay: established ? 45_000_000 : 0,
    defaultRate: established ? "0%" : "n/a",
    maxPerTxDisplay: Number(config.mandate.maxPerTx),
    recentRequests: recent,
    priorAnswer: answered?.answer,
  };

  const d = await decideCredit(ctx);
  if (!d) {
    deterministicDecision(r);
    return;
  }

  r.confidence = d.confidence;
  r.agentReasoning = d.reasoning;
  r.reasonCodes = d.reasoning ? [d.reasoning] : [];
  r.decidedBy = "agent";

  if (d.decision === "grant") {
    r.route = "AUTO";
    r.status = "auto_approved";
  } else if (d.decision === "decline") {
    r.route = "ESCALATE";
    r.status = "declined";
  } else if (d.decision === "ask" && !answered) {
    r.questions.push({
      id: qid(),
      text: d.question || "What are you buying, and when will you repay?",
      askedBy: "agent",
    });
    r.status = "need_info";
    r.route = "NEED_INFO";
  } else {
    // escalate (or "ask" again after already asking) -> hand to a human
    r.route = "ESCALATE";
    r.status = "escalated";
    r.escalationReasons = ["AGENT_ESCALATED"];
  }
}

export async function create(p: {
  nullifierHash: string;
  merchant: string;
  amountDisplay: number;
  purpose: string;
}): Promise<CreditRequest> {
  recordRequest(p.nullifierHash, Date.now()); // velocity signal for the agent
  const r: CreditRequest = {
    id: rid(),
    nullifierHash: p.nullifierHash,
    merchant: p.merchant,
    amountDisplay: p.amountDisplay,
    purpose: p.purpose,
    status: "need_info",
    route: "NEED_INFO",
    confidence: 0,
    reasonCodes: [],
    escalationReasons: [],
    questions: [],
    createdAt: Date.now(),
  };
  requests.set(r.id, r);
  await evaluate(r);
  return r;
}

export function get(id: string): CreditRequest | undefined {
  return requests.get(id);
}

/** All requests, newest first — for the live operator dashboard. */
export function list(): CreditRequest[] {
  return [...requests.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** The borrower's most recent request still waiting on an unanswered question. */
export function latestOpenForHuman(nullifierHash: string): CreditRequest | undefined {
  let found: CreditRequest | undefined;
  for (const r of requests.values()) {
    if (
      r.nullifierHash === nullifierHash &&
      r.status === "need_info" &&
      r.questions.some((q) => q.answer === undefined)
    ) {
      if (!found || r.createdAt > found.createdAt) found = r;
    }
  }
  return found;
}

export async function answer(
  id: string,
  questionId: string,
  text: string,
): Promise<CreditRequest | undefined> {
  const r = requests.get(id);
  if (!r) return undefined;
  const q = r.questions.find((x) => x.id === questionId);
  if (q) q.answer = text;
  await evaluate(r);
  return r;
}

/** Human operator poses an additional question to the borrower. */
export function ask(id: string, text: string): CreditRequest | undefined {
  const r = requests.get(id);
  if (!r) return undefined;
  r.questions.push({ id: qid(), text, askedBy: "human" });
  r.status = "need_info";
  r.route = "NEED_INFO";
  return r;
}

export function decide(id: string, decision: "approve" | "decline"): CreditRequest | undefined {
  const r = requests.get(id);
  if (!r) return undefined;
  r.status = decision === "approve" ? "approved" : "declined";
  return r;
}

export function markDisbursed(id: string, lineId: string, tx: string): void {
  const r = requests.get(id);
  if (!r) return;
  r.lineId = lineId;
  r.tx = tx;
  r.status = "disbursed";
}
