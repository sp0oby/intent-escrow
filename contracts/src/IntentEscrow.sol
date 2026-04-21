// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title  IntentEscrow
/// @author intent-escrow
/// @notice Minimal intent-based escrow for ETH or any ERC-20. The depositor
///         locks funds for a specific beneficiary until either the beneficiary
///         signs an EIP-712 release intent (gasless) or the expiry passes and
///         the depositor refunds the remainder. Supports partial releases.
/// @dev    Design goals: one compact contract, strict Checks-Effects-Interactions,
///         SafeERC20 everywhere, replay-safe signatures via per-escrow nonces
///         plus an EIP-712 domain separator. Signature verification uses
///         `SignatureChecker` so the beneficiary can be either a plain EOA or
///         any contract wallet implementing ERC-1271 (Safe, ERC-4337 account,
///         EIP-7702 smart EOA) — this is what makes the system genuinely
///         compatible with account abstraction rather than just EOAs.
contract IntentEscrow is EIP712, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Constants & typehashes
    //
    // `NATIVE_ETH = address(0)` is the token-address sentinel for ETH; ERC-20
    // contracts can never deploy to address(0) so collisions are impossible.
    // `MAX_FEE_BPS` is a compile-time ceiling so even a compromised owner can
    // never raise the protocol fee beyond 1% (100 / 10_000).
    // `SETTLE_INTENT_TYPEHASH` MUST match the typed struct the frontend signs;
    // any whitespace or field-order drift breaks signature recovery.
    // -------------------------------------------------------------------------

    address public constant NATIVE_ETH = address(0);
    uint16 public constant MAX_FEE_BPS = 100;

    bytes32 public constant SETTLE_INTENT_TYPEHASH =
        keccak256("SettleIntent(uint256 escrowId,uint256 amount,uint256 deadline,uint256 nonce)");

    // -------------------------------------------------------------------------
    // Types
    //
    // `nonce` bumps on every successful settle so previously valid signatures
    // are immediately invalidated — the core partial-release replay defence.
    // `closed` is set on refund, cancel, or full release; once true the escrow
    // is terminal and every state transition reverts.
    // -------------------------------------------------------------------------

    struct Escrow {
        address depositor;
        address beneficiary;
        address token;
        uint256 totalAmount;
        uint256 released;
        uint64 expiry;
        uint64 nonce;
        bool closed;
    }

    // -------------------------------------------------------------------------
    // Storage
    //
    // `totalLocked` is the per-token accounting that lets `rescueStuckTokens`
    // withdraw *only* the surplus above escrowed balances. The invariant
    // `contract_balance(token) >= totalLocked[token]` must hold at all times.
    // -------------------------------------------------------------------------

    uint256 public nextEscrowId;
    mapping(uint256 => Escrow) private _escrows;
    mapping(address => uint256) public totalLocked;

    uint16 public protocolFeeBps;
    address public feeRecipient;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed depositor,
        address indexed beneficiary,
        address token,
        uint256 amount,
        uint64 expiry
    );
    event EscrowSettled(
        uint256 indexed escrowId,
        address indexed beneficiary,
        uint256 amount,
        uint256 fee,
        uint256 totalReleased,
        uint64 newNonce
    );
    event EscrowRefunded(uint256 indexed escrowId, address indexed depositor, uint256 amount);
    event EscrowCancelled(uint256 indexed escrowId, address indexed beneficiary, uint256 amount);
    event ProtocolFeeUpdated(uint16 newFeeBps, address newRecipient);
    event TokensRescued(address indexed token, address indexed to, uint256 amount);

    // -------------------------------------------------------------------------
    // Errors
    //
    // Custom errors are cheaper than revert strings and give tests exact
    // selectors to match against.
    // -------------------------------------------------------------------------

    error ZeroAddress();
    error ZeroAmount();
    error ExpiryInPast();
    error ExpiryTooFar();
    error BadEthValue();
    error NotDepositor();
    error NotBeneficiary();
    error NotExpiredYet();
    error AlreadyClosed();
    error NothingToRelease();
    error AmountExceedsRemaining();
    error DeadlinePassed();
    error InvalidSignature();
    error FeeTooHigh();
    error EthTransferFailed();
    error InsufficientSurplus();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @notice Deploys the escrow with an initial owner and fee recipient.
    /// @param  initialOwner Owner address (use a multisig in production).
    constructor(address initialOwner)
        EIP712("IntentEscrow", "1")
        Ownable(initialOwner)
    {
        feeRecipient = initialOwner;
    }

    // -------------------------------------------------------------------------
    // External: createEscrow
    // -------------------------------------------------------------------------

    /// @notice Create a new escrow, locking `amount` of `token` (or ETH when
    ///         `token == NATIVE_ETH`) in favour of `beneficiary` until
    ///         `expiry` passes or full release occurs.
    /// @dev    For ERC-20 escrows, the recorded `totalAmount` is the amount
    ///         actually received by this contract, not the caller-supplied
    ///         `amount`. This keeps the invariant
    ///         `balance(token) >= totalLocked[token]` true even for
    ///         fee-on-transfer or rebasing tokens. The `nonReentrant` guard
    ///         still holds while the balance delta is measured. Expiry is
    ///         capped at ~5 years to protect against UX typos that would
    ///         otherwise freeze funds practically forever.
    /// @param  beneficiary The party who will sign release intents.
    /// @param  token       ERC-20 address, or `NATIVE_ETH` (address(0)) for ETH.
    /// @param  amount      Amount the depositor is offering. For ERC-20s the
    ///                     contract stores the actual amount received.
    /// @param  expiry      Unix timestamp after which the depositor may refund.
    /// @return escrowId    Id of the new escrow.
    function createEscrow(
        address beneficiary,
        address token,
        uint256 amount,
        uint64 expiry
    ) external payable nonReentrant returns (uint256 escrowId) {
        // Checks.
        if (beneficiary == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (expiry <= block.timestamp) revert ExpiryInPast();
        if (expiry > block.timestamp + 365 days * 5) revert ExpiryTooFar();

        // For ETH, msg.value must match exactly; for ERC-20 it must be zero
        // (any attached ETH on an ERC-20 escrow would be permanently stuck).
        uint256 stored;
        if (token == NATIVE_ETH) {
            if (msg.value != amount) revert BadEthValue();
            stored = amount;
        } else {
            if (msg.value != 0) revert BadEthValue();
            // Interaction-before-effect for ERC-20s is intentional: we need
            // to know how many tokens actually arrived before writing state,
            // because fee-on-transfer tokens deliver less than `amount`.
            // The `nonReentrant` guard prevents any re-entrant state
            // corruption during the transfer.
            uint256 balanceBefore = IERC20(token).balanceOf(address(this));
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
            uint256 balanceAfter = IERC20(token).balanceOf(address(this));
            stored = balanceAfter - balanceBefore;
            if (stored == 0) revert ZeroAmount();
        }

        // Effects.
        escrowId = nextEscrowId++;
        _escrows[escrowId] = Escrow({
            depositor: msg.sender,
            beneficiary: beneficiary,
            token: token,
            totalAmount: stored,
            released: 0,
            expiry: expiry,
            nonce: 0,
            closed: false
        });
        totalLocked[token] += stored;

        emit EscrowCreated(escrowId, msg.sender, beneficiary, token, stored, expiry);
    }

    // -------------------------------------------------------------------------
    // External: settleWithSignature
    //
    // Anyone can call this — typically the depositor or a relayer. The
    // beneficiary never pays gas, which is the point of an intent-based
    // design. The signed struct is bound to (escrowId, amount, deadline,
    // nonce); incrementing `nonce` on every successful settle invalidates
    // all earlier intents for that escrow. The EIP-712 domain separator
    // binds the signature to this contract on this chain.
    // -------------------------------------------------------------------------

    /// @notice Release up to `amount` to the beneficiary, authorised by their
    ///         EIP-712 signature over `SettleIntent`.
    /// @dev    Uses `SignatureChecker.isValidSignatureNow`, which accepts:
    ///         (1) a standard 65-byte ECDSA signature from an EOA beneficiary,
    ///         (2) any contract beneficiary implementing ERC-1271
    ///             `isValidSignature(bytes32,bytes)` — Safe, ERC-4337 smart
    ///             wallets, EIP-7702 delegated EOAs, etc.
    /// @param  escrowId  Target escrow.
    /// @param  amount    Amount to release this call (must be <= remaining).
    /// @param  deadline  Signature expiry (Unix seconds).
    /// @param  signature EOA signature OR ERC-1271 signature bytes.
    function settleWithSignature(
        uint256 escrowId,
        uint256 amount,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        Escrow storage e = _escrows[escrowId];

        // Checks.
        if (e.depositor == address(0)) revert NothingToRelease(); // unknown id
        if (e.closed) revert AlreadyClosed();
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp > deadline) revert DeadlinePassed();

        uint256 remaining = e.totalAmount - e.released;
        if (amount > remaining) revert AmountExceedsRemaining();

        // Verify the beneficiary authorised this exact digest.
        // `SignatureChecker` dispatches to ECDSA recovery for EOAs (rejecting
        // malleable high-s sigs via OZ's guarded recover) and to
        // ERC-1271 `isValidSignature` for contract wallets. Any failure path
        // returns `false`.
        bytes32 digest = _hashSettleIntent(escrowId, amount, deadline, e.nonce);
        if (!SignatureChecker.isValidSignatureNow(e.beneficiary, digest, signature)) {
            revert InvalidSignature();
        }

        // Multiply-before-divide keeps precision loss to at most 1 wei.
        uint256 fee = (amount * protocolFeeBps) / 10_000;
        uint256 payout = amount - fee;

        // Effects.
        e.nonce += 1;
        e.released += amount;
        totalLocked[e.token] -= amount;
        if (e.released == e.totalAmount) {
            e.closed = true;
        }

        // Interactions.
        _payout(e.token, e.beneficiary, payout);
        if (fee > 0) {
            _payout(e.token, feeRecipient, fee);
        }

        emit EscrowSettled(escrowId, e.beneficiary, amount, fee, e.released, e.nonce);
    }

    // -------------------------------------------------------------------------
    // External: refundAfterExpiry / cancelByBeneficiary
    //
    // Two symmetric exits: the depositor can reclaim the remainder once the
    // expiry has passed, or the beneficiary can voluntarily return it early
    // (e.g. deal fell through). Both mark the escrow closed so no further
    // transitions are possible.
    // -------------------------------------------------------------------------

    /// @notice After `expiry`, depositor reclaims any unreleased portion.
    function refundAfterExpiry(uint256 escrowId) external nonReentrant {
        Escrow storage e = _escrows[escrowId];

        if (e.depositor == address(0)) revert NothingToRelease();
        if (msg.sender != e.depositor) revert NotDepositor();
        if (e.closed) revert AlreadyClosed();
        if (block.timestamp <= e.expiry) revert NotExpiredYet();

        uint256 remainder = e.totalAmount - e.released;
        if (remainder == 0) revert NothingToRelease();

        e.released = e.totalAmount;
        e.closed = true;
        totalLocked[e.token] -= remainder;

        _payout(e.token, e.depositor, remainder);

        emit EscrowRefunded(escrowId, e.depositor, remainder);
    }

    /// @notice Beneficiary voluntarily returns the remainder before expiry.
    function cancelByBeneficiary(uint256 escrowId) external nonReentrant {
        Escrow storage e = _escrows[escrowId];

        if (e.depositor == address(0)) revert NothingToRelease();
        if (msg.sender != e.beneficiary) revert NotBeneficiary();
        if (e.closed) revert AlreadyClosed();

        uint256 remainder = e.totalAmount - e.released;
        if (remainder == 0) revert NothingToRelease();

        e.released = e.totalAmount;
        e.closed = true;
        totalLocked[e.token] -= remainder;

        _payout(e.token, e.depositor, remainder);

        emit EscrowCancelled(escrowId, e.beneficiary, remainder);
    }

    // -------------------------------------------------------------------------
    // Owner-only configuration
    //
    // The owner has two powers and only two: (1) tweak the protocol fee
    // within the immutable cap, (2) rescue tokens sent to the contract by
    // mistake — bounded by `totalLocked` so escrowed funds are untouchable
    // regardless of who owns the contract.
    // -------------------------------------------------------------------------

    /// @notice Update the protocol fee (<= `MAX_FEE_BPS`) and/or recipient.
    function setProtocolFee(uint16 newFeeBps, address newRecipient) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        if (newRecipient == address(0)) revert ZeroAddress();
        protocolFeeBps = newFeeBps;
        feeRecipient = newRecipient;
        emit ProtocolFeeUpdated(newFeeBps, newRecipient);
    }

    /// @notice Withdraw tokens sent to the contract outside of `createEscrow`.
    /// @dev    Reverts unless `balance - totalLocked[token] >= amount`, so the
    ///         owner cannot touch any escrowed funds.
    function rescueStuckTokens(address token, address to, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 balance = token == NATIVE_ETH
            ? address(this).balance
            : IERC20(token).balanceOf(address(this));

        uint256 locked = totalLocked[token];
        if (balance < locked || balance - locked < amount) revert InsufficientSurplus();

        _payout(token, to, amount);
        emit TokensRescued(token, to, amount);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Read a single escrow by id.
    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return _escrows[escrowId];
    }

    /// @notice Returns the EIP-712 digest the beneficiary must sign for a
    ///         given release. Exposed for frontend parity tests.
    function hashSettleIntent(
        uint256 escrowId,
        uint256 amount,
        uint256 deadline,
        uint256 nonce
    ) external view returns (bytes32) {
        return _hashSettleIntent(escrowId, amount, deadline, nonce);
    }

    /// @notice EIP-712 domain separator, for off-chain tooling.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // -------------------------------------------------------------------------
    // Internals
    //
    // `_payout` unifies ETH and ERC-20 transfers: low-level `call` for ETH
    // (the only forward-compatible way to forward gas) and SafeERC20 for
    // tokens. There is intentionally no `receive()` / `fallback()` — all ETH
    // must arrive via `createEscrow{value: ...}` so `totalLocked[NATIVE_ETH]`
    // is an exact accounting of escrowed ETH. Anything force-sent via
    // selfdestruct is recoverable through `rescueStuckTokens` as surplus.
    // -------------------------------------------------------------------------

    function _hashSettleIntent(
        uint256 escrowId,
        uint256 amount,
        uint256 deadline,
        uint256 nonce
    ) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(SETTLE_INTENT_TYPEHASH, escrowId, amount, deadline, nonce)
        );
        return _hashTypedDataV4(structHash);
    }

    function _payout(address token, address to, uint256 amount) internal {
        if (amount == 0) return;
        if (token == NATIVE_ETH) {
            (bool ok, ) = payable(to).call{value: amount}("");
            if (!ok) revert EthTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
