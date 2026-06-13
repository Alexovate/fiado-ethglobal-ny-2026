# Fiado - PRD (ETHGlobal New York 2026)

> Working codename: **Fiado** - Spanish/LatAm for buying "on the tab" or informal store credit.
>
> Single goal: **win first place on stage.** Partner prizes matter only as guardrails. Every feature must answer: does this make the live demo more convincing to the main judges?
>
> This is a clean-room hackathon prototype. Do not expose production code, real contracts, real merchant integrations, or private regulatory structure from NanoCredit.

---

## 0. Current Ground Truth

As of June 13, 2026, the workspace contains this PRD only. The repo must now start from scratch, with frequent commits.

ETHGlobal New York 2026 public schedule:
- Project submissions due: **Sunday, June 14, 2026 at 09:00 EDT / 15:00 CEST**.
- Main finalist judging: **Sunday, June 14, 2026 at 09:30 EDT**.
- Partner prize judging: **Sunday, June 14, 2026 at 09:30 EDT**.
- Finalists notified: **Sunday, June 14, 2026 at 15:15 EDT**.
- Closing ceremonies and finalist demos: **Sunday, June 14, 2026 at 15:30 EDT**.

Do not assume any stage timing beyond what is confirmed on-site. Prepare a 4-minute finalist demo and a 60-90 second judging-table cut.

---

## 1. Winning Thesis

**One sentence:**
Fiado gives a verified human instant merchant store credit: World ID enforces one credit line per person, an agent explains and orchestrates the decision, Arc settles USDC directly to the merchant, and Ledger is the physical trust gate before funds move.

**The emotional hook:**
A person without a bank account walks into a corner store, gets what they need, and leaves without cash. The merchant receives USDC immediately. The customer never receives cash, cannot create multiple identities, and builds onchain reputation by repaying.

**The technical hook:**
This is not a toy payment app. It joins personhood, stablecoin settlement, programmable store credit, and hardware-gated agent actions into one visible flow.

**The line judges should repeat:**
> "One verified human, one store-credit line. The merchant gets USDC. The agent cannot move funds until a real person approves on Ledger."

---

## 2. What We Must Rethink From The Earlier Plan

1. **Do not pitch "AI lending."**
   Say **merchant-financed store credit**, **merchant credit**, or **BNPL-style store credit**. Avoid "loan", "lending", "customer cash-out", and "underwriting magic". The contract and policy enforce the credit line; the AI agent explains and orchestrates.

2. **Do not make AgentKit carry the whole product.**
   World AgentKit is useful for human-backed agents and AgentBook/x402-style flows, but the core product should not depend on AgentKit being a general-purpose credit runtime. The product must still work if the credit policy is deterministic and enforced by backend + smart contract.

3. **Do not force Circle Nanopayments into merchant settlement.**
   Circle Gateway/x402 nanopayments are designed for agent/API/service micropayments and batched settlement. Our main flow is a merchant payout/store-credit settlement. Use Arc smart contracts and Circle Agent Wallet/Gas Station where they fit. Treat nanopayments as optional bonus, not the spine.

4. **Do not overpromise Ledger Clear Signing.**
   Ledger Clear Signing can require registry metadata and an `originToken`; without that it may fall back to blind signing. The must-have is a reliable **Ledger/Speculos human-in-the-loop approval gate**. ERC-7730/Clear Signing polish is stretch.

5. **Build one demo surface, not five apps.**
   Judges need to understand the whole system in seconds. Build a "mission control" demo that shows customer, merchant, agent reasoning, Arc transaction, and Ledger approval in one choreographed view.

---

## 3. Judging Strategy

**WOW Factor**
The decisive moment is physical and legible:
World ID verified -> store credit approved -> agent requests payout -> Ledger/Speculos prompts approval -> human confirms -> Arc transaction appears -> merchant balance increases.

**Practicality**
This maps to real informal credit. It prevents cash-out fraud by paying the merchant directly and prevents Sybil abuse with one-person-one-credit-line.

**Originality**
The novel combination is:
verified personhood + merchant-direct stablecoin settlement + agent orchestration + hardware-gated autonomy.

**Technicality**
Make the hard parts visible:
- World ID proof verification and nullifier enforcement.
- Arc CreditLine contract with stablecoin accounting.
- Agent action request and policy trace.
- Ledger approval gate before disbursement.
- Architecture diagram and transaction links.

