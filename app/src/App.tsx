import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AgentTrace } from "./components/AgentTrace";
import { LedgerModal } from "./components/LedgerModal";
import { AUTO, ESCALATE, MANDATE, START_BALANCE, CHAIN } from "./lib/scenarios";
import type { Scenario } from "./lib/types";
import { usdc, pct } from "./lib/format";
import { connectLedger, signInner, isWebHidAvailable } from "./lib/ledger";
import { api, EXPLORER } from "./lib/api";

type Phase =
  | "idle"
  | "verifying"
  | "reasoning"
  | "decided_auto"
  | "ledger"
  | "disbursing"
  | "paid";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function useCountUp(target: number, ms = 900) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const startVal = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(startVal + (target - startVal) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

// ---- small presentational pieces ----

function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "teal" | "amber" | "muted" }) {
  const map = {
    teal: "border-teal/40 bg-teal-dim text-teal-bright",
    amber: "border-amber/40 bg-amber-dim text-amber-bright",
    muted: "border-border bg-surface-2 text-muted",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${map[tone]}`}>
      {children}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-surface p-5 shadow-[0_10px_30px_rgba(0,0,0,0.3)] ${className}`}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{children}</div>;
}

export default function App() {
  const [scenario, setScenario] = useState<Scenario>(AUTO);
  const [phase, setPhase] = useState<Phase>("idle");
  const [revealed, setRevealed] = useState(0);
  const [balanceTarget, setBalanceTarget] = useState(START_BALANCE);
  const [ledgerApproved, setLedgerApproved] = useState(false);
  const runToken = useRef(0);
  const balance = useCountUp(balanceTarget);

  // --- live (Arc) mode ---
  const [liveMode, setLiveMode] = useState(false);
  const [mandateActive, setMandateActive] = useState(false);
  const [tx, setTx] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingLine = useRef<`0x${string}` | null>(null);

  const refreshChainBalance = useCallback(async () => {
    try {
      const s = await api.state(CHAIN.merchant);
      setBalanceTarget(Number(s.merchantBalanceDisplay));
    } catch {
      /* ignore — display stays as-is */
    }
  }, []);

  // Reveal the reasoning trace at demo pace, then resolve.
  const revealTrace = useCallback(async (s: Scenario, token: number) => {
    setScenario(s);
    setRevealed(0);
    setPhase("verifying");
    await sleep(900);
    if (token !== runToken.current) return false;
    setPhase("reasoning");
    for (let i = 0; i < s.trace.length; i++) {
      await sleep(520);
      if (token !== runToken.current) return false;
      setRevealed(i + 1);
    }
    await sleep(400);
    return token === runToken.current;
  }, []);

  const signMandate = useCallback(async () => {
    if (!isWebHidAvailable()) {
      setNote("WebHID needs Chrome/Edge. Open this in Chrome with the Ledger connected.");
      return;
    }
    setBusy(true);
    setNote("Connect your Ledger and confirm the mandate on the device…");
    try {
      const prep = await api.mandatePrepare();
      const session = await connectLedger();
      const sig = await signInner(session, prep.digest);
      await session.close();
      const { hash } = await api.mandateSubmit(prep.onchain, sig);
      setMandateActive(true);
      setTx(hash);
      setNote("Mandate signed on Ledger and set on Arc.");
    } catch (e) {
      setNote(`Mandate failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const runLiveAuto = useCallback(async () => {
    const token = ++runToken.current;
    setTx(null);
    setNote(null);
    setLedgerApproved(false);
    const ok = await revealTrace(AUTO, token);
    if (!ok) return;
    setPhase("decided_auto");
    setBusy(true);
    try {
      const ids = CHAIN.auto;
      await api.verify(ids.nullifier); // World ID gate before a line can open
      const line = await api.openLine(ids.nullifier, ids.customer, CHAIN.lineMaxDisplay);
      pendingLine.current = line.lineId;
      setPhase("disbursing");
      const { hash } = await api.disburse(line.lineId, CHAIN.merchant, String(AUTO.amount));
      setTx(hash);
      await refreshChainBalance();
      setPhase("paid");
    } catch (e) {
      setNote(`Auto disburse failed: ${(e as Error).message}`);
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  }, [revealTrace, refreshChainBalance]);

  const runLiveEscalate = useCallback(async () => {
    const token = ++runToken.current;
    setTx(null);
    setNote(null);
    setLedgerApproved(false);
    const ok = await revealTrace(ESCALATE, token);
    if (!ok) return;
    setBusy(true);
    try {
      const ids = CHAIN.escalate;
      await api.verify(ids.nullifier); // World ID gate before a line can open
      const line = await api.openLine(ids.nullifier, ids.customer, CHAIN.lineMaxDisplay);
      pendingLine.current = line.lineId;
      setPhase("ledger"); // modal opens; device confirm happens in confirmLiveEscalate
    } catch (e) {
      setNote(`Open line failed: ${(e as Error).message}`);
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  }, [revealTrace]);

  const confirmLiveEscalate = useCallback(async () => {
    if (!isWebHidAvailable()) {
      setNote("WebHID needs Chrome/Edge with the Ledger connected.");
      return;
    }
    const lineId = pendingLine.current;
    if (!lineId) return;
    setBusy(true);
    setNote("Confirm the payout on your Ledger…");
    try {
      const nonce = Math.floor(performance.now());
      const prep = await api.escalatePrepare(lineId, CHAIN.merchant, String(ESCALATE.amount), nonce);
      const session = await connectLedger();
      const sig = await signInner(session, prep.digest);
      await session.close();
      const { hash } = await api.escalateSubmit(lineId, CHAIN.merchant, prep.onChainAmount, prep.nonce, sig);
      setLedgerApproved(true);
      setTx(hash);
      setPhase("disbursing");
      await refreshChainBalance();
      setPhase("paid");
      setNote("Human-approved on Ledger, settled on Arc.");
    } catch (e) {
      setNote(`Escalation failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [refreshChainBalance]);

  const reset = useCallback(() => {
    runToken.current++;
    setPhase("idle");
    setRevealed(0);
    setLedgerApproved(false);
    setTx(null);
    setNote(null);
    pendingLine.current = null;
    if (!liveMode) setBalanceTarget(START_BALANCE);
    else refreshChainBalance();
  }, [liveMode, refreshChainBalance]);

  const play = useCallback(async (s: Scenario) => {
    const token = ++runToken.current;
    const alive = () => token === runToken.current;
    setScenario(s);
    setLedgerApproved(false);
    setRevealed(0);
    setPhase("verifying");
    await sleep(900);
    if (!alive()) return;

    setPhase("reasoning");
    for (let i = 0; i < s.trace.length; i++) {
      await sleep(520);
      if (!alive()) return;
      setRevealed(i + 1);
    }
    await sleep(450);
    if (!alive()) return;

    if (s.route === "AUTO") {
      setPhase("decided_auto");
      await sleep(750);
      if (!alive()) return;
      setPhase("disbursing");
      setBalanceTarget(START_BALANCE + s.amount);
      await sleep(950);
      if (!alive()) return;
      setPhase("paid");
    } else {
      setPhase("ledger"); // modal opens, waits for the human
    }
  }, []);

  const approveLedger = useCallback(async () => {
    const token = runToken.current;
    setLedgerApproved(true);
    await sleep(1100);
    if (token !== runToken.current) return;
    setPhase("disbursing");
    setBalanceTarget(START_BALANCE + scenario.amount);
    await sleep(950);
    if (token !== runToken.current) return;
    setPhase("paid");
  }, [scenario]);

  const live = phase === "verifying" || phase === "reasoning";
  const showModal = phase === "ledger";
  const paid = phase === "paid";
  const disbursing = phase === "disbursing";

  return (
    <div className="mx-auto flex min-h-full max-w-[1500px] flex-col px-6 py-5">
      {/* top bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal text-lg font-black text-[#003731]">
            F
          </div>
          <div>
            <div className="text-lg font-bold leading-none tracking-tight">Fiado</div>
            <div className="text-[11px] text-faint">verified-human store credit</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="teal">
            <span className="h-1.5 w-1.5 rounded-full bg-teal" /> World ID verified
          </Pill>
          <Pill tone="muted">Arc Testnet</Pill>
          <Pill tone="muted">
            mandate · {usdc(MANDATE.maxPerTx, false)}/tx · {usdc(MANDATE.maxTotal, false)} total
          </Pill>
        </div>
      </header>

      {/* main stage */}
      <main className="grid flex-1 grid-cols-1 gap-5 py-5 lg:grid-cols-[20rem_1fr_20rem]">
        {/* LEFT — customer + the human-set frame */}
        <div className="flex flex-col gap-5">
          <Card>
            <SectionLabel>Customer</SectionLabel>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-teal/40 bg-teal-dim text-teal">
                <ShieldIcon />
              </div>
              <div>
                <div className="font-semibold">Verified human</div>
                <div className="text-xs text-faint">one credit line per person</div>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-border bg-surface-2 p-4">
              <SectionLabel>Incoming request</SectionLabel>
              <div className="mt-1 text-sm text-muted">{scenario.merchant}</div>
              <div className="mt-1 text-3xl font-extrabold tracking-tight">
                {usdc(scenario.amount, false)} <span className="text-base font-semibold text-muted">USDC</span>
              </div>
            </div>
          </Card>

          {/* The frame — feedback point #1 */}
          <Card>
            <div className="flex items-center justify-between">
              <SectionLabel>Your mandate</SectionLabel>
              <span className="text-[10px] font-medium text-teal">signed on Ledger</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              You set the frame once. The agent lends autonomously inside it — and only calls you for what
              falls outside.
            </p>
            <div className="mt-3 space-y-2 text-sm">
              <FrameRow label="Max per transaction" value={usdc(MANDATE.maxPerTx)} />
              <FrameRow label="Max total outstanding" value={usdc(MANDATE.maxTotal)} />
              <FrameRow label="Merchants" value="Registered only" />
              <FrameRow label="Expires in" value={MANDATE.expiresInLabel} />
            </div>
          </Card>
        </div>

        {/* CENTER — agent reasoning + decision */}
        <div className="flex flex-col gap-5">
          <Card className="flex-1">
            <div className="flex items-center justify-between">
              <SectionLabel>Agent decision</SectionLabel>
              <span className="font-mono text-[11px] text-faint">
                {phase === "idle" ? "STANDBY" : live ? "REASONING…" : "SYSTEM_ACTIVE"}
              </span>
            </div>
            <div className="mt-4">
              <AgentTrace steps={scenario.trace} revealed={revealed} live={live} />
            </div>

            <AnimatePresence>
              {(phase === "decided_auto" || disbursing || paid) && scenario.route === "AUTO" && (
                <DecisionBanner
                  key="auto"
                  tone="teal"
                  title={paid ? "PAID · route AUTO" : "APPROVED · route AUTO"}
                  caption={
                    paid
                      ? "Settled instantly. No human in the loop."
                      : "Inside the mandate — disbursing instantly. No human needed (99% case)."
                  }
                  confidence={scenario.confidence}
                />
              )}
              {(phase === "ledger" || ((disbursing || paid) && scenario.route === "ESCALATE")) && (
                <DecisionBanner
                  key="esc"
                  tone={paid ? "teal" : "amber"}
                  title={paid ? "PAID · approved on Ledger" : "ESCALATION REQUIRED · route ESCALATE"}
                  caption={
                    paid
                      ? "Human-approved on hardware, then settled on Arc."
                      : "Outside the mandate — a human must approve on the Ledger device."
                  }
                  confidence={scenario.confidence}
                />
              )}
            </AnimatePresence>
          </Card>

          {/* demo controls */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  reset();
                  setLiveMode((v) => !v);
                }}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  liveMode
                    ? "border-teal/50 bg-teal-dim text-teal-bright"
                    : "border-border bg-surface-2 text-muted"
                }`}
              >
                {liveMode ? "● LIVE on Arc" : "○ Mock mode"}
              </button>
              {liveMode &&
                (mandateActive ? (
                  <span className="text-xs font-medium text-teal">✓ mandate active on Arc</span>
                ) : (
                  <button
                    onClick={signMandate}
                    disabled={busy}
                    className="rounded-xl border border-teal/50 bg-teal-dim px-3 py-1.5 text-xs font-bold text-teal-bright transition hover:border-teal disabled:opacity-40"
                  >
                    ⎘ Sign mandate on Ledger
                  </button>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => (liveMode ? runLiveAuto() : play(AUTO))}
                disabled={busy || (liveMode && !mandateActive)}
                className="rounded-xl bg-teal px-4 py-2.5 text-sm font-bold text-[#003731] transition hover:bg-teal-bright disabled:opacity-40"
              >
                ▶ Auto purchase · 18.50
              </button>
              <button
                onClick={() => (liveMode ? runLiveEscalate() : play(ESCALATE))}
                disabled={busy}
                className="rounded-xl border border-amber/50 bg-amber-dim px-4 py-2.5 text-sm font-bold text-amber-bright transition hover:border-amber disabled:opacity-40"
              >
                ▶ High-value · 1,500 → escalation
              </button>
              <button
                onClick={reset}
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted transition hover:border-border-bright hover:text-ink"
              >
                Reset
              </button>
            </div>
            {(note || tx) && (
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {note && <span className="text-muted">{note}</span>}
                {tx && (
                  <a
                    href={`${EXPLORER}/tx/${tx}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-teal hover:text-teal-bright"
                  >
                    ↗ {tx.slice(0, 12)}… on ArcScan
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — merchant settlement + flywheel */}
        <div className="flex flex-col gap-5">
          <Card>
            <SectionLabel>Merchant balance</SectionLabel>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight tabular-nums">{usdc(balance, false)}</span>
              <span className="text-sm font-semibold text-muted">USDC</span>
            </div>
            <AnimatePresence>
              {(disbursing || paid) && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-teal-dim px-2.5 py-1 text-sm font-semibold text-teal"
                >
                  +{usdc(scenario.amount)} {disbursing ? "settling…" : "settled"}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="mt-3 text-xs text-faint">Merchant-direct settlement — customer never receives cash.</div>
          </Card>

          <Card>
            <SectionLabel>Arc settlement</SectionLabel>
            <div className="mt-3 space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-faint">tx</span>
                <span className="text-ink">
                  {tx ? `${tx.slice(0, 10)}…${tx.slice(-4)}` : disbursing || paid ? "(simulated)" : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-faint">status</span>
                <span className={paid ? "text-teal" : disbursing ? "text-amber-bright" : "text-faint"}>
                  {paid ? "confirmed" : disbursing ? "pending" : "idle"}
                </span>
              </div>
              <div className="pt-1">
                {tx ? (
                  <a
                    href={`${EXPLORER}/tx/${tx}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal hover:text-teal-bright"
                  >
                    ↗ View on ArcScan
                  </a>
                ) : (
                  <span className="text-faint">↗ ArcScan (live mode only)</span>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <SectionLabel>Borrower reputation</SectionLabel>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="font-semibold">{scenario.borrower.reputationTier}</span>
              <span className="text-faint">·</span>
              <span className="text-muted">{scenario.borrower.tabsRepaid} repaid</span>
            </div>
            <div className="mt-2 text-xs text-faint">
              On repayment, reputation rises and the future credit line grows.
            </div>
          </Card>
        </div>
      </main>

      <AnimatePresence>
        {showModal && (
          <LedgerModal
            scenario={scenario}
            status={ledgerApproved ? "approved" : "waiting"}
            onApprove={liveMode ? confirmLiveEscalate : approveLedger}
            onDecline={reset}
          />
        )}
      </AnimatePresence>
    </div>
  );

  function DecisionBanner({
    tone,
    title,
    caption,
    confidence,
  }: {
    tone: "teal" | "amber";
    title: string;
    caption: string;
    confidence: number;
  }) {
    const styles =
      tone === "teal"
        ? "border-teal/40 bg-teal-dim/50"
        : "border-amber/40 bg-amber-dim/50";
    const titleColor = tone === "teal" ? "text-teal" : "text-amber-bright";
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className={`mt-4 flex items-center justify-between gap-4 rounded-xl border p-4 ${styles}`}
      >
        <div>
          <div className={`text-lg font-extrabold tracking-tight ${titleColor}`}>{title}</div>
          <div className="text-xs text-muted">{caption}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-faint">confidence</div>
          <div className={`text-2xl font-bold tabular-nums ${titleColor}`}>{pct(confidence)}</div>
        </div>
      </motion.div>
    );
  }
}

function FrameRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
