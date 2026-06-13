export type Route = "AUTO" | "ESCALATE";

export type EscalationCode =
  | "OVER_TX_CAP"
  | "OVER_TOTAL_CAP"
  | "LOW_CONFIDENCE"
  | "NEW_MERCHANT"
  | "VELOCITY_ANOMALY"
  | "MANDATE_EXPIRED";

export type StepStatus = "ok" | "warn" | "fail";

export interface TraceStep {
  label: string;
  status: StepStatus;
  detail?: string;
}

export interface EscalationReason {
  code: EscalationCode;
  plain: string;
}

/** Everything the agent knows about the borrower — shown to the human at escalation. */
export interface BorrowerProfile {
  nullifierShort: string; // World ID nullifier, abbreviated
  verifiedLevel: string; // e.g. "Orb"
  memberSince: string;
  reputationTier: string;
  tabsRepaid: string; // "8 / 8"
  totalRepaid: number; // USDC base units (6 dec)
  outstanding: number;
  priorMax: number; // largest prior tab
  defaultRate: string; // "0%"
}

export interface Scenario {
  id: "auto" | "escalate";
  merchant: string;
  merchantRegistered: boolean;
  amount: number; // USDC base units (6 dec)
  confidence: number; // 0..1
  route: Route;
  trace: TraceStep[];
  borrower: BorrowerProfile;
  /** Present only for ESCALATE. */
  escalationReasons?: EscalationReason[];
  agentRecommendation?: string;
}

export interface Mandate {
  maxPerTx: number; // base units
  maxTotal: number;
  expiresInLabel: string;
}
