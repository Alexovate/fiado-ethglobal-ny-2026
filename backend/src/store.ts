// In-memory state for the demo. One verified human = one active credit line.
// Survives only for the process lifetime — that is fine for a hackathon demo.

export interface HumanRecord {
  nullifierHash: string;
  verifiedAt: number;
  reputation: bigint; // cumulative repaid (display base units)
  outstanding: bigint; // currently owed (display base units) — the credit-limit gate
  requestTimestamps: number[]; // for velocity checks
}

const humans = new Map<string, HumanRecord>();

export function markVerified(nullifierHash: string): HumanRecord {
  let h = humans.get(nullifierHash);
  if (!h) {
    h = { nullifierHash, verifiedAt: Date.now(), reputation: 0n, outstanding: 0n, requestTimestamps: [] };
    humans.set(nullifierHash, h);
  }
  return h;
}

export function getHuman(nullifierHash: string): HumanRecord | undefined {
  return humans.get(nullifierHash);
}

export function getOutstanding(nullifierHash: string): bigint {
  return humans.get(nullifierHash)?.outstanding ?? 0n;
}

export function hasOutstanding(nullifierHash: string): boolean {
  return getOutstanding(nullifierHash) > 0n;
}

export function recordRequest(nullifierHash: string, now: number): number[] {
  const h = markVerified(nullifierHash);
  h.requestTimestamps.push(now);
  return h.requestTimestamps;
}

export function getTotalOutstanding(): bigint {
  let total = 0n;
  for (const h of humans.values()) total += h.outstanding;
  return total;
}

/** A granted disbursement increases what this human owes (the credit-limit gate). */
export function addOutstanding(nullifierHash: string, amount: bigint): void {
  markVerified(nullifierHash).outstanding += amount;
}

/** Operator marks the loan repaid: clear the balance and credit reputation. */
export function settleHuman(nullifierHash: string): bigint {
  const h = markVerified(nullifierHash);
  const repaid = h.outstanding;
  h.reputation += repaid;
  h.outstanding = 0n;
  return repaid;
}
