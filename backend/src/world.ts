import { config } from "./config.js";

// World ID proof verification for an EXTERNAL app (IDKit on the web, QR/deeplink
// to World App). We verify the proof server-side via the World cloud-verify
// endpoint — POST /api/v2/verify/{app_id} — which is exactly what IDKit's and
// MiniKit's `verifyCloudProof` call internally (the proven pattern). In rehearsal
// (DEMO_MOCK_MODE or no app id) we accept the proof so the flow runs on a PC
// without World App. README "what is real vs mocked" reflects the active mode.

export interface WorldProof {
  nullifier_hash: string;
  merkle_root: string;
  proof: string;
  verification_level?: string;
}

export interface VerifyResult {
  ok: boolean;
  nullifierHash: string;
  mode: "live" | "mock";
  detail?: string;
}

export async function verifyProof(proof: WorldProof, signal?: string): Promise<VerifyResult> {
  if (config.demoMockMode || !config.world.appId) {
    return { ok: true, nullifierHash: proof.nullifier_hash, mode: "mock" };
  }

  const url = `${config.world.apiBase}/api/v2/verify/${config.world.appId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nullifier_hash: proof.nullifier_hash,
      merkle_root: proof.merkle_root,
      proof: proof.proof,
      verification_level: proof.verification_level ?? "orb",
      action: config.world.actionId,
      signal_hash: signal,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, nullifierHash: proof.nullifier_hash, mode: "live", detail };
  }
  return { ok: true, nullifierHash: proof.nullifier_hash, mode: "live" };
}
