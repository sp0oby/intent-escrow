// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IntentEscrow} from "../../src/IntentEscrow.sol";

/// @dev Malicious depositor that tries to re-enter `createEscrow` on ETH
///      payouts. Used purely to prove that `nonReentrant` blocks it and that
///      the outer call reverts with EthTransferFailed.
contract Reenterer {
    IntentEscrow public immutable escrow;
    uint256 public reentryEscrowId;
    bool public triggered;

    constructor(IntentEscrow _escrow) {
        escrow = _escrow;
    }

    /// @notice Creates an escrow using this contract as depositor.
    function createEscrow(address beneficiary, uint256 amount, uint64 expiry)
        external
        payable
        returns (uint256 id)
    {
        id = escrow.createEscrow{value: amount}(beneficiary, address(0), amount, expiry);
        reentryEscrowId = id;
    }

    // Triggered when the escrow refunds ETH back to us. We attempt to
    // re-enter `createEscrow`. `nonReentrant` on IntentEscrow must revert,
    // which flips `ok` to false in the outer `_payout` and makes the whole
    // refund/cancel call revert.
    receive() external payable {
        if (!triggered) {
            triggered = true;
            // This call must revert (reentrancy guard active).
            escrow.createEscrow{value: 1}(address(0xB0B), address(0), 1, uint64(block.timestamp + 1 days));
        }
    }
}
