// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {BaseTest} from "./Base.t.sol";
import {RevenueTreasury} from "../src/RevenueTreasury.sol";
import {MockRouter} from "./mocks/MockRouter.sol";
import {MockPlainToken, MockNoReturnToken, MockFeeToken} from "./mocks/MockTokens.sol";

contract RevenueTreasuryTest is BaseTest {
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

    function _send(uint256 amount, uint8 source) internal {
        token.mint(address(treasury), amount);
        vm.prank(address(ops)); // ops holds REVENUE_ROLE
        treasury.notifyRevenue(source);
    }

    function test_DefaultSplitIs10_90() public view {
        assertEq(treasury.burnBps(), 1_000);
        assertEq(treasury.poolBps(), 9_000);
        (uint256 b, uint256 p) = treasury.previewSplit(100 ether);
        assertEq(b, 10 ether);
        assertEq(p, 90 ether);
        assertEq(address(treasury.token()), address(token));
        assertEq(treasury.rewardPool(), address(pool));
    }

    function test_NotifyRevenueSplitsAndTracks() public {
        uint256 supply = token.totalSupply();
        token.mint(address(treasury), 50 ether);
        vm.expectEmit(true, true, false, true, address(treasury));
        emit RevenueTreasury.RevenueProcessed(1, address(ops), 50 ether, 5 ether, 45 ether);
        vm.prank(address(ops));
        treasury.notifyRevenue(1);
        assertEq(token.totalSupply(), supply + 50 ether - 5 ether);
        assertEq(token.balanceOf(address(pool)), AIRDROP + 45 ether);
        assertEq(token.balanceOf(address(treasury)), 0);
        assertEq(treasury.totalBurned(), 5 ether);
        assertEq(treasury.totalPooled(), 45 ether);
        assertEq(treasury.revenueBySource(1), 50 ether);
        assertEq(pool.rewardsAvailable(), 45 ether);
    }

    function test_RevertWhen_NotifyWithoutRole() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, treasury.REVENUE_ROLE()
            )
        );
        vm.prank(alice);
        treasury.notifyRevenue(0);
    }

    function test_RevertWhen_InvalidSource() public {
        vm.prank(address(ops));
        vm.expectRevert(abi.encodeWithSelector(RevenueTreasury.InvalidSource.selector, 8));
        treasury.notifyRevenue(8);
    }

    function test_ProcessIsPermissionlessAndBooksOther() public {
        token.mint(address(treasury), 10 ether);
        vm.prank(alice);
        treasury.process();
        assertEq(treasury.revenueBySource(7), 10 ether);
        assertEq(treasury.totalBurned(), 1 ether);
    }

    function test_ZeroBalanceIsNoop() public {
        vm.prank(address(ops));
        (uint256 b, uint256 p) = treasury.notifyRevenue(0);
        assertEq(b + p, 0);
        assertEq(treasury.totalRevenue(), 0);
    }

    // ------------------------------------------------------------ timelocked split

    function test_SplitChangeIsTimelocked() public {
        treasury.queueBurnBps(2_000);
        assertEq(treasury.pendingBurnBps(), 2_000);
        vm.expectRevert(
            abi.encodeWithSelector(RevenueTreasury.TimelockActive.selector, uint64(block.timestamp + 2 days))
        );
        treasury.applyBurnBps();
        vm.warp(block.timestamp + 2 days);
        vm.prank(alice); // anyone can apply once the delay has passed
        treasury.applyBurnBps();
        assertEq(treasury.burnBps(), 2_000);
        assertEq(treasury.poolBps(), 8_000);
        _send(10 ether, 0);
        assertEq(treasury.totalBurned(), 2 ether);
    }

    function test_SplitBounds() public {
        vm.expectRevert(abi.encodeWithSelector(RevenueTreasury.InvalidSplit.selector, 499));
        treasury.queueBurnBps(499);
        vm.expectRevert(abi.encodeWithSelector(RevenueTreasury.InvalidSplit.selector, 5_001));
        treasury.queueBurnBps(5_001);
        treasury.queueBurnBps(500);
        treasury.queueBurnBps(5_000);
    }

    function test_CancelSplit() public {
        treasury.queueBurnBps(3_000);
        treasury.cancelBurnBps();
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(RevenueTreasury.NoPendingSplit.selector);
        treasury.applyBurnBps();
        assertEq(treasury.burnBps(), 1_000);
    }

    function test_RevertWhen_QueueNotAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        treasury.queueBurnBps(2_000);
    }

    function test_RevertWhen_InvalidConstructorSplit() public {
        vm.expectRevert(abi.encodeWithSelector(RevenueTreasury.InvalidSplit.selector, 6_000));
        new RevenueTreasury(token, address(pool), admin, 6_000, RevenueTreasury.BurnMode.BurnFunction);
    }

    // ------------------------------------------------------------ external tokens (pons etc.)

    function _external(IERC20 t) internal returns (RevenueTreasury tr, address sink) {
        sink = makeAddr("pool");
        tr = new RevenueTreasury(t, sink, admin, 1_000, RevenueTreasury.BurnMode.DeadAddress);
        tr.grantRole(tr.REVENUE_ROLE(), admin);
    }

    function test_DeadModeWithPlainToken() public {
        MockPlainToken t = new MockPlainToken();
        (RevenueTreasury tr, address sink) = _external(IERC20(address(t)));
        t.mint(address(tr), 100 ether);
        tr.notifyRevenue(4);
        assertEq(t.balanceOf(DEAD), 10 ether);
        assertEq(t.balanceOf(sink), 90 ether);
        assertEq(tr.totalBurned(), 10 ether);
    }

    function test_BurnModeRevertsOnTokenWithoutBurn() public {
        MockPlainToken t = new MockPlainToken();
        RevenueTreasury tr = new RevenueTreasury(
            IERC20(address(t)), makeAddr("pool"), admin, 1_000, RevenueTreasury.BurnMode.BurnFunction
        );
        tr.grantRole(tr.REVENUE_ROLE(), admin);
        t.mint(address(tr), 1 ether);
        vm.expectRevert(); // no burn(): operators must deploy with BURN_MODE=dead
        tr.notifyRevenue(0);
    }

    function test_DeadModeWithNoReturnToken() public {
        MockNoReturnToken t = new MockNoReturnToken();
        (RevenueTreasury tr, address sink) = _external(IERC20(address(t)));
        t.mint(address(tr), 100 ether);
        tr.notifyRevenue(0);
        assertEq(t.balanceOf(DEAD), 10 ether);
        assertEq(t.balanceOf(sink), 90 ether);
    }

    function test_FeeOnTransferTokenStillSplitsFullBalance() public {
        MockFeeToken t = new MockFeeToken();
        (RevenueTreasury tr, address sink) = _external(IERC20(address(t)));
        t.mint(address(tr), 100 ether);
        tr.notifyRevenue(0);
        assertEq(t.balanceOf(address(tr)), 0);
        assertEq(tr.totalBurned() + tr.totalPooled(), 100 ether);
        assertEq(t.balanceOf(DEAD), 9.8 ether); // 2% transfer fee taken by the token itself
        assertEq(t.balanceOf(sink), 88.2 ether);
    }

    // ------------------------------------------------------------ ETH royalties -> buyback

    function test_BuybackAndSplit() public {
        MockRouter router = new MockRouter(token, 1_000 ether);
        token.grantRole(token.MINTER_ROLE(), address(router));
        treasury.setRouter(router);
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(treasury).call{value: 1 ether}("");
        assertTrue(ok);
        treasury.buybackAndSplit(1 ether, 1_000 ether, block.timestamp);
        assertEq(treasury.revenueBySource(6), 1_000 ether);
        assertEq(treasury.totalBurned(), 100 ether);
        assertEq(treasury.totalEthSpent(), 1 ether);
    }

    function test_RevertWhen_BuybackWithoutRouter() public {
        vm.expectRevert(RevenueTreasury.RouterNotSet.selector);
        treasury.buybackAndSplit(1, 0, block.timestamp);
    }

    // ------------------------------------------------------------ fuzz

    function testFuzz_SplitConservation(uint256 amount, uint16 bps) public {
        amount = bound(amount, 0, 1e26);
        bps = uint16(bound(bps, 500, 5_000));
        treasury.queueBurnBps(bps);
        vm.warp(block.timestamp + 2 days);
        treasury.applyBurnBps();
        uint256 poolBefore = token.balanceOf(address(pool));
        uint256 supply = token.totalSupply();
        _send(amount, 3);
        assertEq(treasury.totalBurned() + treasury.totalPooled(), amount);
        assertEq(token.balanceOf(address(pool)) - poolBefore, treasury.totalPooled());
        assertEq(supply + amount - token.totalSupply(), treasury.totalBurned());
        assertLe(treasury.totalBurned(), (amount * bps) / 10_000);
        assertEq(treasury.totalBurned(), (amount * bps) / 10_000);
    }
}
