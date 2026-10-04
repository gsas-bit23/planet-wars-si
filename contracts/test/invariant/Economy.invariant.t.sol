// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {BaseTest} from "../Base.t.sol";
import {PWSIToken} from "../../src/PWSIToken.sol";
import {PlanetTerritory} from "../../src/PlanetTerritory.sol";
import {TerritoryMarketplace} from "../../src/TerritoryMarketplace.sol";
import {PlanetOps} from "../../src/PlanetOps.sol";
import {RewardPool} from "../../src/RewardPool.sol";

/// @dev Random walk of claims, listings, sales, cancels, sinks, reward epochs, claims and sweeps.
contract EconomyHandler is Test {
    PWSIToken internal token;
    PlanetTerritory internal territory;
    TerritoryMarketplace internal market;
    PlanetOps internal ops;
    RewardPool internal pool;
    address internal publisher;

    address[] internal actors;
    uint256 public ghostFees;
    uint256 public ghostSinks;
    uint256 public ghostClaimed;
    uint256 public doubleClaimSuccesses;
    uint256 public nextDay;

    struct Alloc {
        uint256 epochId;
        address account;
        uint256 amount;
        bytes32 sibling;
    }

    Alloc[] internal allocs;
    uint256[] public epochList;

    constructor(
        PWSIToken t,
        PlanetTerritory te,
        TerritoryMarketplace m,
        PlanetOps o,
        RewardPool p,
        address pub,
        address[] memory a
    ) {
        token = t;
        territory = te;
        market = m;
        ops = o;
        pool = p;
        publisher = pub;
        actors = a;
        nextDay = block.timestamp / 1 days - 1;
    }

    function epochCount() external view returns (uint256) {
        return epochList.length;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    // ---------------------------------------------------------------- game actions

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

    function mission(uint256 actorSeed, uint8 kind) external {
        kind = uint8(bound(kind, 0, 2));
        ghostSinks += ops.missionCost(kind);
        vm.prank(_actor(actorSeed));
        ops.launchMission(3, kind);
    }

    // ---------------------------------------------------------------- reward epochs

    /// Publish a two-recipient rewards epoch (or a two-recipient airdrop) sized within the caps.
    function publish(uint256 seed, bool airdrop) external {
        address a = _actor(seed);
        address b = _actor(seed + 1);
        if (a == b) return;
        uint256 epochId;
        uint256 amtA;
        uint256 amtB;
        if (airdrop) {
            uint256 avail = pool.airdropAvailable();
            if (avail < 2) return;
            epochId = pool.AIRDROP_EPOCH_BASE() + epochList.length;
            amtA = bound(seed, 1, avail / 2);
            amtB = bound(seed >> 8, 1, avail / 2);
        } else {
            (uint256 lbCap, uint256 lotCap) = pool.splitFor(pool.epochCap());
            if (lbCap < 1 || lotCap < 1) return;
            nextDay += 1;
            vm.warp((nextDay + 1) * 1 days + 1);
            epochId = nextDay;
            amtA = bound(seed, 1, lbCap); // leaderboard winner
            amtB = bound(seed >> 8, 1, lotCap); // lottery winner
        }
        bytes32 la = pool.leaf(epochId, a, amtA);
        bytes32 lb = pool.leaf(epochId, b, amtB);
        bytes32 root = la < lb ? keccak256(abi.encode(la, lb)) : keccak256(abi.encode(lb, la));
        vm.startPrank(publisher);
        if (airdrop) pool.publishAirdrop(epochId, root, amtA + amtB, 2, "");
        else pool.publishRewards(epochId, root, amtA, amtB, 2, "");
        vm.stopPrank();
        epochList.push(epochId);
        allocs.push(Alloc(epochId, a, amtA, lb));
        allocs.push(Alloc(epochId, b, amtB, la));
    }

    function claimReward(uint256 idx) external {
        if (allocs.length == 0) return;
        Alloc memory al = allocs[idx % allocs.length];
        RewardPool.Epoch memory e = pool.epoch(al.epochId);
        bool expired = e.swept || block.timestamp > uint256(e.publishedAt) + pool.CLAIM_WINDOW();
        bool already = pool.claimed(al.epochId, al.account);
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = al.sibling;
        if (already || expired) {
            try pool.claim(al.epochId, al.account, al.amount, proof) {
                doubleClaimSuccesses++;
            } catch {}
            return;
        }
        pool.claim(al.epochId, al.account, al.amount, proof);
        ghostClaimed += al.amount;
    }

    function sweepOld(uint256 idx) external {
        if (epochList.length == 0) return;
        uint256 id = epochList[idx % epochList.length];
        RewardPool.Epoch memory e = pool.epoch(id);
        if (e.swept) return;
        vm.warp(uint256(e.publishedAt) + pool.CLAIM_WINDOW() + 1);
        if (block.timestamp / 1 days > nextDay + 1) nextDay = block.timestamp / 1 days - 1;
        pool.sweep(id);
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
        handler = new EconomyHandler(token, territory, market, ops, pool, operator, actors);
        targetContract(address(handler));
    }

    /// Supply conservation: nothing is created or destroyed outside mint/burn.
    function invariant_SupplyConservation() public view {
        assertEq(token.totalSupply() + token.totalBurned(), token.totalMinted());
    }

    /// Revenue is split in the same tx: the treasury never holds PWSI.
    function invariant_TreasuryHoldsNoTokens() public view {
        assertEq(token.balanceOf(address(treasury)), 0);
    }

    /// The split always sums to 100%: every unit of revenue is either burned or pooled.
    function invariant_SplitSumsToRevenue() public view {
        assertEq(treasury.totalBurned() + treasury.totalPooled(), treasury.totalRevenue());
        uint256[] memory bySource = treasury.revenueBreakdown();
        uint256 sum;
        for (uint256 i; i < bySource.length; ++i) {
            sum += bySource[i];
        }
        assertEq(sum, treasury.totalRevenue());
    }

    /// Revenue equals claims + sinks + marketplace fees (ghost-tracked), and only the treasury burns.
    function invariant_RevenueMatchesGhost() public view {
        assertEq(market.totalFees(), handler.ghostFees());
        assertEq(ops.totalSinkRevenue(), handler.ghostSinks());
        assertEq(
            treasury.totalRevenue(),
            territory.totalPrimaryVolume() + ops.totalSinkRevenue() + market.totalFees()
        );
        assertEq(token.totalBurned(), treasury.totalBurned());
    }

    /// Pool accounting conservation: balance = airdrop funding + pooled revenue − claims, and it
    /// always covers the airdrop reserve plus everything allocated but unclaimed.
    function invariant_PoolConservation() public view {
        uint256 bal = token.balanceOf(address(pool));
        assertEq(bal, AIRDROP + treasury.totalPooled() - pool.totalClaimed());
        assertGe(bal, pool.airdropAvailable() + pool.outstanding());
        assertEq(bal, pool.rewardsAvailable() + pool.airdropAvailable() + pool.outstanding());
        assertEq(pool.totalClaimed(), handler.ghostClaimed());
    }

    /// Outstanding equals the sum over epochs of (allocated − claimed − swept).
    function invariant_OutstandingMatchesEpochs() public view {
        uint256 n = handler.epochCount();
        uint256 sum;
        for (uint256 i; i < n; ++i) {
            RewardPool.Epoch memory e = pool.epoch(handler.epochList(i));
            if (!e.swept) sum += uint256(e.total) - e.claimed;
            assertLe(e.claimed, e.total);
        }
        assertEq(sum, pool.outstanding());
    }

    /// No (epoch, account) pair can ever be paid twice, and expired epochs pay nothing.
    function invariant_NoDoubleClaims() public view {
        assertEq(handler.doubleClaimSuccesses(), 0);
    }

    /// Marketplace escrow equals active listings.
    function invariant_EscrowMatchesListings() public view {
        assertEq(territory.balanceOf(address(market)), market.activeCount());
    }
}
