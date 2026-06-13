import { motion } from "framer-motion";
import type { Scenario } from "../lib/types";
import { usdc, pct } from "../lib/format";

type LedgerStatus = "waiting" | "approved";

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${accent ? "text-teal" : "text-ink"}`}>{value}</div>
    </div>
  );
}

export function LedgerModal({
  scenario,
  status,
  onApprove,
  onDecline,
}: {
  scenario: Scenario;
  status: LedgerStatus;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const b = scenario.borrower;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="relative z-10 grid w-full max-w-4xl grid-cols-1 overflow-hidden rounded-2xl border border-border-bright bg-surface-2 shadow-2xl md:grid-cols-[1.15fr_1fr]"
      >
        {/* LEFT — the full picture the human needs to decide */}
        <div className="border-b border-border p-6 md:border-b-0 md:border-r">
          <div className="flex items-center gap-2 text-amber-bright">
            <span className="flex h-6 w-6 items-center justify-center rounded-md border border-amber/50 bg-amber-dim text-xs font-bold">
              !
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider">Human approval required</span>
          </div>

          <h2 className="mt-3 text-2xl font-bold tracking-tight">
            Approve {usdc(scenario.amount, false)} <span className="text-muted">USDC</span>
          </h2>
          <p className="text-sm text-muted">to {scenario.merchant}</p>

          {/* Why the agent is unsure */}
          <div className="mt-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              Why this needs you
            </div>
            <ul className="mt-2 space-y-2">
              {scenario.escalationReasons?.map((r) => (
                <li key={r.code} className="flex gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-amber" />
                  <span className="text-ink/90">{r.plain}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Agent's assessment */}
          <div className="mt-5 rounded-xl border border-teal/25 bg-teal-dim/40 p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-teal">
              <span>Agent assessment</span>
              <span className="rounded-full bg-teal/15 px-2 py-0.5 text-[10px] text-teal-bright">
                confidence {pct(scenario.confidence)}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink/90">{scenario.agentRecommendation}</p>
          </div>

          {/* Borrower details */}
          <div className="mt-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              Borrower (World ID verified)
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Stat label="Reputation" value={b.reputationTier} accent />
              <Stat label="Tabs repaid" value={b.tabsRepaid} />
              <Stat label="Total repaid" value={usdc(b.totalRepaid)} />
              <Stat label="Default rate" value={b.defaultRate} accent />
              <Stat label="Prior largest" value={usdc(b.priorMax)} />
              <Stat label="Verified · since" value={`${b.verifiedLevel} · ${b.memberSince}`} />
            </div>
          </div>
        </div>

        {/* RIGHT — the physical device gate */}
        <div className="flex flex-col items-center justify-center gap-5 bg-surface p-6 text-center">
          <div
            className={`flex h-20 w-20 items-center justify-center rounded-2xl border text-3xl ${
              status === "approved"
                ? "border-teal/50 bg-teal-dim text-teal"
                : "pulse-ring-amber border-amber/50 bg-amber-dim text-amber-bright"
            }`}
          >
            {status === "approved" ? "✓" : "⎘"}
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-faint">Ledger device</div>
            <div className="mt-1 text-lg font-semibold">
              {status === "approved" ? "Approved on device" : "Confirm on your Ledger"}
            </div>
            <p className="mx-auto mt-1 max-w-[16rem] text-xs text-muted">
              {status === "approved"
                ? "Hardware signature captured. Settling on Arc…"
                : "The device shows the exact payout. The agent cannot move these funds until a real person confirms."}
            </p>
          </div>

          {status === "waiting" ? (
            <div className="flex w-full flex-col gap-2">
              <button
                onClick={onApprove}
                className="w-full rounded-xl bg-teal px-4 py-3 text-sm font-bold text-[#003731] transition hover:bg-teal-bright"
              >
                Confirm on device
              </button>
              <button
                onClick={onDecline}
                className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted transition hover:border-border-bright hover:text-ink"
              >
                Decline
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-teal">
              <span className="h-2 w-2 animate-pulse rounded-full bg-teal" />
              Disbursing on Arc
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
