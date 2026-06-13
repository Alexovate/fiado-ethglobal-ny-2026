// In-memory state for the demo. One verified human = one active credit line.
// Survives only for the process lifetime — that is fine for a hackathon demo.

export interface LineRecord {
  lineId: string; // bytes32 hex (filled once the on-chain tx confirms)
  nullifierHash: string;
  customer: string;
  maxAmount: bigint;
  outstanding: bigint;
  open: boolean;
}

export interface HumanRecord {
  nullifierHash: string;
  verifiedAt: number;
  reputation: bigint; // mirrors on-chain reputation for quoting
  requestTimestamps: number[]; // for velocity checks
  line?: LineRecord;
}

const humans = new Map<string, HumanRecord>();
let totalOutstanding = 0n;

export function markVerified(nullifierHash: string): HumanRecord {
  let h = humans.get(nullifierHash);
  if (!h) {
    h = {
      nullifierHash,
      verifiedAt: Date.now(),
      reputation: 0n,
      requestTimestamps: [],
    };
    humans.set(nullifierHash, h);
  }
  return h;
}

export function getHuman(nullifierHash: string): HumanRecord | undefined {
  return humans.get(nullifierHash);
}

export function hasActiveLine(nullifierHash: string): boolean {
  const h = humans.get(nullifierHash);
  return Boolean(h?.line?.open);
}

export function recordRequest(nullifierHash: string, now: number): number[] {
  const h = markVerified(nullifierHash);
  h.requestTimestamps.push(now);
  return h.requestTimestamps;
}

export function getTotalOutstanding(): bigint {
  return totalOutstanding;
}

// Called by the agent layer after a confirmed disbursement (kept in sync for quotes).
export function applyDisbursement(nullifierHash: string, amount: bigint): void {
  const h = markVerified(nullifierHash);
  if (h.line) h.line.outstanding += amount;
  totalOutstanding += amount;
}

export function applyRepayment(nullifierHash: string, amount: bigint): void {
  const h = humans.get(nullifierHash);
  if (!h?.line) return;
  const applied = amount > h.line.outstanding ? h.line.outstanding : amount;
  h.line.outstanding -= applied;
  totalOutstanding -= applied;
  h.reputation += applied;
}
