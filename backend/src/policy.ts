// Deterministic credit policy. The LLM/agent narrates this; it never widens it.
// The same bounds are enforced on-chain by CreditLine, so this can only be
// stricter than the contract, never looser.

export type Route = "AUTO" | "ESCALATE";

export type EscalationReason =
  | "OVER_TX_CAP"
  | "OVER_TOTAL_CAP"
  | "LOW_CONFIDENCE"
  | "NEW_MERCHANT"
  | "VELOCITY_ANOMALY"
  | "MANDATE_EXPIRED";

export interface PolicyInput {
  amount: bigint; // requested, USDC 6 decimals
  maxPerTx: bigint;
  maxTotalOutstanding: bigint;
  totalOutstanding: bigint;
  merchantRegistered: boolean;
  mandateExpired: boolean;
  reputation: bigint; // USDC 6 dec, cumulative repaid
  recentRequestCount: number; // within the velocity window
  velocityMax: number;
  confidenceThreshold: number;
  intakeAnswered?: boolean; // customer answered the agent's clarifying question
}

export interface PolicyResult {
  approvedAmount: bigint;
  confidence: number; // 0..1
  route: Route;
  reasonCodes: string[];
  escalationReasons: EscalationReason[];
}

// Legible, deterministic confidence: high when the ask is small relative to the
// per-tx cap, nudged up by proven repayment history. Tuned so the demo cases
// read cleanly (18.50 of 250 -> ~0.94; 1500 of 250 -> ~0.71).
export function computeConfidence(input: PolicyInput): number {
  const cap = input.maxPerTx > 0n ? input.maxPerTx : 1n;
  const ratio = Number(input.amount) / Number(cap);
  let c = 0.95 - 0.04 * ratio;

  if (input.reputation > 0n) c += 0.03; // repaid before
  if (input.intakeAnswered) c += 0.1; // gave a plausible answer to the agent's probe
  if (!input.merchantRegistered) c -= 0.25;

  return Math.max(0, Math.min(0.99, Number(c.toFixed(2))));
}

export function evaluate(input: PolicyInput): PolicyResult {
  const confidence = computeConfidence(input);
  const reasons: string[] = [];
  const escalations: EscalationReason[] = [];

  if (!input.merchantRegistered) {
    escalations.push("NEW_MERCHANT");
    reasons.push("merchant not registered");
  }
  if (input.mandateExpired) {
    escalations.push("MANDATE_EXPIRED");
    reasons.push("agent mandate expired");
  }
  if (input.amount > input.maxPerTx) {
    escalations.push("OVER_TX_CAP");
    reasons.push("amount exceeds per-transaction cap");
  }
  if (input.totalOutstanding + input.amount > input.maxTotalOutstanding) {
    escalations.push("OVER_TOTAL_CAP");
    reasons.push("would exceed total outstanding cap");
  }
  if (confidence < input.confidenceThreshold) {
    escalations.push("LOW_CONFIDENCE");
    reasons.push(`confidence ${confidence} below threshold ${input.confidenceThreshold}`);
  }
  if (input.recentRequestCount > input.velocityMax) {
    escalations.push("VELOCITY_ANOMALY");
    reasons.push("too many requests in the velocity window");
  }

  const route: Route = escalations.length === 0 ? "AUTO" : "ESCALATE";
  if (route === "AUTO") reasons.push("within mandate, high confidence");

  return {
    approvedAmount: input.amount,
    confidence,
    route,
    reasonCodes: reasons,
    escalationReasons: escalations,
  };
}
