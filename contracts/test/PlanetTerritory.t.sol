// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {PlanetTerritory} from "../src/PlanetTerritory.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract PlanetTerritoryTest is BaseTest {
    function setUp() public override {
        super.setUp();
        _fund(alice, 1_000_000 ether);
        _fund(bob, 1_000_000 ether);
    }

    function test_SolarSystemRegistered() public view {
        assertEq(territory.bodyCount(), 8);
        PlanetTerritory.Body memory earth = territory.body(EARTH);
        assertEq(earth.name, "Earth");
        assertEq(earth.supply, 1_000);
        PlanetTerritory.Body memory jupiter = territory.body(JUPITER);
        assertEq(jupiter.name, "Jupiter");
        assertEq(jupiter.supply, 5_000);
        assertEq(territory.bodies().length, 8);
    }

    function test_ClaimCommonPlot() public {
        uint256 plot = _firstPlotWithZone(EARTH, PlanetTerritory.Zone.Common);
        uint256 price = territory.priceOf(EARTH, plot);
        assertEq(price, 250 ether);

        uint256 supplyBefore = token.totalSupply();
        uint256 id = _claimAs(alice, EARTH, plot);

        assertEq(id, EARTH * 1_000_000 + plot);
        assertEq(territory.ownerOf(id), alice);
        assertTrue(territory.isClaimed(EARTH, plot));
        assertEq(territory.body(EARTH).claimed, 1);
        // 50% burned, 50% to the resistance fund.
        assertEq(token.balanceOf(fund), price / 2);
        assertEq(supplyBefore - token.totalSupply(), price / 2);
        assertEq(territory.totalPrimaryBurned(), price / 2);
    }

    function test_ZoneMultipliers() public view {
        uint256 rare = _firstPlotWithZone(JUPITER, PlanetTerritory.Zone.Rare);
        uint256 legendary = _firstPlotWithZone(JUPITER, PlanetTerritory.Zone.Legendary);
        assertEq(territory.priceOf(JUPITER, rare), 100 ether); // 40 * 2.5
        assertEq(territory.priceOf(JUPITER, legendary), 400 ether); // 40 * 10
    }

    function test_ZonesAreSectorAligned() public view {
        // All 25 plots in a 5x5 sector share a zone.
        uint256 cols = territory.body(JUPITER).cols;
        PlanetTerritory.Zone z = territory.zoneOf(JUPITER, 0);
        for (uint256 r; r < 5; ++r) {
            for (uint256 c; c < 5; ++c) {
                assertEq(uint8(territory.zoneOf(JUPITER, r * cols + c)), uint8(z));
            }
        }
    }

    function test_ZoneDistributionIsSane() public view {
        uint256 supply = territory.body(JUPITER).supply;
        uint256 rare;
        uint256 legendary;
        for (uint256 i; i < supply; ++i) {
            PlanetTerritory.Zone z = territory.zoneOf(JUPITER, i);
            if (z == PlanetTerritory.Zone.Rare) rare++;
            else if (z == PlanetTerritory.Zone.Legendary) legendary++;
        }
        assertGt(rare, 0);
        assertGt(legendary, 0);
        assertLt(rare + legendary, supply / 2);
    }

    function test_RevertWhen_PlotTaken() public {
        uint256 id = _claimAs(alice, EARTH, 0);
        vm.expectRevert(abi.encodeWithSelector(PlanetTerritory.PlotTaken.selector, id));
        vm.prank(bob);
        territory.claim(EARTH, 0);
    }

    function test_RevertWhen_OutOfRange() public {
        vm.expectRevert(abi.encodeWithSelector(PlanetTerritory.PlotOutOfRange.selector, EARTH, 1_000));
        vm.prank(alice);
        territory.claim(EARTH, 1_000);
    }

    function test_RevertWhen_UnknownBody() public {
        vm.expectRevert(abi.encodeWithSelector(PlanetTerritory.UnknownBody.selector, 9));
        vm.prank(alice);
        territory.claim(9, 0);
    }

    function test_RevertWhen_Inactive() public {
        territory.updateBody(EARTH, false, 250 ether);
        vm.expectRevert(abi.encodeWithSelector(PlanetTerritory.BodyInactive.selector, EARTH));
        vm.prank(alice);
        territory.claim(EARTH, 0);
    }

    function test_RevertWhen_NoAllowance() public {
        vm.prank(carol);
        vm.expectRevert();
        territory.claim(EARTH, 0);
    }

    function test_ClaimBatch() public {
        uint256[] memory plots = new uint256[](3);
        plots[0] = 10;
        plots[1] = 11;
        plots[2] = 12;
        uint256 expected =
            territory.priceOf(JUPITER, 10) + territory.priceOf(JUPITER, 11) + territory.priceOf(JUPITER, 12);
        uint256 balBefore = token.balanceOf(alice);
        vm.prank(alice);
        uint256[] memory ids = territory.claimBatch(JUPITER, plots);
        assertEq(ids.length, 3);
        assertEq(territory.balanceOf(alice), 3);
        assertEq(balBefore - token.balanceOf(alice), expected);
        assertEq(territory.tokensOfOwner(alice).length, 3);
    }

    function test_ClaimBatch_RevertsAtomicallyOnDuplicate() public {
        uint256[] memory plots = new uint256[](2);
        plots[0] = 10;
        plots[1] = 10;
        vm.prank(alice);
        vm.expectRevert();
        territory.claimBatch(JUPITER, plots);
        assertFalse(territory.isClaimed(JUPITER, 10));
    }

    function test_ClaimBatch_Limits() public {
        vm.prank(alice);
        vm.expectRevert(PlanetTerritory.BatchTooLarge.selector);
        territory.claimBatch(JUPITER, new uint256[](0));
        vm.prank(alice);
        vm.expectRevert(PlanetTerritory.BatchTooLarge.selector);
        territory.claimBatch(JUPITER, new uint256[](26));
    }

    function test_ClaimedBitmap() public {
        _claimAs(alice, JUPITER, 0);
        _claimAs(alice, JUPITER, 257);
        _claimAs(alice, JUPITER, 4_999);
        uint256[] memory words = territory.claimedBitmap(JUPITER);
        assertEq(words.length, 20);
        assertEq(words[0], 1);
        assertEq(words[1], 2);
        assertEq(words[19], 1 << (4_999 - 19 * 256));
    }

    function test_TokenURI() public {
        uint256 id = _claimAs(alice, EARTH, 5);
        assertEq(territory.tokenURI(id), "https://pwsi.test/api/metadata/3000005");
        territory.setBaseURI("ipfs://x/");
        assertEq(territory.tokenURI(id), "ipfs://x/3000005");
    }

    function test_AddBody_Expandable() public {
        uint256 id = territory.addBody("Moon", 400, 20, 90 ether, true);
        assertEq(id, 9);
        _claimAs(alice, id, 399);
        assertEq(territory.ownerOf(9_000_399), alice);
    }

    function test_AddBody_Validation() public {
        vm.expectRevert(PlanetTerritory.InvalidConfig.selector);
        territory.addBody("Bad", 0, 1, 1, true);
        vm.expectRevert(PlanetTerritory.InvalidConfig.selector);
        territory.addBody("Bad", 10, 11, 1, true);
        vm.expectRevert(PlanetTerritory.InvalidConfig.selector);
        territory.addBody("Bad", 10, 5, 0, true);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        territory.addBody("Moon", 10, 5, 1, true);
    }

    function test_PrimaryConfig() public {
        territory.setPrimaryConfig(carol, 10_000);
        uint256 supplyBefore = token.totalSupply();
        uint256 plot = _firstPlotWithZone(EARTH, PlanetTerritory.Zone.Common);
        _claimAs(alice, EARTH, plot);
        assertEq(supplyBefore - token.totalSupply(), 250 ether); // 100% burn
        assertEq(token.balanceOf(carol), 0);
        vm.expectRevert(PlanetTerritory.InvalidConfig.selector);
        territory.setPrimaryConfig(address(0), 100);
        vm.expectRevert(PlanetTerritory.InvalidConfig.selector);
        territory.setPrimaryConfig(carol, 10_001);
    }

    function testFuzz_ClaimAnyValidPlot(uint256 bodySeed, uint256 plotSeed) public {
        uint256 bodyId = bound(bodySeed, 1, 8);
        uint256 plot = bound(plotSeed, 0, territory.body(bodyId).supply - 1);
        uint256 price = territory.priceOf(bodyId, plot);
        uint256 supplyBefore = token.totalSupply();
        uint256 fundBefore = token.balanceOf(fund);

        uint256 id = _claimAs(alice, bodyId, plot);
        (uint256 b, uint256 p) = territory.decodeTokenId(id);
        assertEq(b, bodyId);
        assertEq(p, plot);
        uint256 burned = supplyBefore - token.totalSupply();
        assertEq(burned + (token.balanceOf(fund) - fundBefore), price);
        assertEq(burned, price / 2);
    }
}
