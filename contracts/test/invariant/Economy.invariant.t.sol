// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {BaseTest} from "../Base.t.sol";
import {PWSIToken} from "../../src/PWSIToken.sol";
import {PlanetTerritory} from "../../src/PlanetTerritory.sol";
import {TerritoryMarketplace} from "../../src/TerritoryMarketplace.sol";
import {BuybackBurnTreasury} from "../../src/BuybackBurnTreasury.sol";
import {PlanetOps} from "../../src/PlanetOps.sol";

/// @dev Random walk of claims, listings, sales, cancels and sinks across a few actors.
contract EconomyHandler is Test {
    PWSIToken internal token;
    PlanetTerritory internal territory;
    TerritoryMarketplace internal market;
    PlanetOps internal ops;

    address[] internal actors;
    uint256 public ghostFees;
    uint256 public ghostSinks;

    constructor(PWSIToken t, PlanetTerritory te, TerritoryMarketplace m, PlanetOps o, address[] memory a) {
        token = t;
        territory = te;
        market = m;
        ops = o;
        actors = a;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function claim(uint256 actorSeed, uint256 plotSeed) external {
        address a = _actor(actorSeed);
        uint256 plot = bound(plotSeed, 0, 4_999);
        if (territory.isClaimed(5, plot)) return;
        vm.prank(a);
        territory.claim(5, plot);
    }

    function list(uint256 actorSeed, uint256 idxSeed, uint256 price) external {
        address a = _actor(actorSeed);
        uint256 n = territory.balanceOf(a);
        if (n == 0) return;
        uint256 id = territory.tokenOfOwnerByIndex(a, idxSeed % n);
        price = bound(price, market.MIN_PRICE(), 10_000 ether);
        vm.prank(a);
        market.list(id, price);
    }

    function buy(uint256 actorSeed, uint256 idxSeed) external {
        uint256 count = market.activeCount();
        if (count == 0) return;
        (uint256[] memory ids, TerritoryMarketplace.Listing[] memory ls) =
            market.activeListings(idxSeed % count, 1);
        address a = _actor(actorSeed);
        if (ls[0].seller == a) return;
        (uint256 fee,) = market.quote(ls[0].price);
        ghostFees += fee;
        vm.prank(a);
        market.buy(ids[0], ls[0].price);
    }

    function cancel(uint256 idxSeed) external {
        uint256 count = market.activeCount();
        if (count == 0) return;
        (uint256[] memory ids, TerritoryMarketplace.Listing[] memory ls) =
            market.activeListings(idxSeed % count, 1);
        vm.prank(ls[0].seller);
        market.cancel(ids[0]);
    }

    function upgrade(uint256 actorSeed, uint256 idxSeed) external {
        address a = _actor(actorSeed);
        uint256 n = territory.balanceOf(a);
        if (n == 0) return;
        uint256 id = territory.tokenOfOwnerByIndex(a, idxSeed % n);
        if (ops.levelOf(id) >= ops.MAX_LEVEL()) return;
        ghostSinks += ops.upgradeCost(id);
        vm.prank(a);
        ops.upgrade(id);
    }
}

contract EconomyInvariantTest is BaseTest {
    EconomyHandler internal handler;

    function setUp() public override {
        super.setUp();
        address[] memory actors = new address[](3);
        actors[0] = alice;
        actors[1] = bob;
        actors[2] = carol;
        for (uint256 i; i < 3; ++i) {
            _fund(actors[i], 10_000_000 ether);
        }
        handler = new EconomyHandler(token, territory, market, ops, actors);
        targetContract(address(handler));
    }

    /// Supply conservation: nothing is created or destroyed outside mint/burn.
    function invariant_SupplyConservation() public view {
        assertEq(token.totalSupply() + token.totalBurned(), token.totalMinted());
    }

    /// Every fee is burned in the same tx: the treasury never holds PWSI.
    function invariant_TreasuryHoldsNoTokens() public view {
        assertEq(token.balanceOf(address(treasury)), 0);
    }

    /// Fee accounting matches the expected 1% of each sale, and all of it was burned.
    function invariant_FeesMatchGhost() public view {
        assertEq(market.totalFees(), handler.ghostFees());
        assertEq(treasury.totalFeesBurned(), handler.ghostFees());
        assertEq(ops.totalSinkBurned(), handler.ghostSinks());
    }

    /// Burn total equals the sum of every burn route.
    function invariant_BurnRoutesReconcile() public view {
        assertEq(
            token.totalBurned(),
            treasury.totalBurned() + ops.totalSinkBurned() + territory.totalPrimaryBurned()
        );
    }

    /// Marketplace escrow equals active listings.
    function invariant_EscrowMatchesListings() public view {
        assertEq(territory.balanceOf(address(market)), market.activeCount());
    }
}
