import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, computeConfidence, type PolicyInput } from "./policy.js";

const USDC = 1_000_000n;

function base(overrides: Partial<PolicyInput> = {}): PolicyInput {
  return {
    amount: 18_500_000n,
    maxPerTx: 250n * USDC,
    maxTotalOutstanding: 5_000n * USDC,
    totalOutstanding: 0n,
    merchantRegistered: true,
    mandateExpired: false,
    reputation: 0n,
    recentRequestCount: 1,
    velocityMax: 5,
    confidenceThreshold: 0.85,
    ...overrides,
  };
}

test("small ask inside mandate -> AUTO, high confidence", () => {
  const r = evaluate(base());
  assert.equal(r.route, "AUTO");
  assert.ok(r.confidence >= 0.9, `confidence was ${r.confidence}`);
  assert.deepEqual(r.escalationReasons, []);
});

test("demo confidence numbers read cleanly", () => {
  assert.equal(computeConfidence(base()), 0.95); // 18.50 of 250
  assert.equal(computeConfidence(base({ amount: 1_500n * USDC })), 0.71); // 1500 of 250
});

test("over per-tx cap -> ESCALATE OVER_TX_CAP", () => {
  const r = evaluate(base({ amount: 1_500n * USDC }));
  assert.equal(r.route, "ESCALATE");
  assert.ok(r.escalationReasons.includes("OVER_TX_CAP"));
});

test("over total outstanding cap -> ESCALATE OVER_TOTAL_CAP", () => {
  const r = evaluate(base({ amount: 100n * USDC, totalOutstanding: 4_950n * USDC }));
  assert.equal(r.route, "ESCALATE");
  assert.ok(r.escalationReasons.includes("OVER_TOTAL_CAP"));
});

test("unregistered merchant -> ESCALATE NEW_MERCHANT", () => {
  const r = evaluate(base({ merchantRegistered: false }));
  assert.equal(r.route, "ESCALATE");
  assert.ok(r.escalationReasons.includes("NEW_MERCHANT"));
});

test("expired mandate -> ESCALATE MANDATE_EXPIRED", () => {
  const r = evaluate(base({ mandateExpired: true }));
  assert.ok(r.escalationReasons.includes("MANDATE_EXPIRED"));
});

test("velocity anomaly -> ESCALATE VELOCITY_ANOMALY", () => {
  const r = evaluate(base({ recentRequestCount: 9 }));
  assert.ok(r.escalationReasons.includes("VELOCITY_ANOMALY"));
});
