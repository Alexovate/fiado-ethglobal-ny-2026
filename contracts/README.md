# contracts — Fiado CreditLine

Foundry project. `CreditLine.sol` is the spine: verified-human store credit,
USDC settled directly to merchants, agent autonomy bounded by a Ledger-signed
mandate with a physical-Ledger escalation gate.

## Layout

- `src/CreditLine.sol` — the contract
- `src/MockUSDC.sol` — 6-decimal USDC stand-in for local tests/demo
- `test/CreditLine.t.sol` — 17 tests (one-line-per-human, mandate bounds, escalation, repay)
- `script/Deploy.s.sol` — deploy to Arc or local

## Trust model

| Function | Who | Guard |
| --- | --- | --- |
| `setAgentMandate` | treasury op | physical-Ledger signature |
| `openLine` | anyone w/ auth | backend signature (after World ID) |
| `autoDisburse` | agent only | hard-bounded by mandate (per-tx + total caps) |
| `approveAndDisburse` | anyone w/ approval | fresh physical-Ledger signature; escalation only |
| `repay` | customer | — |

## Commands

```bash
forge test -vv                 # run the suite
forge build                    # compile

# deploy to Arc testnet (USDC is the gas token — fund deployer at faucet.circle.com)
BACKEND_SIGNER=0x... LEDGER_SIGNER=0x... \
USDC_ADDRESS=0x3600000000000000000000000000000000000000 \
forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast \
  --private-key $DEPLOYER_PRIVATE_KEY

# local deploy (omit USDC_ADDRESS -> a MockUSDC is deployed)
BACKEND_SIGNER=0x... LEDGER_SIGNER=0x... \
forge script script/Deploy.s.sol --broadcast --private-key $PK
```

## Arc testnet

- Chain ID `5042002`, RPC `https://rpc.testnet.arc.network`
- USDC ERC-20 `0x3600000000000000000000000000000000000000` (6 decimals)
- Explorer https://testnet.arcscan.app · Faucet https://faucet.circle.com
