// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {PWSIFaucet} from "../src/PWSIFaucet.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract PWSIFaucetTest is BaseTest {
    function test_ClaimDrips() public {
        vm.prank(alice);
        faucet.claim();
        assertEq(token.balanceOf(alice), faucet.dripAmount());
        assertEq(faucet.claimCount(), 1);
        assertEq(faucet.nextClaimAt(alice), block.timestamp + faucet.cooldown());
    }

    function test_CooldownEnforced() public {
        vm.prank(alice);
        faucet.claim();
        uint256 next = faucet.nextClaimAt(alice);
        vm.warp(next - 1);
        vm.expectRevert(abi.encodeWithSelector(PWSIFaucet.CooldownActive.selector, next));
        vm.prank(alice);
        faucet.claim();

        vm.warp(next);
        vm.prank(alice);
        faucet.claim();
        assertEq(token.balanceOf(alice), 2 * faucet.dripAmount());
    }

    function test_CooldownIsPerWallet() public {
        vm.prank(alice);
        faucet.claim();
        vm.prank(bob);
        faucet.claim();
        assertEq(token.balanceOf(bob), faucet.dripAmount());
    }

    function testFuzz_ClaimTiming(uint32 waitSeconds) public {
        vm.prank(alice);
        faucet.claim();
        vm.warp(block.timestamp + waitSeconds);
        uint256 cd = faucet.cooldown();
        if (waitSeconds < cd) {
            vm.expectRevert();
            vm.prank(alice);
            faucet.claim();
        } else {
            vm.prank(alice);
            faucet.claim();
            assertEq(token.balanceOf(alice), 2 * faucet.dripAmount());
        }
    }

    function test_PauseBlocksClaims() public {
        faucet.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(alice);
        faucet.claim();
        faucet.unpause();
        vm.prank(alice);
        faucet.claim();
    }

    function test_ConfigureBounds() public {
        faucet.configure(500 ether, 1 hours);
        assertEq(faucet.dripAmount(), 500 ether);
        vm.expectRevert(PWSIFaucet.InvalidConfig.selector);
        faucet.configure(0, 1 hours);
        vm.expectRevert(PWSIFaucet.InvalidConfig.selector);
        faucet.configure(200_000 ether, 1 hours);
        vm.expectRevert(PWSIFaucet.InvalidConfig.selector);
        faucet.configure(1 ether, 10);
    }

    function test_OnlyOwnerConfigures() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        faucet.configure(1 ether, 1 hours);
    }
}
