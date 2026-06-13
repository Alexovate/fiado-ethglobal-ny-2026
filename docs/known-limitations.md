# Known Limitations & Q&A

Honest scope for judging. The core thesis is real and proven on-chain; these are
the deliberate hackathon-scope cuts and how we'd answer them at the table.

## Smart contract (demo-grade, not production)

The `CreditLine` spine is intentionally minimal. Known gaps we would close for
production, and would not hide if asked:

- **Line expiry not checked at disbursement.** `openLine` stores `expiresAt`, but
  `_disburse` does not reject a disbursement after it. Fix: `require(block.timestamp < line.expiresAt)`.
- **`repay` is permissionless.** Anyone can repay a line and raise that human's
  reputation. Harmless for the demo (repaying someone's debt only helps them),
  but reputation should credit the borrower, not the payer-of-record.
- **`closeLine` ignores outstanding balance.** Owner can close a line with debt
  still owed. Fix: `require(line.outstanding == 0)` (or an explicit write-off path).
- **Owner/operator is a single EOA.** Production wants a multisig/timelock for
  merchant registration and mandate management.

We did not redeploy to patch these during the event — the deployed contract is
the one our live device test passed against, and we valued a proven, stable
demo over last-minute contract churn.

## World ID

- The **verify-gate is real**: a line cannot open for an unverified nullifier.
- The **live World ID 4.0 scan works**: IDKit 4.0 in the mini app → World App →
  backend verifies via `/api/v4/verify/{rp_id}` (RP-signature signed with the
  app's signing key). `DEMO_MOCK_MODE` remains as an offline-rehearsal fallback.
- The live World flow must be served from the **production build** (`vite preview`
  / a tunnel) — the dev server mis-serves the IDKit WASM.

## Ledger

- We ship a reliable **hardware-approval gate**: a real device signs the mandate
  and each escalation; the on-chain contract verifies via `ecrecover`.
- We sign with `personal_sign`, so the device shows a signing request / hash —
  **not** a Clear-Signed (ERC-7730) decoded "Pay X to Y". That decoding is the
  stretch; our UI copy reflects this honestly.

## Demo scaling

On-chain amounts are scaled down (`DEMO_SCALE_DIVISOR`) so one testnet faucet
covers the demo. The UI shows representative amounts; ArcScan shows the scaled
on-chain value. The mechanism is identical at 1:1.

## Anticipated Q&A

- **How do you underwrite someone with no credit score?** An AI agent (Claude)
  reads verified personhood, repayment history, the requested amount and purpose,
  and can ask the borrower one clarifying question — then grants, escalates, or
  declines. It reasons *inside* hard guardrails (auto-grant under 5 USDC,
  force-escalate over the limit); the policy and contract enforce the bounds, so
  the agent can never widen a limit.
- **What stops a person stacking up loans?** One open loan per verified human
  until repaid (backend-enforced), plus on-chain caps (one line per nullifier,
  line maxAmount, mandate per-tx/total). The same person is blocked from new
  credit until the operator marks the loan repaid.
- **Is this lending?** No — merchant store credit. The customer never receives
  cash; the merchant is paid directly in USDC.
- **Is the AI moving money on its own?** Only within a mandate a human signed on a
  Ledger (caps, registered merchants, time-boxed). Anything outside it stops for a
  human to approve on the device.
