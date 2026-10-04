// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {PWSIToken} from "../src/PWSIToken.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract PWSITokenTest is BaseTest {
    function test_Metadata() public view {
        assertEq(token.name(), "Planet Wars SI");
        assertEq(token.symbol(), "PWSI");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), AIRDROP); // only the testnet airdrop allocation is pre-minted
        assertEq(token.balanceOf(address(pool)), AIRDROP);
    }

    function test_MintRequiresRole() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, token.MINTER_ROLE()
            )
        );
        vm.prank(alice);
        token.mint(alice, 1 ether);
    }

    function test_MintCapCountsLifetime() public {
        token.mint(alice, token.MAX_SUPPLY() - token.totalMinted());
        vm.prank(alice);
        token.burn(10 ether);
        // Burned tokens can never be re-minted.
        vm.expectRevert(abi.encodeWithSelector(PWSIToken.MaxSupplyExceeded.selector, 1, 0));
        token.mint(alice, 1);
        assertEq(token.totalBurned(), 10 ether);
        assertEq(token.totalMinted(), token.MAX_SUPPLY());
    }

    function testFuzz_BurnAccounting(uint256 minted, uint256 burned) public {
        minted = bound(minted, 1, token.MAX_SUPPLY() - token.totalMinted());
        burned = bound(burned, 0, minted);
        token.mint(alice, minted);
        vm.prank(alice);
        token.burn(burned);
        assertEq(token.totalBurned(), burned);
        assertEq(token.totalSupply() + token.totalBurned(), token.totalMinted());
    }

    function test_BurnFromNeedsAllowance() public {
        token.mint(alice, 10 ether);
        vm.expectRevert();
        vm.prank(bob);
        token.burnFrom(alice, 1 ether);
    }
}
