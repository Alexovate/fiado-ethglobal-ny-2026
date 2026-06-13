# Architecture

> A rendered Mermaid diagram lives in the [README](../README.md#architecture).
> This file keeps the textual reference + the trust split.

The gray-zone underwriting is done by an **AI agent** (the `claude` CLI spawned
headless on a Max subscription) between the verifier and the contract:
`≤5 USDC` auto-grant (rule) · gray zone → agent (grant / ask / escalate) ·
`>limit` → human + Ledger. Credit limit: one open tab per human until repaid.

```
+------------------+        +-----------------------------+
|  Customer / UI   |        |  Treasury operator          |
|  (mission ctrl)  |        |  + physical Ledger          |
+--------+---------+        +--------------+--------------+
         |                                 |
         | World ID proof                  | setAgentMandate(...) signed once
         v                                 v
+------------------+        +-----------------------------+
| Backend verifier |        |   Arc CreditLine contract   |
| - World verify   |        |   - merchantRegistry        |
| - nullifier store|------->|   - agentMandate            |
| - one line/human |        |   - autoDisburse (bounded)  |
| - signed auth    |        |   - approveAndDisburse (esc)|
+--------+---------+        |   - repay / reputation      |
         |                  +--------------+--------------+
         v                                 |
+------------------+   AUTO                | USDC
| Agent service    |---------------------->|--------> Merchant balance
| - score + route  |                       |
| - AUTO/ESCALATE  |   ESCALATE            v
| - policy trace   |------> physical Ledger approval ----> approveAndDisburse
+------------------+
```

## Trust split (the core idea)

- **World ID** answers *who* — a unique, verified human; one credit line each.
- **Agent** answers *what* — deterministic score + AUTO/ESCALATE routing.
- **Ledger** answers *is this allowed* — signs the mandate once, approves exceptions.
- **Arc contract** enforces every bound on-chain; the agent cannot widen a cap.
