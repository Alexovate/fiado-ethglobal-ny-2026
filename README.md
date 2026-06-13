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

## What is real vs mocked

_Filled in as we build._

- Real: _TBD_
- Mocked: _TBD_

## Setup

See `.env.example`. _Setup steps TBD as components land._
