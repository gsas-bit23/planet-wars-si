// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IPWSIToken} from "./interfaces/IPWSIToken.sol";

/// @title PWSIFaucet — testnet drip for free $PWSI
/// @notice Each wallet can claim `dripAmount` once every `cooldown` seconds.
/// @dev Testnet only. A mainnet deployment would not grant this contract MINTER_ROLE.
contract PWSIFaucet is Ownable2Step, Pausable {
    IPWSIToken public immutable token;

    uint256 public dripAmount;
    uint256 public cooldown;
    uint256 public totalDripped;
    uint256 public claimCount;

    mapping(address account => uint256 timestamp) public lastClaimAt;

    uint256 public constant MAX_DRIP = 100_000 ether;
    uint256 public constant MIN_COOLDOWN = 1 minutes;

    event Claimed(address indexed account, uint256 amount, uint256 nextClaimAt);
    event FaucetConfigured(uint256 dripAmount, uint256 cooldown);

    error CooldownActive(uint256 nextClaimAt);
    error InvalidConfig();

    constructor(IPWSIToken token_, address owner_, uint256 dripAmount_, uint256 cooldown_) Ownable(owner_) {
        token = token_;
        _configure(dripAmount_, cooldown_);
    }

    /// @notice Claim free test tokens. Reverts while the caller's cooldown is active.
    function claim() external whenNotPaused {
        uint256 next = nextClaimAt(msg.sender);
        if (block.timestamp < next) revert CooldownActive(next);

        lastClaimAt[msg.sender] = block.timestamp;
        totalDripped += dripAmount;
        unchecked {
            ++claimCount;
        }
        emit Claimed(msg.sender, dripAmount, block.timestamp + cooldown);
        token.mint(msg.sender, dripAmount);
    }

    /// @notice Timestamp from which `account` may claim again (0 if never claimed).
    function nextClaimAt(address account) public view returns (uint256) {
        uint256 last = lastClaimAt[account];
        return last == 0 ? 0 : last + cooldown;
    }

    function configure(uint256 dripAmount_, uint256 cooldown_) external onlyOwner {
        _configure(dripAmount_, cooldown_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _configure(uint256 dripAmount_, uint256 cooldown_) internal {
        if (dripAmount_ == 0 || dripAmount_ > MAX_DRIP || cooldown_ < MIN_COOLDOWN) revert InvalidConfig();
        dripAmount = dripAmount_;
        cooldown = cooldown_;
        emit FaucetConfigured(dripAmount_, cooldown_);
    }
}
