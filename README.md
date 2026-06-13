# Fiado

> Verified-human store credit. The merchant gets USDC. The agent disburses
> autonomously inside a hardware-signed mandate — and a real person approves on
> Ledger the instant a decision steps outside that mandate.

ETHGlobal New York 2026 prototype. Clean-room build — not production code.

## One line

One verified human, one store-credit line. World ID enforces personhood, an
agent scores and routes the decision, Arc settles USDC directly to the merchant,
and a physical Ledger signs the agent's spending mandate and approves any
exception that escapes it.

## Why it scales (and why Ledger is not a bottleneck)

A human does not approve every small purchase. The treasury operator signs the
agent **mandate once** on a physical Ledger: max per transaction, max total
outstanding, registered merchants only, time-boxed. Inside that envelope the
agent settles instantly with no human in the loop. Ledger returns only as an
**exception gate** — large amounts, low agent confidence, new merchants, or
anomalies. Bounded autonomy, hardware-enforced.

## Sponsors (3, all load-bearing)

| Sponsor | Role |
| --- | --- |
| **World ID** | One verified human = one credit line. Anti-Sybil. Product breaks without it. |
| **Arc / Circle** | USDC settled directly to the merchant. The payment rail. |
| **Ledger** (physical) | Signs the agent mandate once; approves any escalation. The trust gate. |

## Architecture

```
Customer / Demo UI
  -> World ID / IDKit proof
  -> Backend verifier (World verify API, nullifier store, one-line enforcement, signed authorization)
  -> Agent service (deterministic scoring + routing: AUTO vs ESCALATE, policy trace)
  -> Ledger (physical): signs mandate once; approves escalations
  -> Arc CreditLine contract (mandate-bounded autoDisburse, escalation approveAndDisburse, repay, reputation)
  -> Merchant balance / Arc explorer
```

## Monorepo

| Path | Contents |
| --- | --- |
| `contracts/` | `CreditLine` Solidity contract, tests, deploy scripts |
| `backend/` | World ID verification, nullifier store, policy API, tx orchestration |
| `agent/` | Agent workflow, scoring + AUTO/ESCALATE routing, Ledger approval adapter |
| `app/` | Mission-control demo UI: customer, agent trace, merchant, Ledger, tx panel |
| `docs/` | Architecture diagram, demo script, judging notes |
| `feedback/` | `ledger.md` — Ledger docs/SDK feedback + screenshots |

## Deployed (Arc Testnet · chainId 5042002)

- **CreditLine:** [`0x0068589C0F011c9EB2d054293d6dB8594dc5031e`](https://testnet.arcscan.app/address/0x0068589C0F011c9EB2d054293d6dB8594dc5031e)
- USDC (ERC-20, 6 dec): `0x3600000000000000000000000000000000000000`
- Proof tx — `openLine` accepted with a backend signature, on-chain:
  [`0xc4b2e06f…cf7cfa42e`](https://testnet.arcscan.app/tx/0xc4b2e06fe74a02cad0bbfcbc2c4e84213851a647cdd75a27e604931cf7cfa42e)

## What is real vs mocked

- **Real:** `CreditLine` deployed on Arc; merchant registration, credit-line
  opening with backend signature, and the USDC pool all verified on-chain;
  contract-enforced mandate bounds + escalation gate; deterministic policy engine.
- **Real (pending device):** mandate signing and escalation approval use the
  physical Ledger — wired via WebHID.
- **Scaled for demo:** on-chain settlement = displayed amount ÷ `DEMO_SCALE_DIVISOR`
  so a single testnet faucet covers the demo. The mechanism is identical at 1:1.
- **Mocked until wired:** World ID proof can run through `DEMO_MOCK_MODE` as a
  rehearsal fallback; the live path verifies real World ID proofs.

## Setup

See `.env.example`. Contracts: `cd contracts && forge test`. Backend:
`cd backend && npm i && npm run dev`. App: `cd app && npm i && npm run dev`.