**Usability**
Customer path must feel like two taps:
Verify -> approve store-credit checkout.
The judging/demo path must show the whole flow without tab switching.

---

## 4. Demo Product

The demo is the product. Build the happy path first, then make it resilient.

### Demo Actors

- **Customer:** a verified human with one active credit line.
- **Merchant:** receives USDC directly, never extends cash.
- **Agent:** computes/explains credit policy and requests the disbursement.
- **Ledger approver:** physical/hardware gate for the sensitive action.
- **Contract:** enforces limits, repayment, merchant settlement, and reputation.

### The 4-Minute Script

0:00-0:30 - Human problem:
Informal store tabs are real, trusted, and local, but they do not scale.

0:30-1:00 - Personhood:
Customer verifies with World ID. The system shows the nullifier is accepted and no active credit line exists.

1:00-2:00 - Store credit decision:
Agent reads policy inputs: one verified human, merchant, requested amount, prior repayment score, active line status. It recommends a specific store-credit amount. The policy result is deterministic and auditable.

2:00-3:00 - The moment:
Agent requests merchant payout. Ledger/Speculos displays the approval step. Human confirms. Contract disburses USDC on Arc to the merchant. Show explorer link or local tx panel.

3:00-3:30 - Flywheel:
Repayment updates reputation and raises the future credit line.

3:30-4:00 - Why this wins:
This is financial access without cash-out fraud, without duplicate identities, and without unchecked autonomous payments.

### Backup Demo

Record the full happy path as soon as it works once. Keep it ready. Wi-Fi, faucets, World App, and testnets are not allowed to decide the outcome.

---

## 5. Required Architecture

```
Customer Mini App / Demo UI
  -> World ID / IDKit proof
  -> Backend verifier
      - calls World verify API
      - stores nullifier hash
      - enforces one active credit line per human
      - creates signed credit authorization
  -> Agent service
      - reads policy inputs
      - explains recommendation
      - requests disbursement
      - pauses for Ledger approval
  -> Ledger / Speculos approval gate
  -> Arc CreditLine contract
      - register merchant
      - open credit line
      - disburse USDC to merchant
      - accept repayment
      - update reputation
  -> Merchant balance / Arc explorer
```

### Monorepo Layout

```
/contracts   Solidity CreditLine contract, tests, deployment scripts
/backend     World ID verification, nullifier store, policy API, tx orchestration
/agent       Agent workflow, policy trace, Ledger approval adapter
/app         Main demo UI: customer, merchant, agent, Ledger, tx panel
/docs        Architecture diagram, demo script, judging notes, backup-video checklist
/feedback    ledger.md plus screenshots/notes for Ledger qualification
README.md    Crisp public story, setup, architecture, tx links, what is real vs mocked
```

Use a single web app for the demo unless a real World Mini App can be completed safely. The app can include a Mini App shaped customer view, but the judge-facing mission control is the priority.

---

## 6. Component Decisions

### World

Must-have:
- Use World ID 4.0 as a real constraint.
- Verify proof in backend or smart contract.
- Store and enforce nullifier uniqueness.
- Explain what breaks without World ID: one person could create many credit lines.

Nice-to-have:
- MiniKit/World App native UX.
- AgentKit as proof that the agent is human-backed.

Source truth:
- World ID verification can be done through `POST /api/v4/verify/{rp_id}`.
- MiniKit World ID command has moved to IDKit.
- AgentKit identifies human-backed agents and is meaningful if the product actually enables Human Backed Agents to operate.

### Arc / Circle

Must-have:
- Deploy `CreditLine` on Arc Testnet.
- Use USDC/EURC programmable settlement logic.
- Demonstrate merchant-direct settlement.
- Include architecture diagram and video.

Best Arc track fit:
- **Best Smart Contracts on Arc with Advanced Stablecoin Logic**.

Secondary fit:
- **Best Chain Abstracted USDC Apps Using Arc as a Liquidity Hub** only if CCTP/Gateway is working without hurting the main demo.
- **Best Agentic Economy with Circle Agent Stack** only if a real agent-to-service payment emerges naturally.

Important correction:
Do not call the merchant payout a "nanopayment" unless it actually uses Gateway/x402 in the intended pattern.

### Ledger

