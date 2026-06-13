// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice Deploys CreditLine.
///   - On Arc: set USDC_ADDRESS=0x3600000000000000000000000000000000000000
///   - Locally: leave USDC_ADDRESS unset and a MockUSDC is deployed + minted.
///
/// Required env: BACKEND_SIGNER, LEDGER_SIGNER (addresses).
/// Run:
///   forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast \
///     --private-key $DEPLOYER_PRIVATE_KEY
contract Deploy is Script {
    function run() external {
        address backendSigner = vm.envAddress("BACKEND_SIGNER");
        address ledgerSigner = vm.envAddress("LEDGER_SIGNER");
        address usdc = vm.envOr("USDC_ADDRESS", address(0));

        vm.startBroadcast();

        if (usdc == address(0)) {
            MockUSDC mock = new MockUSDC();
            usdc = address(mock);
            console2.log("MockUSDC deployed:", usdc);
        }

        CreditLine credit = new CreditLine(usdc, backendSigner, ledgerSigner);
        console2.log("CreditLine deployed:", address(credit));
        console2.log("  usdc:          ", usdc);
        console2.log("  backendSigner: ", backendSigner);
        console2.log("  ledgerSigner:  ", ledgerSigner);

        vm.stopBroadcast();
    }
}
