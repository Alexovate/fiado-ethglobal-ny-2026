import express, { type Request, type Response } from "express";
import { config } from "./config.js";
import { verifyProof, type WorldProof } from "./world.js";
import { evaluate, type PolicyInput } from "./policy.js";
import { signOpenLine, backendSignerAddress } from "./signing.js";
import * as arc from "./arc.js";
import * as requests from "./requests.js";
import { mandateDigest, escalationDigest } from "./digests.js";
import { signRequest } from "@worldcoin/idkit-server";
import type { Address, Hex } from "viem";
import {
  markVerified,
  hasOutstanding,
  getOutstanding,
  getHuman,
  getTotalOutstanding,
  settleHuman,
  recordRequest,
} from "./store.js";

const app = express();
app.use(express.json());

// JSON cannot serialize bigint — render as decimal strings.
function json(res: Response, body: unknown, status = 200) {
  res.status(status).type("application/json").send(
    JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
}

const startedAt = Date.now();
const mandateExpiresAt = startedAt + config.mandate.ttlHours * 3600 * 1000;

app.get("/health", (_req, res) => {
  json(res, { ok: true, demoMockMode: config.demoMockMode, startedAt });
});

// 0) RP signature for World ID 4.0 IDKit requests (signed with the RP signer key).
app.post("/rp-signature", (req: Request, res: Response) => {
  if (!config.world.signerPrivateKey) return json(res, { error: "WORLD_SIGNER_PRIVATE_KEY not set" }, 500);
  const action = (req.body?.action as string) || config.world.actionId;
  try {
    const r = signRequest({ signingKeyHex: config.world.signerPrivateKey, action });
    json(res, {
      rp_id: config.world.rpId,
      nonce: r.nonce,
      created_at: r.createdAt,
      expires_at: r.expiresAt,
      sig: r.sig,
      signature: r.sig,
    });
  } catch (e) {
    json(res, { error: String((e as Error).message) }, 500);
  }
});

// Customer standing after verification: creditworthiness + any pending question.
app.get("/customer/status", (req: Request, res: Response) => {
  const nullifier = String(req.query.nullifier ?? "");
  const human = getHuman(nullifier);
  const open = requests.latestOpenForHuman(nullifier);
  const reputationTier = human && human.reputation > 0n ? "Established" : "New customer";
  const outstanding = getOutstanding(nullifier);
  // One open tab at a time: no available credit while a balance is owed.
  const available = outstanding > 0n ? 0n : config.creditLimitDisplay;
  json(res, {
    verified: Boolean(human),
    reputationTier,
    creditLimitDisplay: config.creditLimitDisplay,
    outstandingDisplay: outstanding,
    availableDisplay: available,
    openRequestId: open?.id ?? null,
    openQuestion: open?.questions.find((q) => q.answer === undefined)?.text ?? null,
  });
});

// Operator marks a customer's tab repaid: clears the balance (frees credit) and
// repays on-chain via the relayer so the contract reputation reflects it.
app.post("/repay", async (req: Request, res: Response) => {
  const nullifierHash = String(req.body?.nullifierHash ?? "");
  const requestId = req.body?.requestId ? String(req.body.requestId) : null;
  if (!nullifierHash) return json(res, { error: "nullifierHash required" }, 400);
  if (!getHuman(nullifierHash)) {
    return json(res, { error: "human not verified — cannot repay unknown nullifier" }, 403);
  }
  const repaidDisplay = settleHuman(nullifierHash); // immediate off-chain settlement
  if (requestId) requests.markRepaid(requestId); // flip the card to "repaid" right away
  let hash: string | null = null;
  try {
    const lineId = await arc.humanToLine(nullifierHash as Hex);
    if (repaidDisplay > 0n && lineId && lineId !== `0x${"0".repeat(64)}`) {
      hash = await arc.repay(lineId, arc.toOnChain(repaidDisplay));
    }
  } catch {
    /* on-chain repay is best-effort; the off-chain balance is already cleared */
  }
  json(res, { ok: true, repaidDisplay, hash });
});

// 1) World ID proof -> verified human, one line per human enforced downstream.
app.post("/verify", async (req: Request, res: Response) => {
  const proof = req.body?.proof as WorldProof | undefined;
  if (!proof || typeof proof !== "object") return json(res, { error: "missing proof" }, 400);

  const result = await verifyProof(proof, req.body?.signal);
  console.log(
    `[verify] mode=${result.mode} ok=${result.ok} nullifier=${result.nullifierHash?.slice(0, 14)}…` +
      (result.detail ? ` detail=${result.detail}` : ""),
  );
  if (!result.ok) return json(res, { ...result }, 401);
  if (!result.nullifierHash) return json(res, { error: "verified proof did not include a nullifier" }, 400);

  markVerified(result.nullifierHash);
  json(res, {
    ok: true,
    nullifierHash: result.nullifierHash,
    mode: result.mode,
    hasActiveLine: hasOutstanding(result.nullifierHash),
  });
});

// 2) Backend authorization (signature) to open the on-chain credit line.
app.post("/credit/authorize", async (req: Request, res: Response) => {
  const { nullifierHash, customer, maxAmount, expiresAt } = req.body ?? {};
  if (!nullifierHash || !customer || !maxAmount) {
    return json(res, { error: "nullifierHash, customer, maxAmount required" }, 400);
  }
  const human = getHuman(nullifierHash);
  if (!human) return json(res, { error: "human not verified" }, 403);
  if (hasOutstanding(nullifierHash)) {
    return json(res, { error: "active credit line already exists for this human" }, 409);
  }

  const exp = BigInt(expiresAt ?? Math.floor(Date.now() / 1000) + 30 * 24 * 3600);
  try {
    const auth = await signOpenLine({
      nullifierHash,
      customer,
      maxAmount: BigInt(maxAmount),
      expiresAt: exp,
    });
    json(res, auth);
  } catch (e) {
    json(res, { error: String((e as Error).message) }, 500);
  }
});

// 3) Disbursement decision: AUTO (inside mandate) vs ESCALATE (needs Ledger).
app.post("/credit/quote", (req: Request, res: Response) => {
  const { nullifierHash, amount, merchantRegistered } = req.body ?? {};
  if (!nullifierHash || amount === undefined) {
    return json(res, { error: "nullifierHash and amount required" }, 400);
  }
  const human = getHuman(nullifierHash);
  if (!human) return json(res, { error: "human not verified — complete World ID first" }, 403);

  const now = Date.now();
  const timestamps = recordRequest(nullifierHash, now);
  const recent = timestamps.filter((t) => now - t <= config.velocityWindowMs).length;

  const input: PolicyInput = {
    amount: BigInt(amount),
    maxPerTx: config.mandate.maxPerTx,
    maxTotalOutstanding: config.mandate.maxTotalOutstanding,
    totalOutstanding: getTotalOutstanding(),
    merchantRegistered: merchantRegistered !== false,
    mandateExpired: now >= mandateExpiresAt,
    reputation: human?.reputation ?? 0n,
    recentRequestCount: recent,
    velocityMax: config.velocityMaxInWindow,
    confidenceThreshold: config.confidenceThreshold,
  };

  json(res, { ...evaluate(input), mandate: {
    maxPerTx: config.mandate.maxPerTx,
    maxTotalOutstanding: config.mandate.maxTotalOutstanding,
    expiresAt: Math.floor(mandateExpiresAt / 1000),
  } });
});

// --- Mandate: the human signs once on the Ledger to set the autonomy frame ---

// Returns the inner digest for the Ledger to sign + the on-chain values to submit.
app.post("/mandate/prepare", async (_req: Request, res: Response) => {
  try {
    const agent = arc.agentAddress();
    const nonce = await arc.mandateNonce();
    const onchain = {
      agent,
      maxPerTx: arc.toOnChain(config.mandate.maxPerTx),
      maxTotalOutstanding: arc.toOnChain(config.mandate.maxTotalOutstanding),
      expiresAt: BigInt(Math.floor(Date.now() / 1000) + config.mandate.ttlHours * 3600),
    };
    const digest = mandateDigest({ ...onchain, nonce });
    json(res, { digest, onchain });
  } catch (e) {
    json(res, { error: String((e as Error).message) }, 500);
  }
});

app.post("/mandate/submit", async (req: Request, res: Response) => {
  try {
    const { agent, maxPerTx, maxTotalOutstanding, expiresAt, signature } = req.body ?? {};
    const hash = await arc.setMandate({
      agent: agent as Address,
      maxPerTx: BigInt(maxPerTx),
      maxTotalOutstanding: BigInt(maxTotalOutstanding),
      expiresAt: BigInt(expiresAt),
      ledgerSignature: signature as Hex,
    });
    json(res, { ok: true, hash });
  } catch (e) {
    json(res, { error: String((e as Error).message) }, 500);
  }
});

// --- Open the on-chain credit line (backend signs, relayer submits) ---
app.post("/credit/open", async (req: Request, res: Response) => {
  try {
    const { nullifierHash, customer, displayMaxAmount, expiresAt } = req.body ?? {};
    // Moat: a line can only be opened for a human who passed World ID /verify.
    if (!getHuman(nullifierHash)) {
      return json(res, { error: "human not verified — complete World ID first" }, 403);
    }
    const existing = await arc.humanToLine(nullifierHash as Hex);
    if (existing && existing !== `0x${"0".repeat(64)}`) {
      return json(res, { ok: true, lineId: existing, reused: true });
    }
    const exp = BigInt(expiresAt ?? Math.floor(Date.now() / 1000) + 30 * 24 * 3600);
    const onChainMax = arc.toOnChain(BigInt(displayMaxAmount ?? 100_000_000));
    const auth = await signOpenLine({
      nullifierHash: nullifierHash as Hex,
      customer: customer as Address,
      maxAmount: onChainMax,
      expiresAt: exp,
    });
    const hash = await arc.openLine({
      nullifierHash: nullifierHash as Hex,
      customer: customer as Address,
      maxAmount: onChainMax,
      expiresAt: exp,
      backendSignature: auth.signature,
    });
    await arc.publicClient.waitForTransactionReceipt({ hash });
    const lineId = await arc.humanToLine(nullifierHash as Hex);
    json(res, { ok: true, lineId, hash });
  } catch (e) {
    json(res, { error: String((e as Error).message) }, 500);
  }
});

// --- On-chain state for the UI (scaled back to display units) ---
app.get("/onchain/state", async (req: Request, res: Response) => {
  try {
    const merchant = req.query.merchant as string;
    const [balance, outstanding] = await Promise.all([
      merchant ? arc.merchantBalance(merchant as Address) : Promise.resolve(0n),
      arc.totalOutstanding(),
    ]);
    json(res, {
      merchantBalanceDisplay: arc.toDisplay(balance),
      totalOutstandingDisplay: arc.toDisplay(outstanding),
    });
  } catch (e) {
    json(res, { error: String((e as Error).message) }, 500);
  }
});

// --- AUTO disbursement: agent submits, no human (inside the mandate) ---
app.post("/credit/disburse", async (req: Request, res: Response) => {
  try {
    const { lineId, merchant, displayAmount } = req.body ?? {};
    const hash = await arc.autoDisburse(
      lineId as Hex,
      merchant as Address,
      arc.toOnChain(BigInt(displayAmount)),
    );
    json(res, { ok: true, hash });
  } catch (e) {
    json(res, { error: String((e as Error).message) }, 500);
  }
});

// --- ESCALATION: human signs the payout on the Ledger, then agent submits ---
app.post("/credit/escalate/prepare", (req: Request, res: Response) => {
  try {
    const { lineId, merchant, displayAmount, nonce } = req.body ?? {};
    const onChainAmount = arc.toOnChain(BigInt(displayAmount));
    const digest = escalationDigest({
      lineId: lineId as Hex,
      merchant: merchant as Address,
      amount: onChainAmount,
      nonce: BigInt(nonce),
    });
    json(res, { digest, onChainAmount, nonce });
  } catch (e) {
    json(res, { error: String((e as Error).message) }, 500);
  }
});

app.post("/credit/escalate/submit", async (req: Request, res: Response) => {
  try {
    const { lineId, merchant, onChainAmount, nonce, signature, requestId } = req.body ?? {};
    const hash = await arc.approveAndDisburse(
      lineId as Hex,
      merchant as Address,
      BigInt(onChainAmount),
      BigInt(nonce),
      signature as Hex,
    );
    const request = requestId
      ? requests.markDisbursed(String(requestId), String(lineId), hash)
      : undefined;
    json(res, { ok: true, hash, request: request ?? null });
  } catch (e) {
    json(res, { error: String((e as Error).message) }, 500);
  }
});

// --- Conversational underwriting: the credit-request state machine ---

app.post("/request", async (req: Request, res: Response) => {
  const { nullifierHash, merchant, amountDisplay, purpose } = req.body ?? {};
  if (!nullifierHash || !merchant || amountDisplay === undefined) {
    return json(res, { error: "nullifierHash, merchant, amountDisplay required" }, 400);
  }
  if (!getHuman(nullifierHash)) {
    return json(res, { error: "human not verified — complete World ID first" }, 403);
  }
  const r = await requests.create({
    nullifierHash,
    merchant,
    amountDisplay: Number(amountDisplay),
    purpose: purpose ?? "",
  });
  json(res, r);
});

app.get("/requests", (_req: Request, res: Response) => {
  json(res, { requests: requests.list() });
});

app.get("/request/:id", (req: Request, res: Response) => {
  const r = requests.get(String(req.params.id));
  if (!r) return json(res, { error: "not found" }, 404);
  json(res, r);
});

app.post("/request/:id/answer", async (req: Request, res: Response) => {
  const { questionId, answer } = req.body ?? {};
  if (!questionId) return json(res, { error: "questionId required" }, 400);
  const r = await requests.answer(String(req.params.id), String(questionId), String(answer ?? ""));
  if (!r) return json(res, { error: "not found" }, 404);
  json(res, r);
});

app.post("/request/:id/ask", (req: Request, res: Response) => {
  const r = requests.ask(String(req.params.id), String(req.body?.text ?? ""));
  if (!r) return json(res, { error: "not found" }, 404);
  json(res, r);
});

app.post("/request/:id/decide", (req: Request, res: Response) => {
  const r = requests.decide(String(req.params.id), req.body?.decision === "approve" ? "approve" : "decline");
  if (!r) return json(res, { error: "not found" }, 404);
  json(res, r);
});

app.post("/request/:id/disbursed", (req: Request, res: Response) => {
  const { lineId, tx } = req.body ?? {};
  if (!lineId || !tx) return json(res, { error: "lineId and tx required" }, 400);
  const r = requests.markDisbursed(String(req.params.id), String(lineId), String(tx));
  if (!r) return json(res, { error: "not found" }, 404);
  json(res, r);
});

app.listen(config.port, () => {
  const signer = config.backendSignerPrivateKey ? backendSignerAddress() : "(unset)";
  console.log(`Fiado backend on :${config.port}  mock=${config.demoMockMode}  signer=${signer}`);
});
