// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MockERC20} from "./MockERC20.sol";

// An ERC-20 that burns a fixed fee on every transfer. Exists only so the
// escrow can prove it measures *actually received* tokens instead of trusting
// the caller-supplied amount — a classic accounting-invariant break.
contract FeeOnTransferERC20 is MockERC20 {
    uint256 public immutable transferFeeBps;

    constructor(uint256 _transferFeeBps)
        MockERC20("FeeOnTransfer", "FOT", 18)
    {
        transferFeeBps = _transferFeeBps;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        uint256 fee = (amount * transferFeeBps) / 10_000;
        _burnFrom(msg.sender, fee);
        _move(msg.sender, to, amount - fee);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        uint256 fee = (amount * transferFeeBps) / 10_000;
        _burnFrom(from, fee);
        _move(from, to, amount - fee);
        return true;
    }

    function _burnFrom(address from, uint256 amount) internal {
        if (amount == 0) return;
        require(balanceOf[from] >= amount, "balance");
        unchecked {
            balanceOf[from] -= amount;
            totalSupply -= amount;
        }
        emit Transfer(from, address(0), amount);
    }

    function _move(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "balance");
        unchecked {
            balanceOf[from] -= amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }
}
