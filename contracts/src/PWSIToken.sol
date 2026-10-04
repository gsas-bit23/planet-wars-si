// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title PWSI — the Planet Wars SI game token
/// @notice Utility token used to claim territories, trade on the marketplace and fuel
///         upgrades, defenses and missions. Every token spent inside the game is burned.
/// @dev Minting is capped by a lifetime ceiling (`MAX_SUPPLY` counts every token ever minted),
///      so burned tokens can never be re-issued. On testnet the only minter is the faucet.
contract PWSIToken is ERC20, ERC20Burnable, ERC20Permit, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Lifetime mint ceiling (1B PWSI).
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether;

    /// @notice Sum of every token ever minted.
    uint256 public totalMinted;
    /// @notice Sum of every token ever burned (fees, sinks, primary sales).
    uint256 public totalBurned;

    error MaxSupplyExceeded(uint256 requested, uint256 remaining);

    constructor(address admin) ERC20("Planet Wars SI", "PWSI") ERC20Permit("Planet Wars SI") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Mint new tokens. Restricted to `MINTER_ROLE` (the faucet on testnet).
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        uint256 remaining = MAX_SUPPLY - totalMinted;
        if (amount > remaining) revert MaxSupplyExceeded(amount, remaining);
        totalMinted += amount;
        _mint(to, amount);
    }

    /// @dev Tracks the burn counter for every path that sends tokens to address(0).
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (to == address(0)) totalBurned += value;
    }
}
