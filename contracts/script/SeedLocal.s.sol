// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {PWSIToken} from "../src/PWSIToken.sol";
import {PWSIFaucet} from "../src/PWSIFaucet.sol";
import {PlanetTerritory} from "../src/PlanetTerritory.sol";
import {TerritoryMarketplace} from "../src/TerritoryMarketplace.sol";
import {PlanetOps} from "../src/PlanetOps.sol";

/// @notice Populate a LOCAL anvil chain with realistic activity (claims, listings, trades,
///         upgrades, missions) so every page of the app has data. Refuses to run elsewhere.
/// @dev Uses anvil's well-known public test mnemonic. Never use these keys on a real network.
contract SeedLocal is Script {
    string internal constant ANVIL_MNEMONIC = "test test test test test test test test test test test junk";

    PWSIToken token;
    PWSIFaucet faucet;
    PlanetTerritory territory;
    TerritoryMarketplace market;
    PlanetOps ops;
    mapping(uint256 => uint256) listedA;
    mapping(uint256 => uint256) listedB;

    function run() external {
        require(block.chainid == 31337, "SeedLocal: anvil only");
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/deployments/31337.json"));
        token = PWSIToken(vm.parseJsonAddress(json, ".token"));
        faucet = PWSIFaucet(vm.parseJsonAddress(json, ".faucet"));
        territory = PlanetTerritory(vm.parseJsonAddress(json, ".territory"));
        market = TerritoryMarketplace(vm.parseJsonAddress(json, ".marketplace"));
        ops = PlanetOps(vm.parseJsonAddress(json, ".ops"));

        // Players 1..4 (account 0 is the deployer).
        for (uint32 p = 1; p <= 4; ++p) {
            uint256 pk = vm.deriveKey(ANVIL_MNEMONIC, p);
            vm.startBroadcast(pk);
            faucet.claim();
            token.approve(address(territory), type(uint256).max);
            token.approve(address(market), type(uint256).max);
            token.approve(address(ops), type(uint256).max);
            territory.setApprovalForAll(address(market), true);

            // Claim a small cluster on two bodies.
            uint256 bodyA = 1 + (p % 8);
            uint256 bodyB = 1 + ((p + 3) % 8);
            uint256[] memory a = _commonPlots(bodyA, p * 40, 3);
            territory.claimBatch(bodyA, a);
            uint256 single = territory.claim(bodyB, _commonPlots(bodyB, 200 + p * 40, 1)[0]);

            ops.upgrade(bodyA * 1_000_000 + a[0]);
            ops.buildShield(bodyA * 1_000_000 + a[1], 20);
            ops.launchMission(bodyB, uint8(p % 3));

            market.list(single, (60 + uint256(p) * 15) * 1 ether);
            market.list(bodyA * 1_000_000 + a[2], (90 + uint256(p) * 20) * 1 ether);
            listedA[p] = bodyA * 1_000_000 + a[2];
            listedB[p] = single;
            vm.stopBroadcast();
        }

        // A few secondary sales so the burn dashboard has fee burns.
        _buy(4, listedB[1]);
        _buy(1, listedB[2]);
        _buy(2, listedA[3]);

        console2.log("Seeded. Total burned:", token.totalBurned() / 1 ether, "PWSI");
        console2.log("Active listings:", market.activeCount());
    }

    /// @dev First `n` unclaimed Common plots at or after `start` (keeps seed costs predictable).
    function _commonPlots(uint256 bodyId, uint256 start, uint256 n)
        internal
        view
        returns (uint256[] memory out)
    {
        out = new uint256[](n);
        uint256 found;
        for (uint256 i = start; found < n; ++i) {
            if (!territory.isClaimed(bodyId, i) && territory.zoneOf(bodyId, i) == PlanetTerritory.Zone.Common)
            {
                out[found++] = i;
            }
        }
    }

    function _buy(uint32 buyer, uint256 id) internal {
        uint256 price = market.getListing(id).price;
        vm.startBroadcast(vm.deriveKey(ANVIL_MNEMONIC, buyer));
        market.buy(id, price);
        vm.stopBroadcast();
    }
}
