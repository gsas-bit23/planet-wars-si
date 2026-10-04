// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Minimal commutative-hash Merkle tree (same hashing as OZ MerkleProof / StandardMerkleTree).
library Merkle {
    function hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    function root(bytes32[] memory leaves) internal pure returns (bytes32) {
        bytes32[] memory level = leaves;
        while (level.length > 1) level = _next(level);
        return level[0];
    }

    function proof(bytes32[] memory leaves, uint256 index) internal pure returns (bytes32[] memory out) {
        bytes32[] memory tmp = new bytes32[](64);
        uint256 n;
        bytes32[] memory level = leaves;
        while (level.length > 1) {
            uint256 sib = index ^ 1;
            if (sib < level.length) tmp[n++] = level[sib];
            level = _next(level);
            index /= 2;
        }
        out = new bytes32[](n);
        for (uint256 i; i < n; ++i) {
            out[i] = tmp[i];
        }
    }

    function _next(bytes32[] memory level) private pure returns (bytes32[] memory up) {
        up = new bytes32[]((level.length + 1) / 2);
        for (uint256 i; i < up.length; ++i) {
            uint256 l = 2 * i;
            up[i] = l + 1 < level.length ? hashPair(level[l], level[l + 1]) : level[l];
        }
    }
}
