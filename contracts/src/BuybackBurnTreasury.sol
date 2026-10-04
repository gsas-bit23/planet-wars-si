// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPWSIToken} from "./interfaces/IPWSIToken.sol";
import {ISwapRouterV2Like} from "./interfaces/ISwapRouterV2Like.sol";

/// @title BuybackBurnTreasury
/// @notice Receives the marketplace fee and destroys it.
///         Two paths, both permanent and verifiable on-chain:
///          1. `burnAccrued()`  — any PWSI held by the treasury (trade fees) is burned directly.
///             Permissionless, called automatically by the marketplace after every trade.
///          2. `buybackAndBurn()` — ETH held by the treasury is swapped for PWSI on a DEX
///             (Uniswap-V2 style router) and the proceeds are burned. Requires a router and
///             a liquidity pool; disabled until `setRouter` is called (not used on testnet).
contract BuybackBurnTreasury is AccessControl, ReentrancyGuard {
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    IPWSIToken public immutable token;
    ISwapRouterV2Like public router;

    uint256 public totalFeesBurned;
    uint256 public totalBuybackBurned;
    uint256 public totalEthSpent;

    event FeesBurned(address indexed caller, uint256 amount);
    event BuybackBurned(address indexed keeper, uint256 ethIn, uint256 tokensBurned);
    event RouterUpdated(address indexed router);
    event EthReceived(address indexed from, uint256 amount);

    error RouterNotSet();
    error InsufficientEth(uint256 requested, uint256 available);
    error NothingBought();

    constructor(IPWSIToken token_, address admin) {
        token = token_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(KEEPER_ROLE, admin);
    }

    receive() external payable {
        emit EthReceived(msg.sender, msg.value);
    }

    /// @notice Burn every PWSI the treasury currently holds.
    function burnAccrued() external nonReentrant returns (uint256 amount) {
        amount = token.balanceOf(address(this));
        if (amount == 0) return 0;
        totalFeesBurned += amount;
        emit FeesBurned(msg.sender, amount);
        token.burn(amount);
    }

    /// @notice Swap `ethAmount` of treasury ETH for PWSI via the configured router and burn it.
    /// @param ethAmount  ETH to spend from the treasury balance.
    /// @param minOut     Slippage guard: minimum PWSI that must be received.
    /// @param deadline   Router deadline.
    function buybackAndBurn(uint256 ethAmount, uint256 minOut, uint256 deadline)
        external
        nonReentrant
        onlyRole(KEEPER_ROLE)
        returns (uint256 burned)
    {
        ISwapRouterV2Like r = router;
        if (address(r) == address(0)) revert RouterNotSet();
        if (ethAmount > address(this).balance) revert InsufficientEth(ethAmount, address(this).balance);

        address[] memory path = new address[](2);
        path[0] = r.WETH();
        path[1] = address(token);

        uint256 before = token.balanceOf(address(this));
        r.swapExactETHForTokens{value: ethAmount}(minOut, path, address(this), deadline);
        burned = token.balanceOf(address(this)) - before;
        if (burned == 0) revert NothingBought();

        totalEthSpent += ethAmount;
        totalBuybackBurned += burned;
        token.burn(burned);
        // forge-lint: disable-next-line(reentrancy-events)
        emit BuybackBurned(msg.sender, ethAmount, burned);
    }

    function setRouter(ISwapRouterV2Like router_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        router = router_;
        emit RouterUpdated(address(router_));
    }

    /// @notice Total PWSI destroyed through the treasury (fees + buybacks).
    function totalBurned() external view returns (uint256) {
        return totalFeesBurned + totalBuybackBurned;
    }
}
