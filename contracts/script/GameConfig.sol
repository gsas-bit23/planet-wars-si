// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Launch configuration for the solar system. Shared by deploy scripts and tests.
library GameConfig {
    struct BodyConfig {
        string name;
        uint32 supply;
        uint32 cols;
        uint128 basePrice;
    }

    uint256 internal constant FAUCET_DRIP = 2_500 ether;
    uint256 internal constant FAUCET_COOLDOWN = 24 hours;
    uint16 internal constant MARKET_FEE_BPS = 100; // 1%
    uint16 internal constant BURN_BPS = 1_000; // 10% of all revenue burned, 90% to the RewardPool
    uint96 internal constant ROYALTY_BPS = 100; // ERC-2981 1% → treasury
    uint16 internal constant EPOCH_BUDGET_BPS = 2_000; // a daily epoch may allocate ≤20% of unallocated rewards
    uint16 internal constant LOTTERY_BPS = 3_000; // 30% of an epoch budget → lottery, 70% → leaderboard
    uint256 internal constant TESTNET_AIRDROP = 10_000_000 ether; // testnet airdrop allocation (minted)
    uint256 internal constant UPGRADE_BASE_COST = 50 ether;
    uint256 internal constant SHIELD_UNIT_COST = 2 ether;

    function bodies() internal pure returns (BodyConfig[] memory b) {
        b = new BodyConfig[](8);
        b[0] = BodyConfig("Mercury", 600, 30, 120 ether);
        b[1] = BodyConfig("Venus", 800, 40, 140 ether);
        b[2] = BodyConfig("Earth", 1_000, 40, 250 ether);
        b[3] = BodyConfig("Mars", 1_500, 50, 180 ether);
        b[4] = BodyConfig("Jupiter", 5_000, 100, 40 ether);
        b[5] = BodyConfig("Saturn", 4_000, 80, 50 ether);
        b[6] = BodyConfig("Uranus", 2_500, 50, 70 ether);
        b[7] = BodyConfig("Neptune", 2_500, 50, 75 ether);
    }

    /// @dev Recon, Sabotage, Liberation.
    function missionCosts() internal pure returns (uint256[] memory c) {
        c = new uint256[](3);
        c[0] = 25 ether;
        c[1] = 75 ether;
        c[2] = 200 ether;
    }
}
