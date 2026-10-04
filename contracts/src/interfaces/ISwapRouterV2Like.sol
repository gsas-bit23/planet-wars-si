// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Uniswap-V2 style router surface used by the treasury for ETH -> PWSI buybacks.
/// @dev Any V2-compatible router (Uniswap V2, Sushi, forks) satisfies this interface. A V3
///      `exactInputSingle` adapter can be dropped in behind the same signature if needed.
interface ISwapRouterV2Like {
    function WETH() external view returns (address);

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);
}
