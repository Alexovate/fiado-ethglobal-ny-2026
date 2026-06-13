import { config } from "./config.js";

// World ID 4.0 proof verification for an EXTERNAL app (IDKit on the web, QR /
// deeplink to World App). Per the official docs ("Step 5: Verify the proof in
// your backend"), we forward the IDKit result payload AS-IS to
// POST https://developer.world.org/api/v4/verify/{rp_id} — no field remapping.
// In rehearsal (DEMO_MOCK_MODE or no app) we accept the proof so the flow runs
// on a PC without World App. README "what is real vs mocked" reflects the mode.

// The IDKit 4.0 result: a `responses[]` array (each with a `nullifier`) plus a
// top-level `nonce`/`action`. We keep it loose and forward the whole object.
export interface WorldProof {
  nullifier_hash?: string; // legacy/compat field
  responses?: Array<{ nullifier?: string }>;
  [key: string]: unknown;
}

export interface VerifyResult {
  ok: boolean;
  nullifierHash: string;
  mode: "live" | "mock";
  detail?: string;
}

function extractNullifier(proof: WorldProof): string {
  return proof.responses?.[0]?.nullifier ?? proof.nullifier_hash ?? "";
}

export async function verifyProof(proof: WorldProof, _signal?: string): Promise<VerifyResult> {
  const nullifierHash = extractNullifier(proof);

  if (config.demoMockMode || !config.world.rpId) {
    return { ok: true, nullifierHash, mode: "mock" };
  }

  // v4 cloud verify lives on developer.world.org and keys off the rp_id.
  // Forward the IDKit result, but ensure `action` is present — v4 requires it for
  // uniqueness proofs and IDKit doesn't echo it back into the result payload.
  const url = `https://developer.world.org/api/v4/verify/${config.world.rpId}`;
  const body = { action: config.world.actionId, ...proof };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, nullifierHash, mode: "live", detail };
  }
  return { ok: true, nullifierHash, mode: "live" };
}
