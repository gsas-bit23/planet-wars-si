// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Burnable} from "./interfaces/IERC20Burnable.sol";
import {IRevenueTreasury} from "./interfaces/IRevenueTreasury.sol";
import {ISwapRouterV2Like} from "./interfaces/ISwapRouterV2Like.sol";

/// @title RevenueTreasury — splits all game revenue between burn and the RewardPool
/// @notice Every PWSI the game earns (plot claims, upgrades, shields, missions, the marketplace fee,
///         royalties, buybacks) lands here and is split in the same transaction:
///           burnBps        → burned (default 10%)
///           BPS - burnBps  → RewardPool (default 90%), paid back to players via daily Merkle epochs.
///         The split is bounded to [MIN_BURN_BPS, MAX_BURN_BPS] and changes are timelocked.
/// @dev The treasury never holds PWSI between transactions: every inflow is processed immediately.
///      ETH (e.g. ERC-2981 royalties paid in ETH on external marketplaces) can be swapped into PWSI
///      through a Uniswap-V2-style router with `buybackAndSplit`, then follows the same split.
///      Works with any standard ERC-20 (e.g. a token launched on an external launchpad): burning is
///      either `burn()` (BurnMode.BurnFunction, reduces totalSupply) or a transfer to the dead
///      address 0x…dEaD (BurnMode.DeadAddress) for tokens without a burn function. Burned amounts
///      are tracked here, independent of the token's own counters.
contract RevenueTreasury is IRevenueTreasury, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant REVENUE_ROLE = keccak256("REVENUE_ROLE");
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    uint256 public constant BPS = 10_000;
    uint16 public constant MIN_BURN_BPS = 500; // never burn less than 5%
    uint16 public constant MAX_BURN_BPS = 5_000; // never burn more than 50%
    uint256 public constant SPLIT_TIMELOCK = 2 days;

    uint8 public constant SOURCE_CLAIM = 0;
    uint8 public constant SOURCE_UPGRADE = 1;
    uint8 public constant SOURCE_SHIELD = 2;
    uint8 public constant SOURCE_MISSION = 3;
    uint8 public constant SOURCE_MARKET_FEE = 4;
    uint8 public constant SOURCE_ROYALTY = 5;
    uint8 public constant SOURCE_BUYBACK = 6;
    uint8 public constant SOURCE_OTHER = 7;
    uint8 public constant SOURCE_COUNT = 8;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    enum BurnMode {
        BurnFunction,
        DeadAddress
    }

    IERC20 public immutable token;
    address public immutable rewardPool;
    BurnMode public immutable burnMode;
    ISwapRouterV2Like public router;

    uint16 public burnBps;
    uint16 public pendingBurnBps;
    uint64 public pendingBurnBpsEta;

    uint256 public totalRevenue;
    uint256 public totalBurned;
    uint256 public totalPooled;
    uint256 public totalEthSpent;
    mapping(uint8 source => uint256) public revenueBySource;

    event RevenueProcessed(
        uint8 indexed source, address indexed from, uint256 amount, uint256 burned, uint256 pooled
    );
    event BurnSplitQueued(uint16 burnBps, uint64 eta);
    event BurnSplitApplied(uint16 oldBurnBps, uint16 newBurnBps);
    event BurnSplitCancelled(uint16 burnBps);
    event BuybackExecuted(address indexed keeper, uint256 ethIn, uint256 tokensOut);
    event RouterUpdated(address indexed router);
    event EthReceived(address indexed from, uint256 amount);

    error InvalidSplit(uint16 burnBps);
    error InvalidSource(uint8 source);
    error NoPendingSplit();
    error TimelockActive(uint64 eta);
    error RouterNotSet();
    error InsufficientEth(uint256 requested, uint256 available);
    error NothingBought();
    error ZeroAddress();

    constructor(IERC20 token_, address rewardPool_, address admin, uint16 burnBps_, BurnMode burnMode_) {
        if (address(token_) == address(0) || rewardPool_ == address(0) || admin == address(0)) {
            revert ZeroAddress();
        }
        if (burnBps_ < MIN_BURN_BPS || burnBps_ > MAX_BURN_BPS) revert InvalidSplit(burnBps_);
        token = token_;
        rewardPool = rewardPool_;
        burnBps = burnBps_;
        burnMode = burnMode_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(KEEPER_ROLE, admin);
    }

    receive() external payable {
        emit EthReceived(msg.sender, msg.value);
    }

    // ------------------------------------------------------------------ revenue

    /// @notice Called by game contracts right after transferring revenue in.
    function notifyRevenue(uint8 source)
        external
        nonReentrant
        onlyRole(REVENUE_ROLE)
        returns (uint256 burned, uint256 pooled)
    {
        if (source >= SOURCE_COUNT) revert InvalidSource(source);
        return _process(source);
    }

    /// @notice Permissionless: split any PWSI sitting in the treasury (e.g. royalties paid in PWSI
    ///         by an external marketplace, or direct donations).
    function process() external nonReentrant returns (uint256 burned, uint256 pooled) {
        return _process(SOURCE_OTHER);
    }

    /// @notice Swap treasury ETH (royalties) into PWSI via the router, then apply the split.
    function buybackAndSplit(uint256 ethAmount, uint256 minOut, uint256 deadline)
        external
        nonReentrant
        onlyRole(KEEPER_ROLE)
        returns (uint256 bought)
    {
        ISwapRouterV2Like r = router;
        if (address(r) == address(0)) revert RouterNotSet();
        if (ethAmount > address(this).balance) revert InsufficientEth(ethAmount, address(this).balance);
        address[] memory path = new address[](2);
        path[0] = r.WETH();
        path[1] = address(token);
        uint256 before = token.balanceOf(address(this));
        r.swapExactETHForTokens{value: ethAmount}(minOut, path, address(this), deadline);
        bought = token.balanceOf(address(this)) - before;
        if (bought == 0) revert NothingBought();
        totalEthSpent += ethAmount;
        // forge-lint: disable-next-line(reentrancy-events)
        emit BuybackExecuted(msg.sender, ethAmount, bought);
        _process(SOURCE_BUYBACK);
    }

    function _process(uint8 source) internal returns (uint256 burned, uint256 pooled) {
        uint256 amount = token.balanceOf(address(this));
        if (amount == 0) return (0, 0);
        burned = (amount * burnBps) / BPS;
        pooled = amount - burned;
        totalRevenue += amount;
        totalBurned += burned;
        totalPooled += pooled;
        revenueBySource[source] += amount;
        // forge-lint: disable-next-line(reentrancy-events) -- only a view call precedes; nonReentrant
        emit RevenueProcessed(source, msg.sender, amount, burned, pooled);
        if (burned > 0) _burn(burned);
        if (pooled > 0) token.safeTransfer(rewardPool, pooled);
    }

    function _burn(uint256 amount) internal {
        if (burnMode == BurnMode.BurnFunction) IERC20Burnable(address(token)).burn(amount);
        else token.safeTransfer(DEAD, amount);
    }

    // ------------------------------------------------------------------ views

    function poolBps() external view returns (uint16) {
        return uint16(BPS - burnBps);
    }

    /// @notice Preview the split for an amount at the current ratio.
    function previewSplit(uint256 amount) external view returns (uint256 burned, uint256 pooled) {
        burned = (amount * burnBps) / BPS;
        pooled = amount - burned;
    }

    function revenueBreakdown() external view returns (uint256[] memory out) {
        out = new uint256[](SOURCE_COUNT);
        for (uint8 i; i < SOURCE_COUNT; ++i) {
            out[i] = revenueBySource[i];
        }
    }

    // ------------------------------------------------------------------ admin (timelocked split)

    function queueBurnBps(uint16 newBurnBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newBurnBps < MIN_BURN_BPS || newBurnBps > MAX_BURN_BPS) revert InvalidSplit(newBurnBps);
        uint64 eta = uint64(block.timestamp + SPLIT_TIMELOCK);
        pendingBurnBps = newBurnBps;
        pendingBurnBpsEta = eta;
        emit BurnSplitQueued(newBurnBps, eta);
    }

    function applyBurnBps() external {
        uint64 eta = pendingBurnBpsEta;
        if (eta == 0) revert NoPendingSplit();
        if (block.timestamp < eta) revert TimelockActive(eta);
        uint16 old = burnBps;
        burnBps = pendingBurnBps;
        pendingBurnBps = 0;
        pendingBurnBpsEta = 0;
        emit BurnSplitApplied(old, burnBps);
    }

    function cancelBurnBps() external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (pendingBurnBpsEta == 0) revert NoPendingSplit();
        emit BurnSplitCancelled(pendingBurnBps);
        pendingBurnBps = 0;
        pendingBurnBpsEta = 0;
    }

    function setRouter(ISwapRouterV2Like router_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        router = router_;
        emit RouterUpdated(address(router_));
    }
}
