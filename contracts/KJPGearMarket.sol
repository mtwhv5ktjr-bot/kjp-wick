// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
  KJP GEAR MARKET — secondary trading for the 100-piece FIELD ISSUE.

  - LIST / BUY at a fixed price, and an OFFERS POOL: anyone can escrow PLS as a
    bid on a specific token OR on "any piece of type N" (so you can bid for a
    SUPPRESSOR without hunting a particular id).
  - ROYALTY = 15% of every sale, and it does what the mint does:
    50% buys & burns KJP, 50% buys & burns WICK, inside the sale transaction.
    The seller receives the other 85%.

  ESCROW IS SACRED — the rule this contract is built around.
    Bid money belongs to the bidder until they cancel or a seller accepts.
    `burnPending` tracks ONLY royalties whose swap failed, and burnPool() can
    convert nothing else. There is no path — owner or otherwise — that can move
    an open offer. (A sibling market on this chain currently holds 2,265,500
    PLS of live bids; that separation is why it is safe.)

  No withdraw(). The only PLS that ever leaves is: to a seller, back to a
  bidder, or into a burn.
*/

interface IERC20Min { function balanceOf(address) external view returns (uint256); }
interface IPulseXRouter {
  function swapExactETHForTokensSupportingFeeOnTransferTokens(
    uint256 amountOutMin, address[] calldata path, address to, uint256 deadline
  ) external payable;
}
interface IKJPGear {
  function ownerOf(uint256) external view returns (address);
  function gearTypeOf(uint256) external view returns (uint8);
  function transferFrom(address, address, uint256) external;
  function getApproved(uint256) external view returns (address);
  function isApprovedForAll(address, address) external view returns (bool);
}

