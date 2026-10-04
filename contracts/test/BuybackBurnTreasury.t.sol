// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {BuybackBurnTreasury} from "../src/BuybackBurnTreasury.sol";
import {MockRouter} from "./mocks/MockRouter.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract BuybackBurnTreasuryTest is BaseTest {
    MockRouter internal router;

    function setUp() public override {
        super.setUp();
        router = new MockRouter(token, 10_000 ether); // 1 ETH buys 10k PWSI
        token.grantRole(token.MINTER_ROLE(), address(router));
    }

    function test_BurnAccrued() public {
        token.mint(address(treasury), 42 ether);
        uint256 burned = treasury.burnAccrued();
        assertEq(burned, 42 ether);
        assertEq(token.balanceOf(address(treasury)), 0);
        assertEq(treasury.totalFeesBurned(), 42 ether);
        assertEq(token.totalBurned(), 42 ether);
    }

    function test_BurnAccrued_NoopWhenEmpty() public {
        assertEq(treasury.burnAccrued(), 0);
    }

    function test_BuybackAndBurn() public {
        vm.deal(address(treasury), 2 ether);
        treasury.setRouter(router);
        uint256 burned = treasury.buybackAndBurn(1 ether, 9_000 ether, block.timestamp);
        assertEq(burned, 10_000 ether);
        assertEq(address(treasury).balance, 1 ether);
        assertEq(treasury.totalBuybackBurned(), 10_000 ether);
        assertEq(treasury.totalEthSpent(), 1 ether);
        assertEq(token.totalSupply(), 0);
        assertEq(treasury.totalBurned(), 10_000 ether);
    }

    function test_BuybackRespectsSlippage() public {
        vm.deal(address(treasury), 1 ether);
        treasury.setRouter(router);
        vm.expectRevert(bytes("slippage"));
        treasury.buybackAndBurn(1 ether, 10_001 ether, block.timestamp);
    }

    function test_RevertWhen_RouterNotSet() public {
        vm.deal(address(treasury), 1 ether);
        vm.expectRevert(BuybackBurnTreasury.RouterNotSet.selector);
        treasury.buybackAndBurn(1 ether, 0, block.timestamp);
    }

    function test_RevertWhen_InsufficientEth() public {
        treasury.setRouter(router);
        vm.expectRevert(abi.encodeWithSelector(BuybackBurnTreasury.InsufficientEth.selector, 1 ether, 0));
        treasury.buybackAndBurn(1 ether, 0, block.timestamp);
    }

    function test_OnlyKeeperBuysBack() public {
        treasury.setRouter(router);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, treasury.KEEPER_ROLE()
            )
        );
        vm.prank(alice);
        treasury.buybackAndBurn(0, 0, block.timestamp);
    }

    function test_ReceivesEth() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(treasury).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(treasury).balance, 1 ether);
    }

    function testFuzz_BuybackBurnsEverythingBought(uint96 ethIn) public {
        ethIn = uint96(bound(ethIn, 1e9, 1_000 ether));
        vm.deal(address(treasury), ethIn);
        treasury.setRouter(router);
        uint256 burned = treasury.buybackAndBurn(ethIn, 0, block.timestamp);
        assertEq(burned, (uint256(ethIn) * 10_000 ether) / 1 ether);
        assertEq(token.balanceOf(address(treasury)), 0);
        assertEq(token.totalSupply(), 0);
    }
}
