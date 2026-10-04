// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title RewardPool — Merkle distributor for daily leaderboard/lottery rewards and airdrops
/// @notice Holds the player share of game revenue (sent by RevenueTreasury) plus a separate airdrop
///         allocation. The backend publishes one Merkle root per epoch; players claim their own
///         amount with a proof.
///
///         Safety rails (enforced on-chain, not by the backend):
///          - A rewards epoch can never allocate more than `epochBudgetBps` of the currently
///            *unallocated* reward balance, so payouts are always capped by what the pool holds.
///          - The leaderboard / lottery amounts of an epoch must respect `lotteryBps`.
///          - Airdrop epochs draw only from `airdropAvailable`, never from game revenue.
///          - Each (epoch, account) can claim once; unclaimed amounts return to their bucket after
///            `CLAIM_WINDOW`.
///
///         Leaves follow OpenZeppelin's StandardMerkleTree encoding:
///           leaf = keccak256(bytes.concat(keccak256(abi.encode(epochId, account, amount))))
contract RewardPool is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant PUBLISHER_ROLE = keccak256("PUBLISHER_ROLE");

    uint256 public constant BPS = 10_000;
    uint256 public constant CLAIM_WINDOW = 30 days;
    /// @dev Airdrop epoch ids live in their own namespace above every possible day number.
    uint256 public constant AIRDROP_EPOCH_BASE = 1_000_000_000;

    uint16 public constant MIN_EPOCH_BUDGET_BPS = 100; // 1% of unallocated rewards / epoch
    uint16 public constant MAX_EPOCH_BUDGET_BPS = 5_000; // 50%
    uint16 public constant MIN_LOTTERY_BPS = 1_000;
    uint16 public constant MAX_LOTTERY_BPS = 7_000;

    enum Kind {
        None,
        Rewards,
        Airdrop
    }

    struct Epoch {
        bytes32 root;
        Kind kind;
        bool swept;
        uint64 publishedAt;
        uint128 total;
        uint128 claimed;
        uint128 leaderboardTotal;
        uint128 lotteryTotal;
        uint32 recipients;
    }

    IERC20 public immutable token;

    uint16 public epochBudgetBps;
    uint16 public lotteryBps;

    /// @notice PWSI reserved for airdrops and not yet allocated to an airdrop epoch.
    uint256 public airdropAvailable;
    /// @notice Allocated to published epochs but not yet claimed or swept.
    uint256 public outstanding;

    uint256 public totalRewardsAllocated;
    uint256 public totalAirdropAllocated;
    uint256 public totalClaimed;
    uint256 public epochCount;
    uint256 public lastRewardsEpoch;

    mapping(uint256 epochId => Epoch) private _epochs;
    mapping(uint256 epochId => mapping(address account => bool)) public claimed;
    uint256[] private _epochIds;

    event AirdropFunded(address indexed from, uint256 amount);
    event EpochPublished(
        uint256 indexed epochId,
        Kind kind,
        bytes32 root,
        uint256 total,
        uint256 leaderboardTotal,
        uint256 lotteryTotal,
        uint32 recipients,
        string uri
    );
    event Claimed(uint256 indexed epochId, address indexed account, uint256 amount);
    event EpochSwept(uint256 indexed epochId, uint256 returned);
    event ConfigUpdated(uint16 epochBudgetBps, uint16 lotteryBps);

    error InvalidConfig();
    error EpochExists(uint256 epochId);
    error UnknownEpoch(uint256 epochId);
    error BadEpochId(uint256 epochId);
    error OverBudget(uint256 requested, uint256 cap);
    error SplitViolated();
    error AlreadyClaimed(uint256 epochId, address account);
    error InvalidProof();
    error ClaimWindowClosed(uint256 epochId);
    error ClaimWindowOpen(uint256 epochId);
    error AlreadySwept(uint256 epochId);
    error LengthMismatch();

    constructor(IERC20 token_, address admin, uint16 epochBudgetBps_, uint16 lotteryBps_) {
        if (address(token_) == address(0) || admin == address(0)) revert InvalidConfig();
        token = token_;
        _setConfig(epochBudgetBps_, lotteryBps_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PUBLISHER_ROLE, admin);
    }

    // ------------------------------------------------------------------ views

    /// @notice Revenue-funded balance not yet allocated to any epoch.
    function rewardsAvailable() public view returns (uint256) {
        uint256 bal = token.balanceOf(address(this));
        uint256 reserved = airdropAvailable + outstanding;
        return bal > reserved ? bal - reserved : 0;
    }

    /// @notice Maximum a rewards epoch published right now may allocate.
    function epochCap() public view returns (uint256) {
        return (rewardsAvailable() * epochBudgetBps) / BPS;
    }

    /// @notice Split `total` into leaderboard / lottery slices (used with `epochCap()`).
    function splitFor(uint256 total) public view returns (uint256 leaderboard, uint256 lottery) {
        lottery = (total * lotteryBps) / BPS;
        leaderboard = total - lottery;
    }

    function epoch(uint256 epochId) external view returns (Epoch memory) {
        return _epochs[epochId];
    }

    function epochIds(uint256 offset, uint256 limit) external view returns (uint256[] memory ids) {
        uint256 n = _epochIds.length;
        if (offset >= n) return new uint256[](0);
        uint256 end = offset + limit > n ? n : offset + limit;
        ids = new uint256[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            ids[i - offset] = _epochIds[i];
        }
    }

    function leaf(uint256 epochId, address account, uint256 amount) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(epochId, account, amount))));
    }

    function canClaim(uint256 epochId, address account, uint256 amount, bytes32[] calldata proof)
        external
        view
        returns (bool)
    {
        Epoch storage e = _epochs[epochId];
        if (e.kind == Kind.None || e.swept || claimed[epochId][account]) return false;
        if (block.timestamp > uint256(e.publishedAt) + CLAIM_WINDOW) return false;
        return MerkleProof.verifyCalldata(proof, e.root, leaf(epochId, account, amount));
    }

    // ------------------------------------------------------------------ funding

    /// @notice Add PWSI to the airdrop allocation (kept separate from revenue-funded rewards).
    function fundAirdrop(uint256 amount) external nonReentrant {
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - before; // fee-on-transfer safe
        airdropAvailable += received;
        emit AirdropFunded(msg.sender, received);
    }

    // ------------------------------------------------------------------ publishing

    /// @notice Publish the daily rewards epoch (leaderboard + lottery) for UTC day `epochId`.
    function publishRewards(
        uint256 epochId,
        bytes32 root,
        uint256 leaderboardTotal,
        uint256 lotteryTotal,
        uint32 recipients,
        string calldata uri
    ) external onlyRole(PUBLISHER_ROLE) {
        if (epochId == 0 || epochId >= AIRDROP_EPOCH_BASE || epochId > block.timestamp / 1 days) {
            revert BadEpochId(epochId);
        }
        uint256 total = leaderboardTotal + lotteryTotal;
        uint256 cap = epochCap();
        if (total > cap) revert OverBudget(total, cap);
        // Each slice is capped by its share of the epoch budget; an unused slice stays in the pool.
        (uint256 lbCap, uint256 lotCap) = splitFor(cap);
        if (lotteryTotal > lotCap || leaderboardTotal > lbCap) revert SplitViolated();
        _publish(epochId, Kind.Rewards, root, total, leaderboardTotal, lotteryTotal, recipients, uri);
        totalRewardsAllocated += total;
        if (epochId > lastRewardsEpoch) lastRewardsEpoch = epochId;
    }

    /// @notice Publish an airdrop epoch funded from `airdropAvailable`.
    function publishAirdrop(
        uint256 epochId,
        bytes32 root,
        uint256 total,
        uint32 recipients,
        string calldata uri
    ) external onlyRole(PUBLISHER_ROLE) {
        if (epochId < AIRDROP_EPOCH_BASE) revert BadEpochId(epochId);
        if (total > airdropAvailable) revert OverBudget(total, airdropAvailable);
        airdropAvailable -= total;
        _publish(epochId, Kind.Airdrop, root, total, 0, 0, recipients, uri);
        totalAirdropAllocated += total;
    }

    function _publish(
        uint256 epochId,
        Kind kind,
        bytes32 root,
        uint256 total,
        uint256 lb,
        uint256 lot,
        uint32 recipients,
        string calldata uri
    ) internal {
        if (_epochs[epochId].kind != Kind.None) revert EpochExists(epochId);
        if (root == bytes32(0) || total == 0) revert InvalidConfig();
        _epochs[epochId] = Epoch({
            root: root,
            kind: kind,
            swept: false,
            publishedAt: uint64(block.timestamp),
            total: uint128(total),
            claimed: 0,
            leaderboardTotal: uint128(lb),
            lotteryTotal: uint128(lot),
            recipients: recipients
        });
        _epochIds.push(epochId);
        unchecked {
            ++epochCount;
        }
        outstanding += total;
        emit EpochPublished(epochId, kind, root, total, lb, lot, recipients, uri);
    }

    // ------------------------------------------------------------------ claiming

    /// @notice Claim `amount` for `account` in `epochId`. Anyone may submit; tokens go to `account`.
    function claim(uint256 epochId, address account, uint256 amount, bytes32[] calldata proof)
        public
        nonReentrant
    {
        _claim(epochId, account, amount, proof);
    }

    function claimMany(
        uint256[] calldata epochIds_,
        address account,
        uint256[] calldata amounts,
        bytes32[][] calldata proofs
    ) external nonReentrant {
        uint256 n = epochIds_.length;
        if (n != amounts.length || n != proofs.length) revert LengthMismatch();
        for (uint256 i; i < n; ++i) {
            _claim(epochIds_[i], account, amounts[i], proofs[i]);
        }
    }

    function _claim(uint256 epochId, address account, uint256 amount, bytes32[] calldata proof) internal {
        Epoch storage e = _epochs[epochId];
        if (e.kind == Kind.None) revert UnknownEpoch(epochId);
        if (e.swept || block.timestamp > uint256(e.publishedAt) + CLAIM_WINDOW) {
            revert ClaimWindowClosed(epochId);
        }
        if (claimed[epochId][account]) revert AlreadyClaimed(epochId, account);
        if (!MerkleProof.verifyCalldata(proof, e.root, leaf(epochId, account, amount))) {
            revert InvalidProof();
        }
        // A root can never pay out more than it allocated (defends against a malformed tree).
        if (uint256(e.claimed) + amount > e.total) revert OverBudget(uint256(e.claimed) + amount, e.total);

        claimed[epochId][account] = true;
        e.claimed += uint128(amount);
        outstanding -= amount;
        totalClaimed += amount;
        // forge-lint: disable-next-line(reentrancy-events) -- only a view call precedes; nonReentrant
        emit Claimed(epochId, account, amount);
        token.safeTransfer(account, amount);
    }

    /// @notice After the claim window, return an epoch's unclaimed amount to its bucket.
    function sweep(uint256 epochId) external nonReentrant returns (uint256 returned) {
        Epoch storage e = _epochs[epochId];
        if (e.kind == Kind.None) revert UnknownEpoch(epochId);
        if (e.swept) revert AlreadySwept(epochId);
        if (block.timestamp <= uint256(e.publishedAt) + CLAIM_WINDOW) revert ClaimWindowOpen(epochId);
        e.swept = true;
        returned = uint256(e.total) - e.claimed;
        outstanding -= returned;
        if (e.kind == Kind.Airdrop) airdropAvailable += returned; // rewards flow back automatically
        emit EpochSwept(epochId, returned);
    }

    // ------------------------------------------------------------------ admin

    function setConfig(uint16 epochBudgetBps_, uint16 lotteryBps_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setConfig(epochBudgetBps_, lotteryBps_);
    }

    function _setConfig(uint16 budget, uint16 lottery) internal {
        if (budget < MIN_EPOCH_BUDGET_BPS || budget > MAX_EPOCH_BUDGET_BPS) revert InvalidConfig();
        if (lottery < MIN_LOTTERY_BPS || lottery > MAX_LOTTERY_BPS) revert InvalidConfig();
        epochBudgetBps = budget;
        lotteryBps = lottery;
        emit ConfigUpdated(budget, lottery);
    }
}
