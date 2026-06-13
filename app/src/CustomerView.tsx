import { useCallback, useEffect, useRef, useState } from "react";
import { IDKitRequestWidget, orbLegacy, type IDKitResult, type RpContext } from "@worldcoin/idkit";
import { api, requests, EXPLORER, type CreditRequest } from "./lib/api";
import { CHAIN } from "./lib/scenarios";
import { usdc, pct } from "./lib/format";

// Customer-facing surface for an EXTERNAL World ID app (IDKit). The borrower asks
// for store credit; verifies personhood via World ID (QR on desktop / deeplink on
// phone); the agent may ask a clarifying question; large/uncertain requests go to
// a human reviewer. Phone-shaped on purpose. Hosted on Vercel for the live demo.

const APP_ID = (import.meta.env.VITE_WORLD_APP_ID as `app_${string}`) ?? "app_staging";
const ACTION = (import.meta.env.VITE_WORLD_ACTION as string) ?? "fiado-credit-line";

export default function CustomerView() {
  const [amount, setAmount] = useState("80");
  const [purpose, setPurpose] = useState("");
  const [nullifier, setNullifier] = useState<string | null>(null);
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

  const startRequest = useCallback(
    async (nullifierHash: string) => {
      const base = Math.round(parseFloat(amount || "0") * 1_000_000);
      const r = await requests.create(nullifierHash, CHAIN.merchant, base, purpose);
      setNullifier(nullifierHash);
      setReq(r);
    },
    [amount, purpose],
  );

  // Fetch a fresh RP signature from the backend, then open the IDKit widget.
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

  // IDKit returns a 4.0 result -> backend forwards it as-is to v4 verify ->
  // start the request with the nullifier the backend extracted from the proof.
  const handleVerify = useCallback(
    async (result: IDKitResult) => {
      const { nullifierHash } = await api.verifyProof(result);
      await startRequest(nullifierHash);
    },
    [startRequest],
  );

  // Offline rehearsal: skip the scan, use a demo nullifier (backend mock-accepts).
  const demoSkip = useCallback(async () => {
    setErr(null);
    setBusy(true);
    try {
      await api.verify(CHAIN.auto.nullifier);
      await startRequest(CHAIN.auto.nullifier);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [startRequest]);

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
  const reset = () => {
    setReq(null);
    setNullifier(null);
    setTx(null);
    stopPoll();
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
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] text-muted">
          buy now, pay later
        </span>
      </header>

      {/* request form + World ID verify */}
      {!req && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
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
            onClick={startVerify}
            disabled={busy}
            className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-teal px-4 py-3 text-sm font-bold text-[#003731] transition hover:bg-teal-bright disabled:opacity-40"
          >
            {busy ? "Verifying…" : "Verify with World ID & request"}
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
              // After World App auth on a phone, return to this page in the browser.
              return_to={typeof window !== "undefined" ? window.location.href : undefined}
              handleVerify={handleVerify}
              onSuccess={() => setOpen(false)}
              onError={(e: unknown) => setErr(`verification error: ${JSON.stringify(e)}`)}
            />
          )}
          <button onClick={demoSkip} disabled={busy} className="text-center text-[11px] text-faint hover:text-muted">
            Demo (skip World ID scan)
          </button>
        </div>
      )}

      {/* agent / reviewer question */}
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

      {/* outcomes */}
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
        <button onClick={reset} className="text-xs text-faint hover:text-muted">
          ← new request
        </button>
      )}
    </div>
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
