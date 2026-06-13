import "dotenv/config";

function env(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: Number(env("BACKEND_PORT", "3001")),

  // World ID
  world: {
    appId: env("WORLD_APP_ID"),
    actionId: env("WORLD_ACTION_ID", "fiado-credit-line"),
    apiBase: env("WORLD_API_BASE", "https://developer.worldcoin.org"),
    rpId: env("WORLD_VERIFY_RP_ID"),
    signerPrivateKey: env("WORLD_SIGNER_PRIVATE_KEY"),
  },

  // Signing — backend authorizes openLine; the ledger key is on the device.
  backendSignerPrivateKey: env("BACKEND_SIGNER_PRIVATE_KEY"),
  creditLineAddress: env("CREDITLINE_ADDRESS"),
  ledgerSigner: env("LEDGER_SIGNER"),
  agentPrivateKey: env("AGENT_PRIVATE_KEY"),

  // Arc
  arcRpcUrl: env("ARC_RPC_URL", "https://rpc.testnet.arc.network"),
  usdcAddress: env("USDC_ADDRESS", "0x3600000000000000000000000000000000000000"),

  // Demo scaling: on-chain settlement = display amount / scaleDivisor (1 = real 1:1).
  scaleDivisor: BigInt(env("DEMO_SCALE_DIVISOR", "1")),

  // Policy
  confidenceThreshold: Number(env("POLICY_CONFIDENCE_THRESHOLD", "0.85")),
  velocityWindowMs: Number(env("POLICY_VELOCITY_WINDOW_MS", "60000")),
  velocityMaxInWindow: Number(env("POLICY_VELOCITY_MAX", "5")),
  // Above this amount the agent asks the borrower a clarifying question first.
  questionThresholdDisplay: BigInt(env("POLICY_QUESTION_THRESHOLD", "50")) * 1_000_000n,
  // At/under this amount, credit is auto-granted (no agent reasoning needed).
  autoGrantThresholdDisplay: BigInt(env("POLICY_AUTO_GRANT_THRESHOLD", "5")) * 1_000_000n,
  // Per-borrower credit limit. Available credit = this minus current outstanding;
  // no new credit once outstanding reaches it, until the loan is repaid.
  creditLimitDisplay: BigInt(env("POLICY_CREDIT_LIMIT", "250")) * 1_000_000n,

  // Demo seed mandate (real one is signed on the Ledger; this mirrors it for quotes)
  mandate: {
    maxPerTx: BigInt(env("MANDATE_MAX_PER_TX", "250")) * 1_000_000n, // USDC 6 dec
    maxTotalOutstanding: BigInt(env("MANDATE_MAX_TOTAL_OUTSTANDING", "5000")) * 1_000_000n,
    ttlHours: Number(env("MANDATE_TTL_HOURS", "6")),
  },

  // When true, World verification is accepted without a live API call (rehearsal).
  demoMockMode: env("DEMO_MOCK_MODE", "false") === "true",
};

export type Config = typeof config;
