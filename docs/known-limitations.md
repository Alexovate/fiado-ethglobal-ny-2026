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
- The **proof itself** is mocked via `DEMO_MOCK_MODE` for rehearsal reliability.
  Wiring IDKit 4.0 to carry a live World App proof (and the v4 `responses[]`
  verify payload) is the remaining integration.

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

- **How do you underwrite someone with no credit score?** Today: deterministic
  policy over verified-personhood, repayment history, and mandate bounds.
  Roadmap: conversational/alternative-data intake — the agent asks a few
  questions and maps answers to *structured features* that feed the deterministic
  confidence score. The LLM gathers and explains; policy and contract still decide.
- **Is this lending?** No — merchant store credit. The customer never receives
  cash; the merchant is paid directly in USDC.
- **What stops one person opening many lines?** World ID: one verified human, one
  active line — enforced on-chain (`humanToLine`) and gated server-side by `/verify`.
