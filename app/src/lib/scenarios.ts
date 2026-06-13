import type { Mandate, Scenario } from "./types";

const USDC = 1_000_000;

/** The human's only routine input: the frame the agent operates inside. */
export const MANDATE: Mandate = {
  maxPerTx: 250 * USDC,
  maxTotal: 5_000 * USDC,
  expiresInLabel: "5h 32m",
};

export const START_BALANCE = 1_284_500_000; // merchant starts at 1,284.50 USDC (mock cosmetic)

/** On-chain demo identities for live (Arc) mode. */
export const CHAIN = {
  merchant: "0x8acC23a57207D3e919704780bE2e750E560A29A6",
  lineMaxDisplay: "2000000000", // 2,000 USDC line limit (display units)
  auto: {
    nullifier: "0x00000000000000000000000000000000000000000000000000000000000a0701",
    customer: "0x000000000000000000000000000000000000A070",
  },
  escalate: {
    nullifier: "0x00000000000000000000000000000000000000000000000000000000000e5ca1",
    customer: "0x000000000000000000000000000000000000E5CA",
  },
} as const;

/** AUTO — the 99% case. Inside the mandate, high confidence, no human. */
export const AUTO: Scenario = {
  id: "auto",
  merchant: "Doña Rosa Corner Store",
  merchantRegistered: true,
  amount: 18_500_000, // 18.50
  confidence: 0.95,
  route: "AUTO",
  trace: [
    { label: "World ID proof verified", status: "ok", detail: "unique human · nullifier 0x4e…c1a" },
    { label: "One credit line per human", status: "ok", detail: "active line within limit" },
    { label: "Merchant registered", status: "ok", detail: "Doña Rosa Corner Store" },
    { label: "Requested 18.50 USDC", status: "ok", detail: "7% of per-tx cap" },
    { label: "Confidence 0.95", status: "ok", detail: "≥ 0.85 threshold" },
    { label: "Inside mandate", status: "ok", detail: "≤ 250/tx · total ok" },
  ],
  borrower: {
    nullifierShort: "0x4e2a…c1a",
    verifiedLevel: "Orb",
    memberSince: "Mar 2026",
    reputationTier: "Established",
    tabsRepaid: "11 / 11",
    totalRepaid: 198_000_000,
    outstanding: 0,
    priorMax: 32_000_000,
    defaultRate: "0%",
  },
};

/** ESCALATE — outside the mandate. The human gets the full picture to decide. */
export const ESCALATE: Scenario = {
  id: "escalate",
  merchant: "Doña Rosa Corner Store",
  merchantRegistered: true,
  amount: 1_500_000_000, // 1,500.00
  confidence: 0.71,
  route: "ESCALATE",
  trace: [
    { label: "World ID proof verified", status: "ok", detail: "unique human · nullifier 0x9f…ab1" },
    { label: "Merchant registered", status: "ok", detail: "Doña Rosa Corner Store" },
    { label: "Requested 1,500.00 USDC", status: "warn", detail: "unusually large" },
    { label: "Per-transaction cap 250 USDC", status: "fail", detail: "6× over your limit" },
    { label: "Confidence 0.71", status: "warn", detail: "below 0.85 threshold" },
    { label: "Largest tab ever for this borrower", status: "warn", detail: "prior max 45 USDC" },
  ],
  escalationReasons: [
    { code: "OVER_TX_CAP", plain: "1,500 USDC is 6× the 250 USDC per-transaction cap you set." },
    { code: "LOW_CONFIDENCE", plain: "Confidence 0.71 is below your 0.85 auto-approve threshold." },
    {
      code: "VELOCITY_ANOMALY",
      plain: "This is the largest amount this borrower has ever requested (prior max 45 USDC).",
    },
  ],
  agentRecommendation:
    "My read: approve. The borrower has repaid 8 of 8 prior tabs (142 USDC, 0% default) and Doña Rosa is a trusted, registered merchant. The only concern is size — it falls outside the frame you set, so this one is yours to sign.",
  borrower: {
    nullifierShort: "0x9f2c…ab1",
    verifiedLevel: "Orb",
    memberSince: "Apr 2026",
    reputationTier: "Established",
    tabsRepaid: "8 / 8",
    totalRepaid: 142_000_000,
    outstanding: 0,
    priorMax: 45_000_000,
    defaultRate: "0%",
  },
};
