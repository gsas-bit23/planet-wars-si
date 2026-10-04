// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DeployLib} from "./DeployLib.sol";
import {DeployWriter} from "./DeployWriter.sol";
import {RevenueTreasury} from "../src/RevenueTreasury.sol";

/// @notice MAINNET: deploys the game suite around an EXISTING ERC-20 (e.g. the token launched on
///         the pons launchpad). No token and no faucet are deployed.
///
/// Env:
///   DEPLOYER_PRIVATE_KEY  (required)
///   TOKEN_ADDRESS         (required) the external game token.
///   OPERATOR_ADDRESS      (required) backend signer (reward roots + lottery); keep it separate from the admin.
///   BURN_MODE             (optional) "burn" → token.burn() (token must implement it, e.g. pons V2 tokens
///                         are ERC20Burnable) · "dead" → transfer to 0x…dEaD (default; works with any ERC-20).
///   METADATA_BASE_URI, CONTRACT_URI (required) production URLs.
///
/// Usage (dry run first, without --broadcast):
///   forge script script/DeployMainnet.s.sol --rpc-url robinhood_mainnet
contract DeployMainnet is DeployWriter {
    function run() external returns (DeployLib.Game memory g) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address token = vm.envAddress("TOKEN_ADDRESS");
        require(token.code.length > 0, "TOKEN_ADDRESS has no code on this chain");
        IERC20(token).totalSupply(); // sanity: must look like an ERC-20

        string memory mode = vm.envOr("BURN_MODE", string("dead"));
        bool useBurn = keccak256(bytes(mode)) == keccak256("burn");
        require(useBurn || keccak256(bytes(mode)) == keccak256("dead"), "BURN_MODE must be 'burn' or 'dead'");
        if (useBurn) {
            // Local simulation only (not broadcast): the token must expose burn(uint256), otherwise
            // every revenue call would revert. pons V2 tokens are ERC20Burnable; V1 are not.
            (bool ok,) = token.call(abi.encodeWithSignature("burn(uint256)", 0));
            require(ok, "TOKEN_ADDRESS has no burn(uint256); use BURN_MODE=dead");
        }
        RevenueTreasury.BurnMode burnMode =
            useBurn ? RevenueTreasury.BurnMode.BurnFunction : RevenueTreasury.BurnMode.DeadAddress;

        DeployLib.Params memory p = DeployLib.Params({
            admin: deployer,
            operator: vm.envAddress("OPERATOR_ADDRESS"),
            baseURI: vm.envString("METADATA_BASE_URI"),
            contractURI: vm.envString("CONTRACT_URI"),
            burnMode: burnMode
        });
        uint256 startBlock = block.number;

        vm.startBroadcast(pk);
        g = DeployLib.deployGame(IERC20(token), p);
        vm.stopBroadcast();

        _write(token, address(0), g, deployer, p.operator, startBlock);
    }
}
