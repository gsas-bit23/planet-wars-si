// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {DeployLib} from "./DeployLib.sol";

/// @notice Writes deployments/<chainId>.json (consumed by `npm run contracts:sync`).
abstract contract DeployWriter is Script {
    function _write(
        address token,
        address faucet,
        DeployLib.Game memory g,
        address deployer,
        address operator,
        uint256 startBlock
    ) internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "deployBlock", startBlock);
        vm.serializeAddress(k, "deployer", deployer);
        vm.serializeAddress(k, "operator", operator);
        vm.serializeAddress(k, "token", token);
        vm.serializeAddress(k, "faucet", faucet);
        vm.serializeAddress(k, "treasury", address(g.treasury));
        vm.serializeAddress(k, "rewardPool", address(g.pool));
        vm.serializeAddress(k, "dailyDraw", address(g.draw));
        vm.serializeAddress(k, "territory", address(g.territory));
        vm.serializeAddress(k, "marketplace", address(g.marketplace));
        string memory json = vm.serializeAddress(k, "ops", address(g.ops));
        // DEPLOY_OUT overrides the output file (useful for dry runs that must not clobber a real record).
        string memory path = vm.envOr(
            "DEPLOY_OUT", string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json")
        );
        vm.writeJson(json, path);

        console2.log("Token                ", token);
        console2.log("Faucet               ", faucet);
        console2.log("RevenueTreasury      ", address(g.treasury));
        console2.log("RewardPool           ", address(g.pool));
        console2.log("DailyDraw            ", address(g.draw));
        console2.log("PlanetTerritory      ", address(g.territory));
        console2.log("TerritoryMarketplace ", address(g.marketplace));
        console2.log("PlanetOps            ", address(g.ops));
        console2.log("Written to", path);
    }
}
