// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IntentEscrow} from "../src/IntentEscrow.sol";

/// @notice Deploys `IntentEscrow` with the broadcaster as initial owner.
/// @dev    Usage (Sepolia):
///           source .env
///           forge script script/Deploy.s.sol:Deploy \
///             --rpc-url $SEPOLIA_RPC_URL \
///             --broadcast \
///             --verify \
///             --etherscan-api-key $ETHERSCAN_API_KEY
contract Deploy is Script {
    function run() external returns (IntentEscrow escrow) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        console.log("Deployer:", deployer);
        console.log("ChainId:", block.chainid);

        vm.startBroadcast(pk);
        escrow = new IntentEscrow(deployer);
        vm.stopBroadcast();

        console.log("IntentEscrow deployed at:", address(escrow));
    }
}
