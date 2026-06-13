# app — Fiado mission control

The judge-facing demo surface. One dark, projector-legible screen showing the
whole system: customer request, the human-set mandate (the frame), the agent's
reasoning trace, merchant settlement on Arc, and the physical-Ledger escalation
gate.

Vite + React + TypeScript + Tailwind v4 + framer-motion.

## The two choreographed moments

- **Auto purchase · 18.50** — inside the mandate, confidence 0.95 → the agent
  approves and Arc settles instantly. No human. (the 99% case)
- **High-value · 1,500 → escalation** — outside the per-tx cap, confidence 0.71
  → the agent stops and opens a rich Ledger approval modal containing everything
  a human needs to decide: **why the agent is unsure**, the **agent's assessment +
  recommendation**, and the **full borrower profile** (reputation, repayment
  history, default rate). The human confirms on the device, then Arc settles.

Design intent: the human only sets the frame once; the agent operates
autonomously inside it and escalates exceptions with full context.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
npm run typecheck
```

Two modes via the toggle:

- **Mock** — self-contained, offline-rehearsal-safe (no backend/chain needed).
- **Live (Arc)** — wired to the backend (`/api` proxy). Sign the mandate on the
  physical Ledger (WebHID) → `setAgentMandate`; AUTO runs `openLine` +
  `autoDisburse`; ESCALATE opens a line and the human confirms the payout on the
  device → `approveAndDisburse`. Merchant balance and tx links come from Arc.
  Verified end-to-end on Arc testnet.

Note: live mode currently uses fixed demo nullifiers; wiring IDKit so the
nullifier comes from a real World ID proof is the remaining World integration.
