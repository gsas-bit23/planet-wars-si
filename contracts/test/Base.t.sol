// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {DeployLib} from "../script/DeployLib.sol";
import {PWSIToken} from "../src/PWSIToken.sol";
import {PWSIFaucet} from "../src/PWSIFaucet.sol";
import {PlanetTerritory} from "../src/PlanetTerritory.sol";
import {TerritoryMarketplace} from "../src/TerritoryMarketplace.sol";
import {BuybackBurnTreasury} from "../src/BuybackBurnTreasury.sol";
import {PlanetOps} from "../src/PlanetOps.sol";

abstract contract BaseTest is Test {
    PWSIToken internal token;
    PWSIFaucet internal faucet;
    PlanetTerritory internal territory;
    TerritoryMarketplace internal market;
    BuybackBurnTreasury internal treasury;
    PlanetOps internal ops;

    address internal admin = address(this);
    address internal fund = makeAddr("resistanceFund");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal constant EARTH = 3;
    uint256 internal constant JUPITER = 5;

    function setUp() public virtual {
        vm.warp(1_750_000_000);
        DeployLib.Suite memory s = DeployLib.deploy(admin, fund, "https://pwsi.test/api/metadata/");
        token = s.token;
        faucet = s.faucet;
        territory = s.territory;
        market = s.marketplace;
        treasury = s.treasury;
        ops = s.ops;
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
