import {
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";

// Backend authorization for openLine. Matches CreditLine.openLine, which checks:
//   ecrecover( eth(keccak256(abi.encode(address(this), nullifierHash, customer,
//   maxAmount, expiresAt))) ) == backendSigner
// viem's account.signMessage({ message: { raw } }) applies the EIP-191
// personal_sign prefix, mirroring the contract's _eth(...) wrapper.

export interface OpenLineAuth {
  nullifierHash: Hex;
  customer: Address;
  maxAmount: bigint;
  expiresAt: bigint;
  signature: Hex;
  backendSigner: Address;
}

function account() {
  const pk = config.backendSignerPrivateKey;
  if (!pk) throw new Error("BACKEND_SIGNER_PRIVATE_KEY not set");
  return privateKeyToAccount(pk as Hex);
}

export function backendSignerAddress(): Address {
  return account().address;
}

export async function signOpenLine(params: {
  nullifierHash: Hex;
  customer: Address;
  maxAmount: bigint;
  expiresAt: bigint;
}): Promise<OpenLineAuth> {
  const contract = config.creditLineAddress as Address;
  if (!contract) throw new Error("CREDITLINE_ADDRESS not set");

  const inner = keccak256(
    encodeAbiParameters(
      parseAbiParameters("address, bytes32, address, uint256, uint256"),
      [contract, params.nullifierHash, params.customer, params.maxAmount, params.expiresAt],
    ),
  );

  const acct = account();
  const signature = await acct.signMessage({ message: { raw: inner } });

  return {
    nullifierHash: params.nullifierHash,
    customer: params.customer,
    maxAmount: params.maxAmount,
    expiresAt: params.expiresAt,
    signature,
    backendSigner: acct.address,
  };
}
