// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {IntentEscrow} from "../src/IntentEscrow.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {Reenterer} from "./mocks/Reenterer.sol";
import {FeeOnTransferERC20} from "./mocks/FeeOnTransferERC20.sol";
import {MockERC1271Wallet} from "./mocks/MockERC1271Wallet.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Unit + signature + fuzz tests. Fork/invariant tests live in the
///      other test files in this folder.
contract IntentEscrowTest is Test {
    IntentEscrow internal escrow;
    MockERC20 internal token;

    // Addresses + matching private keys for deterministic EIP-712 signing.
    uint256 internal constant BENEFICIARY_PK = 0xA11CE;
    uint256 internal constant ATTACKER_PK = 0xBADBEEF;

    address internal owner = address(0xA0);
    address internal depositor = address(0xD05);
    address internal beneficiary;
    address internal attacker;

    // Events mirrored from the contract so we can `vm.expectEmit` them.
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

    function setUp() public {
        beneficiary = vm.addr(BENEFICIARY_PK);
        attacker = vm.addr(ATTACKER_PK);

        vm.prank(owner);
        escrow = new IntentEscrow(owner);

        token = new MockERC20("Test", "TST", 18);

        // Fund actors generously but deterministically.
        vm.deal(depositor, 100 ether);
        vm.deal(attacker, 10 ether);
        token.mint(depositor, 1_000_000e18);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    function _sign(
        uint256 pk,
        uint256 escrowId,
        uint256 amount,
        uint256 deadline,
        uint256 nonce
    ) internal view returns (bytes memory sig) {
        bytes32 digest = escrow.hashSettleIntent(escrowId, amount, deadline, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function _createEthEscrow(uint256 amount, uint64 expiry) internal returns (uint256 id) {
        vm.prank(depositor);
        id = escrow.createEscrow{value: amount}(beneficiary, address(0), amount, expiry);
    }

    function _createErc20Escrow(uint256 amount, uint64 expiry) internal returns (uint256 id) {
        vm.startPrank(depositor);
        token.approve(address(escrow), amount);
        id = escrow.createEscrow(beneficiary, address(token), amount, expiry);
        vm.stopPrank();
    }

    // -----------------------------------------------------------------------
    // createEscrow
    // -----------------------------------------------------------------------

    function test_CreateEscrow_Eth_Succeeds() public {
        uint64 expiry = uint64(block.timestamp + 1 days);

        vm.expectEmit(true, true, true, true);
        emit EscrowCreated(0, depositor, beneficiary, address(0), 1 ether, expiry);

        uint256 id = _createEthEscrow(1 ether, expiry);

        IntentEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(e.depositor, depositor);
        assertEq(e.beneficiary, beneficiary);
        assertEq(e.token, address(0));
        assertEq(e.totalAmount, 1 ether);
        assertEq(e.released, 0);
        assertEq(e.expiry, expiry);
        assertEq(e.nonce, 0);
        assertFalse(e.closed);
        assertEq(address(escrow).balance, 1 ether);
        assertEq(escrow.totalLocked(address(0)), 1 ether);
    }

    function test_CreateEscrow_Erc20_Succeeds() public {
        uint256 amount = 500e18;
        uint64 expiry = uint64(block.timestamp + 1 days);

        uint256 id = _createErc20Escrow(amount, expiry);

        assertEq(token.balanceOf(address(escrow)), amount);
        assertEq(escrow.totalLocked(address(token)), amount);
        assertEq(id, 0);
    }

    function test_RevertWhen_CreateEscrow_ZeroBeneficiary() public {
        vm.prank(depositor);
        vm.expectRevert(IntentEscrow.ZeroAddress.selector);
        escrow.createEscrow{value: 1 ether}(address(0), address(0), 1 ether, uint64(block.timestamp + 1 days));
    }

    function test_RevertWhen_CreateEscrow_ZeroAmount() public {
        vm.prank(depositor);
        vm.expectRevert(IntentEscrow.ZeroAmount.selector);
        escrow.createEscrow(beneficiary, address(0), 0, uint64(block.timestamp + 1 days));
    }

    function test_RevertWhen_CreateEscrow_ExpiryInPast() public {
        vm.warp(1000);
        vm.prank(depositor);
        vm.expectRevert(IntentEscrow.ExpiryInPast.selector);
        escrow.createEscrow{value: 1 ether}(beneficiary, address(0), 1 ether, uint64(500));
    }

    function test_RevertWhen_CreateEscrow_ExpiryTooFar() public {
        vm.prank(depositor);
        vm.expectRevert(IntentEscrow.ExpiryTooFar.selector);
        escrow.createEscrow{value: 1 ether}(
            beneficiary,
            address(0),
            1 ether,
            uint64(block.timestamp + 366 days * 5)
        );
    }

    function test_RevertWhen_CreateEscrow_BadEthValue_EthPath() public {
        vm.prank(depositor);
        vm.expectRevert(IntentEscrow.BadEthValue.selector);
        // Sends 2 ether but claims 1 ether.
        escrow.createEscrow{value: 2 ether}(beneficiary, address(0), 1 ether, uint64(block.timestamp + 1 days));
    }

    function test_RevertWhen_CreateEscrow_BadEthValue_Erc20Path() public {
        vm.startPrank(depositor);
        token.approve(address(escrow), 1e18);
        vm.expectRevert(IntentEscrow.BadEthValue.selector);
        // Attaches ETH to an ERC-20 escrow, which would otherwise get stuck.
        escrow.createEscrow{value: 1}(beneficiary, address(token), 1e18, uint64(block.timestamp + 1 days));
        vm.stopPrank();
    }

    // -----------------------------------------------------------------------
    // settleWithSignature
    // -----------------------------------------------------------------------

    function test_Settle_FullEth_PaysBeneficiary() public {
        uint256 id = _createEthEscrow(1 ether, uint64(block.timestamp + 1 days));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(BENEFICIARY_PK, id, 1 ether, deadline, 0);

        uint256 before_ = beneficiary.balance;

        vm.expectEmit(true, true, false, true);
        emit EscrowSettled(id, beneficiary, 1 ether, 0, 1 ether, 1);

        escrow.settleWithSignature(id, 1 ether, deadline, sig);

        assertEq(beneficiary.balance - before_, 1 ether);
        assertEq(escrow.totalLocked(address(0)), 0);
        assertTrue(escrow.getEscrow(id).closed);
    }

    function test_Settle_FullErc20_PaysBeneficiary() public {
        uint256 amount = 1000e18;
        uint256 id = _createErc20Escrow(amount, uint64(block.timestamp + 1 days));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(BENEFICIARY_PK, id, amount, deadline, 0);

        escrow.settleWithSignature(id, amount, deadline, sig);

        assertEq(token.balanceOf(beneficiary), amount);
        assertEq(escrow.totalLocked(address(token)), 0);
    }

    function test_Settle_PartialReleases_MultipleRounds() public {
        uint256 id = _createEthEscrow(3 ether, uint64(block.timestamp + 1 days));
        uint256 deadline = block.timestamp + 1 hours;

        // First release: 1 ether using nonce 0.
        bytes memory sig0 = _sign(BENEFICIARY_PK, id, 1 ether, deadline, 0);
        escrow.settleWithSignature(id, 1 ether, deadline, sig0);

        IntentEscrow.Escrow memory e1 = escrow.getEscrow(id);
        assertEq(e1.released, 1 ether);
        assertEq(e1.nonce, 1);
        assertFalse(e1.closed);

        // Second release: 1.5 ether using bumped nonce 1.
        bytes memory sig1 = _sign(BENEFICIARY_PK, id, 1.5 ether, deadline, 1);
        escrow.settleWithSignature(id, 1.5 ether, deadline, sig1);

        IntentEscrow.Escrow memory e2 = escrow.getEscrow(id);
        assertEq(e2.released, 2.5 ether);
        assertEq(e2.nonce, 2);

        // Final release closes the escrow.
        bytes memory sig2 = _sign(BENEFICIARY_PK, id, 0.5 ether, deadline, 2);
        escrow.settleWithSignature(id, 0.5 ether, deadline, sig2);

        IntentEscrow.Escrow memory e3 = escrow.getEscrow(id);
        assertTrue(e3.closed);
        assertEq(beneficiary.balance, 3 ether);
    }

    function test_RevertWhen_Settle_ReplayedNonce() public {
        uint256 id = _createEthEscrow(2 ether, uint64(block.timestamp + 1 days));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(BENEFICIARY_PK, id, 1 ether, deadline, 0);

        escrow.settleWithSignature(id, 1 ether, deadline, sig);

        // Nonce is now 1, so the same signature must fail.
        vm.expectRevert(IntentEscrow.InvalidSignature.selector);
        escrow.settleWithSignature(id, 1 ether, deadline, sig);
    }

    function test_RevertWhen_Settle_WrongSigner() public {
        uint256 id = _createEthEscrow(1 ether, uint64(block.timestamp + 1 days));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(ATTACKER_PK, id, 1 ether, deadline, 0);

        vm.expectRevert(IntentEscrow.InvalidSignature.selector);
        escrow.settleWithSignature(id, 1 ether, deadline, sig);
    }

    function test_RevertWhen_Settle_ExpiredDeadline() public {
        uint256 id = _createEthEscrow(1 ether, uint64(block.timestamp + 1 days));
        uint256 deadline = block.timestamp + 10;
        bytes memory sig = _sign(BENEFICIARY_PK, id, 1 ether, deadline, 0);

        vm.warp(deadline + 1);

        vm.expectRevert(IntentEscrow.DeadlinePassed.selector);
        escrow.settleWithSignature(id, 1 ether, deadline, sig);
    }

    function test_RevertWhen_Settle_AmountExceedsRemaining() public {
        uint256 id = _createEthEscrow(1 ether, uint64(block.timestamp + 1 days));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(BENEFICIARY_PK, id, 2 ether, deadline, 0);

        vm.expectRevert(IntentEscrow.AmountExceedsRemaining.selector);
        escrow.settleWithSignature(id, 2 ether, deadline, sig);
    }

    function test_RevertWhen_Settle_UnknownId() public {
        bytes memory sig = _sign(BENEFICIARY_PK, 42, 1 ether, block.timestamp + 1 hours, 0);
        vm.expectRevert(IntentEscrow.NothingToRelease.selector);
        escrow.settleWithSignature(42, 1 ether, block.timestamp + 1 hours, sig);
    }

    function test_RevertWhen_Settle_AfterRefund() public {
        uint64 exp = uint64(block.timestamp + 1 days);
        uint256 id = _createEthEscrow(1 ether, exp);
        vm.warp(exp + 1);
        vm.prank(depositor);
        escrow.refundAfterExpiry(id);

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(BENEFICIARY_PK, id, 1 ether, deadline, 0);
        vm.expectRevert(IntentEscrow.AlreadyClosed.selector);
        escrow.settleWithSignature(id, 1 ether, deadline, sig);
    }

    function test_RevertWhen_Settle_WrongChainId() public {
        uint256 id = _createEthEscrow(1 ether, uint64(block.timestamp + 1 days));
        uint256 deadline = block.timestamp + 1 hours;

        // Compute a digest under a fake chainId, then try to use it here.
        // This mimics an attacker replaying a signature captured on another chain.
        uint256 originalChainId = block.chainid;
        vm.chainId(999_999);
        bytes memory sig = _sign(BENEFICIARY_PK, id, 1 ether, deadline, 0);
        vm.chainId(originalChainId);

        vm.expectRevert(IntentEscrow.InvalidSignature.selector);
        escrow.settleWithSignature(id, 1 ether, deadline, sig);
    }

    function test_Settle_WithFee_DeductsAndPaysRecipient() public {
        address feeRecipient = address(0xFEE);
        vm.prank(owner);
        escrow.setProtocolFee(100, feeRecipient); // 1% fee

        uint256 id = _createEthEscrow(1 ether, uint64(block.timestamp + 1 days));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(BENEFICIARY_PK, id, 1 ether, deadline, 0);

        uint256 expectedFee = (1 ether * 100) / 10_000;
        uint256 expectedPayout = 1 ether - expectedFee;

        escrow.settleWithSignature(id, 1 ether, deadline, sig);

        assertEq(beneficiary.balance, expectedPayout);
        assertEq(feeRecipient.balance, expectedFee);
    }

    // -----------------------------------------------------------------------
    // refundAfterExpiry / cancelByBeneficiary
    // -----------------------------------------------------------------------

    function test_Refund_AfterExpiry_ReturnsRemainder() public {
        uint64 exp = uint64(block.timestamp + 1 days);
        uint256 id = _createEthEscrow(2 ether, exp);

        // Partially settle 0.5 ether first.
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(BENEFICIARY_PK, id, 0.5 ether, deadline, 0);
        escrow.settleWithSignature(id, 0.5 ether, deadline, sig);

        vm.warp(exp + 1);
        uint256 before_ = depositor.balance;

        vm.expectEmit(true, true, false, true);
        emit EscrowRefunded(id, depositor, 1.5 ether);

        vm.prank(depositor);
        escrow.refundAfterExpiry(id);

        assertEq(depositor.balance - before_, 1.5 ether);
        assertTrue(escrow.getEscrow(id).closed);
    }

    function test_RevertWhen_Refund_NotExpired() public {
        uint256 id = _createEthEscrow(1 ether, uint64(block.timestamp + 1 days));
        vm.prank(depositor);
        vm.expectRevert(IntentEscrow.NotExpiredYet.selector);
        escrow.refundAfterExpiry(id);
    }

    function test_RevertWhen_Refund_NotDepositor() public {
        uint64 exp = uint64(block.timestamp + 1 days);
        uint256 id = _createEthEscrow(1 ether, exp);
        vm.warp(exp + 1);
        vm.prank(attacker);
        vm.expectRevert(IntentEscrow.NotDepositor.selector);
        escrow.refundAfterExpiry(id);
    }

    function test_Cancel_ByBeneficiary_ReturnsRemainder() public {
        uint256 id = _createEthEscrow(1 ether, uint64(block.timestamp + 1 days));
        uint256 before_ = depositor.balance;

        vm.prank(beneficiary);
        escrow.cancelByBeneficiary(id);

        assertEq(depositor.balance - before_, 1 ether);
        assertTrue(escrow.getEscrow(id).closed);
    }

    function test_RevertWhen_Cancel_NotBeneficiary() public {
        uint256 id = _createEthEscrow(1 ether, uint64(block.timestamp + 1 days));
        vm.prank(depositor);
        vm.expectRevert(IntentEscrow.NotBeneficiary.selector);
        escrow.cancelByBeneficiary(id);
    }

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    function test_SetProtocolFee_Succeeds() public {
        vm.prank(owner);
        escrow.setProtocolFee(50, address(0xFEE));
        assertEq(escrow.protocolFeeBps(), 50);
        assertEq(escrow.feeRecipient(), address(0xFEE));
    }

    function test_RevertWhen_SetProtocolFee_TooHigh() public {
        vm.prank(owner);
        vm.expectRevert(IntentEscrow.FeeTooHigh.selector);
        escrow.setProtocolFee(101, address(0xFEE));
    }

    function test_RevertWhen_SetProtocolFee_NonOwner() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        escrow.setProtocolFee(10, address(0xFEE));
    }

    function test_Rescue_OnlySurplus_Erc20() public {
        // Lock 100 tokens via normal escrow flow.
        _createErc20Escrow(100e18, uint64(block.timestamp + 1 days));

        // Force 40 extra tokens into the contract (simulating accidental send).
        token.mint(address(escrow), 40e18);

        // Can rescue exactly 40; anything more must revert.
        vm.prank(owner);
        vm.expectRevert(IntentEscrow.InsufficientSurplus.selector);
        escrow.rescueStuckTokens(address(token), owner, 41e18);

        vm.prank(owner);
        escrow.rescueStuckTokens(address(token), owner, 40e18);
        assertEq(token.balanceOf(owner), 40e18);
        // Locked funds are untouched.
        assertEq(token.balanceOf(address(escrow)), 100e18);
    }

    function test_Rescue_OnlySurplus_Eth() public {
        _createEthEscrow(1 ether, uint64(block.timestamp + 1 days));
        // Force 0.3 ETH into the contract outside of createEscrow via a
        // selfdestructing helper (vm.deal doesn't touch totalLocked).
        vm.deal(address(escrow), address(escrow).balance + 0.3 ether);

        vm.prank(owner);
        escrow.rescueStuckTokens(address(0), owner, 0.3 ether);
        assertEq(owner.balance, 0.3 ether);
        assertEq(address(escrow).balance, 1 ether);
    }

    // -----------------------------------------------------------------------
    // Reentrancy
    // -----------------------------------------------------------------------

    function test_Reentrancy_Blocked_OnRefund() public {
        // Strategy: the reenterer contract is the depositor. After expiry
        // the refund pays ETH back to the reenterer, whose `receive()` hook
        // tries to call `createEscrow` again. The outer refund is guarded
        // by `nonReentrant`, so the reentering `createEscrow` reverts; that
        // revert propagates through `_payout`'s low-level call, making the
        // whole `refundAfterExpiry` revert with `EthTransferFailed`.
        Reenterer r = new Reenterer(escrow);
        vm.deal(address(r), 5 ether);

        uint64 exp = uint64(block.timestamp + 1 days);
        uint256 id = r.createEscrow(beneficiary, 1 ether, exp);

        vm.warp(exp + 1);

        vm.prank(address(r));
        vm.expectRevert(IntentEscrow.EthTransferFailed.selector);
        escrow.refundAfterExpiry(id);
    }

    // -----------------------------------------------------------------------
    // Fuzz
    // -----------------------------------------------------------------------

    function testFuzz_FeeMath(uint256 amount, uint16 feeBps) public {
        amount = bound(amount, 1, 1e27);
        feeBps = uint16(bound(uint256(feeBps), 0, escrow.MAX_FEE_BPS()));

        vm.prank(owner);
        escrow.setProtocolFee(feeBps, owner);

        vm.deal(depositor, amount);
        vm.prank(depositor);
        uint256 id = escrow.createEscrow{value: amount}(
            beneficiary,
            address(0),
            amount,
            uint64(block.timestamp + 1 days)
        );

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(BENEFICIARY_PK, id, amount, deadline, 0);
        escrow.settleWithSignature(id, amount, deadline, sig);

        uint256 expectedFee = (amount * feeBps) / 10_000;
        uint256 expectedPayout = amount - expectedFee;
        assertEq(beneficiary.balance, expectedPayout);
        assertEq(owner.balance, expectedFee);
    }

    // -----------------------------------------------------------------------
    // ERC-1271 smart contract wallet beneficiaries
    //
    // The upgrade from `ECDSA.tryRecover` to `SignatureChecker` is the
    // feature that actually makes this contract compatible with Safe /
    // ERC-4337 / EIP-7702 smart accounts. These tests exercise both the
    // accept-path and the reject-path of `isValidSignature`.
    // -----------------------------------------------------------------------

    function test_Settle_Erc1271Wallet_Succeeds() public {
        MockERC1271Wallet wallet = new MockERC1271Wallet(vm.addr(BENEFICIARY_PK));

        uint64 exp = uint64(block.timestamp + 1 days);
        vm.prank(depositor);
        uint256 id = escrow.createEscrow{value: 1 ether}(address(wallet), address(0), 1 ether, exp);

        uint256 deadline = block.timestamp + 1 hours;
        // The mock wallet considers an EOA-signed digest valid if the signer
        // matches its stored `owner`. This is what every real contract wallet
        // ultimately reduces to.
        bytes memory sig = _sign(BENEFICIARY_PK, id, 1 ether, deadline, 0);

        escrow.settleWithSignature(id, 1 ether, deadline, sig);

        assertEq(address(wallet).balance, 1 ether);
        assertTrue(escrow.getEscrow(id).closed);
    }

    function test_RevertWhen_Settle_Erc1271_BadInnerSignature() public {
        MockERC1271Wallet wallet = new MockERC1271Wallet(vm.addr(BENEFICIARY_PK));

        uint64 exp = uint64(block.timestamp + 1 days);
        vm.prank(depositor);
        uint256 id = escrow.createEscrow{value: 1 ether}(address(wallet), address(0), 1 ether, exp);

        uint256 deadline = block.timestamp + 1 hours;
        // Signed by an attacker, not by the wallet owner. The wallet's
        // `isValidSignature` returns a non-magic value and the escrow reverts.
        bytes memory sig = _sign(ATTACKER_PK, id, 1 ether, deadline, 0);

        vm.expectRevert(IntentEscrow.InvalidSignature.selector);
        escrow.settleWithSignature(id, 1 ether, deadline, sig);
    }

    // -----------------------------------------------------------------------
    // Fee-on-transfer token accounting
    //
    // Asserts that the contract stores the amount actually received, not
    // the caller-supplied amount, so the invariant
    // `balance(token) >= totalLocked[token]` holds for quirky ERC-20s.
    // -----------------------------------------------------------------------

    function test_CreateEscrow_FeeOnTransfer_AccountsActualReceived() public {
        FeeOnTransferERC20 fot = new FeeOnTransferERC20(500); // 5% burn
        fot.mint(depositor, 1_000e18);

        vm.prank(depositor);
        fot.approve(address(escrow), 1_000e18);

        uint64 exp = uint64(block.timestamp + 1 days);
        vm.prank(depositor);
        uint256 id = escrow.createEscrow(beneficiary, address(fot), 1_000e18, exp);

        IntentEscrow.Escrow memory e = escrow.getEscrow(id);

        // 5% was burned in transferFrom; 950 tokens actually arrived.
        assertEq(e.totalAmount, 950e18, "totalAmount must equal received");
        assertEq(escrow.totalLocked(address(fot)), 950e18, "locked must equal received");
        assertEq(fot.balanceOf(address(escrow)), 950e18, "balance must equal received");
        assertLe(escrow.totalLocked(address(fot)), fot.balanceOf(address(escrow)));
    }

    function test_Settle_FeeOnTransfer_ReleasesActualReceived() public {
        FeeOnTransferERC20 fot = new FeeOnTransferERC20(500);
        fot.mint(depositor, 1_000e18);

        vm.prank(depositor);
        fot.approve(address(escrow), 1_000e18);

        uint64 exp = uint64(block.timestamp + 1 days);
        vm.prank(depositor);
        uint256 id = escrow.createEscrow(beneficiary, address(fot), 1_000e18, exp);

        uint256 stored = escrow.getEscrow(id).totalAmount; // 950e18
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(BENEFICIARY_PK, id, stored, deadline, 0);

        escrow.settleWithSignature(id, stored, deadline, sig);

        // The beneficiary's receive is itself subject to the 5% burn, so they
        // get 95% of the 950 stored. The key property is that escrow
        // accounting stayed sane end-to-end: escrow balance drains to zero
        // and nothing is left locked.
        assertEq(fot.balanceOf(beneficiary), (stored * 9_500) / 10_000);
        assertEq(escrow.totalLocked(address(fot)), 0);
        assertEq(fot.balanceOf(address(escrow)), 0);
        assertTrue(escrow.getEscrow(id).closed);
    }

    function testFuzz_PartialSettlementsSumToTotal(uint96 a, uint96 b, uint96 c) public {
        uint256 aa = bound(uint256(a), 1, 10 ether);
        uint256 bb = bound(uint256(b), 1, 10 ether);
        uint256 cc = bound(uint256(c), 1, 10 ether);
        uint256 total = aa + bb + cc;

        vm.deal(depositor, total);
        vm.prank(depositor);
        uint256 id = escrow.createEscrow{value: total}(
            beneficiary,
            address(0),
            total,
            uint64(block.timestamp + 30 days)
        );

        uint256 deadline = block.timestamp + 1 hours;

        bytes memory s0 = _sign(BENEFICIARY_PK, id, aa, deadline, 0);
        escrow.settleWithSignature(id, aa, deadline, s0);
        bytes memory s1 = _sign(BENEFICIARY_PK, id, bb, deadline, 1);
        escrow.settleWithSignature(id, bb, deadline, s1);
        bytes memory s2 = _sign(BENEFICIARY_PK, id, cc, deadline, 2);
        escrow.settleWithSignature(id, cc, deadline, s2);

        assertEq(beneficiary.balance, total);
        assertTrue(escrow.getEscrow(id).closed);
        assertEq(escrow.totalLocked(address(0)), 0);
    }
}
