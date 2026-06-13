# Demo Script (run-of-show)

Two surfaces on screen: a phone showing the **customer mini app**
(`/#customer`) and a laptop showing the **operator dashboard** (`/`, live).
4-minute finalist cut + 90-second table cut.

## Setup before the slot

- Backend + built app + tunnel running (`./run.sh <reserved-domain>`), backend `DEMO_MOCK_MODE=false`.
- Physical Ledger plugged in, unlocked, **Ethereum app open**, in Chrome.
- Operator dashboard open on the laptop (it polls every 2s).
- Backup video ready if Wi-Fi / World App / faucet misbehaves.

## 4-minute cut

| Time | On screen | Spoken |
| --- | --- | --- |
| 0:00–0:30 | Corner store / problem | Informal store tabs are real and trusted, but they don't scale — and there's no way to know who's a real person. |
| 0:30–1:00 | Phone: scan QR → World App → verified | A real, unique human proves themselves with World ID. One verified human, one credit line — that's our anti-fraud moat. |
| 1:00–1:50 | Phone: request 12 USDC → **agent reasons** (may ask one question) → Approved | An AI agent underwrites it in seconds — it even asks a clarifying question, then approves. The merchant is paid in USDC on Arc. No human in the loop. (show the ArcScan tx) |
| 1:50–3:00 | Phone: request a large amount → laptop **dashboard lights up "needs human"** → operator opens review → **approves on the physical Ledger** | This one's too big for the agent's mandate, so it escalates. The operator sees the agent's reasoning, the borrower's history, can chat with them — then approves on hardware. Only now does Arc disburse. |
| 3:00–3:30 | Phone: same person requests again → **blocked "repay first"** → operator clicks **Mark repaid** → freed | One open loan at a time — no stacking. Repayment frees the credit and raises reputation. |
| 3:30–4:00 | Recap | Financial access without a bank, without cash-out fraud, without duplicate identities — and an AI that scales but can't move money unchecked. |

## 90-second table cut

World ID scan → 12 USDC agent-approved (with reasoning) → one large request escalates →
operator approves on the Ledger → "and the same person can't borrow again until they repay." Done.

## The line to repeat

> "One verified human, one credit line. The agent handles the everyday loans on
> its own; a human approves the big ones on a Ledger; the contract enforces the
> limits no matter what."

## Fallbacks

- Play the backup video if the live scan / network fails.
- `#customer` "Demo (skip World ID)" runs the flow without a scan (rehearsal only; needs `DEMO_MOCK_MODE=true`).
- If the agent (Claude) is rate-limited, the backend falls back to the deterministic policy automatically.
