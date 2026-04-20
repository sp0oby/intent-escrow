// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IntentEscrow} from "../src/IntentEscrow.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @dev Handler exposed to Foundry's invariant fuzzer. It performs random
///      sequences of createEscrow / settleWithSignature / refundAfterExpiry
///      on behalf of a small set of actors, and the test below asserts that
///      the core accounting invariant holds after every sequence.
contract EscrowHandler is Test {
    IntentEscrow public immutable escrow;
    MockERC20 public immutable token;

    // Fixed depositor / beneficiary set to keep fuzz state small.
    uint256 internal constant BENEFICIARY_PK = 0xA11CE;
    address public beneficiary;
    address public depositor = address(0xD05);

    uint256[] public createdIds;

    constructor(IntentEscrow _escrow, MockERC20 _token) {
        escrow = _escrow;
        token = _token;
        beneficiary = vm.addr(BENEFICIARY_PK);
        vm.deal(depositor, 1_000 ether);
        token.mint(depositor, 1_000_000e18);
        vm.prank(depositor);
        token.approve(address(escrow), type(uint256).max);
    }

    function createEth(uint96 rawAmount, uint32 rawDelta) external {
        uint256 amount = bound(uint256(rawAmount), 1, 10 ether);
        uint64 expiry = uint64(block.timestamp + bound(uint256(rawDelta), 1 hours, 30 days));
        vm.prank(depositor);
        uint256 id = escrow.createEscrow{value: amount}(beneficiary, address(0), amount, expiry);
        createdIds.push(id);
    }

    function createErc20(uint96 rawAmount, uint32 rawDelta) external {
        uint256 amount = bound(uint256(rawAmount), 1, 10_000e18);
        uint64 expiry = uint64(block.timestamp + bound(uint256(rawDelta), 1 hours, 30 days));
        vm.prank(depositor);
        uint256 id = escrow.createEscrow(beneficiary, address(token), amount, expiry);
        createdIds.push(id);
    }

    function settleSome(uint256 idxSeed, uint96 rawAmount) external {
        if (createdIds.length == 0) return;
        uint256 id = createdIds[idxSeed % createdIds.length];
        IntentEscrow.Escrow memory e = escrow.getEscrow(id);
        if (e.closed) return;
        uint256 remaining = e.totalAmount - e.released;
        if (remaining == 0) return;

        uint256 amount = bound(uint256(rawAmount), 1, remaining);
        uint256 deadline = block.timestamp + 1 hours;

        bytes32 digest = escrow.hashSettleIntent(id, amount, deadline, e.nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(BENEFICIARY_PK, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        escrow.settleWithSignature(id, amount, deadline, sig);
    }

    function refundIfExpired(uint256 idxSeed) external {
        if (createdIds.length == 0) return;
        uint256 id = createdIds[idxSeed % createdIds.length];
        IntentEscrow.Escrow memory e = escrow.getEscrow(id);
        if (e.closed) return;
        if (block.timestamp <= e.expiry) return;
        if (e.totalAmount == e.released) return;
        vm.prank(depositor);
        escrow.refundAfterExpiry(id);
    }

    // Makes time-based transitions reachable for the refund path.
    function jumpTime(uint32 raw) external {
        uint256 delta = bound(uint256(raw), 1 minutes, 40 days);
        vm.warp(block.timestamp + delta);
    }
}

contract IntentEscrowInvariantTest is Test {
    IntentEscrow internal escrow;
    MockERC20 internal token;
    EscrowHandler internal handler;

    function setUp() public {
        escrow = new IntentEscrow(address(this));
        token = new MockERC20("Test", "TST", 18);
        handler = new EscrowHandler(escrow, token);

        // Restrict fuzzer to handler-only calls so it doesn't call escrow
        // directly with garbage and waste runs on reverts.
        targetContract(address(handler));
    }

    /// @dev Core accounting invariant: the contract's actual balance of every
    ///      token must always be at least `totalLocked[token]`. Any surplus
    ///      is allowed (rescue territory) but a deficit would mean user funds
    ///      were lost or double-counted.
    function invariant_BalanceCoversLocked_Eth() public view {
        assertGe(address(escrow).balance, escrow.totalLocked(address(0)));
    }

    function invariant_BalanceCoversLocked_Erc20() public view {
        assertGe(token.balanceOf(address(escrow)), escrow.totalLocked(address(token)));
    }

    /// @dev totalLocked can never underflow or go negative (uint so just
    ///      checks consistency across events and state).
    function invariant_ReleasedNeverExceedsTotal() public view {
        uint256 count = escrow.nextEscrowId();
        for (uint256 i = 0; i < count; i++) {
            IntentEscrow.Escrow memory e = escrow.getEscrow(i);
            assertLe(e.released, e.totalAmount);
        }
    }
}
