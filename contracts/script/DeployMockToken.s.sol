// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";

/// @notice Deploys a MockERC20 on Sepolia and mints some to the deployer so
///         you have a test token to escrow. Useful for end-to-end demos.
/// @dev    Usage:
///           source .env
///           forge script script/DeployMockToken.s.sol:DeployMockToken \
///             --rpc-url $SEPOLIA_RPC_URL --broadcast
contract DeployMockToken is Script {
    function run() external returns (MockERC20 token) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        token = new MockERC20("Intent Escrow Demo Token", "IEDT", 18);
        token.mint(deployer, 1_000_000e18);
        vm.stopBroadcast();

        console.log("MockERC20 deployed at:", address(token));
        console.log("Minted 1,000,000 IEDT to:", deployer);
    }
}
