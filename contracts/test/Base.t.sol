// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {DeployLib} from "../script/DeployLib.sol";
import {PWSIToken} from "../src/PWSIToken.sol";
import {PWSIFaucet} from "../src/PWSIFaucet.sol";
import {PlanetTerritory} from "../src/PlanetTerritory.sol";
import {TerritoryMarketplace} from "../src/TerritoryMarketplace.sol";
import {RevenueTreasury} from "../src/RevenueTreasury.sol";
import {RewardPool} from "../src/RewardPool.sol";
import {DailyDraw} from "../src/DailyDraw.sol";
import {PlanetOps} from "../src/PlanetOps.sol";

abstract contract BaseTest is Test {
    PWSIToken internal token;
    PWSIFaucet internal faucet;
    PlanetTerritory internal territory;
    TerritoryMarketplace internal market;
    RevenueTreasury internal treasury;
    RewardPool internal pool;
    DailyDraw internal draw;
    PlanetOps internal ops;

    address internal admin = address(this);
    address internal operator = makeAddr("operator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal constant EARTH = 3;
    uint256 internal constant JUPITER = 5;
    uint256 internal constant AIRDROP = 1_000_000 ether;

    /// @dev 10% burned, 90% pooled (default split).
    function _burnPart(uint256 amount) internal pure returns (uint256) {
        return (amount * 1_000) / 10_000;
    }

    function setUp() public virtual {
        vm.warp(1_750_000_000);
        DeployLib.Suite memory s = DeployLib.deployTestnet(
            DeployLib.Params({
                admin: admin,
                operator: operator,
                baseURI: "https://pwsi.test/api/metadata/",
                contractURI: "https://pwsi.test/api/metadata/contract",
                burnMode: RevenueTreasury.BurnMode.BurnFunction
            }),
            AIRDROP
        );
        token = s.token;
        faucet = s.faucet;
        territory = s.game.territory;
        market = s.game.marketplace;
        treasury = s.game.treasury;
        pool = s.game.pool;
        draw = s.game.draw;
        ops = s.game.ops;
        // Test-only minter so we can fund accounts beyond the faucet drip.
        token.grantRole(token.MINTER_ROLE(), admin);
    }

    function _fund(address who, uint256 amount) internal {
        token.mint(who, amount);
        vm.startPrank(who);
        token.approve(address(territory), type(uint256).max);
        token.approve(address(market), type(uint256).max);
        token.approve(address(ops), type(uint256).max);
        territory.setApprovalForAll(address(market), true);
        vm.stopPrank();
    }

    function _firstPlotWithZone(uint256 bodyId, PlanetTerritory.Zone zone) internal view returns (uint256) {
        uint256 supply = territory.body(bodyId).supply;
        for (uint256 i; i < supply; ++i) {
            if (territory.zoneOf(bodyId, i) == zone) return i;
        }
        revert("zone not found");
    }

    function _claimAs(address who, uint256 bodyId, uint256 plotIndex) internal returns (uint256 tokenId) {
        vm.prank(who);
        tokenId = territory.claim(bodyId, plotIndex);
    }
}
