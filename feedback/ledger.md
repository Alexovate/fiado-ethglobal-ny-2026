# Ledger Feedback (AI Agents x Ledger track)

Our experience integrating a physical Ledger as the human-approval gate for an
autonomous credit agent. Hardware: physical Ledger, Ethereum app. Stack:
`@ledgerhq/hw-transport-webhid` + `@ledgerhq/hw-app-eth` in a Vite + React app,
signing in Chrome over WebHID. Derivation path `44'/60'/0'/0/0`.

## What we built

The agent disburses USDC autonomously *inside a mandate the human signs once on
the Ledger* (`setAgentMandate`). Anything outside that mandate (amount over the
per-tx cap, low confidence, new merchant) requires a fresh physical-Ledger
signature before funds move (`approveAndDisburse`). Both signatures are EIP-191
`personal_sign` over a 32-byte digest, verified on-chain via `ecrecover`.

## What worked well

- **WebHID via `hw-transport-webhid` is great for a no-wallet demo.** The device
  connects directly in Chrome — no MetaMask/WalletConnect middleman. The pairing
  dialog + on-device confirm is a strong, legible "human in the loop" moment.
- **`hw-app-eth` `signPersonalMessage` is simple** and maps cleanly to a Solidity
  `ecrecover` of `toEthSignedMessageHash(...)`. Got an end-to-end signature
  accepted by our on-chain contract on the first real device test.
- **Stable across two distinct signing intents** (mandate + escalation) using the
  same primitive — we only change the digest.

## Gaps / friction

- **Buffer / Node globals.** `hw-transport-webhid` pulls in Node builtins
  (`Buffer`). A plain Vite browser build fails until you add node polyfills
  (`vite-plugin-node-polyfills` with `globals.Buffer`). This is a common
  first-run trip-up; worth a one-line note in the web quickstart.
- **`signPersonalMessage` shows an opaque hash on-device.** Because we sign a
  32-byte digest, the Ledger displays a raw message/hash, not "Pay 1,500 USDC to
  Doña Rosa." For a human approving a *payment*, that's exactly the wrong thing
  to be blind to. Clear Signing (ERC-7730) is the fix, but the path from
  "personal_sign works" to "device shows decoded intent" is not obvious from the
  getting-started docs — it reads as a separate, heavier track.
- **Version/peer-dependency churn.** Matching `hw-app-eth` / `hw-transport-webhid`
  versions that work together under a current bundler took trial and error.

## Suggestions

1. **First-class WebHID + Vite quickstart** that includes the Buffer polyfill step.
   It's the single most likely thing to block a hackathon team in the first hour.
2. **Make the personal_sign → Clear Signing upgrade a guided, incremental path.**
   "You're signing a hash the user can't read — here's how to show real intent"
   would land well right where teams first succeed with blind signing.
3. **A tiny "verify this signature in Solidity" snippet** next to
   `signPersonalMessage` would close the loop for on-chain use cases.

## Honest scope note

We ship the **reliable hardware-approval gate** (real device, on-chain-verified
signature). Full ERC-7730 Clear Signing (decoded amount on the device) is a
stretch we did not complete; our UI copy reflects that the device shows a signing
request, not a decoded payout.
