// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Revenue entry point used by the game contracts.
interface IRevenueTreasury {
    /// @dev Revenue sources (indexes are part of the event ABI; append only).
    ///      0 Claim · 1 Upgrade · 2 Shield · 3 Mission · 4 MarketFee · 5 Royalty · 6 Buyback · 7 Other
    function notifyRevenue(uint8 source) external returns (uint256 burned, uint256 pooled);
}
