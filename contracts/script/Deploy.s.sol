// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {DeployLib} from "./DeployLib.sol";

/// @notice Deploy the full suite.
///
/// Env:
///   DEPLOYER_PRIVATE_KEY  (required) funded deployer key — never commit it.
///   RESISTANCE_FUND       (optional) receiver of the non-burned primary-claim share. Default: deployer.
///   METADATA_BASE_URI     (optional) e.g. https://planet-wars-si.vercel.app/api/metadata/
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast
contract Deploy is Script {
    function run() external returns (DeployLib.Suite memory s) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address fund = vm.envOr("RESISTANCE_FUND", deployer);
        string memory baseURI = vm.envOr("METADATA_BASE_URI", string("http://localhost:3000/api/metadata/"));
        uint256 startBlock = block.number;

        vm.startBroadcast(pk);
        s = DeployLib.deploy(deployer, fund, baseURI);
        vm.stopBroadcast();

        _write(s, deployer, fund, startBlock);
    }

    function _write(DeployLib.Suite memory s, address deployer, address fund, uint256 startBlock) internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "deployBlock", startBlock);
        vm.serializeAddress(k, "deployer", deployer);
        vm.serializeAddress(k, "resistanceFund", fund);
        vm.serializeAddress(k, "token", address(s.token));
        vm.serializeAddress(k, "faucet", address(s.faucet));
        vm.serializeAddress(k, "treasury", address(s.treasury));
        vm.serializeAddress(k, "territory", address(s.territory));
        vm.serializeAddress(k, "marketplace", address(s.marketplace));
        string memory json = vm.serializeAddress(k, "ops", address(s.ops));
        string memory path =
            string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);

        console2.log("PWSIToken            ", address(s.token));
        console2.log("PWSIFaucet           ", address(s.faucet));
        console2.log("BuybackBurnTreasury  ", address(s.treasury));
        console2.log("PlanetTerritory      ", address(s.territory));
        console2.log("TerritoryMarketplace ", address(s.marketplace));
        console2.log("PlanetOps            ", address(s.ops));
        console2.log("Written to", path);
    }
}
