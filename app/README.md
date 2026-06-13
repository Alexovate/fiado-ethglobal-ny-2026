# app — Fiado customer, operator, and demo surfaces

One hash-routed Vite app with three surfaces: the phone-shaped customer flow,
the live operator dashboard, and a scripted mission-control fallback.

Vite + React + TypeScript + Tailwind v4 + framer-motion.

## The live surfaces

- `#customer` — World ID 4.0 via IDKit, customer standing, store-credit request,
  agent/reviewer questions, approval state, and ArcScan tx link when available.
- `/` — operator dashboard polling the backend every 2s, with agent decisions,
  human review, customer context, Ledger approval, repayment, and tx links.
- `#demo` — scripted mission-control fallback for the two choreographed moments.

## The two choreographed moments

- **Auto purchase · 18.50** — inside the mandate, confidence 0.95 → the agent
  approves and Arc settles instantly. No human. (the 99% case)
- **High-value · 1,500 → escalation** — outside the per-tx cap, confidence 0.71
  → the agent stops and opens a rich Ledger approval modal containing everything
  a human needs to decide: **why the agent is unsure**, the **agent's assessment +
  recommendation**, and the **full customer profile** (reputation, repayment
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

Note: the scripted `#demo` live toggle uses fixed demo nullifiers for repeatable
Arc runs. The `#customer` surface is the real World ID path: IDKit result →
backend `/verify` → verified nullifier → request state machine.
