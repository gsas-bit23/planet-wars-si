// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IRevenueTreasury} from "./interfaces/IRevenueTreasury.sol";

/// @title PlanetTerritory — ERC-721 territory plots across the solar system
/// @notice Each celestial body is divided into a grid of plots. Plots are claimed from the SI
///         with $PWSI. Grids are split into 5x5 sectors; every sector has a deterministic zone
///         (Common, Rare, Legendary) which multiplies the plot's claim price.
/// @dev tokenId = bodyId * PLOT_SPACE + plotIndex. New bodies (moons, dwarf planets) can be
///      appended at any time with `addBody` without touching existing plots.
///      Claim payments go to the RevenueTreasury (burn / reward-pool split). ERC-2981 royalties
///      (default 1%) also point at the treasury so external marketplaces feed the same split.
///      `contractURI()` (ERC-7572) serves collection-level metadata for marketplaces.
contract PlanetTerritory is ERC721Enumerable, ERC2981, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
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

    uint96 public constant MAX_ROYALTY_BPS = 1_000; // 10% hard cap
    uint8 internal constant SOURCE_CLAIM = 0;

    IERC20 public immutable token;
    IRevenueTreasury public immutable treasury;
    bytes32 public immutable zoneSalt;

    uint256 public bodyCount;
    mapping(uint256 bodyId => Body) private _bodies;
    mapping(uint256 bodyId => mapping(uint256 word => uint256 bits)) private _claimedBits;

    string private _baseTokenURI;
    string private _contractURI;

    uint256 public totalPrimaryVolume;

    event BodyAdded(uint256 indexed bodyId, string name, uint32 supply, uint32 cols, uint128 basePrice);
    event BodyUpdated(uint256 indexed bodyId, bool active, uint128 basePrice);
    event PlotClaimed(
        address indexed player, uint256 indexed bodyId, uint256 indexed tokenId, Zone zone, uint256 price
    );
    event BaseURIUpdated(string baseURI);
    event ContractURIUpdated();
    event RoyaltyUpdated(address receiver, uint96 bps);

    error UnknownBody(uint256 bodyId);
    error BodyInactive(uint256 bodyId);
    error PlotOutOfRange(uint256 bodyId, uint256 plotIndex);
    error PlotTaken(uint256 tokenId);
    error InvalidConfig();
    error BatchTooLarge();

    constructor(
        IERC20 token_,
        IRevenueTreasury treasury_,
        address owner_,
        string memory baseURI_,
        string memory contractURI_,
        uint96 royaltyBps_
    ) ERC721("Planet Wars SI Territory", "PWSI-T") Ownable(owner_) {
        if (address(token_) == address(0) || address(treasury_) == address(0)) {
            revert InvalidConfig();
        }
        if (royaltyBps_ > MAX_ROYALTY_BPS) revert InvalidConfig();
        token = token_;
        treasury = treasury_;
        zoneSalt = keccak256(abi.encode(block.chainid, address(this), "PWSI_ZONES_V1"));
        _baseTokenURI = baseURI_;
        _contractURI = contractURI_;
        _setDefaultRoyalty(address(treasury_), royaltyBps_);
        emit RoyaltyUpdated(address(treasury_), royaltyBps_);
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

    /// @dev Pull payment straight into the treasury, which splits it (burn / reward pool).
    function _collect(uint256 amount) internal {
        totalPrimaryVolume += amount;
        token.safeTransferFrom(msg.sender, address(treasury), amount);
        treasury.notifyRevenue(SOURCE_CLAIM);
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

    /// @notice Collection-level metadata (ERC-7572 / OpenSea `contractURI`).
    function contractURI() external view returns (string memory) {
        return _contractURI;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
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

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
        emit BaseURIUpdated(baseURI_);
    }

    function setContractURI(string calldata contractURI_) external onlyOwner {
        _contractURI = contractURI_;
        emit ContractURIUpdated();
    }

    /// @notice Royalties always go to the treasury (so they enter the burn / reward split); only
    ///         the rate is adjustable, capped at MAX_ROYALTY_BPS.
    function setRoyaltyBps(uint96 bps) external onlyOwner {
        if (bps > MAX_ROYALTY_BPS) revert InvalidConfig();
        _setDefaultRoyalty(address(treasury), bps);
        emit RoyaltyUpdated(address(treasury), bps);
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
}
