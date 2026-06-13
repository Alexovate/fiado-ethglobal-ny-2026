import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import Eth from "@ledgerhq/hw-app-eth";

// Direct hardware signing over WebHID (Chrome). No MetaMask in between — the
// physical Ledger lights up and the operator confirms. The device signs the
// "inner" 32-byte hash via EIP-191 personal_sign, applying the same
// "\x19Ethereum Signed Message:\n32" prefix the CreditLine contract expects.

const DEFAULT_PATH = "44'/60'/0'/0/0";

export interface LedgerSession {
  eth: Eth;
  address: string;
  close: () => Promise<void>;
}

export async function connectLedger(path = DEFAULT_PATH): Promise<LedgerSession> {
  const transport = await TransportWebHID.create();
  const eth = new Eth(transport);
  const { address } = await eth.getAddress(path, false);
  return { eth, address, close: () => transport.close() };
}

/** Sign the inner hash; returns a 65-byte 0x signature ready for the contract. */
export async function signInner(
  session: LedgerSession,
  innerHashHex: string,
  path = DEFAULT_PATH,
): Promise<`0x${string}`> {
  const hex = innerHashHex.replace(/^0x/, "");
  const sig = await session.eth.signPersonalMessage(path, hex);
  const v = sig.v.toString(16).padStart(2, "0");
  return `0x${sig.r}${sig.s}${v}`;
}

export function isWebHidAvailable(): boolean {
  return typeof navigator !== "undefined" && "hid" in navigator;
}
