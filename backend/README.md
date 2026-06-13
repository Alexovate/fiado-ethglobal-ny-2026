# backend — Fiado verifier + policy

Node/TypeScript service. World ID 4.0 verification, one-line-per-human
enforcement, the credit-request state machine, the Claude-backed gray-zone agent,
the deterministic fallback policy, and the Arc transaction orchestration.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | liveness + mode |
| POST | `/rp-signature` | RP signature for IDKit 4.0 requests |
| POST | `/verify` | World ID 4.0 proof -> verified human (mock fallback in `DEMO_MOCK_MODE`) |
| GET | `/customer/status` | verified customer standing + open question |
| POST | `/credit/authorize` | backend signature to open the credit line on-chain |
| POST | `/credit/quote` | legacy quote endpoint; requires prior verification |
| POST | `/request` | create a store-credit request and run rule/agent decisioning |
| GET | `/requests` | operator dashboard feed |
| POST | `/request/:id/ask` | human reviewer asks the customer a question |
| POST | `/request/:id/answer` | customer answers an agent/reviewer question |
| POST | `/request/:id/disbursed` | persist the Arc tx after live disbursement |
| POST | `/repay` | mark a tab repaid and best-effort repay on-chain |

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
npm test          # policy + store safety tests
npm run typecheck
npm run dev       # watch mode on :3001

# minimal env to boot in offline rehearsal:
# DEMO_MOCK_MODE=true BACKEND_SIGNER_PRIVATE_KEY=0x... CREDITLINE_ADDRESS=0x... AGENT_PRIVATE_KEY=0x... npm start
```

See repo-root `.env.example` for all variables.
