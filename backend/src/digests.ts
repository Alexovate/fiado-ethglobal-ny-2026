import { keccak256, encodeAbiParameters, parseAbiParameters, type Hex, type Address } from "viem";
import { config } from "./config.js";

// The "inner" hashes the contract recomputes before applying its EIP-191 wrapper
// (_eth) and ecrecover. The Ledger signs these via signPersonalMessage, which
// applies the same "\x19Ethereum Signed Message:\n32" prefix. So we return the
// raw inner hash; the device adds the prefix; the contract verifies the match.

function creditLine(): Address {
  if (!config.creditLineAddress) throw new Error("CREDITLINE_ADDRESS not set");
  return config.creditLineAddress as Address;
}

/** Mirrors keccak256(abi.encode(address(this), agent, maxPerTx, maxTotal, expiresAt, mandateNonce)). */
export function mandateDigest(p: {
  agent: Address;
  maxPerTx: bigint;
  maxTotalOutstanding: bigint;
  expiresAt: bigint;
  nonce: bigint;
}): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("address, address, uint256, uint256, uint256, uint256"), [
      creditLine(),
      p.agent,
      p.maxPerTx,
      p.maxTotalOutstanding,
      p.expiresAt,
      p.nonce,
    ]),
  );
}

/** Mirrors keccak256(abi.encode(address(this), lineId, merchant, amount, nonce)). */
export function escalationDigest(p: {
  lineId: Hex;
  merchant: Address;
  amount: bigint; // on-chain units
  nonce: bigint;
}): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("address, bytes32, address, uint256, uint256"), [
      creditLine(),
      p.lineId,
      p.merchant,
      p.amount,
      p.nonce,
    ]),
  );
}
