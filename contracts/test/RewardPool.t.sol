// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BaseTest} from "./Base.t.sol";
import {RewardPool} from "../src/RewardPool.sol";
import {Merkle} from "./utils/Merkle.sol";
import {MockFeeToken} from "./mocks/MockTokens.sol";

contract RewardPoolTest is BaseTest {
    uint256 internal today;

    function setUp() public override {
        super.setUp();
        today = block.timestamp / 1 days;
        // 100k PWSI of revenue -> 90k pooled for rewards.
        token.mint(address(treasury), 100_000 ether);
        vm.prank(address(ops));
        treasury.notifyRevenue(0);
    }

    struct Tree {
        address[] accounts;
        uint256[] amounts;
        bytes32[] leaves;
        bytes32 root;
    }

    function _tree(uint256 epochId, address[] memory accounts, uint256[] memory amounts)
        internal
        view
        returns (Tree memory t)
    {
        t.accounts = accounts;
        t.amounts = amounts;
        t.leaves = new bytes32[](accounts.length);
        for (uint256 i; i < accounts.length; ++i) {
            t.leaves[i] = pool.leaf(epochId, accounts[i], amounts[i]);
        }
        t.root = Merkle.root(t.leaves);
    }

    function _three(uint256 a, uint256 b, uint256 c)
        internal
        view
        returns (address[] memory accts, uint256[] memory amts)
    {
        accts = new address[](3);
        amts = new uint256[](3);
        (accts[0], accts[1], accts[2]) = (alice, bob, carol);
        (amts[0], amts[1], amts[2]) = (a, b, c);
    }

    function _publish(uint256 epochId, Tree memory t, uint256 lb, uint256 lot) internal {
        vm.prank(operator);
        pool.publishRewards(epochId, t.root, lb, lot, uint32(t.accounts.length), "ipfs://x");
    }

    function test_InitialState() public view {
        assertEq(pool.airdropAvailable(), AIRDROP);
        assertEq(pool.rewardsAvailable(), 90_000 ether);
        assertEq(pool.epochCap(), 18_000 ether); // 20% of available
        (uint256 lb, uint256 lot) = pool.splitFor(18_000 ether);
        assertEq(lb, 12_600 ether);
        assertEq(lot, 5_400 ether);
        assertTrue(pool.hasRole(pool.PUBLISHER_ROLE(), operator));
    }

    function test_PublishAndClaim() public {
        (address[] memory a, uint256[] memory m) = _three(1_000 ether, 500 ether, 250 ether);
        Tree memory t = _tree(today, a, m);
        _publish(today, t, 1_500 ether, 250 ether);
        assertEq(pool.outstanding(), 1_750 ether);
        assertEq(pool.rewardsAvailable(), 90_000 ether - 1_750 ether);

        bytes32[] memory p = Merkle.proof(t.leaves, 1);
        assertTrue(pool.canClaim(today, bob, 500 ether, p));
        vm.prank(carol); // anyone can relay; funds go to the account
        pool.claim(today, bob, 500 ether, p);
        assertEq(token.balanceOf(bob), 500 ether);
        assertEq(pool.outstanding(), 1_250 ether);
        assertFalse(pool.canClaim(today, bob, 500 ether, p));

        vm.expectRevert(abi.encodeWithSelector(RewardPool.AlreadyClaimed.selector, today, bob));
        pool.claim(today, bob, 500 ether, p);
    }

    function test_RevertWhen_WrongAmountOrAccount() public {
        (address[] memory a, uint256[] memory m) = _three(1_000 ether, 500 ether, 250 ether);
        Tree memory t = _tree(today, a, m);
        _publish(today, t, 1_000 ether, 750 ether);
        bytes32[] memory p = Merkle.proof(t.leaves, 0);
        vm.expectRevert(RewardPool.InvalidProof.selector);
        pool.claim(today, alice, 1_001 ether, p);
        vm.expectRevert(RewardPool.InvalidProof.selector);
        pool.claim(today, bob, 1_000 ether, p);
    }

    function test_ClaimMany() public {
        uint256 d1 = today - 1;
        (address[] memory a, uint256[] memory m) = _three(100 ether, 200 ether, 300 ether);
        Tree memory t1 = _tree(d1, a, m);
        _publish(d1, t1, 300 ether, 300 ether);
        Tree memory t2 = _tree(today, a, m);
        _publish(today, t2, 300 ether, 300 ether);

        uint256[] memory ids = new uint256[](2);
        uint256[] memory amts = new uint256[](2);
        bytes32[][] memory proofs = new bytes32[][](2);
        (ids[0], ids[1]) = (d1, today);
        (amts[0], amts[1]) = (300 ether, 300 ether);
        proofs[0] = Merkle.proof(t1.leaves, 2);
        proofs[1] = Merkle.proof(t2.leaves, 2);
        pool.claimMany(ids, carol, amts, proofs);
        assertEq(token.balanceOf(carol), 600 ether);
    }

    function test_RevertWhen_OverEpochCap() public {
        (address[] memory a, uint256[] memory m) = _three(1, 1, 1);
        Tree memory t = _tree(today, a, m);
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(RewardPool.OverBudget.selector, 18_000 ether + 1, 18_000 ether)
        );
        pool.publishRewards(today, t.root, 12_600 ether, 5_400 ether + 1, 3, "");
    }

    function test_RevertWhen_SliceOverSplit() public {
        (address[] memory a, uint256[] memory m) = _three(1, 1, 1);
        Tree memory t = _tree(today, a, m);
        vm.prank(operator);
        vm.expectRevert(RewardPool.SplitViolated.selector);
        pool.publishRewards(today, t.root, 1_000 ether, 5_400 ether + 1, 3, "");
    }

    function test_RevertWhen_BadEpochIds() public {
        vm.startPrank(operator);
        vm.expectRevert(abi.encodeWithSelector(RewardPool.BadEpochId.selector, today + 1));
        pool.publishRewards(today + 1, bytes32(uint256(1)), 1, 1, 1, "");
        vm.expectRevert(abi.encodeWithSelector(RewardPool.BadEpochId.selector, 0));
        pool.publishRewards(0, bytes32(uint256(1)), 1, 1, 1, "");
        vm.expectRevert(abi.encodeWithSelector(RewardPool.BadEpochId.selector, 5));
        pool.publishAirdrop(5, bytes32(uint256(1)), 1, 1, "");
        pool.publishRewards(today, bytes32(uint256(1)), 1, 1, 1, "");
        // Re-publishing (or any day not after the last published one) is rejected.
        vm.expectRevert(abi.encodeWithSelector(RewardPool.BadEpochId.selector, today));
        pool.publishRewards(today, bytes32(uint256(1)), 1, 1, 1, "");
        vm.stopPrank();
    }

    /// @dev Regression: a publisher must not be able to release a backlog of past days in one burst
    ///      (each epoch takes epochBudgetBps of what is left, so thousands of back-dated epochs would
    ///      drain the pool).
    function test_RevertWhen_BackdatedBeyondLag() public {
        uint256 lag = pool.MAX_PUBLISH_LAG_DAYS();
        vm.startPrank(operator);
        vm.expectRevert(abi.encodeWithSelector(RewardPool.BadEpochId.selector, today - lag - 1));
        pool.publishRewards(today - lag - 1, bytes32(uint256(1)), 1, 1, 1, "");
        vm.expectRevert(abi.encodeWithSelector(RewardPool.BadEpochId.selector, 1));
        pool.publishRewards(1, bytes32(uint256(1)), 1, 1, 1, "");
        // The oldest allowed day works.
        pool.publishRewards(today - lag, bytes32(uint256(1)), 1, 1, 1, "");
        vm.stopPrank();
    }

    function test_RevertWhen_OutOfOrder() public {
        vm.startPrank(operator);
        pool.publishRewards(today - 1, bytes32(uint256(1)), 1, 1, 1, "");
        vm.expectRevert(abi.encodeWithSelector(RewardPool.BadEpochId.selector, today - 2));
        pool.publishRewards(today - 2, bytes32(uint256(1)), 1, 1, 1, "");
        pool.publishRewards(today, bytes32(uint256(1)), 1, 1, 1, "");
        assertEq(pool.lastRewardsEpoch(), today);
        vm.stopPrank();
    }

    /// @notice Worst case for a compromised publisher key: the burst it can release right now is
    ///         bounded by (MAX_PUBLISH_LAG_DAYS + 1) epochs, then one epoch per day.
    function test_PublisherBurstIsBounded() public {
        uint256 lag = pool.MAX_PUBLISH_LAG_DAYS();
        uint256 startAvail = pool.rewardsAvailable();
        vm.startPrank(operator);
        for (uint256 d = today - lag; d <= today; ++d) {
            uint256 cap = pool.epochCap();
            (uint256 lb, uint256 lot) = pool.splitFor(cap);
            pool.publishRewards(d, bytes32(uint256(d)), lb, lot, 1, "");
        }
        uint256 cap2 = pool.epochCap();
        (uint256 lb2, uint256 lot2) = pool.splitFor(cap2);
        vm.expectRevert(abi.encodeWithSelector(RewardPool.BadEpochId.selector, today));
        pool.publishRewards(today, bytes32(uint256(7)), lb2, lot2, 1, "");
        vm.stopPrank();
        // 4 epochs at 20% each leave 0.8^4 = 40.96% unallocated.
        assertApproxEqRel(pool.rewardsAvailable(), (startAvail * 4096) / 10_000, 1e12);
    }

    function test_RevertWhen_NotPublisher() public {
        vm.prank(alice);
        vm.expectRevert();
        pool.publishRewards(today, bytes32(uint256(1)), 1, 1, 1, "");
    }

    function test_MalformedRootCannotOverpay() public {
        // Tree allocates 300 total but publisher declares only 100: claims stop at the declared total.
        (address[] memory a, uint256[] memory m) = _three(100 ether, 100 ether, 100 ether);
        Tree memory t = _tree(today, a, m);
        _publish(today, t, 100 ether, 0);
        pool.claim(today, alice, 100 ether, Merkle.proof(t.leaves, 0));
        bytes32[] memory p = Merkle.proof(t.leaves, 1);
        vm.expectRevert(abi.encodeWithSelector(RewardPool.OverBudget.selector, 200 ether, 100 ether));
        pool.claim(today, bob, 100 ether, p);
    }

    function test_ClaimWindowAndSweep() public {
        (address[] memory a, uint256[] memory m) = _three(100 ether, 100 ether, 100 ether);
        Tree memory t = _tree(today, a, m);
        _publish(today, t, 300 ether, 0);
        pool.claim(today, alice, 100 ether, Merkle.proof(t.leaves, 0));

        vm.expectRevert(abi.encodeWithSelector(RewardPool.ClaimWindowOpen.selector, today));
        pool.sweep(today);

        vm.warp(block.timestamp + 30 days + 1);
        bytes32[] memory p = Merkle.proof(t.leaves, 1);
        vm.expectRevert(abi.encodeWithSelector(RewardPool.ClaimWindowClosed.selector, today));
        pool.claim(today, bob, 100 ether, p);

        uint256 availBefore = pool.rewardsAvailable();
        assertEq(pool.sweep(today), 200 ether);
        assertEq(pool.rewardsAvailable(), availBefore + 200 ether);
        assertEq(pool.outstanding(), 0);
        vm.expectRevert(abi.encodeWithSelector(RewardPool.AlreadySwept.selector, today));
        pool.sweep(today);
    }

    function test_AirdropBucketIsSeparate() public {
        uint256 id = pool.AIRDROP_EPOCH_BASE() + 1;
        (address[] memory a, uint256[] memory m) = _three(1_000 ether, 2_000 ether, 3_000 ether);
        Tree memory t = _tree(id, a, m);
        uint256 rewardsBefore = pool.rewardsAvailable();
        vm.prank(operator);
        pool.publishAirdrop(id, t.root, 6_000 ether, 3, "");
        assertEq(pool.airdropAvailable(), AIRDROP - 6_000 ether);
        assertEq(pool.rewardsAvailable(), rewardsBefore, "airdrop never dips into revenue rewards");
        pool.claim(id, carol, 3_000 ether, Merkle.proof(t.leaves, 2));
        assertEq(token.balanceOf(carol), 3_000 ether);

        vm.warp(block.timestamp + 31 days);
        pool.sweep(id);
        assertEq(
            pool.airdropAvailable(), AIRDROP - 3_000 ether, "unclaimed airdrop returns to airdrop bucket"
        );
        assertEq(pool.rewardsAvailable(), rewardsBefore);
    }

    function test_RevertWhen_AirdropOverBudget() public {
        uint256 id = pool.AIRDROP_EPOCH_BASE();
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RewardPool.OverBudget.selector, AIRDROP + 1, AIRDROP));
        pool.publishAirdrop(id, bytes32(uint256(1)), AIRDROP + 1, 1, "");
    }

    function test_FundAirdropFeeOnTransfer() public {
        MockFeeToken t = new MockFeeToken();
        RewardPool p = new RewardPool(IERC20(address(t)), admin, 2_000, 3_000);
        t.mint(address(this), 100 ether);
        t.approve(address(p), 100 ether);
        p.fundAirdrop(100 ether);
        assertEq(p.airdropAvailable(), 98 ether);
        assertEq(p.rewardsAvailable(), 0);
    }

    function test_ConfigBounds() public {
        vm.expectRevert(RewardPool.InvalidConfig.selector);
        pool.setConfig(99, 3_000);
        vm.expectRevert(RewardPool.InvalidConfig.selector);
        pool.setConfig(2_000, 7_001);
        pool.setConfig(5_000, 7_000);
        assertEq(pool.epochCap(), 45_000 ether);
    }

    function test_EpochIdsPagination() public {
        vm.startPrank(operator);
        pool.publishRewards(today - 2, bytes32(uint256(1)), 1, 1, 1, "");
        pool.publishRewards(today - 1, bytes32(uint256(1)), 1, 1, 1, "");
        pool.publishRewards(today, bytes32(uint256(1)), 1, 1, 1, "");
        vm.stopPrank();
        uint256[] memory ids = pool.epochIds(1, 10);
        assertEq(ids.length, 2);
        assertEq(ids[0], today - 1);
        assertEq(pool.lastRewardsEpoch(), today);
    }

    /// Fuzz: random allocations within the cap; everyone claims exactly once; pool stays solvent.
    function testFuzz_ClaimsConserve(uint256 seed, uint8 nRaw) public {
        uint256 n = bound(nRaw, 1, 40);
        (uint256 lbCap,) = pool.splitFor(pool.epochCap());
        address[] memory accts = new address[](n);
        uint256[] memory amts = new uint256[](n);
        uint256 total;
        for (uint256 i; i < n; ++i) {
            accts[i] = address(uint160(uint256(keccak256(abi.encode(seed, i))) | 1));
            amts[i] = bound(uint256(keccak256(abi.encode(seed, i, "a"))), 1, lbCap / n);
            total += amts[i];
        }
        Tree memory t = _tree(today, accts, amts);
        _publish(today, t, total, 0);
        uint256 balBefore = token.balanceOf(address(pool));
        for (uint256 i; i < n; ++i) {
            bytes32[] memory p = Merkle.proof(t.leaves, i);
            if (pool.claimed(today, accts[i])) continue; // duplicate address in random set
            pool.claim(today, accts[i], amts[i], p);
            vm.expectRevert();
            pool.claim(today, accts[i], amts[i], p);
            assertGe(token.balanceOf(address(pool)), pool.airdropAvailable() + pool.outstanding());
        }
        RewardPool.Epoch memory e = pool.epoch(today);
        assertLe(e.claimed, e.total);
        assertEq(balBefore - token.balanceOf(address(pool)), e.claimed);
        assertEq(pool.outstanding(), uint256(e.total) - e.claimed);
    }
}
