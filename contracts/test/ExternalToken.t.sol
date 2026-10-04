// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {DeployLib} from "../script/DeployLib.sol";
import {RevenueTreasury} from "../src/RevenueTreasury.sol";
import {MockPlainToken, MockNoReturnToken} from "./mocks/MockTokens.sol";

/// @dev Mainnet shape: the game runs around an externally launched ERC-20 (e.g. pons) with no
///      burn() and no faucet. Burns go to 0x…dEaD and are tracked by our own contracts.
contract ExternalTokenTest is Test {
    using SafeERC20 for IERC20;

    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function _deploy(IERC20 t) internal returns (DeployLib.Game memory g) {
        g = DeployLib.deployGame(
            t,
            DeployLib.Params({
                admin: address(this),
                operator: makeAddr("operator"),
                baseURI: "https://x/api/metadata/",
                contractURI: "https://x/api/metadata/contract",
                burnMode: RevenueTreasury.BurnMode.DeadAddress
            })
        );
    }

    function _play(address token, DeployLib.Game memory g) internal {
        (bool ok,) = token.call(abi.encodeWithSignature("mint(address,uint256)", alice, 1_000_000 ether));
        require(ok);
        (ok,) = token.call(abi.encodeWithSignature("mint(address,uint256)", bob, 1_000_000 ether));
        require(ok);
        vm.startPrank(alice);
        IERC20(token).forceApprove(address(g.territory), type(uint256).max);
        IERC20(token).forceApprove(address(g.ops), type(uint256).max);
        g.territory.setApprovalForAll(address(g.marketplace), true);
        uint256 price = g.territory.priceOf(3, 0);
        uint256 id = g.territory.claim(3, 0);
        g.ops.upgrade(id);
        g.marketplace.list(id, 100 ether);
        vm.stopPrank();

        vm.startPrank(bob);
        IERC20(token).forceApprove(address(g.marketplace), type(uint256).max);
        g.marketplace.buy(id, 100 ether);
        vm.stopPrank();

        RevenueTreasury tr = g.treasury;
        assertEq(g.territory.ownerOf(id), bob);
        assertGt(tr.totalRevenue(), price);
        assertEq(tr.totalBurned() + tr.totalPooled(), tr.totalRevenue());
        assertEq(IERC20(token).balanceOf(DEAD), tr.totalBurned());
        assertEq(IERC20(token).balanceOf(address(g.pool)), tr.totalPooled());
        assertEq(IERC20(token).balanceOf(address(tr)), 0);
    }

    function test_GameWithPlainNonBurnableToken() public {
        MockPlainToken t = new MockPlainToken();
        _play(address(t), _deploy(IERC20(address(t))));
    }

    function test_GameWithNoReturnToken() public {
        MockNoReturnToken t = new MockNoReturnToken();
        _play(address(t), _deploy(IERC20(address(t))));
    }
}
