// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IArbSys {
    function arbBlockNumber() external view returns (uint256);
    function arbBlockHash(uint256 blockNumber) external view returns (bytes32);
}

/// @title DailyDraw — commit-reveal randomness for the free daily lottery
/// @notice There is no official Chainlink VRF on Robinhood Chain, so each daily round uses:
///           1. commit  — before the round (UTC day) starts, the operator commits keccak256(seed).
///           2. close   — after the day ends, the operator fixes the entrant list (Merkle root of
///                        eligible wallets, in index order + count). A future L2 block is chosen
///                        as the target: current L2 block + REVEAL_DELAY.
///           3. reveal  — after the target block, the operator reveals `seed`. Randomness is
///                        keccak256(seed, blockhash(target), round, entrantsRoot).
///         Neither input alone decides the outcome: the seed is fixed before the entrant list
///         and before the target block exists; the block hash is unknown when the seed and the
///         entrant list are fixed. Winners are a deterministic partial Fisher-Yates shuffle of
///         the entrant indices (`drawIndices`), reproducible by anyone.
///
///         Honest limitations: the operator could refuse to reveal (the round is then voided and
///         cannot be redrawn — its lottery budget stays in the pool), and the L2 block hash is
///         produced by the chain's single sequencer. See README "Lottery randomness".
/// @dev On Arbitrum-based chains `block.number`/`blockhash` refer to L1; the ArbSys precompile
///      (0x64) is used when present. Block hashes are only available for the last 256 blocks.
contract DailyDraw is AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    IArbSys internal constant ARB_SYS = IArbSys(address(0x64));

    uint256 public constant REVEAL_DELAY = 10; // L2 blocks between close and the target block
    uint256 public constant HASH_WINDOW = 256;
    uint256 public constant MAX_WINNERS = 100;

    enum Status {
        None,
        Committed,
        Closed,
        Revealed,
        Voided
    }

    struct Round {
        Status status;
        bytes32 seedHash;
        bytes32 entrantsRoot;
        uint32 entrantCount;
        uint64 targetBlock;
        bytes32 targetBlockHash;
        bytes32 seed;
        bytes32 randomness;
    }

    bool public immutable useArbSys;
    mapping(uint256 round => Round) private _rounds;

    event Committed(uint256 indexed round, bytes32 seedHash);
    event Closed(uint256 indexed round, bytes32 entrantsRoot, uint32 entrantCount, uint64 targetBlock);
    event Revealed(uint256 indexed round, bytes32 seed, bytes32 targetBlockHash, bytes32 randomness);
    event Voided(uint256 indexed round);

    error BadStatus(uint256 round, Status status);
    error TooLate(uint256 round);
    error TooEarly(uint256 round);
    error BadSeed();
    error HashUnavailable(uint256 targetBlock);
    error InvalidArgs();

    constructor(address admin, address operator) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);
        useArbSys = address(ARB_SYS).code.length > 0;
    }

    // ------------------------------------------------------------------ lifecycle

    /// @notice Commit to the seed of a future round (round = UTC day number).
    function commit(uint256 round, bytes32 seedHash) external onlyRole(OPERATOR_ROLE) {
        if (seedHash == bytes32(0)) revert InvalidArgs();
        if (block.timestamp >= round * 1 days) revert TooLate(round);
        Round storage r = _rounds[round];
        if (r.status != Status.None) revert BadStatus(round, r.status);
        r.status = Status.Committed;
        r.seedHash = seedHash;
        emit Committed(round, seedHash);
    }

    /// @notice Fix the entrant list once the round's day has ended and pick the target block.
    function close(uint256 round, bytes32 entrantsRoot, uint32 entrantCount)
        external
        onlyRole(OPERATOR_ROLE)
    {
        Round storage r = _rounds[round];
        if (r.status != Status.Committed) revert BadStatus(round, r.status);
        if (block.timestamp < (round + 1) * 1 days) revert TooEarly(round);
        r.status = Status.Closed;
        r.entrantsRoot = entrantsRoot;
        r.entrantCount = entrantCount;
        r.targetBlock = uint64(_blockNumber() + REVEAL_DELAY);
        emit Closed(round, entrantsRoot, entrantCount, r.targetBlock);
    }

    /// @notice Reveal the committed seed after the target block (within the 256-block hash window).
    function reveal(uint256 round, bytes32 seed)
        external
        onlyRole(OPERATOR_ROLE)
        returns (bytes32 randomness)
    {
        Round storage r = _rounds[round];
        if (r.status != Status.Closed) revert BadStatus(round, r.status);
        if (keccak256(abi.encode(seed)) != r.seedHash) revert BadSeed();
        uint256 target = r.targetBlock;
        uint256 current = _blockNumber();
        if (current <= target) revert TooEarly(round);
        if (current - target > HASH_WINDOW) revert HashUnavailable(target);
        bytes32 h = _blockHash(target);
        if (h == bytes32(0)) revert HashUnavailable(target);
        randomness = keccak256(abi.encode(seed, h, round, r.entrantsRoot));
        r.status = Status.Revealed;
        r.seed = seed;
        r.targetBlockHash = h;
        r.randomness = randomness;
        emit Revealed(round, seed, h, randomness);
    }

    /// @notice Anyone can void a closed round whose reveal window has passed. Voided rounds can never
    ///         be redrawn, so withholding a reveal cannot be used to re-roll.
    function voidRound(uint256 round) external {
        Round storage r = _rounds[round];
        if (r.status != Status.Closed) revert BadStatus(round, r.status);
        if (_blockNumber() <= uint256(r.targetBlock) + HASH_WINDOW) revert TooEarly(round);
        r.status = Status.Voided;
        emit Voided(round);
    }

    // ------------------------------------------------------------------ views

    function roundInfo(uint256 round) external view returns (Round memory) {
        return _rounds[round];
    }

    function currentBlock() external view returns (uint256) {
        return _blockNumber();
    }

    /// @notice Winner indices for a revealed round (partial Fisher-Yates, no duplicates).
    function winners(uint256 round) external view returns (uint256[] memory) {
        Round storage r = _rounds[round];
        if (r.status != Status.Revealed) revert BadStatus(round, r.status);
        uint256 k = r.entrantCount < MAX_WINNERS ? r.entrantCount : MAX_WINNERS;
        return drawIndices(r.randomness, r.entrantCount, k);
    }

    /// @notice Deterministic selection of `k` distinct indices out of `n` from `randomness`.
    ///         Partial Fisher-Yates over the virtual array [0, n): step i swaps position i with
    ///         j = i + keccak256(abi.encode(randomness, i)) % (n - i) and outputs position i.
    ///         Only touched positions are tracked, so cost is O(k^2) regardless of n.
    function drawIndices(bytes32 randomness, uint256 n, uint256 k)
        public
        pure
        returns (uint256[] memory out)
    {
        if (k > n) k = n;
        out = new uint256[](k);
        // Sparse overrides: position keys[t] currently holds vals[t].
        uint256[] memory keys = new uint256[](k);
        uint256[] memory vals = new uint256[](k);
        uint256 used;
        for (uint256 i; i < k; ++i) {
            uint256 j = i + (uint256(keccak256(abi.encode(randomness, i))) % (n - i));
            uint256 vi = i;
            uint256 vj = j;
            uint256 slotJ = type(uint256).max;
            for (uint256 t; t < used; ++t) {
                if (keys[t] == i) vi = vals[t];
                if (keys[t] == j) {
                    vj = vals[t];
                    slotJ = t;
                }
            }
            out[i] = vj;
            // Position i is never read again (later steps only touch positions > i), so only
            // position j needs to remember that it now holds the old value of position i.
            if (j != i) {
                if (slotJ == type(uint256).max) {
                    keys[used] = j;
                    vals[used] = vi;
                    ++used;
                } else {
                    vals[slotJ] = vi;
                }
            }
        }
    }

    // ------------------------------------------------------------------ internal

    function _blockNumber() internal view returns (uint256) {
        return useArbSys ? ARB_SYS.arbBlockNumber() : block.number;
    }

    function _blockHash(uint256 n) internal view returns (bytes32) {
        return useArbSys ? ARB_SYS.arbBlockHash(n) : blockhash(n);
    }
}
