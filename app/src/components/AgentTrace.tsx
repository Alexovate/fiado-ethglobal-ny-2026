import { motion, AnimatePresence } from "framer-motion";
import type { TraceStep } from "../lib/types";

const ICON: Record<TraceStep["status"], string> = {
  ok: "✓",
  warn: "!",
  fail: "✕",
};

const COLOR: Record<TraceStep["status"], string> = {
  ok: "text-teal",
  warn: "text-amber-bright",
  fail: "text-red",
};

const RING: Record<TraceStep["status"], string> = {
  ok: "border-teal/40 bg-teal-dim",
  warn: "border-amber/40 bg-amber-dim",
  fail: "border-red/40 bg-red/10",
};

export function AgentTrace({
  steps,
  revealed,
  live,
}: {
  steps: TraceStep[];
  revealed: number;
  live: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg/60 p-5 font-mono text-[13px] leading-relaxed">
      <div className="mb-3 flex items-center gap-2 text-faint">
        <span className="text-teal">agent@fiado</span>
        <span>~ evaluating credit request</span>
      </div>
      <div className="space-y-2">
        <AnimatePresence>
          {steps.slice(0, revealed).map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className="flex items-start gap-3"
            >
              <span
                className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-md border text-[11px] font-bold ${RING[s.status]} ${COLOR[s.status]}`}
              >
                {ICON[s.status]}
              </span>
              <span className="flex-1">
                <span className="text-ink">{s.label}</span>
                {s.detail && <span className="text-faint"> — {s.detail}</span>}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        {live && revealed < steps.length && (
          <div className="flex items-center gap-2 text-faint">
            <span className="h-5 w-5" />
            <span>
              analyzing<span className="cursor-blink">_</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
