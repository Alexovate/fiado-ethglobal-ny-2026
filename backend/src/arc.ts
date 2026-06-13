import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";

// Arc Testnet. USDC is the native gas token (18 dec); the ERC-20 USDC interface
// at 0x3600…0000 uses 6 decimals — CreditLine settles in the ERC-20.
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [config.arcRpcUrl] } },
  blockExplorers: { default: { name: "ArcScan", url: "https://testnet.arcscan.app" } },
});

// Minimal ABIs — only what the relayer touches.
const CREDITLINE_ABI = [
  {
    type: "function",
    name: "setAgentMandate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "maxPerTx", type: "uint256" },
      { name: "maxTotalOutstanding", type: "uint256" },
      { name: "expiresAt", type: "uint256" },
      { name: "ledgerSignature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "openLine",
    stateMutability: "nonpayable",
    inputs: [
      { name: "nullifierHash", type: "bytes32" },
      { name: "customer", type: "address" },
      { name: "maxAmount", type: "uint256" },
      { name: "expiresAt", type: "uint256" },
      { name: "backendSignature", type: "bytes" },
    ],
    outputs: [{ name: "lineId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "autoDisburse",
    stateMutability: "nonpayable",
    inputs: [
      { name: "lineId", type: "bytes32" },
      { name: "merchant", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "approveAndDisburse",
    stateMutability: "nonpayable",
    inputs: [
      { name: "lineId", type: "bytes32" },
      { name: "merchant", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "ledgerApproval", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "totalOutstanding",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "mandateNonce",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });

function agentWallet() {
  if (!config.agentPrivateKey) throw new Error("AGENT_PRIVATE_KEY not set");
  const account = privateKeyToAccount(config.agentPrivateKey as Hex);
  return createWalletClient({ account, chain: arcTestnet, transport: http() });
}

export function agentAddress(): Address {
  if (!config.agentPrivateKey) throw new Error("AGENT_PRIVATE_KEY not set");
  return privateKeyToAccount(config.agentPrivateKey as Hex).address;
}

function creditLine(): Address {
  if (!config.creditLineAddress) throw new Error("CREDITLINE_ADDRESS not set");
  return config.creditLineAddress as Address;
}

/** Display USDC base units (6 dec) -> on-chain units, scaled for the testnet faucet. */
export function toOnChain(displayBaseUnits: bigint): bigint {
  return displayBaseUnits / config.scaleDivisor;
}

// ---- reads ----

export function merchantBalance(merchant: Address): Promise<bigint> {
  return publicClient.readContract({
    address: config.usdcAddress as Address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [merchant],
  });
}

export function totalOutstanding(): Promise<bigint> {
  return publicClient.readContract({
    address: creditLine(),
    abi: CREDITLINE_ABI,
    functionName: "totalOutstanding",
  });
}

export function mandateNonce(): Promise<bigint> {
  return publicClient.readContract({
    address: creditLine(),
    abi: CREDITLINE_ABI,
    functionName: "mandateNonce",
  });
}

// ---- writes (agent relayer) ----
// All amounts here are ALREADY on-chain units. Scaling display->on-chain happens
// once, in the orchestration layer (so signed digests and submitted values match).

export function setMandate(params: {
  agent: Address;
  maxPerTx: bigint;
  maxTotalOutstanding: bigint;
  expiresAt: bigint;
  ledgerSignature: Hex;
}): Promise<Hex> {
  return agentWallet().writeContract({
    address: creditLine(),
    abi: CREDITLINE_ABI,
    functionName: "setAgentMandate",
    args: [params.agent, params.maxPerTx, params.maxTotalOutstanding, params.expiresAt, params.ledgerSignature],
  });
}

export function autoDisburse(lineId: Hex, merchant: Address, onChainAmount: bigint): Promise<Hex> {
  return agentWallet().writeContract({
    address: creditLine(),
    abi: CREDITLINE_ABI,
    functionName: "autoDisburse",
    args: [lineId, merchant, onChainAmount],
  });
}

export function approveAndDisburse(
  lineId: Hex,
  merchant: Address,
  onChainAmount: bigint,
  nonce: bigint,
  ledgerApproval: Hex,
): Promise<Hex> {
  return agentWallet().writeContract({
    address: creditLine(),
    abi: CREDITLINE_ABI,
    functionName: "approveAndDisburse",
    args: [lineId, merchant, onChainAmount, nonce, ledgerApproval],
  });
}
