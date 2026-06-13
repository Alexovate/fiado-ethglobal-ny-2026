import express, { type Request, type Response } from "express";
import { config } from "./config.js";
import { verifyProof, type WorldProof } from "./world.js";
import { evaluate, type PolicyInput } from "./policy.js";
import { signOpenLine, backendSignerAddress } from "./signing.js";
import {
  markVerified,
  hasActiveLine,
  getHuman,
  getTotalOutstanding,
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

// 1) World ID proof -> verified human, one line per human enforced downstream.
app.post("/verify", async (req: Request, res: Response) => {
  const proof = req.body?.proof as WorldProof | undefined;
  if (!proof?.nullifier_hash) return json(res, { error: "missing proof" }, 400);

  const result = await verifyProof(proof, req.body?.signal);
  if (!result.ok) return json(res, { ...result }, 401);

  markVerified(result.nullifierHash);
  json(res, {
    ok: true,
    nullifierHash: result.nullifierHash,
    mode: result.mode,
    hasActiveLine: hasActiveLine(result.nullifierHash),
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
  if (hasActiveLine(nullifierHash)) {
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

  const now = Date.now();
  const timestamps = recordRequest(nullifierHash, now);
  const recent = timestamps.filter((t) => now - t <= config.velocityWindowMs).length;
  const human = getHuman(nullifierHash);

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

app.listen(config.port, () => {
  const signer = config.backendSignerPrivateKey ? backendSignerAddress() : "(unset)";
  console.log(`Fiado backend on :${config.port}  mock=${config.demoMockMode}  signer=${signer}`);
});
