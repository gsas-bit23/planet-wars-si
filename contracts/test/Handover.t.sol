// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DeployLib} from "../script/DeployLib.sol";
import {RevenueTreasury} from "../src/RevenueTreasury.sol";
import {MockPlainToken} from "./mocks/MockTokens.sol";

/// @dev Mainnet admin handover to a multisig: after `handOver` + `acceptOwnership` the deployer
///      holds no power at all; the operator keeps only its publishing / lottery roles.
contract HandoverTest is Test {
    address internal operator = makeAddr("operator");
    address internal safe = makeAddr("safe");

    function test_HandOverRemovesAllDeployerPowers() public {
        MockPlainToken t = new MockPlainToken();
        DeployLib.Game memory g = DeployLib.deployGame(
            IERC20(address(t)),
            DeployLib.Params({
                admin: address(this),
                operator: operator,
                baseURI: "https://x/api/metadata/",
                contractURI: "https://x/api/metadata/contract",
                burnMode: RevenueTreasury.BurnMode.DeadAddress
            })
        );
        DeployLib.handOver(g, address(this), safe);

        bytes32 a = 0x00;
        address me = address(this);
        assertFalse(g.treasury.hasRole(a, me));
        assertFalse(g.treasury.hasRole(g.treasury.KEEPER_ROLE(), me));
        assertFalse(g.pool.hasRole(a, me));
        assertFalse(g.pool.hasRole(g.pool.PUBLISHER_ROLE(), me));
        assertFalse(g.draw.hasRole(a, me));
        assertTrue(g.treasury.hasRole(a, safe));
        assertTrue(g.treasury.hasRole(g.treasury.KEEPER_ROLE(), safe));
        assertTrue(g.pool.hasRole(a, safe));
        assertTrue(g.draw.hasRole(a, safe));
        assertTrue(g.pool.hasRole(g.pool.PUBLISHER_ROLE(), operator));
        assertTrue(g.draw.hasRole(g.draw.OPERATOR_ROLE(), operator));

        // Ownable2Step: pending until the Safe accepts.
        assertEq(g.territory.pendingOwner(), safe);
        vm.startPrank(safe);
        g.territory.acceptOwnership();
        g.marketplace.acceptOwnership();
        g.ops.acceptOwnership();
        vm.stopPrank();
        assertEq(g.territory.owner(), safe);
        assertEq(g.marketplace.owner(), safe);
        assertEq(g.ops.owner(), safe);

        vm.expectRevert();
        g.territory.setBaseURI("https://evil/");
        vm.expectRevert();
        g.treasury.queueBurnBps(5_000);
        vm.expectRevert();
        g.pool.setConfig(5_000, 3_000);
    }
}
