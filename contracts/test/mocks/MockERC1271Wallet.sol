// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";

// A minimal ERC-1271 contract wallet: it accepts any signature that a
// designated EOA "owner" would have produced. This stands in for real
// smart accounts (Safe, ERC-4337, EIP-7702) in tests — what matters is the
// interface contract, not the signing scheme underneath.
contract MockERC1271Wallet is IERC1271 {
    using ECDSA for bytes32;

    bytes4 internal constant MAGIC_VALUE = 0x1626ba7e;

    address public immutable owner;

    constructor(address _owner) {
        owner = _owner;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature)
        external
        view
        override
        returns (bytes4)
    {
        (address recovered, ECDSA.RecoverError err, ) = ECDSA.tryRecover(hash, signature);
        if (err == ECDSA.RecoverError.NoError && recovered == owner) {
            return MAGIC_VALUE;
        }
        return 0xffffffff;
    }

    receive() external payable {}
}
