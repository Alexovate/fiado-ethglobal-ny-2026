import { spawn } from "node:child_process";

// The credit agent's brain = the `claude` CLI spawned headless, authenticated via
// the logged-in Max subscription (NOT an API key). Same proven pattern as the
// pitch-copilot hackathon: stripping ANTHROPIC_API_KEY from the child env forces
// subscription auth, so the agent's reasoning costs nothing per call.
//
// The brain only REASONS within the deterministic guardrails the caller already
// applied (under-5 auto-granted, over-cap force-escalated). It decides the gray
// zone — grant / decline / ask one question / escalate to a human — and never
// gets to widen a limit; the policy + contract enforce the bounds.

export type AgentDecision = "grant" | "decline" | "ask" | "escalate";

export interface CreditContext {
  amountDisplay: number; // USDC base units (6 dec)
  purpose: string;
  reputationTier: string;
  tabsRepaid: string;
  totalRepaidDisplay: number;
  outstandingDisplay: number;
  priorMaxDisplay: number;
  defaultRate: string;
  maxPerTxDisplay: number;
  recentRequests: number;
  priorAnswer?: string; // the customer's answer to an earlier agent question
}

export interface BrainDecision {
  decision: AgentDecision;
  question?: string;
  reasoning: string;
  confidence: number; // 0..1
}

const SYSTEM_PROMPT = `You are the credit underwriting agent for Fiado, a verified-human merchant
store-credit service (BNPL). You decide ONE request at a time and output ONLY a
JSON object — no prose, no markdown fences.

Rules you must obey:
- You are deciding a GRAY-ZONE request. Under-5-USDC requests are auto-granted
  upstream and over-cap requests are force-escalated upstream; you never see those.
- You may NOT exceed any limit. You only choose among: grant, decline, ask, escalate.
- "grant": fund it now (you're confident it's a real, repayable purchase).
- "ask": you need ONE clarifying question first (set "question"). Use when the
  purpose is vague or the amount is unusual for this customer.
- "escalate": a human should decide on the Ledger — use when the amount is large
  relative to history, the customer has many recent requests, or risk feels high
  even with good history.
- "decline": only for clear abuse signals.
- Favor financial inclusion: a clean repayment record should be rewarded.

Output exactly: {"decision":"grant|decline|ask|escalate","question":"...optional...","reasoning":"one sentence","confidence":0.0-1.0}`;

function usd(baseUnits: number): string {
  return (baseUnits / 1_000_000).toFixed(2);
}

function buildPrompt(ctx: CreditContext): string {
  const lines = [
    `Requested: ${usd(ctx.amountDisplay)} USDC`,
    `Purpose: ${ctx.purpose || "(not stated)"}`,
    `Per-transaction cap: ${usd(ctx.maxPerTxDisplay)} USDC`,
    `Customer reputation: ${ctx.reputationTier}`,
    `Tabs repaid: ${ctx.tabsRepaid}`,
    `Total repaid: ${usd(ctx.totalRepaidDisplay)} USDC`,
    `Current outstanding: ${usd(ctx.outstandingDisplay)} USDC`,
    `Largest prior tab: ${usd(ctx.priorMaxDisplay)} USDC`,
    `Default rate: ${ctx.defaultRate}`,
    `Requests in the last minute: ${ctx.recentRequests}`,
  ];
  if (ctx.priorAnswer) lines.push(`Customer's answer to your earlier question: "${ctx.priorAnswer}"`);
  return `Decide this store-credit request:\n${lines.join("\n")}`;
}

function parseDecision(text: string): BrainDecision | null {
  // Grab the first flat JSON object (no nested braces in our schema). Using
  // [^{}] avoids a greedy match spanning duplicate copies / markdown fences.
  const match = text.match(/\{[^{}]*\}/);
  if (!match) return null;
  try {
    const o = JSON.parse(match[0]) as Record<string, unknown>;
    const decision = String(o.decision) as AgentDecision;
    if (!["grant", "decline", "ask", "escalate"].includes(decision)) return null;
    return {
      decision,
      question: typeof o.question === "string" ? o.question : undefined,
      reasoning: typeof o.reasoning === "string" ? o.reasoning : "",
      confidence: typeof o.confidence === "number" ? o.confidence : 0.7,
    };
  } catch {
    return null;
  }
}

/** Run the headless Claude brain for one credit decision. Returns null on failure
 *  so the caller can fall back to the deterministic policy. */
export function decideCredit(ctx: CreditContext, timeoutMs = 30_000): Promise<BrainDecision | null> {
  // Clean, minimal reasoner: replace the default Claude Code system prompt with
  // ours, load NO MCP servers, and use Haiku (fast, cheap, rate-limit-friendly).
  // This avoids the full-agent behavior (tool use, prompt-injection refusals) and
  // keeps the spawned context tiny.
  const args = [
    "--print",
    "--output-format",
    "stream-json",
    "--verbose",
    "--strict-mcp-config",
    "--model",
    process.env.AGENT_MODEL || "haiku",
    "--system-prompt",
    SYSTEM_PROMPT,
  ];
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // force Max-subscription auth, no API cost

  return new Promise((resolve) => {
    const proc = spawn("claude", args, { env });
    let stdout = "";
    const timer = setTimeout(() => proc.kill(), timeoutMs);

    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.on("close", () => {
      clearTimeout(timer);
      // Prefer the final `result` string (single, authoritative); fall back to
      // assistant text blocks. Avoids parsing duplicated content.
      let resultText = "";
      const assistantTexts: string[] = [];
      for (const line of stdout.split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        try {
          const ev = JSON.parse(t);
          if (ev.type === "result" && typeof ev.result === "string") resultText = ev.result;
          if (ev.type === "assistant" && ev.message?.content) {
            for (const b of ev.message.content) if (b.type === "text" && b.text) assistantTexts.push(b.text);
          }
        } catch {
          /* skip non-json lines */
        }
      }
      resolve(parseDecision(resultText || assistantTexts.join("\n")));
    });

    proc.stdin.write(buildPrompt(ctx));
    proc.stdin.end();
  });
}