Must-have:
- Ledger or Speculos approval is the final gate before funds move.
- The UI clearly separates autonomous recommendation from human approval.
- `/feedback/ledger.md` documents docs/SDK experience, gaps, screenshots, and improvement suggestions.

Stretch:
- Clear Signing / ERC-7730 metadata.
- Ragger/Speculos test harness.

Important correction:
Do not promise full Clear Signing if we only have blind signing or simulated approval. Be honest and make the hardware gate visually strong.

---

## 7. Smart Contract Scope

Contract name: `CreditLine`.

Core state:
- `merchantRegistry[merchant]`
- `humanToLine[nullifierHash]`
- `creditLines[lineId]`
- `reputation[nullifierHash]`
- `totalOutstanding`

Core functions:
- `registerMerchant(address merchant, string metadataURI)`
- `openLine(bytes32 nullifierHash, address customerWallet, uint256 maxAmount, uint256 expiresAt, bytes backendSignature)`
- `requestDisbursement(bytes32 lineId, address merchant, uint256 amount)`
- `approveAndDisburse(bytes32 lineId, address merchant, uint256 amount, bytes ledgerApproval)` or equivalent signed approval path
- `repay(bytes32 lineId, uint256 amount)`
- `closeLine(bytes32 lineId)`

Events:
- `HumanVerified`
- `CreditLineOpened`
- `DisbursementRequested`
- `DisbursementApproved`
- `MerchantPaid`
- `Repaid`
- `ReputationUpdated`

Security rules:
- One active line per nullifier.
- Customer never receives disbursement funds.
- Only registered merchants can receive payouts.
- Disbursement cannot exceed line limit.
- Sensitive disbursement path requires approval.
- Repayment improves reputation only after actual payment.

---

## 8. Agent Scope

The agent must feel intelligent without becoming unverifiable.

Inputs:
- Nullifier status.
- Requested amount.
- Merchant registration.
- Existing outstanding balance.
- Repayment score.
- Policy caps.

Output:
- `approvedAmount`
- `reasonCodes`
- `riskLevel`
- `requiresLedgerApproval`
- `contractCallPreview`

Policy:
- Deterministic scoring first.
- LLM/agent can narrate, explain, and route actions.
- Never let the LLM invent eligibility or bypass contract checks.

Demo log example:
```
Verified human: yes
Active credit line: no
Merchant registered: yes
Requested: 18.50 USDC
Reputation tier: starter
Policy cap: 25.00 USDC
Decision: approve 18.50 USDC store credit
Next step: request Ledger approval for merchant payout
```

---

## 9. UI Scope

Build the judge-facing experience first.

Main screen:
- Left: customer checkout card.
- Center: agent decision trace.
- Right: merchant balance and Arc transaction status.
- Bottom or modal: Ledger/Speculos approval step.

Required states:
- Pre-verified.
- World ID verified.
- Credit decision pending.
- Approved with policy details.
- Waiting for Ledger approval.
- Merchant paid.
- Repaid / reputation increased.
- Failure fallback with "play backup video" cue.

Do not create a marketing landing page. The first screen must be the product/demo.

---

## 10. Partner Prize Alignment

Submit exactly these three partner categories unless on-site partner guidance changes:

1. **World**
   - Track A: AgentKit if meaningful Human Backed Agent flow is working.
   - Track B: World ID is safer and core. Product breaks without proof of human.

2. **Arc**
   - Primary: Best Smart Contracts on Arc with Advanced Stablecoin Logic.
   - Secondary: Chain Abstracted USDC only if crosschain repayment works.
   - Do not chase private nanopayments; it requires Dynamic + Arc + Unlink and distracts from main goal.

3. **Ledger**
   - AI Agents x Ledger.
   - Must include clear feedback on docs/SDKs.
   - Must show Ledger as trust layer, not wallet branding.

---

## 11. Build Order

### Phase 0 - Repo and skeleton

- `git init`
- README scaffold
- monorepo directories
- `.env.example`
- demo script stub
- architecture diagram stub
- first commit

### Phase 1 - Contract spine

- Arc network config.
- `CreditLine.sol`.
- Unit tests for one-human-one-line, merchant-only payout, repayment.
- Local deployment script.

### Phase 2 - Backend verifier and policy

- World proof verification endpoint.
- Nullifier store.
- Policy engine.
- Signed authorization path for opening credit line.

### Phase 3 - Demo UI

