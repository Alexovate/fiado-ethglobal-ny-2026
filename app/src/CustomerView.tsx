import { useCallback, useEffect, useRef, useState } from "react";
import { IDKitRequestWidget, orbLegacy, type IDKitResult, type RpContext } from "@worldcoin/idkit";
import { api, requests, EXPLORER, type CreditRequest } from "./lib/api";
import { CHAIN } from "./lib/scenarios";
import { usdc, pct } from "./lib/format";

// Customer surface (External World ID app, IDKit). Flow: verify first -> see your
// standing (creditworthiness + any unanswered agent question) -> request store
// credit -> the agent may ask a question -> approved / escalated. Phone-shaped.

const APP_ID = (import.meta.env.VITE_WORLD_APP_ID as `app_${string}`) ?? "app_staging";
const ACTION = (import.meta.env.VITE_WORLD_ACTION as string) ?? "fiado-credit-line";

interface Status {
  verified: boolean;
  reputationTier: string;
  availableDisplay: string;
  openRequestId: string | null;
  openQuestion: string | null;
}

export default function CustomerView() {
  const [amount, setAmount] = useState("80");
  const [purpose, setPurpose] = useState("");
  const [nullifier, setNullifier] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [req, setReq] = useState<CreditRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [tx, setTx] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
  };
  useEffect(() => stopPoll, []);

  const loadStatus = useCallback(async (n: string) => {
    const s = await api.customerStatus(n);
    setStatus(s);
  }, []);

  // After a successful World ID proof: remember the human + load their standing.
  const onVerified = useCallback(
    async (p: IDKitResult) => {
      setErr(null);
      setBusy(true);
      try {
        const { nullifierHash } = await api.verifyProof(p);
        setNullifier(nullifierHash);
        await loadStatus(nullifierHash);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [loadStatus],
  );

  const startVerify = useCallback(async () => {
    setErr(null);
    setBusy(true);
    try {
      const sig = await api.rpSignature(ACTION);
      setRpContext({
        rp_id: sig.rp_id,
        nonce: sig.nonce,
        created_at: sig.created_at,
        expires_at: sig.expires_at,
        signature: sig.signature,
      } as RpContext);
      setOpen(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  // Offline rehearsal: skip the scan with a demo nullifier (backend mock-accepts).
  const demoSkip = useCallback(async () => {
    setErr(null);
    setBusy(true);
    try {
      await api.verify(CHAIN.auto.nullifier);
      setNullifier(CHAIN.auto.nullifier);
      await loadStatus(CHAIN.auto.nullifier);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [loadStatus]);

  const submitRequest = useCallback(async () => {
    if (!nullifier) return;
    setBusy(true);
    setErr(null);
    try {
      const base = Math.round(parseFloat(amount || "0") * 1_000_000);
      const r = await requests.create(nullifier, CHAIN.merchant, base, purpose);
      setReq(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [nullifier, amount, purpose]);

  const answerPending = useCallback(async () => {
    if (!status?.openRequestId) return;
    setBusy(true);
    try {
      const r = await requests.get(status.openRequestId);
      setReq(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [status]);

  const sendAnswer = useCallback(
    async (questionId: string) => {
      if (!req) return;
      setBusy(true);
      try {
        const r = await requests.answer(req.id, questionId, answerText);
        setReq(r);
        setAnswerText("");
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [req, answerText],
  );

  // AUTO -> settle on-chain (best effort); ESCALATE -> poll for the reviewer's call.
  useEffect(() => {
    if (!req || !nullifier) return;
    if (req.status === "auto_approved" && !tx) {
      (async () => {
        try {
          const line = await api.openLine(nullifier, CHAIN.auto.customer, CHAIN.lineMaxDisplay);
          const { hash } = await api.disburse(line.lineId, CHAIN.merchant, String(req.amountDisplay));
          setTx(hash);
        } catch {
          /* mandate may be inactive in mock; the decision still stands */
        }
      })();
    }
    if (req.status === "escalated" || (req.status === "need_info" && req.questions.some((q) => q.askedBy === "human"))) {
      stopPoll();
      poll.current = setInterval(async () => {
        try {
          const r = await requests.get(req.id);
          setReq(r);
          if (["approved", "declined", "disbursed", "auto_approved"].includes(r.status)) stopPoll();
        } catch {
          /* ignore */
        }
      }, 2000);
    }
    return stopPoll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req?.status, req?.id, nullifier]);

  const openQ = req?.questions.find((q) => q.answer === undefined);
  const restart = () => {
    setReq(null);
    setTx(null);
    setErr(null);
    stopPoll();
    if (nullifier) loadStatus(nullifier);
  };

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col gap-4 px-5 py-6">
      <header className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal text-base font-black text-[#003731]">
          F
        </div>
        <div>
          <div className="font-bold leading-none">Fiado</div>
          <div className="text-[11px] text-faint">Doña Rosa Corner Store</div>
        </div>
        {nullifier && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-teal/40 bg-teal-dim px-2.5 py-1 text-[11px] text-teal-bright">
            <span className="h-1.5 w-1.5 rounded-full bg-teal" /> World ID
          </span>
        )}
      </header>

      {/* STEP 1 — verify first */}
      {!nullifier && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">Buy now, pay later</div>
          <p className="text-sm text-muted">
            Prove you're a real person to access store credit at Doña Rosa. One verified human, one credit line.
          </p>
          <button
            onClick={startVerify}
            disabled={busy}
            className="mt-1 rounded-xl bg-teal px-4 py-3 text-sm font-bold text-[#003731] transition hover:bg-teal-bright disabled:opacity-40"
          >
            {busy ? "Verifying…" : "Verify with World ID"}
          </button>
          {rpContext && (
            <IDKitRequestWidget
              open={open}
              onOpenChange={setOpen}
              app_id={APP_ID}
              action={ACTION}
              rp_context={rpContext}
              allow_legacy_proofs={true}
              preset={orbLegacy({})}
              // return_to caused an iOS reload loop (page reloads on return -> the
              // IDKit polling session is lost). Omitting it keeps the page alive;
              // the user swipes back to Safari and polling completes. Bulletproof
              // demo path: laptop + phone-QR-scan (the laptop page stays open).
              handleVerify={onVerified}
              onSuccess={() => setOpen(false)}
              onError={(e: unknown) => setErr(`verification error: ${JSON.stringify(e)}`)}
            />
          )}
          <button onClick={demoSkip} disabled={busy} className="text-center text-[11px] text-faint hover:text-muted">
            Demo (skip World ID scan)
          </button>
        </div>
      )}

      {/* STEP 2 — status + request (verified, no active request) */}
      {nullifier && !req && (
        <>
          <div className="rounded-2xl border border-teal/30 bg-teal-dim/20 p-5">
            <div className="flex items-center gap-2 text-teal">
              <ShieldIcon />
              <span className="font-semibold">Verified human</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-faint">Standing</div>
                <div className="font-semibold">{status?.reputationTier ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-faint">Available credit</div>
                <div className="font-semibold text-teal">{status ? usdc(Number(status.availableDisplay)) : "—"}</div>
              </div>
            </div>
          </div>

          {status?.openQuestion ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-amber/40 bg-amber-dim/30 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-bright">
                You have an unanswered question
              </div>
              <p className="text-sm">{status.openQuestion}</p>
              <button
                onClick={answerPending}
                disabled={busy}
                className="rounded-xl bg-amber px-4 py-2.5 text-sm font-bold text-[#3a2c10] disabled:opacity-40"
              >
                Answer it now
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">Request store credit</div>
              <label className="text-xs text-muted">Amount (USDC)</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-2xl font-bold outline-none focus:border-teal"
              />
              <label className="text-xs text-muted">What's it for? (optional)</label>
              <input
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. groceries"
                className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm outline-none focus:border-teal"
              />
              <button
                onClick={submitRequest}
                disabled={busy}
                className="mt-1 rounded-xl bg-teal px-4 py-3 text-sm font-bold text-[#003731] transition hover:bg-teal-bright disabled:opacity-40"
              >
                {busy ? "Requesting…" : "Request store credit"}
              </button>
            </div>
          )}
        </>
      )}

      {/* STEP 3 — agent chat (a question is open) */}
      {req && openQ && (
        <div className="flex flex-col gap-3 rounded-2xl border border-teal/30 bg-teal-dim/30 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-teal">
            {openQ.askedBy === "agent" ? "Agent has a question" : "Reviewer has a question"}
          </div>
          <p className="text-sm">{openQ.text}</p>
          <input
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            placeholder="Type your answer…"
            className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm outline-none focus:border-teal"
          />
          <button
            onClick={() => sendAnswer(openQ.id)}
            disabled={busy || !answerText.trim()}
            className="rounded-xl bg-teal px-4 py-2.5 text-sm font-bold text-[#003731] disabled:opacity-40"
          >
            Send answer
          </button>
        </div>
      )}

      {/* STEP 4 — outcomes */}
      {req && !openQ && (req.status === "auto_approved" || req.status === "disbursed") && (
        <Outcome
          tone="teal"
          title="Approved"
          body={`${usdc(req.amountDisplay)} store credit at Doña Rosa. The merchant is paid directly — you pay it back later.`}
          confidence={req.confidence}
          tx={tx}
        />
      )}
      {req && !openQ && req.status === "approved" && (
        <Outcome tone="teal" title="Approved by reviewer" body="A person reviewed and approved your request." confidence={req.confidence} tx={tx} />
      )}
      {req && req.status === "escalated" && (
        <Outcome
          tone="amber"
          title="A person is reviewing"
          body="This one needs a human. A reviewer is looking at your request now — hang tight."
          confidence={req.confidence}
        />
      )}
      {req && req.status === "declined" && (
        <Outcome tone="amber" title="Not approved" body="This request wasn't approved. You can try a smaller amount." confidence={req.confidence} />
      )}

      {err && <div className="rounded-xl border border-red/40 bg-red/10 p-3 text-xs text-red">{err}</div>}

      {req && (
        <button onClick={restart} className="text-xs text-faint hover:text-muted">
          ← back to my account
        </button>
      )}
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function Outcome({
  tone,
  title,
  body,
  confidence,
  tx,
}: {
  tone: "teal" | "amber";
  title: string;
  body: string;
  confidence: number;
  tx?: string | null;
}) {
  const c = tone === "teal" ? "border-teal/40 bg-teal-dim/40 text-teal" : "border-amber/40 bg-amber-dim/40 text-amber-bright";
  return (
    <div className={`flex flex-col gap-2 rounded-2xl border p-5 ${c}`}>
      <div className="text-lg font-extrabold tracking-tight">{title}</div>
      <p className="text-sm text-ink/90">{body}</p>
      <div className="text-[11px] text-muted">agent confidence {pct(confidence)}</div>
      {tx && (
        <a href={`${EXPLORER}/tx/${tx}`} target="_blank" rel="noreferrer" className="font-mono text-xs text-teal hover:text-teal-bright">
          ↗ {tx.slice(0, 12)}… on ArcScan
        </a>
      )}
    </div>
  );
}
