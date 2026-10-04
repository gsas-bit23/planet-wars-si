// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {PlanetOps} from "../src/PlanetOps.sol";

contract PlanetOpsTest is BaseTest {
    uint256 internal plotId;

    function setUp() public override {
        super.setUp();
        _fund(alice, 1_000_000 ether);
        _fund(bob, 1_000_000 ether);
        plotId = _claimAs(alice, EARTH, 0);
    }

    function test_UpgradeChargesScalingCost() public {
        uint256 supply = token.totalSupply();
        vm.startPrank(alice);
        assertEq(ops.upgradeCost(plotId), 50 ether);
        ops.upgrade(plotId);
        assertEq(ops.levelOf(plotId), 1);
        assertEq(ops.upgradeCost(plotId), 100 ether);
        ops.upgrade(plotId);
        vm.stopPrank();
        assertEq(supply - token.totalSupply(), _burnPart(150 ether));
        assertEq(ops.totalSinkRevenue(), 150 ether);
        assertEq(treasury.revenueBySource(1), 150 ether, "upgrade source");
        assertEq(token.balanceOf(address(treasury)), 0);
    }

    function test_UpgradeCapsAtMaxLevel() public {
        vm.startPrank(alice);
        for (uint256 i; i < 10; ++i) {
            ops.upgrade(plotId);
        }
        vm.expectRevert(PlanetOps.MaxLevel.selector);
        ops.upgrade(plotId);
        vm.stopPrank();
        (uint8 lvl,, uint256 next) = ops.stats(plotId);
        assertEq(lvl, 10);
        assertEq(next, 0);
        // 50 * (1+2+...+10)
        assertEq(ops.totalSinkRevenue(), 50 ether * 55);
    }

    function test_LevelPersistsAcrossTransfers() public {
        vm.prank(alice);
        ops.upgrade(plotId);
        vm.prank(alice);
        market.list(plotId, 10 ether);
        vm.prank(bob);
        market.buy(plotId, 10 ether);
        assertEq(ops.levelOf(plotId), 1);
        vm.prank(bob);
        ops.upgrade(plotId);
        assertEq(ops.levelOf(plotId), 2);
    }

    function test_RevertWhen_NotOwner() public {
        vm.expectRevert(PlanetOps.NotTerritoryOwner.selector);
        vm.prank(bob);
        ops.upgrade(plotId);
        vm.expectRevert(PlanetOps.NotTerritoryOwner.selector);
        vm.prank(bob);
        ops.buildShield(plotId, 1);
    }

    function test_RevertWhen_Listed() public {
        // Escrowed territories cannot be upgraded by the seller.
        vm.prank(alice);
        market.list(plotId, 10 ether);
        vm.expectRevert(PlanetOps.NotTerritoryOwner.selector);
        vm.prank(alice);
        ops.upgrade(plotId);
    }

    function test_Shield() public {
        uint256 supply = token.totalSupply();
        vm.prank(alice);
        uint16 total = ops.buildShield(plotId, 25);
        assertEq(total, 25);
        assertEq(supply - token.totalSupply(), _burnPart(50 ether));
        vm.expectRevert(PlanetOps.ShieldCap.selector);
        vm.prank(alice);
        ops.buildShield(plotId, 976);
        vm.expectRevert(PlanetOps.InvalidConfig.selector);
        vm.prank(alice);
        ops.buildShield(plotId, 0);
    }

    function testFuzz_ShieldCost(uint16 units) public {
        units = uint16(bound(units, 1, 1_000));
        uint256 supply = token.totalSupply();
        vm.prank(alice);
        ops.buildShield(plotId, units);
        assertEq(supply - token.totalSupply(), _burnPart(uint256(units) * 2 ether));
        assertEq(ops.shieldOf(plotId), units);
    }

    function test_Missions() public {
        uint256 supply = token.totalSupply();
        vm.startPrank(bob);
        uint256 m1 = ops.launchMission(JUPITER, 0);
        uint256 m2 = ops.launchMission(EARTH, 2);
        vm.stopPrank();
        assertEq(m1, 1);
        assertEq(m2, 2);
        assertEq(supply - token.totalSupply(), _burnPart(225 ether));
        assertEq(treasury.revenueBySource(3), 225 ether, "mission source");
        vm.expectRevert(abi.encodeWithSelector(PlanetOps.UnknownMission.selector, 3));
        vm.prank(bob);
        ops.launchMission(EARTH, 3);
    }

    function test_AddMissionType() public {
        ops.setMissionCost(3, 500 ether);
        assertEq(ops.missionTypes(), 4);
        vm.prank(bob);
        ops.launchMission(EARTH, 3);
        vm.expectRevert(PlanetOps.InvalidConfig.selector);
        ops.setMissionCost(9, 1 ether);
    }

    function test_RevertWhen_NoAllowance() public {
        token.mint(carol, 1_000 ether);
        vm.expectRevert();
        vm.prank(carol);
        ops.launchMission(EARTH, 0);
    }
}
