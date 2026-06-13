// Thin client for the Fiado backend. Vite proxies /api -> http://localhost:3001.
// Amounts cross the wire as decimal strings (bigint-safe); callers convert.

// Dev: Vite proxies /api -> backend. Prod (Vercel): set VITE_API_BASE to the
// public backend URL (e.g. an ngrok https URL).
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "/api";

// `ngrok-skip-browser-warning` keeps the free-tier interstitial from intercepting
// our API fetches (it would return HTML instead of JSON).
const NGROK = { "ngrok-skip-browser-warning": "true" };

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...NGROK },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data?.error) throw new Error(data?.error ?? `${path} failed`);
  return data as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { ...NGROK } });
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
  // Mock verify (PC rehearsal): backend accepts in DEMO_MOCK_MODE.
  verify: (nullifierHash: string) =>
    post<{ ok: boolean; nullifierHash: string; mode: string; hasActiveLine: boolean }>("/verify", {
      proof: { nullifier_hash: nullifierHash, merkle_root: "0x0", proof: "0x0" },
    }),

  // RP signature (signed by the backend with the RP signer key) for an IDKit 4.0 request.
  rpSignature: (action: string) =>
    post<{ rp_id: string; nonce: string; created_at: number; expires_at: number; signature: string }>(
      "/rp-signature",
      { action },
    ),

  // Real IDKit 4.0 result -> backend forwards it as-is to /api/v4/verify/{rp_id}.
  verifyProof: (proof: unknown) =>
    post<{ ok: boolean; nullifierHash: string; mode: string; hasActiveLine: boolean }>("/verify", {
      proof,
    }),

  // Customer standing after verification.
  customerStatus: (nullifier: string) =>
    get<{
      verified: boolean;
      reputationTier: string;
      creditLimitDisplay: string;
      outstandingDisplay: string;
      availableDisplay: string;
      openRequestId: string | null;
      openQuestion: string | null;
    }>(`/customer/status?nullifier=${nullifier}`),

  repay: (nullifierHash: string, requestId?: string) =>
    post<{ ok: boolean; repaidDisplay: string; hash: string | null }>("/repay", {
      nullifierHash,
      requestId,
    }),

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
    requestId?: string,
  ) =>
    post<{ ok: boolean; hash: `0x${string}`; request: CreditRequest | null }>("/credit/escalate/submit", {
      lineId,
      merchant,
      onChainAmount,
      nonce,
      signature,
      requestId,
    }),
};

export interface Question {
  id: string;
  text: string;
  askedBy: "agent" | "human";
  answer?: string;
}

export interface CreditRequest {
  id: string;
  nullifierHash: string;
  merchant: string;
  amountDisplay: number;
  purpose: string;
  status: "need_info" | "auto_approved" | "escalated" | "approved" | "declined" | "disbursed" | "repaid";
  route: "AUTO" | "ESCALATE" | "NEED_INFO";
  confidence: number;
  reasonCodes: string[];
  escalationReasons: string[];
  questions: Question[];
  agentReasoning?: string;
  decidedBy?: "rule" | "agent";
  lineId?: string;
  tx?: string;
}

export const requests = {
  create: (nullifierHash: string, merchant: string, amountDisplay: number, purpose: string) =>
    post<CreditRequest>("/request", { nullifierHash, merchant, amountDisplay, purpose }),
  get: (id: string) => get<CreditRequest>(`/request/${id}`),
  answer: (id: string, questionId: string, answer: string) =>
    post<CreditRequest>(`/request/${id}/answer`, { questionId, answer }),
  list: () => get<{ requests: CreditRequest[] }>("/requests"),
  ask: (id: string, text: string) => post<CreditRequest>(`/request/${id}/ask`, { text }),
  decide: (id: string, decision: "approve" | "decline") =>
    post<CreditRequest>(`/request/${id}/decide`, { decision }),
  disbursed: (id: string, lineId: string, tx: string) =>
    post<CreditRequest>(`/request/${id}/disbursed`, { lineId, tx }),
};

export const EXPLORER = "https://testnet.arcscan.app";
