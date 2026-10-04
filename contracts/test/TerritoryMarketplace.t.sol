// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {TerritoryMarketplace} from "../src/TerritoryMarketplace.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract TerritoryMarketplaceTest is BaseTest {
    uint256 internal plotId;

    function setUp() public override {
        super.setUp();
        _fund(alice, 1_000_000 ether);
        _fund(bob, 1_000_000 ether);
        _fund(carol, 1_000_000 ether);
        plotId = _claimAs(alice, JUPITER, 0);
    }

    function _list(address seller, uint256 id, uint256 price) internal {
        vm.prank(seller);
        market.list(id, price);
    }

    function test_DefaultFeeIsOnePercent() public view {
        assertEq(market.feeBps(), 100);
        (uint256 fee, uint256 proceeds) = market.quote(1_000 ether);
        assertEq(fee, 10 ether);
        assertEq(proceeds, 990 ether);
    }

    function test_ListEscrowsTerritory() public {
        _list(alice, plotId, 100 ether);
        assertEq(territory.ownerOf(plotId), address(market));
        TerritoryMarketplace.Listing memory l = market.getListing(plotId);
        assertEq(l.seller, alice);
        assertEq(l.price, 100 ether);
        assertEq(market.activeCount(), 1);
        assertEq(market.listingsOf(alice).length, 1);
    }

    function test_BuyPaysSellerAndSplitsFee() public {
        _list(alice, plotId, 100 ether);
        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bobBefore = token.balanceOf(bob);
        uint256 supplyBefore = token.totalSupply();
        uint256 rewardsBefore = pool.rewardsAvailable();

        vm.expectEmit(true, true, true, true, address(market));
        emit TerritoryMarketplace.Sale(plotId, alice, bob, 100 ether, 1 ether);
        vm.prank(bob);
        market.buy(plotId, 100 ether);

        assertEq(territory.ownerOf(plotId), bob);
        assertEq(token.balanceOf(alice) - aliceBefore, 99 ether);
        assertEq(bobBefore - token.balanceOf(bob), 100 ether);
        assertEq(supplyBefore - token.totalSupply(), 0.1 ether, "10% of fee burned");
        assertEq(pool.rewardsAvailable() - rewardsBefore, 0.9 ether, "90% of fee pooled");
        assertEq(token.balanceOf(address(treasury)), 0);
        assertEq(treasury.revenueBySource(4), 1 ether);
        assertEq(market.totalVolume(), 100 ether);
        assertEq(market.totalFees(), 1 ether);
        assertEq(market.tradeCount(), 1);
        assertEq(market.activeCount(), 0);
        assertEq(market.listingsOf(alice).length, 0);
    }

    function test_TreasuryMustAuthorizeMarketplace() public {
        treasury.revokeRole(treasury.REVENUE_ROLE(), address(market));
        _list(alice, plotId, 100 ether);
        vm.prank(bob);
        vm.expectRevert();
        market.buy(plotId, 100 ether);
    }

    function test_Cancel() public {
        _list(alice, plotId, 100 ether);
        vm.prank(alice);
        market.cancel(plotId);
        assertEq(territory.ownerOf(plotId), alice);
        assertEq(market.activeCount(), 0);
        vm.expectRevert(abi.encodeWithSelector(TerritoryMarketplace.NotListed.selector, plotId));
        vm.prank(bob);
        market.buy(plotId, 100 ether);
    }

    function test_CancelWorksWhilePaused() public {
        _list(alice, plotId, 100 ether);
        market.pause();
        vm.prank(alice);
        market.cancel(plotId);
        assertEq(territory.ownerOf(plotId), alice);
    }

    function test_UpdatePrice() public {
        _list(alice, plotId, 100 ether);
        vm.prank(alice);
        market.updatePrice(plotId, 150 ether);
        assertEq(market.getListing(plotId).price, 150 ether);
        vm.expectRevert(TerritoryMarketplace.NotSeller.selector);
        vm.prank(bob);
        market.updatePrice(plotId, 1 ether);
    }

    function test_RevertWhen_PriceRaisedInFlight() public {
        _list(alice, plotId, 100 ether);
        vm.prank(alice);
        market.updatePrice(plotId, 500 ether);
        vm.expectRevert(
            abi.encodeWithSelector(TerritoryMarketplace.PriceAboveMax.selector, 500 ether, 100 ether)
        );
        vm.prank(bob);
        market.buy(plotId, 100 ether);
    }

    function test_RevertWhen_NotOwnerLists() public {
        vm.expectRevert(TerritoryMarketplace.NotTokenOwner.selector);
        vm.prank(bob);
        market.list(plotId, 100 ether);
    }

    function test_RevertWhen_BuyOwn() public {
        _list(alice, plotId, 100 ether);
        vm.expectRevert(TerritoryMarketplace.CannotBuyOwn.selector);
        vm.prank(alice);
        market.buy(plotId, 100 ether);
    }

    function test_RevertWhen_PriceOutOfRange() public {
        vm.startPrank(alice);
        vm.expectRevert(TerritoryMarketplace.PriceOutOfRange.selector);
        market.list(plotId, 1e14);
        vm.expectRevert(TerritoryMarketplace.PriceOutOfRange.selector);
        market.list(plotId, uint256(type(uint128).max) + 1);
        vm.stopPrank();
    }

    function test_PausedBlocksListAndBuy() public {
        market.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        _list(alice, plotId, 100 ether);
    }

    function test_FeeAdmin() public {
        market.setFeeBps(250);
        assertEq(market.feeBps(), 250);
        vm.expectRevert(TerritoryMarketplace.InvalidConfig.selector);
        market.setFeeBps(501);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        market.setFeeBps(0);
    }

    function test_ZeroFeeSkipsTreasury() public {
        market.setFeeBps(0);
        _list(alice, plotId, 100 ether);
        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(bob);
        market.buy(plotId, 100 ether);
        assertEq(token.balanceOf(alice) - aliceBefore, 100 ether);
        assertEq(treasury.revenueBySource(4), 0);
    }

    function test_ActiveListingsPagination() public {
        uint256[] memory plots = new uint256[](5);
        for (uint256 i; i < 5; ++i) {
            plots[i] = 100 + i;
        }
        vm.prank(alice);
        uint256[] memory ids = territory.claimBatch(JUPITER, plots);
        for (uint256 i; i < 5; ++i) {
            _list(alice, ids[i], (i + 1) * 1 ether);
        }
        (uint256[] memory page, TerritoryMarketplace.Listing[] memory ls) = market.activeListings(1, 2);
        assertEq(page.length, 2);
        assertEq(ls[0].price, 2 ether);
        (page,) = market.activeListings(4, 10);
        assertEq(page.length, 1);
        (page,) = market.activeListings(10, 10);
        assertEq(page.length, 0);
    }

    function test_ResaleChain() public {
        _list(alice, plotId, 100 ether);
        vm.prank(bob);
        market.buy(plotId, 100 ether);
        vm.prank(bob);
        market.list(plotId, 200 ether);
        vm.prank(carol);
        market.buy(plotId, 200 ether);
        assertEq(territory.ownerOf(plotId), carol);
        assertEq(treasury.revenueBySource(4), 3 ether);
        assertEq(market.tradeCount(), 2);
    }

    // ------------------------------------------------------------------ fuzz: fee maths

    /// @notice For any price and fee, seller + fee == price and fee is exactly floor(price*bps/1e4).
    function testFuzz_QuoteConservesValue(uint128 price, uint16 bps) public {
        bps = uint16(bound(bps, 0, market.MAX_FEE_BPS()));
        market.setFeeBps(bps);
        (uint256 fee, uint256 proceeds) = market.quote(price);
        assertEq(fee + proceeds, price);
        assertEq(fee, (uint256(price) * bps) / 10_000);
        assertLe(fee, uint256(price) * 500 / 10_000);
    }

    /// @notice End-to-end sale at any price: balances, burn, pool and supply all reconcile.
    function testFuzz_SaleSettlement(uint256 price, uint16 bps) public {
        price = bound(price, market.MIN_PRICE(), 500_000 ether);
        bps = uint16(bound(bps, 0, market.MAX_FEE_BPS()));
        market.setFeeBps(bps);
        _list(alice, plotId, price);

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bobBefore = token.balanceOf(bob);
        uint256 supplyBefore = token.totalSupply();
        uint256 burnedBefore = token.totalBurned();
        uint256 poolBefore = token.balanceOf(address(pool));

        vm.prank(bob);
        market.buy(plotId, price);

        uint256 expectedFee = (price * bps) / 10_000;
        assertEq(bobBefore - token.balanceOf(bob), price, "buyer pays price");
        assertEq(token.balanceOf(alice) - aliceBefore, price - expectedFee, "seller proceeds");
        assertEq(supplyBefore - token.totalSupply(), _burnPart(expectedFee), "burn share");
        assertEq(token.totalBurned() - burnedBefore, _burnPart(expectedFee));
        assertEq(
            token.balanceOf(address(pool)) - poolBefore, expectedFee - _burnPart(expectedFee), "pool share"
        );
        assertEq(token.balanceOf(address(treasury)), 0, "treasury holds nothing");
        assertEq(territory.ownerOf(plotId), bob);
    }

    /// @notice One-percent fee never exceeds 1% and rounds down (never overcharges).
    function testFuzz_OnePercentNeverOvercharges(uint128 price) public view {
        (uint256 fee,) = market.quote(price);
        assertLe(fee * 100, uint256(price));
        assertGt(fee * 100 + 100, uint256(price));
    }
}
