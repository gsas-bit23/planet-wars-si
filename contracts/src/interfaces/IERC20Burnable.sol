// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Optional ERC-20 burn extension (OpenZeppelin ERC20Burnable surface).
interface IERC20Burnable {
    function burn(uint256 amount) external;
}
