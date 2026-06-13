import { useCallback, useEffect, useRef, useState } from "react";
import { api, requests as reqApi, EXPLORER, type CreditRequest } from "./lib/api";
import { CHAIN } from "./lib/scenarios";
import { connectLedger, signInner } from "./lib/ledger";
import { usdc, pct } from "./lib/format";

// Live operator dashboard. Polls the backend for incoming credit requests and
// shows the agent's decisions in real time. Escalated requests are actionable:
// the human can ask the borrower a question, decline, or approve on the Ledger.

const STATUS: Record<string, { label: string; cls: string }> = {
  auto_approved: { label: "approved", cls: "border-teal/40 bg-teal-dim text-teal" },
  disbursed: { label: "disbursed", cls: "border-teal/40 bg-teal-dim text-teal" },
  approved: { label: "approved", cls: "border-teal/40 bg-teal-dim text-teal" },
  repaid: { label: "✓ repaid", cls: "border-teal/60 bg-teal text-[#003731]" },
  need_info: { label: "awaiting answer", cls: "border-tertiary/40 bg-surface-3 text-tertiary" },
  escalated: { label: "needs human", cls: "border-amber/40 bg-amber-dim text-amber-bright" },
  declined: { label: "declined", cls: "border-red/40 bg-red/10 text-red" },
};

