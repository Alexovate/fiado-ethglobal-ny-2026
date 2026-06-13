// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CreditLine} from "../src/CreditLine.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract CreditLineTest is Test {
    CreditLine internal credit;
    MockUSDC internal usdc;

    // Keys: backend signs line authorizations, ledger signs mandate + escalations.
    uint256 internal backendPk = 0xB00B;
    uint256 internal ledgerPk = 0x1ED6E2;
    address internal backend;
    address internal ledger;

    address internal owner = address(this);
    address internal agent = address(0xA6E27);
    address internal merchant = address(0x111E2C);
    address internal customer = address(0xC057);

    bytes32 internal constant NULL_A = keccak256("human-a");
    bytes32 internal constant NULL_B = keccak256("human-b");

    uint256 internal constant USDC = 1e6; // 6 decimals

    function setUp() public {
        backend = vm.addr(backendPk);
        ledger = vm.addr(ledgerPk);

        usdc = new MockUSDC();
        credit = new CreditLine(address(usdc), backend, ledger);

        // Fund the contract treasury and register the merchant.
        usdc.mint(address(credit), 100_000 * USDC);
        credit.registerMerchant(merchant, "ipfs://merchant-a");

        // Seed a mandate: maxPerTx 250, maxTotal 5000, valid 6h.
        _setMandate(250 * USDC, 5_000 * USDC, block.timestamp + 6 hours);
    }

    // ----------------------------------------------------------------------
    // helpers
    // ----------------------------------------------------------------------

    function _eth(bytes32 h) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h));
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _setMandate(uint256 maxPerTx, uint256 maxTotal, uint256 expiresAt) internal {
        uint256 n = credit.mandateNonce();
        bytes32 d = _eth(keccak256(abi.encode(address(credit), agent, maxPerTx, maxTotal, expiresAt, n)));
        credit.setAgentMandate(agent, maxPerTx, maxTotal, expiresAt, _sign(ledgerPk, d));
    }

    function _openLine(bytes32 nullifier, uint256 maxAmount) internal returns (bytes32) {
        uint256 expiresAt = block.timestamp + 30 days;
        bytes32 d = _eth(keccak256(abi.encode(address(credit), nullifier, customer, maxAmount, expiresAt)));
        return credit.openLine(nullifier, customer, maxAmount, expiresAt, _sign(backendPk, d));
    }

    // ----------------------------------------------------------------------
    // World ID: one active line per human
    // ----------------------------------------------------------------------

    function test_OneLinePerNullifier() public {
        _openLine(NULL_A, 100 * USDC);
        vm.expectRevert(CreditLine.LineAlreadyActive.selector);
        _openLine(NULL_A, 100 * USDC);
    }

    function test_DifferentHumansEachGetALine() public {
        bytes32 a = _openLine(NULL_A, 100 * USDC);
        bytes32 b = _openLine(NULL_B, 100 * USDC);
        assertTrue(a != b);
    }

    function test_OpenLine_RejectsBadBackendSig() public {
        uint256 expiresAt = block.timestamp + 30 days;
        bytes32 d = _eth(keccak256(abi.encode(address(credit), NULL_A, customer, 100 * USDC, expiresAt)));
        // sign with the ledger key instead of the backend key -> invalid
        vm.expectRevert(CreditLine.BadSignature.selector);
        credit.openLine(NULL_A, customer, 100 * USDC, expiresAt, _sign(ledgerPk, d));
    }

    // ----------------------------------------------------------------------
    // AUTO path: bounded by the mandate
    // ----------------------------------------------------------------------

    function test_AutoDisburse_WithinMandate() public {
        bytes32 line = _openLine(NULL_A, 100 * USDC);
        uint256 before = usdc.balanceOf(merchant);

        vm.prank(agent);
        credit.autoDisburse(line, merchant, 18_500_000); // 18.50 USDC

        assertEq(usdc.balanceOf(merchant) - before, 18_500_000);
        assertEq(credit.totalOutstanding(), 18_500_000);
    }

    function test_AutoDisburse_OnlyAgent() public {
        bytes32 line = _openLine(NULL_A, 100 * USDC);
        vm.expectRevert(CreditLine.NotAgent.selector);
        credit.autoDisburse(line, merchant, 10 * USDC); // called by owner, not agent
    }

    function test_AutoDisburse_OverTxCap_Reverts() public {
        bytes32 line = _openLine(NULL_A, 5_000 * USDC);
        vm.prank(agent);
        vm.expectRevert(CreditLine.OverTxCap.selector);
        credit.autoDisburse(line, merchant, 251 * USDC); // > maxPerTx 250
    }

    function test_AutoDisburse_OnlyRegisteredMerchant() public {
        bytes32 line = _openLine(NULL_A, 100 * USDC);
        vm.prank(agent);
        vm.expectRevert(CreditLine.MerchantNotRegistered.selector);
        credit.autoDisburse(line, address(0xDEAD), 10 * USDC);
    }

    function test_AutoDisburse_OverLineLimit_Reverts() public {
        bytes32 line = _openLine(NULL_A, 20 * USDC); // line limit below tx cap
        vm.prank(agent);
        vm.expectRevert(CreditLine.OverLineLimit.selector);
        credit.autoDisburse(line, merchant, 25 * USDC);
    }

    function test_AutoDisburse_OverTotalCap_Reverts() public {
        // tiny total cap so the second draw breaks the contract-wide ceiling
        _setMandate(250 * USDC, 30 * USDC, block.timestamp + 6 hours);
        bytes32 line = _openLine(NULL_A, 1_000 * USDC);

        vm.prank(agent);
        credit.autoDisburse(line, merchant, 20 * USDC);

        vm.prank(agent);
        vm.expectRevert(CreditLine.OverTotalCap.selector);
        credit.autoDisburse(line, merchant, 20 * USDC); // 40 > 30 total cap
    }

    function test_AutoDisburse_ExpiredMandate_Reverts() public {
        bytes32 line = _openLine(NULL_A, 100 * USDC);
        vm.warp(block.timestamp + 7 hours); // past the 6h mandate
        vm.prank(agent);
        vm.expectRevert(CreditLine.MandateInactiveOrExpired.selector);
        credit.autoDisburse(line, merchant, 10 * USDC);
    }

    // ----------------------------------------------------------------------
    // ESCALATE path: requires a fresh physical-Ledger signature
    // ----------------------------------------------------------------------

    function test_Escalation_DisbursesAboveTxCapWithLedgerSig() public {
        bytes32 line = _openLine(NULL_A, 5_000 * USDC);
        uint256 amount = 1_500 * USDC; // far above maxPerTx 250
        uint256 nonce = 1;

        bytes32 inner = keccak256(abi.encode(address(credit), line, merchant, amount, nonce));
        bytes memory sig = _sign(ledgerPk, _eth(inner));

        uint256 before = usdc.balanceOf(merchant);
        credit.approveAndDisburse(line, merchant, amount, nonce, sig);
        assertEq(usdc.balanceOf(merchant) - before, amount);
    }

    function test_Escalation_RejectsNonLedgerSig() public {
        bytes32 line = _openLine(NULL_A, 5_000 * USDC);
        uint256 amount = 1_500 * USDC;
        uint256 nonce = 1;
        bytes32 inner = keccak256(abi.encode(address(credit), line, merchant, amount, nonce));
        // backend key, not ledger key -> rejected
        bytes memory sig = _sign(backendPk, _eth(inner));
        vm.expectRevert(CreditLine.BadSignature.selector);
        credit.approveAndDisburse(line, merchant, amount, nonce, sig);
    }

    function test_Escalation_NoReplay() public {
        bytes32 line = _openLine(NULL_A, 5_000 * USDC);
        uint256 amount = 1_500 * USDC;
        uint256 nonce = 7;
        bytes32 inner = keccak256(abi.encode(address(credit), line, merchant, amount, nonce));
        bytes memory sig = _sign(ledgerPk, _eth(inner));

        credit.approveAndDisburse(line, merchant, amount, nonce, sig);
        vm.expectRevert(CreditLine.ApprovalReplayed.selector);
        credit.approveAndDisburse(line, merchant, amount, nonce, sig);
    }

    // ----------------------------------------------------------------------
    // Mandate signing
    // ----------------------------------------------------------------------

    function test_SetMandate_RejectsBadLedgerSig() public {
        uint256 n = credit.mandateNonce();
        uint256 expiresAt = block.timestamp + 6 hours;
        bytes32 d = _eth(keccak256(abi.encode(address(credit), agent, 250 * USDC, 5_000 * USDC, expiresAt, n)));
        vm.expectRevert(CreditLine.BadSignature.selector);
        credit.setAgentMandate(agent, 250 * USDC, 5_000 * USDC, expiresAt, _sign(backendPk, d));
    }

    // ----------------------------------------------------------------------
    // Repayment & reputation
    // ----------------------------------------------------------------------

    function test_Repay_ReducesOutstandingAndRaisesReputation() public {
        bytes32 line = _openLine(NULL_A, 100 * USDC);
        vm.prank(agent);
        credit.autoDisburse(line, merchant, 50 * USDC);

        // customer repays 30
        usdc.mint(customer, 30 * USDC);
        vm.startPrank(customer);
        usdc.approve(address(credit), 30 * USDC);
        credit.repay(line, 30 * USDC);
        vm.stopPrank();

        assertEq(credit.totalOutstanding(), 20 * USDC);
        assertEq(credit.reputation(NULL_A), 30 * USDC);
    }

    function test_Repay_CapsAtOutstanding() public {
        bytes32 line = _openLine(NULL_A, 100 * USDC);
        vm.prank(agent);
        credit.autoDisburse(line, merchant, 10 * USDC);

        usdc.mint(customer, 50 * USDC);
        vm.startPrank(customer);
        usdc.approve(address(credit), 50 * USDC);
        credit.repay(line, 50 * USDC); // overpay; only 10 should apply
        vm.stopPrank();

        assertEq(credit.totalOutstanding(), 0);
        assertEq(credit.reputation(NULL_A), 10 * USDC);
    }

    // ----------------------------------------------------------------------
    // Close & reopen
    // ----------------------------------------------------------------------

    function test_CloseLine_AllowsReopenForSameHuman() public {
        bytes32 first = _openLine(NULL_A, 100 * USDC);
        credit.closeLine(first);
        bytes32 second = _openLine(NULL_A, 100 * USDC); // must not revert
        assertTrue(first != second);
    }
}
