// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IPWSIToken} from "./interfaces/IPWSIToken.sol";
import {BuybackBurnTreasury} from "./BuybackBurnTreasury.sol";

/// @title TerritoryMarketplace — peer-to-peer territory trading in $PWSI
/// @notice Sellers escrow a territory with an asking price; buyers pay in PWSI.
///         A protocol fee (default 1%) of every sale is routed to the BuybackBurnTreasury and
///         burned in the same transaction.
contract TerritoryMarketplace is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IPWSIToken;
    using EnumerableSet for EnumerableSet.UintSet;

    struct Listing {
        address seller;
        uint64 listedAt;
        uint256 price;
    }

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_FEE_BPS = 500; // hard cap 5%
    uint256 public constant MIN_PRICE = 1e15; // 0.001 PWSI

    IPWSIToken public immutable token;
    IERC721 public immutable territory;
    BuybackBurnTreasury public treasury;

    uint16 public feeBps;
    bool public autoBurn = true;

    mapping(uint256 tokenId => Listing) private _listings;
    EnumerableSet.UintSet private _active;
    mapping(address seller => EnumerableSet.UintSet) private _bySeller;

    uint256 public totalVolume;
    uint256 public totalFees;
    uint256 public tradeCount;

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event PriceUpdated(uint256 indexed tokenId, uint256 oldPrice, uint256 newPrice);
    event Cancelled(uint256 indexed tokenId, address indexed seller);
    event Sale(
        uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 fee
    );
    event FeeUpdated(uint16 feeBps);
    event TreasuryUpdated(address treasury);
    event AutoBurnUpdated(bool enabled);

    error NotTokenOwner();
    error NotSeller();
    error NotListed(uint256 tokenId);
    error PriceOutOfRange();
    error PriceAboveMax(uint256 price, uint256 maxPrice);
    error CannotBuyOwn();
    error InvalidConfig();

    constructor(
        IPWSIToken token_,
        IERC721 territory_,
        BuybackBurnTreasury treasury_,
        address owner_,
        uint16 feeBps_
    ) Ownable(owner_) {
        if (address(treasury_) == address(0) || feeBps_ > MAX_FEE_BPS) revert InvalidConfig();
        token = token_;
        territory = territory_;
        treasury = treasury_;
        feeBps = feeBps_;
    }

    // ------------------------------------------------------------------ trading

    /// @notice List a territory. Requires prior `approve`/`setApprovalForAll` to this contract.
    function list(uint256 tokenId, uint256 price) external nonReentrant whenNotPaused {
        if (territory.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (price < MIN_PRICE || price > type(uint128).max) revert PriceOutOfRange();

        _listings[tokenId] = Listing({seller: msg.sender, listedAt: uint64(block.timestamp), price: price});
        _active.add(tokenId);
        _bySeller[msg.sender].add(tokenId);

        emit Listed(tokenId, msg.sender, price);
        territory.transferFrom(msg.sender, address(this), tokenId);
    }

    function updatePrice(uint256 tokenId, uint256 newPrice) external whenNotPaused {
        Listing storage l = _listing(tokenId);
        if (l.seller != msg.sender) revert NotSeller();
        if (newPrice < MIN_PRICE || newPrice > type(uint128).max) revert PriceOutOfRange();
        emit PriceUpdated(tokenId, l.price, newPrice);
        l.price = newPrice;
    }

    /// @notice Withdraw a listing. Always available, even while paused.
    function cancel(uint256 tokenId) external nonReentrant {
        Listing memory l = _listing(tokenId);
        if (l.seller != msg.sender) revert NotSeller();
        _remove(tokenId, l.seller);
        emit Cancelled(tokenId, l.seller);
        territory.transferFrom(address(this), l.seller, tokenId);
    }

    /// @notice Buy a listed territory. `maxPrice` protects against a price change in-flight.
    function buy(uint256 tokenId, uint256 maxPrice) external nonReentrant whenNotPaused {
        Listing memory l = _listing(tokenId);
        if (l.seller == msg.sender) revert CannotBuyOwn();
        if (l.price > maxPrice) revert PriceAboveMax(l.price, maxPrice);

        (uint256 fee, uint256 proceeds) = quote(l.price);
        _remove(tokenId, l.seller);

        totalVolume += l.price;
        totalFees += fee;
        unchecked {
            ++tradeCount;
        }

        emit Sale(tokenId, l.seller, msg.sender, l.price, fee);
        token.safeTransferFrom(msg.sender, l.seller, proceeds);
        if (fee > 0) {
            token.safeTransferFrom(msg.sender, address(treasury), fee);
            if (autoBurn) treasury.burnAccrued();
        }
        territory.transferFrom(address(this), msg.sender, tokenId);
    }

    // ------------------------------------------------------------------ views

    /// @notice Split a sale price into protocol fee and seller proceeds.
    function quote(uint256 price) public view returns (uint256 fee, uint256 proceeds) {
        fee = (price * feeBps) / BPS;
        proceeds = price - fee;
    }

    function getListing(uint256 tokenId) external view returns (Listing memory) {
        return _listings[tokenId];
    }

    function activeCount() external view returns (uint256) {
        return _active.length();
    }

    /// @notice Paginated active listings.
    function activeListings(uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory tokenIds, Listing[] memory listings)
    {
        uint256 len = _active.length();
        if (offset >= len) return (new uint256[](0), new Listing[](0));
        uint256 end = offset + limit > len ? len : offset + limit;
        tokenIds = new uint256[](end - offset);
        listings = new Listing[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            uint256 id = _active.at(i);
            tokenIds[i - offset] = id;
            listings[i - offset] = _listings[id];
        }
    }

    function listingsOf(address seller) external view returns (uint256[] memory) {
        return _bySeller[seller].values();
    }

    // ------------------------------------------------------------------ admin

    function setFeeBps(uint16 feeBps_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert InvalidConfig();
        feeBps = feeBps_;
        emit FeeUpdated(feeBps_);
    }

    function setTreasury(BuybackBurnTreasury treasury_) external onlyOwner {
        if (address(treasury_) == address(0)) revert InvalidConfig();
        treasury = treasury_;
        emit TreasuryUpdated(address(treasury_));
    }

    function setAutoBurn(bool enabled) external onlyOwner {
        autoBurn = enabled;
        emit AutoBurnUpdated(enabled);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ------------------------------------------------------------------ internal

    function _listing(uint256 tokenId) internal view returns (Listing storage l) {
        l = _listings[tokenId];
        if (l.seller == address(0)) revert NotListed(tokenId);
    }

    function _remove(uint256 tokenId, address seller) internal {
        delete _listings[tokenId];
        _active.remove(tokenId);
        _bySeller[seller].remove(tokenId);
    }
}