contract KJPGearMarket {
  address public constant BURN_ADDR = 0x000000000000000000000000000000000000dEaD;
  uint256 public constant ROYALTY_BPS = 1500;    // 15% of every sale is burned
  uint256 public constant KJP_SHARE_BPS = 5000;  // of that royalty: 50% KJP, 50% WICK

  IKJPGear public immutable gear;
  address public immutable burnRouter;
  address public immutable burnPathIn;           // WPLS
  address public immutable kjpToken;
  address public immutable wickToken;

  /// royalties whose swap failed — burnPool() cranks these; NEVER escrow
  uint256 public burnPending;
  /// total PLS escrowed as live offers — can only ever leave via cancel/accept
  uint256 public offerEscrow;

  struct Listing { address seller; uint256 price; }
  struct Offer { address bidder; uint256 amount; uint256 tokenId; uint8 gearType; bool open; }

  mapping(uint256 => Listing) public listings;   // tokenId -> listing
  Offer[] public offers;

  event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
  event Delisted(uint256 indexed tokenId);
  event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 royalty);
  event OfferMade(uint256 indexed id, address indexed bidder, uint256 amount, uint256 tokenId, uint8 gearType);
  event OfferCancelled(uint256 indexed id);
  event OfferAccepted(uint256 indexed id, uint256 indexed tokenId, address indexed seller, uint256 amount);
  event Burned(address indexed token, uint256 plsIn, uint256 tokensBurned);
  event BurnDeferred(uint256 amount);

  uint256 private _lock;
  modifier nonReentrant(){ require(_lock == 0, "reentrant"); _lock = 1; _; _lock = 0; }

  constructor(address _gear, address _router, address _wpls, address _kjp, address _wick){
    require(_gear.code.length > 0, "bad gear addr");
    require(_router == address(0) ||
      (_router.code.length > 0 && _kjp.code.length > 0 && _wick.code.length > 0 && _wpls != address(0)),
      "bad burn route");
    gear = IKJPGear(_gear);
    burnRouter = _router; burnPathIn = _wpls; kjpToken = _kjp; wickToken = _wick;
  }

  // ---------------- burn plumbing ----------------
  function _buy(address tok, uint256 amount, uint256 minOut) internal returns (bool){
    if (burnRouter == address(0) || amount == 0) return false;
    address[] memory path = new address[](2);
    path[0] = burnPathIn; path[1] = tok;
    uint256 had = IERC20Min(tok).balanceOf(BURN_ADDR);
    try IPulseXRouter(burnRouter).swapExactETHForTokensSupportingFeeOnTransferTokens{value: amount}(
      minOut, path, BURN_ADDR, block.timestamp){
      emit Burned(tok, amount, IERC20Min(tok).balanceOf(BURN_ADDR) - had);
      return true;
    } catch { return false; }
  }
  /// split a royalty 50/50 and burn both legs; anything that fails becomes
  /// burnPending — it is NEVER mixed with escrow
  function _burnRoyalty(uint256 amount) internal {
    if (amount == 0) return;
    uint256 kjpPart = amount * KJP_SHARE_BPS / 10000;
    uint256 wickPart = amount - kjpPart;
    uint256 failed;
    if (!_buy(kjpToken, kjpPart, 0)) failed += kjpPart;
    if (!_buy(wickToken, wickPart, 0)) failed += wickPart;
    if (failed > 0){ burnPending += failed; emit BurnDeferred(failed); }
  }
  /// Anyone may convert deferred royalties into the same 50/50 burn.
  /// It can only ever spend burnPending — escrow is unreachable from here.
  function burnPool(uint256 minOutKjp, uint256 minOutWick) external nonReentrant {
    uint256 amt = burnPending;
    require(amt > 0, "nothing pending");
    burnPending = 0;
    uint256 kjpPart = amt * KJP_SHARE_BPS / 10000;
    uint256 wickPart = amt - kjpPart;
    uint256 failed;
    if (!_buy(kjpToken, kjpPart, minOutKjp)) failed += kjpPart;
    if (!_buy(wickToken, wickPart, minOutWick)) failed += wickPart;
    if (failed > 0){ burnPending += failed; emit BurnDeferred(failed); }
  }

  // ---------------- listings ----------------
  function list(uint256 tokenId, uint256 price) external {
    require(price > 0, "price 0");
    require(gear.ownerOf(tokenId) == msg.sender, "not owner");
    require(gear.getApproved(tokenId) == address(this) || gear.isApprovedForAll(msg.sender, address(this)),
      "approve the market first");
    listings[tokenId] = Listing(msg.sender, price);
    emit Listed(tokenId, msg.sender, price);
  }
  function delist(uint256 tokenId) external {
    require(listings[tokenId].seller == msg.sender, "not seller");
    delete listings[tokenId];
    emit Delisted(tokenId);
  }
  function buy(uint256 tokenId) external payable nonReentrant {
    Listing memory L = listings[tokenId];
    require(L.price > 0, "not listed");
    require(msg.value == L.price, "wrong PLS");
    /* a listing is stale the moment the token moves — refuse rather than
       hand the money to someone who no longer owns it */
    require(gear.ownerOf(tokenId) == L.seller, "seller no longer owns it");
    delete listings[tokenId];

    uint256 royalty = msg.value * ROYALTY_BPS / 10000;
    uint256 toSeller = msg.value - royalty;
    gear.transferFrom(L.seller, msg.sender, tokenId);
    (bool ok, ) = payable(L.seller).call{value: toSeller}("");
    require(ok, "seller transfer failed");
    _burnRoyalty(royalty);
    emit Sold(tokenId, L.seller, msg.sender, msg.value, royalty);
  }

  // ---------------- offers ----------------
  /// tokenId 0 + gearType N = "any piece of type N"; tokenId N = that piece
  function makeOffer(uint256 tokenId, uint8 gearType) external payable returns (uint256 id){
    require(msg.value > 0, "no PLS");
    require(tokenId > 0 || (gearType >= 1 && gearType <= 8), "specify a token or a type");
    offers.push(Offer(msg.sender, msg.value, tokenId, gearType, true));
    offerEscrow += msg.value;
    id = offers.length - 1;
    emit OfferMade(id, msg.sender, msg.value, tokenId, gearType);
  }
  function cancelOffer(uint256 id) external nonReentrant {
    Offer storage o = offers[id];
    require(o.open && o.bidder == msg.sender, "not your open offer");
    o.open = false;
    uint256 amt = o.amount; o.amount = 0;
    offerEscrow -= amt;
    (bool ok, ) = payable(msg.sender).call{value: amt}("");
    require(ok, "refund failed");
    emit OfferCancelled(id);
  }
  /// seller accepts a bid with a token that satisfies it
  function acceptOffer(uint256 id, uint256 tokenId) external nonReentrant {
    Offer storage o = offers[id];
    require(o.open, "offer closed");
    require(gear.ownerOf(tokenId) == msg.sender, "not owner");
    require(gear.getApproved(tokenId) == address(this) || gear.isApprovedForAll(msg.sender, address(this)),
      "approve the market first");
    if (o.tokenId != 0) require(o.tokenId == tokenId, "offer is for another token");
    else require(gear.gearTypeOf(tokenId) == o.gearType, "wrong gear type");

    o.open = false;
    uint256 amt = o.amount; o.amount = 0;
    offerEscrow -= amt;
    delete listings[tokenId];                        // it just sold; kill any listing

    uint256 royalty = amt * ROYALTY_BPS / 10000;
    uint256 toSeller = amt - royalty;
    gear.transferFrom(msg.sender, o.bidder, tokenId);
    (bool ok, ) = payable(msg.sender).call{value: toSeller}("");
    require(ok, "seller transfer failed");
    _burnRoyalty(royalty);
    emit OfferAccepted(id, tokenId, msg.sender, amt);
  }

  // ---------------- reads for the UI ----------------
  function offerCount() external view returns (uint256){ return offers.length; }
  /// every open offer, newest first — the site renders straight from this
  function openOffers() external view returns (
    uint256[] memory ids, address[] memory bidders, uint256[] memory amounts,
    uint256[] memory tokenIds, uint8[] memory types
  ){
    uint256 n;
    for (uint256 i = 0; i < offers.length; i++) if (offers[i].open) n++;
    ids = new uint256[](n); bidders = new address[](n); amounts = new uint256[](n);
    tokenIds = new uint256[](n); types = new uint8[](n);
    uint256 k;
    for (uint256 i = offers.length; i > 0; i--){
      Offer storage o = offers[i - 1];
      if (!o.open) continue;
      ids[k] = i - 1; bidders[k] = o.bidder; amounts[k] = o.amount;
      tokenIds[k] = o.tokenId; types[k] = o.gearType; k++;
    }
  }
  /// active listings across a token id range — cheap enough for a 100-piece set
  function listingsIn(uint256 from, uint256 to) external view returns (
    uint256[] memory ids, address[] memory sellers, uint256[] memory prices, uint8[] memory types
  ){
    uint256 n;
    for (uint256 i = from; i <= to; i++) if (listings[i].price > 0) n++;
    ids = new uint256[](n); sellers = new address[](n); prices = new uint256[](n); types = new uint8[](n);
    uint256 k;
    for (uint256 i = from; i <= to; i++){
      if (listings[i].price == 0) continue;
      ids[k] = i; sellers[k] = listings[i].seller; prices[k] = listings[i].price;
      types[k] = gear.gearTypeOf(i); k++;
    }
  }
  /// solvency: what the contract holds must cover escrow + pending burns
  function solvent() external view returns (bool ok, uint256 held, uint256 owed){
    held = address(this).balance;
    owed = offerEscrow + burnPending;
    ok = held >= owed;
  }
  receive() external payable { burnPending += msg.value; }   // stray PLS can only burn
}
