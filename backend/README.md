# backend — Fiado verifier + policy

Node/TypeScript service. World ID verification, one-line-per-human enforcement,
the deterministic AUTO/ESCALATE policy engine, and the backend signature that
authorizes `openLine` on-chain.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | liveness + mode |
| POST | `/verify` | World ID proof -> verified human (mock fallback in `DEMO_MOCK_MODE`) |
| POST | `/credit/authorize` | backend signature to open the credit line on-chain |
| POST | `/credit/quote` | disbursement decision: `AUTO` (inside mandate) vs `ESCALATE` (needs Ledger) |

## Policy

Deterministic. The agent narrates it; it can only be stricter than the contract,
never looser. Escalation reasons: `OVER_TX_CAP`, `OVER_TOTAL_CAP`,
`LOW_CONFIDENCE`, `NEW_MERCHANT`, `VELOCITY_ANOMALY`, `MANDATE_EXPIRED`.
Confidence is legible and deterministic (18.50 of 250 -> 0.95; 1500 of 250 -> 0.71).

## Signing

`openLine` authorization uses EIP-191 personal_sign over
`keccak256(abi.encode(creditLine, nullifierHash, customer, maxAmount, expiresAt))`,
matching `CreditLine.openLine`'s `ecrecover`. Verified end-to-end: a viem
signature recovers to the backend signer under the contract's exact scheme.

## Run

```bash
npm install
npm test          # policy engine (7 tests)
npm run typecheck
npm run dev       # watch mode on :3001

# minimal env to boot:
# DEMO_MOCK_MODE=true BACKEND_SIGNER_PRIVATE_KEY=0x... CREDITLINE_ADDRESS=0x... npm start
```

See repo-root `.env.example` for all variables.
