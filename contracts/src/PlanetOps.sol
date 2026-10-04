// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IRevenueTreasury} from "./interfaces/IRevenueTreasury.sol";

/// @title PlanetOps — token sinks: upgrades, defenses and missions
/// @notice Every PWSI spent here is game revenue: it goes to the RevenueTreasury, which burns its
///         configured share and sends the rest to the RewardPool. Ownership of state lives on-chain
///         (levels, shields); outcomes of missions and SI attacks are resolved off-chain by the
///         game backend, which indexes the events emitted here.
contract PlanetOps is Ownable2Step, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    IERC721 public immutable territory;
    IRevenueTreasury public immutable treasury;

    uint8 public constant MAX_LEVEL = 10;
    uint16 public constant MAX_SHIELD = 1_000;
    uint256 public constant PLOT_SPACE = 1_000_000;

    /// @notice Cost of upgrading from level L to L+1 = upgradeBaseCost * (L + 1).
    uint256 public upgradeBaseCost;
    /// @notice Cost per shield unit.
    uint256 public shieldUnitCost;
    /// @notice Cost per mission type (0 = Recon, 1 = Sabotage, 2 = Liberation...).
    mapping(uint8 missionType => uint256 cost) public missionCost;
    uint8 public missionTypes;

    mapping(uint256 tokenId => uint8) public levelOf;
    mapping(uint256 tokenId => uint16) public shieldOf;

    uint256 public totalSinkRevenue;
    uint256 public missionCount;

    event Upgraded(uint256 indexed tokenId, address indexed player, uint8 newLevel, uint256 cost);
    event ShieldBuilt(
        uint256 indexed tokenId, address indexed player, uint16 units, uint16 total, uint256 cost
    );
    event MissionLaunched(
        uint256 indexed missionId,
        address indexed player,
        uint256 indexed bodyId,
        uint8 missionType,
        uint256 cost
    );
    event CostsUpdated(uint256 upgradeBaseCost, uint256 shieldUnitCost);
    event MissionCostUpdated(uint8 missionType, uint256 cost);

    error NotTerritoryOwner();
    error MaxLevel();
    error ShieldCap();
    error UnknownMission(uint8 missionType);
    error InvalidConfig();

    constructor(
        IERC20 token_,
        IERC721 territory_,
        IRevenueTreasury treasury_,
        address owner_,
        uint256 upgradeBaseCost_,
        uint256 shieldUnitCost_,
        uint256[] memory missionCosts_
    ) Ownable(owner_) {
        if (address(treasury_) == address(0)) revert InvalidConfig();
        token = token_;
        territory = territory_;
        treasury = treasury_;
        _setCosts(upgradeBaseCost_, shieldUnitCost_);
        if (missionCosts_.length == 0 || missionCosts_.length > 16) revert InvalidConfig();
        for (uint8 i; i < missionCosts_.length; ++i) {
            _setMissionCost(i, missionCosts_[i]);
        }
        missionTypes = uint8(missionCosts_.length);
    }

    function upgradeCost(uint256 tokenId) public view returns (uint256) {
        return upgradeBaseCost * (uint256(levelOf[tokenId]) + 1);
    }

    /// @notice Spend PWSI to raise a territory's level (boosts off-chain yield & defense).
    function upgrade(uint256 tokenId) external whenNotPaused returns (uint8 newLevel) {
        _requireOwner(tokenId);
        uint8 lvl = levelOf[tokenId];
        if (lvl >= MAX_LEVEL) revert MaxLevel();
        uint256 cost = upgradeCost(tokenId);
        newLevel = lvl + 1;
        levelOf[tokenId] = newLevel;
        emit Upgraded(tokenId, msg.sender, newLevel, cost);
        _spend(cost, 1);
    }

    /// @notice Spend PWSI to add shield units that absorb SI attacks.
    function buildShield(uint256 tokenId, uint16 units) external whenNotPaused returns (uint16 total) {
        _requireOwner(tokenId);
        if (units == 0) revert InvalidConfig();
        uint256 next = uint256(shieldOf[tokenId]) + units;
        if (next > MAX_SHIELD) revert ShieldCap();
        total = uint16(next);
        shieldOf[tokenId] = total;
        uint256 cost = shieldUnitCost * units;
        emit ShieldBuilt(tokenId, msg.sender, units, total, cost);
        _spend(cost, 2);
    }

    /// @notice Spend PWSI to launch a mission against the SI on a celestial body.
    function launchMission(uint256 bodyId, uint8 missionType)
        external
        whenNotPaused
        returns (uint256 missionId)
    {
        if (missionType >= missionTypes) revert UnknownMission(missionType);
        if (bodyId == 0) revert InvalidConfig();
        uint256 cost = missionCost[missionType];
        missionId = ++missionCount;
        emit MissionLaunched(missionId, msg.sender, bodyId, missionType, cost);
        _spend(cost, 3);
    }

    function stats(uint256 tokenId)
        external
        view
        returns (uint8 level, uint16 shield, uint256 nextUpgradeCost)
    {
        return (levelOf[tokenId], shieldOf[tokenId], levelOf[tokenId] >= MAX_LEVEL ? 0 : upgradeCost(tokenId));
    }

    // ------------------------------------------------------------------ admin

    function setCosts(uint256 upgradeBaseCost_, uint256 shieldUnitCost_) external onlyOwner {
        _setCosts(upgradeBaseCost_, shieldUnitCost_);
    }

    function setMissionCost(uint8 missionType, uint256 cost) external onlyOwner {
        if (missionType > missionTypes || missionType >= 16) revert InvalidConfig();
        _setMissionCost(missionType, cost);
        if (missionType == missionTypes) missionTypes++;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ------------------------------------------------------------------ internal

    function _requireOwner(uint256 tokenId) internal view {
        if (territory.ownerOf(tokenId) != msg.sender) revert NotTerritoryOwner();
    }

    /// @param source RevenueTreasury source id (1 Upgrade · 2 Shield · 3 Mission)
    function _spend(uint256 amount, uint8 source) internal {
        totalSinkRevenue += amount;
        token.safeTransferFrom(msg.sender, address(treasury), amount);
        treasury.notifyRevenue(source);
    }

    function _setCosts(uint256 upgradeBaseCost_, uint256 shieldUnitCost_) internal {
        if (upgradeBaseCost_ == 0 || shieldUnitCost_ == 0) revert InvalidConfig();
        upgradeBaseCost = upgradeBaseCost_;
        shieldUnitCost = shieldUnitCost_;
        emit CostsUpdated(upgradeBaseCost_, shieldUnitCost_);
    }

    function _setMissionCost(uint8 missionType, uint256 cost) internal {
        if (cost == 0) revert InvalidConfig();
        missionCost[missionType] = cost;
        emit MissionCostUpdated(missionType, cost);
    }
}
