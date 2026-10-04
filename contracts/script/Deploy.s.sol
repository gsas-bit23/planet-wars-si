// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {DeployLib} from "./DeployLib.sol";
import {DeployWriter} from "./DeployWriter.sol";
import {GameConfig} from "./GameConfig.sol";
import {RevenueTreasury} from "../src/RevenueTreasury.sol";

/// @notice TESTNET / local: deploys our own PWSI token + faucet + the full game suite.
///
/// Env:
///   DEPLOYER_PRIVATE_KEY  (required) funded deployer key — never commit it.
///   OPERATOR_ADDRESS      (optional) backend signer for reward roots + lottery. Default: deployer.
///   METADATA_BASE_URI     (optional) e.g. https://planet-wars-si.vercel.app/api/metadata/
///   CONTRACT_URI          (optional) e.g. https://planet-wars-si.vercel.app/api/metadata/contract
///   AIRDROP_ALLOCATION    (optional, wei) testnet airdrop minted into the RewardPool.
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast
contract Deploy is DeployWriter {
    function run() external returns (DeployLib.Suite memory s) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        require(block.chainid != 4663, "Deploy.s.sol is testnet-only; use DeployMainnet.s.sol");
        DeployLib.Params memory p = DeployLib.Params({
            admin: deployer,
            operator: vm.envOr("OPERATOR_ADDRESS", deployer),
            baseURI: vm.envOr("METADATA_BASE_URI", string("http://localhost:3000/api/metadata/")),
            contractURI: vm.envOr("CONTRACT_URI", string("http://localhost:3000/api/metadata/contract")),
            burnMode: RevenueTreasury.BurnMode.BurnFunction
        });
        uint256 airdrop = vm.envOr("AIRDROP_ALLOCATION", GameConfig.TESTNET_AIRDROP);
        uint256 startBlock = block.number;

        vm.startBroadcast(pk);
        s = DeployLib.deployTestnet(p, airdrop);
        vm.stopBroadcast();

        _write(address(s.token), address(s.faucet), s.game, deployer, p.operator, startBlock);
    }
}
