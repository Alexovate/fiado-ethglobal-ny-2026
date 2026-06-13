// Credit-request state machine — the conversational underwriting loop.
// Not a chat: a shared request object both the customer and the human operator
// read and update. The agent may ask the borrower a clarifying question; if it
// still cannot clear the request, a human reviews everything (answers included),
// may ask one more question, then decides and approves on the Ledger.

import { config } from "./config.js";
import { evaluate as policyEvaluate } from "./policy.js";
import { getHuman } from "./store.js";

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

/** Core decision: question gate -> agent probe -> deterministic policy. */
function evaluate(r: CreditRequest): void {
  const open = r.questions.find((q) => q.answer === undefined);
  if (open) {
    r.status = "need_info";
    r.route = "NEED_INFO";
    return;
  }

  // Agent asks once, for amounts above the threshold, to probe fraud-vs-real.
  const agentAsked = r.questions.some((q) => q.askedBy === "agent");
  if (BigInt(r.amountDisplay) >= config.questionThresholdDisplay && !agentAsked) {
    r.questions.push({
      id: qid(),
      text: "What are you buying right now, and when do you expect to repay?",
      askedBy: "agent",
    });
    r.status = "need_info";
    r.route = "NEED_INFO";
    return;
  }

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
  if (result.route === "AUTO") {
    r.route = "AUTO";
    r.status = "auto_approved";
  } else {
    r.route = "ESCALATE";
    r.status = "escalated";
  }
}

export function create(p: {
  nullifierHash: string;
  merchant: string;
  amountDisplay: number;
  purpose: string;
}): CreditRequest {
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
  evaluate(r);
  return r;
}

export function get(id: string): CreditRequest | undefined {
  return requests.get(id);
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

export function answer(id: string, questionId: string, text: string): CreditRequest | undefined {
  const r = requests.get(id);
  if (!r) return undefined;
  const q = r.questions.find((x) => x.id === questionId);
  if (q) q.answer = text;
  evaluate(r);
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
