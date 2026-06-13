// Thin client for the Fiado backend. Vite proxies /api -> http://localhost:3001.
// Amounts cross the wire as decimal strings (bigint-safe); callers convert.

const BASE = "/api";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data?.error) throw new Error(data?.error ?? `${path} failed`);
  return data as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json();
  if (!res.ok || data?.error) throw new Error(data?.error ?? `${path} failed`);
  return data as T;
}

export interface MandatePrepare {
  digest: `0x${string}`;
  onchain: { agent: string; maxPerTx: string; maxTotalOutstanding: string; expiresAt: string };
}

export interface EscalatePrepare {
  digest: `0x${string}`;
  onChainAmount: string;
  nonce: string;
}

export const api = {
  state: (merchant: string) =>
    get<{ merchantBalanceDisplay: string; totalOutstandingDisplay: string }>(
      `/onchain/state?merchant=${merchant}`,
    ),

  openLine: (nullifierHash: string, customer: string, displayMaxAmount: string) =>
    post<{ ok: boolean; lineId: `0x${string}`; reused?: boolean; hash?: `0x${string}` }>(
      "/credit/open",
      { nullifierHash, customer, displayMaxAmount },
    ),

  mandatePrepare: () => post<MandatePrepare>("/mandate/prepare", {}),
  mandateSubmit: (onchain: MandatePrepare["onchain"], signature: string) =>
    post<{ ok: boolean; hash: `0x${string}` }>("/mandate/submit", { ...onchain, signature }),

  disburse: (lineId: string, merchant: string, displayAmount: string) =>
    post<{ ok: boolean; hash: `0x${string}` }>("/credit/disburse", { lineId, merchant, displayAmount }),

  escalatePrepare: (lineId: string, merchant: string, displayAmount: string, nonce: number) =>
    post<EscalatePrepare>("/credit/escalate/prepare", { lineId, merchant, displayAmount, nonce }),
  escalateSubmit: (
    lineId: string,
    merchant: string,
    onChainAmount: string,
    nonce: string,
    signature: string,
  ) =>
    post<{ ok: boolean; hash: `0x${string}` }>("/credit/escalate/submit", {
      lineId,
      merchant,
      onChainAmount,
      nonce,
      signature,
    }),
};

export const EXPLORER = "https://testnet.arcscan.app";
