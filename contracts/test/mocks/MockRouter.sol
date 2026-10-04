// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISwapRouterV2Like} from "../../src/interfaces/ISwapRouterV2Like.sol";
import {PWSIToken} from "../../src/PWSIToken.sol";

/// @dev Fake V2 router: "sells" PWSI at a fixed rate by minting it (needs MINTER_ROLE).
contract MockRouter is ISwapRouterV2Like {
    PWSIToken public immutable token;
    address public immutable override WETH = address(0xBEEF);
    uint256 public rate; // PWSI per 1 ETH (18 decimals each)

    constructor(PWSIToken token_, uint256 rate_) {
        token = token_;
        rate = rate_;
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable override returns (uint256[] memory amounts) {
        require(block.timestamp <= deadline, "expired");
        require(path.length == 2 && path[0] == WETH && path[1] == address(token), "path");
        uint256 out = (msg.value * rate) / 1 ether;
        require(out >= amountOutMin, "slippage");
        token.mint(to, out);
        amounts = new uint256[](2);
        amounts[0] = msg.value;
        amounts[1] = out;
    }
}
