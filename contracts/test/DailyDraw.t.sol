// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {DailyDraw} from "../src/DailyDraw.sol";

contract DailyDrawTest is Test {
    DailyDraw internal draw;
    address internal operator = makeAddr("operator");
    bytes32 internal constant SEED = keccak256("secret-seed");
    bytes32 internal constant ROOT = keccak256("entrants");
    uint256 internal round;

    function setUp() public {
        vm.warp(1_750_000_000);
        vm.roll(1_000);
        draw = new DailyDraw(address(this), operator);
        round = block.timestamp / 1 days + 1; // tomorrow
        vm.prank(operator);
        draw.commit(round, keccak256(abi.encode(SEED)));
    }

    function _closeAfterDay() internal {
        vm.warp((round + 1) * 1 days + 60);
        vm.prank(operator);
        draw.close(round, ROOT, 500);
    }

    function test_NoArbSysLocally() public view {
        assertFalse(draw.useArbSys());
        assertEq(draw.currentBlock(), block.number);
    }

    function test_FullLifecycle() public {
        _closeAfterDay();
        DailyDraw.Round memory r = draw.roundInfo(round);
        assertEq(uint8(r.status), uint8(DailyDraw.Status.Closed));
        assertEq(r.targetBlock, block.number + 10);

        vm.roll(block.number + 11);
        vm.prank(operator);
        bytes32 rnd = draw.reveal(round, SEED);
        assertEq(rnd, keccak256(abi.encode(SEED, blockhash(r.targetBlock), round, ROOT)));
        uint256[] memory w = draw.winners(round);
        assertEq(w.length, 100);
        for (uint256 i; i < w.length; ++i) {
            assertLt(w[i], 500);
            for (uint256 j; j < i; ++j) {
                assertTrue(w[i] != w[j]);
            }
        }
    }

    function test_RevertWhen_CommitTooLate() public {
        uint256 today = block.timestamp / 1 days;
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(DailyDraw.TooLate.selector, today));
        draw.commit(today, bytes32(uint256(1)));
    }

    function test_RevertWhen_CommitTwice() public {
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(DailyDraw.BadStatus.selector, round, DailyDraw.Status.Committed)
        );
        draw.commit(round, bytes32(uint256(1)));
    }

    function test_RevertWhen_CloseBeforeDayEnds() public {
        vm.warp((round + 1) * 1 days - 1);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(DailyDraw.TooEarly.selector, round));
        draw.close(round, ROOT, 10);
    }

    function test_RevertWhen_RevealEarlyOrBadSeed() public {
        _closeAfterDay();
        uint256 target = draw.roundInfo(round).targetBlock;
        vm.roll(target); // hash of the target block is not final yet
        vm.startPrank(operator);
        vm.expectRevert(abi.encodeWithSelector(DailyDraw.TooEarly.selector, round));
        draw.reveal(round, SEED);
        vm.roll(target + 1);
        vm.expectRevert(DailyDraw.BadSeed.selector);
        draw.reveal(round, keccak256("other"));
        vm.stopPrank();
    }

    function test_RevertWhen_NotOperator() public {
        vm.warp((round + 1) * 1 days + 60);
        vm.expectRevert();
        draw.close(round, ROOT, 10);
    }

    function test_WithheldRevealCanBeVoidedAndNeverRerolled() public {
        _closeAfterDay();
        uint256 target = draw.roundInfo(round).targetBlock;
        vm.roll(target + 257);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(DailyDraw.HashUnavailable.selector, target));
        draw.reveal(round, SEED);

        vm.prank(makeAddr("anyone"));
        draw.voidRound(round);
        assertEq(uint8(draw.roundInfo(round).status), uint8(DailyDraw.Status.Voided));
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(DailyDraw.BadStatus.selector, round, DailyDraw.Status.Voided));
        draw.reveal(round, SEED);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(DailyDraw.BadStatus.selector, round, DailyDraw.Status.Voided));
        draw.close(round, ROOT, 1);
    }

    function test_RevertWhen_VoidTooEarly() public {
        _closeAfterDay();
        vm.roll(block.number + 200);
        vm.expectRevert(abi.encodeWithSelector(DailyDraw.TooEarly.selector, round));
        draw.voidRound(round);
    }

    function test_FewerEntrantsThanWinners() public {
        vm.warp((round + 1) * 1 days + 60);
        vm.prank(operator);
        draw.close(round, ROOT, 7);
        vm.roll(block.number + 11);
        vm.prank(operator);
        draw.reveal(round, SEED);
        uint256[] memory w = draw.winners(round);
        assertEq(w.length, 7);
        bool[7] memory seen;
        for (uint256 i; i < 7; ++i) {
            assertFalse(seen[w[i]]);
            seen[w[i]] = true;
        }
    }

    /// Reference: naive Fisher-Yates over a full array; the sparse version must match exactly.
    function _naive(bytes32 rnd, uint256 n, uint256 k) internal pure returns (uint256[] memory out) {
        if (k > n) k = n;
        uint256[] memory a = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            a[i] = i;
        }
        out = new uint256[](k);
        for (uint256 i; i < k; ++i) {
            uint256 j = i + (uint256(keccak256(abi.encode(rnd, i))) % (n - i));
            (a[i], a[j]) = (a[j], a[i]);
            out[i] = a[i];
        }
    }

    function testFuzz_DrawIndicesMatchesReferenceAndIsUnique(bytes32 rnd, uint16 nRaw, uint8 kRaw)
        public
        view
    {
        uint256 n = bound(nRaw, 0, 600);
        uint256 k = bound(kRaw, 0, 100);
        uint256[] memory got = draw.drawIndices(rnd, n, k);
        uint256[] memory want = _naive(rnd, n, k);
        assertEq(got.length, want.length);
        for (uint256 i; i < got.length; ++i) {
            assertEq(got[i], want[i]);
            assertLt(got[i], n);
            for (uint256 j; j < i; ++j) {
                assertTrue(got[i] != got[j]);
            }
        }
    }

    function test_DrawIndicesScalesToLargeN() public view {
        uint256 g = gasleft();
        uint256[] memory w = draw.drawIndices(keccak256("x"), 10_000_000, 100);
        assertEq(w.length, 100);
        assertLt(g - gasleft(), 3_000_000);
    }
}