export default function OperatorDashboard() {
  const [rows, setRows] = useState<CreditRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [asking, setAsking] = useState<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await reqApi.list();
      setRows(r.requests);
    } catch {
      /* ignore transient */
    }
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, 2000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh]);

  const decline = useCallback(
    async (r: CreditRequest) => {
      setBusyId(r.id);
      try {
        await reqApi.decide(r.id, "decline");
        await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const ask = useCallback(
    async (r: CreditRequest) => {
      const text = (asking[r.id] || "").trim();
      if (!text) return;
      setBusyId(r.id);
      try {
        await reqApi.ask(r.id, text);
        setAsking((a) => ({ ...a, [r.id]: "" }));
        await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [asking, refresh],
  );

  // Human-in-the-loop on-chain approval: open the line, sign the payout on the
  // physical Ledger, submit approveAndDisburse on Arc.
  const approveOnLedger = useCallback(
    async (r: CreditRequest) => {
      setBusyId(r.id);
      setNote("Confirm the payout on your Ledger…");
      try {
        const line = await api.openLine(r.nullifierHash, CHAIN.auto.customer, CHAIN.lineMaxDisplay);
        const nonce = Math.floor(performance.now());
        const prep = await api.escalatePrepare(line.lineId, r.merchant, String(r.amountDisplay), nonce);
        const session = await connectLedger();
        const sig = await signInner(session, prep.digest);
        await session.close();
        await api.escalateSubmit(line.lineId, r.merchant, prep.onChainAmount, prep.nonce, sig);
        await reqApi.decide(r.id, "approve");
        setNote("Approved on Ledger, settled on Arc.");
        await refresh();
      } catch (e) {
        setNote(`Ledger approval failed: ${(e as Error).message}`);
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const markRepaid = useCallback(
    async (r: CreditRequest) => {
      setBusyId(r.id);
      setNote(null);
      try {
        const res = await api.repay(r.nullifierHash, r.id);
        setNote(`Marked repaid — credit freed.${res.hash ? " On-chain repay submitted." : ""}`);
        await refresh();
      } catch (e) {
        setNote(`Repay failed: ${(e as Error).message}`);
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const pending = rows.filter((r) => r.status === "escalated").length;
  const granted = (st: string) => st === "auto_approved" || st === "approved" || st === "disbursed";

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-4 px-6 py-6">
      <header className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal text-lg font-black text-[#003731]">
            F
          </div>
          <div>
            <div className="text-lg font-bold leading-none">Fiado · Operator</div>
            <div className="text-[11px] text-faint">live agent activity — polling every 2s</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal/40 bg-teal-dim px-2.5 py-1 text-teal-bright">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal" /> live
          </span>
          {pending > 0 && (
            <span className="rounded-full border border-amber/40 bg-amber-dim px-2.5 py-1 text-amber-bright">
              {pending} need human
            </span>
          )}
        </div>
      </header>

      {note && <div className="rounded-xl border border-border bg-surface-2 px-4 py-2 text-xs text-muted">{note}</div>}

      {rows.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-faint">
          No requests yet. Open the customer app and request store credit — decisions appear here live.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const s = STATUS[r.status] ?? { label: r.status, cls: "border-border text-muted" };
          const openQ = r.questions.find((q) => q.answer === undefined);
          return (
            <div key={r.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-extrabold tracking-tight">{usdc(r.amountDisplay)}</span>
                  <span className="font-mono text-[11px] text-faint">{r.nullifierHash.slice(0, 10)}…</span>
                </div>
                <div className="flex items-center gap-2">
                  {r.decidedBy && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        r.decidedBy === "agent" ? "bg-teal/15 text-teal" : "bg-surface-3 text-muted"
                      }`}
                    >
                      {r.decidedBy === "agent" ? "🤖 agent" : "rule"}
                    </span>
                  )}
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>
                </div>
              </div>

              <div className="mt-1 text-xs text-muted">
                {r.purpose ? `"${r.purpose}"` : "(no purpose given)"} · confidence {pct(r.confidence)}
              </div>

              {r.agentReasoning && (
                <p className="mt-2 rounded-lg border border-border/60 bg-bg/50 px-3 py-2 text-xs text-ink/80">
                  {r.agentReasoning}
                </p>
              )}

              {openQ && (
                <div className="mt-2 text-xs text-tertiary">
                  Q: {openQ.text} {openQ.answer ? `→ ${openQ.answer}` : "(awaiting borrower)"}
                </div>
              )}
              {r.questions
                .filter((q) => q.answer)
                .map((q) => (
                  <div key={q.id} className="mt-1 text-xs text-muted">
                    <span className="text-faint">{q.askedBy === "agent" ? "agent asked" : "you asked"}:</span> {q.text}{" "}
                    → <span className="text-ink/80">{q.answer}</span>
                  </div>
                ))}

              {r.tx && (
                <a
                  href={`${EXPLORER}/tx/${r.tx}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block font-mono text-[11px] text-teal hover:text-teal-bright"
                >
                  ↗ {r.tx.slice(0, 12)}… on ArcScan
                </a>
              )}

              {/* mark a granted loan repaid -> frees the borrower's credit */}
              {granted(r.status) && (
                <div className="mt-3 border-t border-border/60 pt-3">
                  <button
                    onClick={() => markRepaid(r)}
                    disabled={busyId === r.id}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-teal/50 hover:text-teal disabled:opacity-40"
                  >
                    {busyId === r.id ? "Repaying…" : "✓ Mark repaid"}
                  </button>
                </div>
              )}

              {/* operator actions for escalated requests */}
              {r.status === "escalated" && (
                <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3">
                  <div className="flex gap-2">
                    <input
                      value={asking[r.id] ?? ""}
                      onChange={(e) => setAsking((a) => ({ ...a, [r.id]: e.target.value }))}
                      placeholder="Ask the borrower a question…"
                      className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs outline-none focus:border-teal"
                    />
                    <button
                      onClick={() => ask(r)}
                      disabled={busyId === r.id}
                      className="rounded-lg border border-border px-3 py-2 text-xs text-muted hover:text-ink disabled:opacity-40"
                    >
                      Ask
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveOnLedger(r)}
                      disabled={busyId === r.id}
                      className="flex-1 rounded-lg bg-teal px-3 py-2 text-xs font-bold text-[#003731] hover:bg-teal-bright disabled:opacity-40"
                    >
                      ⎘ Approve on Ledger
                    </button>
                    <button
                      onClick={() => decline(r)}
                      disabled={busyId === r.id}
                      className="rounded-lg border border-red/40 px-3 py-2 text-xs font-medium text-red hover:bg-red/10 disabled:opacity-40"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
