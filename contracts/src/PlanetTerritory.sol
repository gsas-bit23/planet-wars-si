// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IPWSIToken} from "./interfaces/IPWSIToken.sol";

/// @title PlanetTerritory — ERC-721 territory plots across the solar system
/// @notice Each celestial body is divided into a grid of plots. Plots are claimed from the SI
///         with $PWSI. Grids are split into 5x5 sectors; every sector has a deterministic zone
///         (Common, Rare, Legendary) which multiplies the plot's claim price.
/// @dev tokenId = bodyId * PLOT_SPACE + plotIndex. New bodies (moons, dwarf planets) can be
///      appended at any time with `addBody` without touching existing plots.
contract PlanetTerritory is ERC721Enumerable, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IPWSIToken;
    using Strings for uint256;

    struct Body {
        string name;
        uint32 supply; // number of plots
        uint32 cols; // grid width
        uint32 claimed; // plots claimed so far
        bool active; // primary claims open
        uint128 basePrice; // PWSI (wei) for a Common plot
    }

    enum Zone {
        Common,
        Rare,
        Legendary
    }

    uint256 public constant PLOT_SPACE = 1_000_000;
    uint256 public constant SECTOR = 5;
    uint256 public constant MAX_BATCH = 25;
    uint256 public constant BPS = 10_000;
    /// @dev Zone price multipliers in basis points.
    uint256 public constant RARE_MULT_BPS = 25_000; // 2.5x
    uint256 public constant LEGENDARY_MULT_BPS = 100_000; // 10x

    IPWSIToken public immutable token;
    bytes32 public immutable zoneSalt;

    /// @notice Recipient of the non-burned share of primary claims (player rewards / ops).
    address public resistanceFund;
    /// @notice Share of every primary claim that is burned, in bps.
    uint16 public primaryBurnBps;

    uint256 public bodyCount;
    mapping(uint256 bodyId => Body) private _bodies;
    mapping(uint256 bodyId => mapping(uint256 word => uint256 bits)) private _claimedBits;

    string private _baseTokenURI;

    uint256 public totalPrimaryVolume;
    uint256 public totalPrimaryBurned;

    event BodyAdded(uint256 indexed bodyId, string name, uint32 supply, uint32 cols, uint128 basePrice);
    event BodyUpdated(uint256 indexed bodyId, bool active, uint128 basePrice);
    event PlotClaimed(
        address indexed player, uint256 indexed bodyId, uint256 indexed tokenId, Zone zone, uint256 price
    );
    event PrimarySplit(uint256 burned, uint256 toFund);
    event PrimaryConfigUpdated(address resistanceFund, uint16 primaryBurnBps);
    event BaseURIUpdated(string baseURI);

    error UnknownBody(uint256 bodyId);
    error BodyInactive(uint256 bodyId);
    error PlotOutOfRange(uint256 bodyId, uint256 plotIndex);
    error PlotTaken(uint256 tokenId);
    error InvalidConfig();
    error BatchTooLarge();

    constructor(
        IPWSIToken token_,
        address owner_,
        address resistanceFund_,
        uint16 primaryBurnBps_,
        string memory baseURI_
    ) ERC721("Planet Wars SI Territory", "PWSI-T") Ownable(owner_) {
        token = token_;
        zoneSalt = keccak256(abi.encode(block.chainid, address(this), "PWSI_ZONES_V1"));
        _setPrimaryConfig(resistanceFund_, primaryBurnBps_);
        _baseTokenURI = baseURI_;
    }

    // ------------------------------------------------------------------ claims

    /// @notice Claim a single unclaimed plot. Caller must have approved `priceOf` PWSI.
    function claim(uint256 bodyId, uint256 plotIndex) external nonReentrant returns (uint256 tokenId) {
        uint256 price;
        (tokenId, price) = _claim(bodyId, plotIndex);
        _collect(price);
    }

    /// @notice Claim several plots on the same body in one transaction.
    function claimBatch(uint256 bodyId, uint256[] calldata plotIndexes)
        external
        nonReentrant
        returns (uint256[] memory tokenIds)
    {
        uint256 n = plotIndexes.length;
        if (n == 0 || n > MAX_BATCH) revert BatchTooLarge();
        tokenIds = new uint256[](n);
        uint256 total;
        for (uint256 i; i < n; ++i) {
            (uint256 id, uint256 price) = _claim(bodyId, plotIndexes[i]);
            tokenIds[i] = id;
            total += price;
        }
        _collect(total);
    }

    function _claim(uint256 bodyId, uint256 plotIndex) internal returns (uint256 tokenId, uint256 price) {
        Body storage b = _body(bodyId);
        if (!b.active) revert BodyInactive(bodyId);
        if (plotIndex >= b.supply) revert PlotOutOfRange(bodyId, plotIndex);

        uint256 word = plotIndex >> 8;
        uint256 mask = 1 << (plotIndex & 0xff);
        tokenId = bodyId * PLOT_SPACE + plotIndex;
        if (_claimedBits[bodyId][word] & mask != 0) revert PlotTaken(tokenId);
        _claimedBits[bodyId][word] |= mask;
        unchecked {
            ++b.claimed;
        }

        Zone zone = zoneOf(bodyId, plotIndex);
        price = _priceFor(b.basePrice, zone);
        _mint(msg.sender, tokenId);
        emit PlotClaimed(msg.sender, bodyId, tokenId, zone, price);
    }

    /// @dev Pull payment, burn the configured share, forward the remainder to the fund.
    function _collect(uint256 amount) internal {
        uint256 burned = (amount * primaryBurnBps) / BPS;
        uint256 toFund = amount - burned;
        totalPrimaryVolume += amount;
        totalPrimaryBurned += burned;
        emit PrimarySplit(burned, toFund);
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (burned > 0) token.burn(burned);
        if (toFund > 0) token.safeTransfer(resistanceFund, toFund);
    }

    // ------------------------------------------------------------------ views

    function body(uint256 bodyId) external view returns (Body memory) {
        return _body(bodyId);
    }

    /// @notice All bodies in id order (ids are 1..bodyCount).
    function bodies() external view returns (Body[] memory list) {
        list = new Body[](bodyCount);
        for (uint256 i; i < bodyCount; ++i) {
            list[i] = _bodies[i + 1];
        }
    }

    /// @notice Bitmap of claimed plots for a body; bit i of word w = plot (w*256 + i).
    function claimedBitmap(uint256 bodyId) external view returns (uint256[] memory words) {
        Body storage b = _body(bodyId);
        uint256 n = (uint256(b.supply) + 255) >> 8;
        words = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            words[i] = _claimedBits[bodyId][i];
        }
    }

    function isClaimed(uint256 bodyId, uint256 plotIndex) public view returns (bool) {
        return _claimedBits[bodyId][plotIndex >> 8] & (1 << (plotIndex & 0xff)) != 0;
    }

    /// @notice Deterministic zone for a plot, derived from its 5x5 sector.
    function zoneOf(uint256 bodyId, uint256 plotIndex) public view returns (Zone) {
        Body storage b = _body(bodyId);
        if (plotIndex >= b.supply) revert PlotOutOfRange(bodyId, plotIndex);
        uint256 cols = b.cols;
        uint256 sectorCols = (cols + SECTOR - 1) / SECTOR;
        uint256 sectorId = ((plotIndex / cols) / SECTOR) * sectorCols + ((plotIndex % cols) / SECTOR);
        uint256 roll = uint256(keccak256(abi.encode(zoneSalt, bodyId, sectorId))) % 100;
        if (roll < 4) return Zone.Legendary; // ~4% of sectors
        if (roll < 20) return Zone.Rare; // ~16% of sectors
        return Zone.Common;
    }

    function priceOf(uint256 bodyId, uint256 plotIndex) external view returns (uint256) {
        return _priceFor(_body(bodyId).basePrice, zoneOf(bodyId, plotIndex));
    }

    function decodeTokenId(uint256 tokenId) public pure returns (uint256 bodyId, uint256 plotIndex) {
        bodyId = tokenId / PLOT_SPACE;
        plotIndex = tokenId % PLOT_SPACE;
    }

    function tokensOfOwner(address owner_) external view returns (uint256[] memory ids) {
        uint256 n = balanceOf(owner_);
        ids = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            ids[i] = tokenOfOwnerByIndex(owner_, i);
        }
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(_baseTokenURI, tokenId.toString());
    }

    // ------------------------------------------------------------------ admin

    /// @notice Register a new celestial body (planet, moon, dwarf planet...).
    function addBody(string calldata name, uint32 supply, uint32 cols, uint128 basePrice, bool active)
        external
        onlyOwner
        returns (uint256 bodyId)
    {
        if (supply == 0 || supply >= PLOT_SPACE || cols == 0 || cols > supply || basePrice == 0) {
            revert InvalidConfig();
        }
        bodyId = ++bodyCount;
        _bodies[bodyId] =
            Body({name: name, supply: supply, cols: cols, claimed: 0, active: active, basePrice: basePrice});
        emit BodyAdded(bodyId, name, supply, cols, basePrice);
    }

    function updateBody(uint256 bodyId, bool active, uint128 basePrice) external onlyOwner {
        if (basePrice == 0) revert InvalidConfig();
        Body storage b = _body(bodyId);
        b.active = active;
        b.basePrice = basePrice;
        emit BodyUpdated(bodyId, active, basePrice);
    }

    function setPrimaryConfig(address resistanceFund_, uint16 primaryBurnBps_) external onlyOwner {
        _setPrimaryConfig(resistanceFund_, primaryBurnBps_);
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
        emit BaseURIUpdated(baseURI_);
    }

    // ------------------------------------------------------------------ internal

    function _body(uint256 bodyId) internal view returns (Body storage b) {
        if (bodyId == 0 || bodyId > bodyCount) revert UnknownBody(bodyId);
        b = _bodies[bodyId];
    }

    function _priceFor(uint256 basePrice, Zone zone) internal pure returns (uint256) {
        if (zone == Zone.Legendary) return (basePrice * LEGENDARY_MULT_BPS) / BPS;
        if (zone == Zone.Rare) return (basePrice * RARE_MULT_BPS) / BPS;
        return basePrice;
    }

    function _setPrimaryConfig(address fund, uint16 burnBps) internal {
        if (fund == address(0) || burnBps > BPS) revert InvalidConfig();
        resistanceFund = fund;
        primaryBurnBps = burnBps;
        emit PrimaryConfigUpdated(fund, burnBps);
    }
}
