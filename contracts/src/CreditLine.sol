// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-20 surface used by CreditLine (USDC on Arc: 6 decimals).
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title Fiado CreditLine
/// @notice Verified-human store credit settled in USDC directly to merchants.
///         The agent disburses autonomously *inside a hardware-signed mandate*
///         (`autoDisburse`); anything outside the mandate must go through the
///         physical-Ledger escalation gate (`approveAndDisburse`).
/// @dev Clean-room ETHGlobal prototype. Not production code.
contract CreditLine {
    // ----------------------------------------------------------------------
    // Roles & config
    // ----------------------------------------------------------------------

    /// @notice Treasury operator. Funds the contract and registers merchants.
    address public owner;

    /// @notice USDC ERC-20 used for settlement (6 decimals).
    IERC20 public immutable usdc;

    /// @notice Backend EOA that signs credit-line authorizations after World ID.
    address public backendSigner;

    /// @notice Address controlled by the physical Ledger. Signs the mandate and
    ///         every escalation. The contract trusts only this key for human approval.
    address public ledgerSigner;

    // ----------------------------------------------------------------------
    // Agent mandate (the autonomy envelope, signed once on Ledger)
    // ----------------------------------------------------------------------

    struct Mandate {
        address agent; // the only address allowed to call autoDisburse
        uint256 maxPerTx; // hard per-transaction cap
        uint256 maxTotalOutstanding; // hard cap on contract-wide outstanding
        uint256 expiresAt; // mandate is dead after this timestamp
        bool active;
    }

    Mandate public mandate;
    uint256 public mandateNonce; // replay protection for setAgentMandate

    // ----------------------------------------------------------------------
    // Merchants, lines, reputation
    // ----------------------------------------------------------------------

    mapping(address => bool) public merchantRegistered;
    mapping(address => string) public merchantMetadata;

    struct Line {
        bytes32 nullifierHash; // World ID nullifier — the human behind the line
        address customer; // customer wallet (never receives funds)
        uint256 maxAmount; // line limit
        uint256 outstanding; // currently owed
        uint256 expiresAt;
        bool open;
    }

    mapping(bytes32 => Line) public lines; // lineId => Line
    mapping(bytes32 => bytes32) public humanToLine; // nullifierHash => active lineId
    mapping(bytes32 => uint256) public reputation; // nullifierHash => score
    mapping(bytes32 => bool) public usedApproval; // escalation replay protection

    uint256 public totalOutstanding;
    uint256 public lineCount;

    // ----------------------------------------------------------------------
    // Events
    // ----------------------------------------------------------------------

    event HumanVerified(bytes32 indexed nullifierHash, address indexed customer);
    event CreditLineOpened(bytes32 indexed lineId, bytes32 indexed nullifierHash, uint256 maxAmount);
    event MandateSet(address indexed agent, uint256 maxPerTx, uint256 maxTotalOutstanding, uint256 expiresAt);
    event AutoDisbursed(bytes32 indexed lineId, address indexed merchant, uint256 amount);
    event DisbursementApproved(bytes32 indexed lineId, address indexed merchant, uint256 amount);
    event MerchantPaid(address indexed merchant, uint256 amount);
    event Repaid(bytes32 indexed lineId, uint256 amount);
    event ReputationUpdated(bytes32 indexed nullifierHash, uint256 newScore);
    event MerchantRegistered(address indexed merchant);

    // ----------------------------------------------------------------------
    // Errors
    // ----------------------------------------------------------------------

    error NotOwner();
    error NotAgent();
    error BadSignature();
    error MerchantNotRegistered();
    error LineNotOpen();
    error LineAlreadyActive();
    error ZeroAmount();
    error OverLineLimit();
    error OverTxCap(); // amount > mandate.maxPerTx
    error OverTotalCap(); // totalOutstanding + amount > mandate.maxTotalOutstanding
    error MandateInactiveOrExpired();
    error ApprovalReplayed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _usdc, address _backendSigner, address _ledgerSigner) {
        owner = msg.sender;
        usdc = IERC20(_usdc);
        backendSigner = _backendSigner;
        ledgerSigner = _ledgerSigner;
    }

    // ----------------------------------------------------------------------
    // Merchants
    // ----------------------------------------------------------------------

    function registerMerchant(address merchant, string calldata metadataURI) external onlyOwner {
        merchantRegistered[merchant] = true;
        merchantMetadata[merchant] = metadataURI;
        emit MerchantRegistered(merchant);
    }

    // ----------------------------------------------------------------------
    // Mandate — signed once on the physical Ledger
    // ----------------------------------------------------------------------

    /// @param ledgerSignature personal_sign over
    ///        keccak256(address(this), agent, maxPerTx, maxTotalOutstanding, expiresAt, mandateNonce)
    function setAgentMandate(
        address agent,
        uint256 maxPerTx,
        uint256 maxTotalOutstanding,
        uint256 expiresAt,
        bytes calldata ledgerSignature
    ) external {
        bytes32 digest = _eth(
            keccak256(
                abi.encode(address(this), agent, maxPerTx, maxTotalOutstanding, expiresAt, mandateNonce)
            )
        );
        if (_recover(digest, ledgerSignature) != ledgerSigner) revert BadSignature();

        mandateNonce++;
        mandate = Mandate({
            agent: agent,
            maxPerTx: maxPerTx,
            maxTotalOutstanding: maxTotalOutstanding,
            expiresAt: expiresAt,
            active: true
        });
        emit MandateSet(agent, maxPerTx, maxTotalOutstanding, expiresAt);
    }

    // ----------------------------------------------------------------------
    // Credit lines — opened after World ID proof + backend authorization
    // ----------------------------------------------------------------------

    /// @param backendSignature personal_sign over
    ///        keccak256(address(this), nullifierHash, customer, maxAmount, expiresAt)
    function openLine(
        bytes32 nullifierHash,
        address customer,
        uint256 maxAmount,
        uint256 expiresAt,
        bytes calldata backendSignature
    ) external returns (bytes32 lineId) {
        bytes32 existing = humanToLine[nullifierHash];
        if (existing != bytes32(0) && lines[existing].open) revert LineAlreadyActive();

        bytes32 digest = _eth(
            keccak256(abi.encode(address(this), nullifierHash, customer, maxAmount, expiresAt))
        );
        if (_recover(digest, backendSignature) != backendSigner) revert BadSignature();

        lineId = keccak256(abi.encode(nullifierHash, lineCount++));
        lines[lineId] = Line({
            nullifierHash: nullifierHash,
            customer: customer,
            maxAmount: maxAmount,
            outstanding: 0,
            expiresAt: expiresAt,
            open: true
        });
        humanToLine[nullifierHash] = lineId;

        emit HumanVerified(nullifierHash, customer);
        emit CreditLineOpened(lineId, nullifierHash, maxAmount);
    }

    // ----------------------------------------------------------------------
    // Disbursement — the 99% AUTO path and the ESCALATE path
    // ----------------------------------------------------------------------

    /// @notice Agent-only autonomous payout, hard-bounded by the mandate.
    function autoDisburse(bytes32 lineId, address merchant, uint256 amount) external {
        if (msg.sender != mandate.agent) revert NotAgent();
        if (!mandate.active || block.timestamp >= mandate.expiresAt) revert MandateInactiveOrExpired();
        if (amount > mandate.maxPerTx) revert OverTxCap();
        if (totalOutstanding + amount > mandate.maxTotalOutstanding) revert OverTotalCap();

        _disburse(lineId, merchant, amount);
        emit AutoDisbursed(lineId, merchant, amount);
    }

    /// @notice Escalation path. Anything outside the mandate (too large, low
    ///         confidence, new merchant, expired mandate) requires a fresh
    ///         physical-Ledger approval signature. Still bounded by the line limit.
    /// @param ledgerApproval personal_sign over
    ///        keccak256(address(this), lineId, merchant, amount, nonce)
    function approveAndDisburse(
        bytes32 lineId,
        address merchant,
        uint256 amount,
        uint256 nonce,
        bytes calldata ledgerApproval
    ) external {
        bytes32 inner = keccak256(abi.encode(address(this), lineId, merchant, amount, nonce));
        if (usedApproval[inner]) revert ApprovalReplayed();
        if (_recover(_eth(inner), ledgerApproval) != ledgerSigner) revert BadSignature();
        usedApproval[inner] = true;

        _disburse(lineId, merchant, amount);
        emit DisbursementApproved(lineId, merchant, amount);
    }

    function _disburse(bytes32 lineId, address merchant, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        if (!merchantRegistered[merchant]) revert MerchantNotRegistered();

        Line storage l = lines[lineId];
        if (!l.open) revert LineNotOpen();
        if (l.outstanding + amount > l.maxAmount) revert OverLineLimit();

        l.outstanding += amount;
        totalOutstanding += amount;

        // Customer never receives funds — USDC goes straight to the merchant.
        if (!usdc.transfer(merchant, amount)) revert BadSignature();
        emit MerchantPaid(merchant, amount);
    }

    // ----------------------------------------------------------------------
    // Repayment & reputation
    // ----------------------------------------------------------------------

    function repay(bytes32 lineId, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        Line storage l = lines[lineId];
        if (!l.open) revert LineNotOpen();

        uint256 applied = amount > l.outstanding ? l.outstanding : amount;
        if (!usdc.transferFrom(msg.sender, address(this), applied)) revert BadSignature();

        l.outstanding -= applied;
        totalOutstanding -= applied;

        // Reputation improves only after actual payment.
        uint256 score = reputation[l.nullifierHash] + applied;
        reputation[l.nullifierHash] = score;

        emit Repaid(lineId, applied);
        emit ReputationUpdated(l.nullifierHash, score);
    }

    function closeLine(bytes32 lineId) external onlyOwner {
        Line storage l = lines[lineId];
        l.open = false;
        if (humanToLine[l.nullifierHash] == lineId) {
            humanToLine[l.nullifierHash] = bytes32(0);
        }
    }

    // ----------------------------------------------------------------------
    // Admin
    // ----------------------------------------------------------------------

    function setBackendSigner(address s) external onlyOwner {
        backendSigner = s;
    }

    function setLedgerSigner(address s) external onlyOwner {
        ledgerSigner = s;
    }

    function deactivateMandate() external onlyOwner {
        mandate.active = false;
    }

    // ----------------------------------------------------------------------
    // Signature helpers (personal_sign / EIP-191)
    // ----------------------------------------------------------------------

    function _eth(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }

    function _recover(bytes32 digest, bytes memory sig) internal pure returns (address) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        return ecrecover(digest, v, r, s);
    }
}
