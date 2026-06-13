import { config } from "./config.js";

// World ID proof verification. In a live demo we POST the proof to the World
// verify API; in rehearsal (DEMO_MOCK_MODE or no app id) we accept the proof so
// the flow runs without network/World App dependencies. The honest "what is real
// vs mocked" note in the README reflects whichever mode the demo runs in.

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

export async function verifyProof(
  proof: WorldProof,
  signal?: string,
): Promise<VerifyResult> {
  if (config.demoMockMode || !config.world.appId) {
    return { ok: true, nullifierHash: proof.nullifier_hash, mode: "mock" };
  }

  const rpId = config.world.rpId || config.world.appId;
  const url = `${config.world.apiBase}/api/v2/verify/${rpId}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nullifier_hash: proof.nullifier_hash,
      merkle_root: proof.merkle_root,
      proof: proof.proof,
      verification_level: proof.verification_level ?? "orb",
      action: config.world.actionId,
      signal: signal ?? "",
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, nullifierHash: proof.nullifier_hash, mode: "live", detail };
  }

  return { ok: true, nullifierHash: proof.nullifier_hash, mode: "live" };
}
