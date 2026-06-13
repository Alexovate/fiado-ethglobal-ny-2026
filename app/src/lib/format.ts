/** USDC is stored as integer base units (6 decimals). */
export function usdc(baseUnits: number, withSymbol = true): string {
  const v = baseUnits / 1_000_000;
  const s = v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return withSymbol ? `${s} USDC` : s;
}

export function pct(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