- Mission control interface.
- Mock mode for offline rehearsal.
- Real mode for contract/backend.
- Transaction status and explorer link.

### Phase 4 - Agent + Ledger

- Agent decision trace.
- Ledger/Speculos approval gate.
- Approval artifact attached to disbursement flow.
- Screenshot/notes for `/feedback/ledger.md`.

### Phase 5 - Polish and submission

- Backup video.
- README with "what is real vs mocked".
- Architecture diagram.
- Partner prize descriptions.
- Rehearsal timer.

---

## 12. Cut Lines

Cut immediately if it threatens the core demo:
- CCTP / crosschain repayment.
- Full World Mini App polish.
- Full ERC-7730 Clear Signing.
- Nanopayments/x402 merchant settlement.
- Multi-merchant dashboards.
- Complex credit scoring.
- Any regulatory essay inside the app.

Protect at all costs:
- World ID uniqueness.
- Merchant-direct USDC payout.
- Ledger approval moment.
- Contract-enforced credit limits.
- Clean README + architecture diagram + video.

---

## 13. Framing Rules

Use:
- "store credit"
- "merchant-financed credit"
- "BNPL-style checkout"
- "verified human"
- "merchant-direct settlement"
- "hardware-gated agent action"

Do not use:
- "loan"
- "lending"
- "cash advance"
- "AI decides who deserves credit"
- "banking the unbanked" unless carefully framed
- "Solana"
- "BLE proximity"

Pilot facts only:
- 3 merchants
- 28 transactions
- 23 borrowers
- 87% positive feedback
- 6-day pilot

Mercator Fellowship, if mentioned:
- "German federal government fellowship, full-year 2025, completed Dec 2025."

---

## 14. Q&A Answers

**Is this lending?**
No. This demo is merchant store credit: the customer receives goods, the merchant receives USDC, and the customer cannot cash out funds.

**Why World ID?**
Without proof of personhood, one user can create many credit lines. World ID lets us enforce one active line per verified human without exposing identity.

**Why a smart contract?**
The contract enforces the rules the agent cannot be trusted to improvise: merchant-only payout, limits, repayment, and reputation.

**Why Ledger?**
Autonomous systems should not move money unchecked. Ledger is the physical approval gate for sensitive agent actions.

**What is AI doing?**
The agent explains, orchestrates, and prepares actions. The policy and contract enforce the decision boundaries.

**What is real vs prototype?**
Real: World ID proof path, Arc contract, merchant-direct settlement, approval gate, policy trace. Prototype: demo merchant data, small testnet balances, simplified repayment scoring.

---

## 15. Submission Checklist

- [ ] Public GitHub repo with frequent commits.
- [ ] README explains project, setup, architecture, and what is real vs mocked.
- [ ] Architecture diagram in `/docs`.
- [ ] Demo script in `/docs`.
- [ ] Backup video recorded.
- [ ] `CreditLine` deployed on Arc Testnet.
- [ ] Testnet USDC funded.
- [ ] Merchant registered and pre-seeded.
- [ ] World ID proof verification works or reliable demo fallback is documented.
- [ ] One active credit line per nullifier is enforced.
- [ ] Ledger/Speculos approval flow works.
- [ ] `/feedback/ledger.md` includes docs/SDK feedback and screenshots.
- [ ] Partner submissions: World, Arc, Ledger.
- [ ] Explorer links and tx hashes ready.
- [ ] 4-minute and 90-second versions rehearsed out loud.

---

## 16. Source Links To Recheck Before Coding

- ETHGlobal New York 2026: https://ethglobal.com/events/newyork2026
- ETHGlobal prizes: https://ethglobal.com/events/newyork2026/prizes
- World Verify API: https://docs.world.org/api-reference/developer-portal/verify
- World ID / IDKit: https://docs.world.org/mini-apps/commands/verify
- World AgentKit: https://docs.world.org/agents/agent-kit/integrate
- Circle Agent Stack: https://developers.circle.com/agent-stack
- Circle Nanopayments: https://developers.circle.com/gateway/nanopayments
- Arc docs: https://docs.arc.io/
- Arc connect/RPC: https://docs.arc.io/arc/references/connect-to-arc
- Arc contract addresses: https://docs.arc.io/arc/references/contract-addresses
- Ledger developer portal: https://developers.ledger.com/
- Ledger Clear Signing: https://developers.ledger.com/docs/clear-signing/for-wallets
