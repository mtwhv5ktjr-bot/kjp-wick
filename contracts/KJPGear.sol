// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
  KJP GEAR — FIELD ISSUE (PulseChain, chainId 369)

  100 pieces of cross-game equipment for the WICK universe. Every item works in
  BOTH games: KJP (kjp.wick.pics) and PEPE WICK (games.wick.pics).

    type  name            pool  KJP effect                          PEPE WICK effect
    1     SUPPRESSOR       22   silences every lethal gun           subsonic tuning: tighter spread, +rate
    2     KEVLAR WEAVE     20   +1 heart, absorbs the op's 1st hit  +1 heart
    3     TACTICAL BOOTS   16   +8% speed, running 25% quieter      +8% move speed
    4     EXTENDED MAGS    14   +33% magazine on every firearm      +33% magazine
    5     NIGHT OPTICS     12   TAC-MAP never jams in combat        dark districts readable
    6     K9 TREATS         8   dogs' noses fill 50% slower         HOUND packs slowed
    7     SKELETON KEY      5   pick ANY locked door, no card       crate CASE +40%
    8     GOLD BRIEFCASE    3   score x1.25, intel worth double     score x1.1 — and the drip

  THE PLEDGE, ENFORCED BY CODE — NOT BY TRUST:
    Every mint's PLS is split IN THE MINT TRANSACTION:
      50% swapped on PulseX to the KJP token  -> sent to 0x...dEaD (burned)
      50% swapped on PulseX to $WICK          -> sent to 0x...dEaD (burned)
    There is NO withdraw function in this contract. If a swap fails (router
    hiccup) the PLS pools here and ANYONE can convert it with the public
    burnPool() crank, at the same 50/50 split. Revenue has exactly two exits,
    and both are burns.

  Type is drawn at mint from the remaining pool (prevrandao + minter + supply
  entropy — same draw as WICK MODS; pools are utility tiers, not blind grails).
  gearOfOwner(addr) mirrors gunsOfOwner/modsOfOwner so both games read wallets
  the exact same way. Fully self-contained on-chain SVG metadata.
*/

interface IERC20Min { function balanceOf(address) external view returns (uint256); }
interface IPulseXRouter {
  function swapExactETHForTokensSupportingFeeOnTransferTokens(
    uint256 amountOutMin, address[] calldata path, address to, uint256 deadline
  ) external payable;
}
interface IERC721Receiver {
  function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4);
}

library B64g {
  bytes internal constant T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function encode(bytes memory data) internal pure returns (string memory) {
    if (data.length == 0) return "";
    uint256 enclen = 4 * ((data.length + 2) / 3);
    bytes memory result = new bytes(enclen);
    bytes memory tbl = T;
    uint256 i; uint256 j;
    for (; i + 3 <= data.length; i += 3) {
      uint256 n = (uint256(uint8(data[i])) << 16) | (uint256(uint8(data[i+1])) << 8) | uint256(uint8(data[i+2]));
      result[j++] = tbl[(n >> 18) & 63]; result[j++] = tbl[(n >> 12) & 63];
      result[j++] = tbl[(n >> 6) & 63];  result[j++] = tbl[n & 63];
    }
    if (data.length - i == 1) {
      uint256 n = uint256(uint8(data[i])) << 16;
      result[j++] = tbl[(n >> 18) & 63]; result[j++] = tbl[(n >> 12) & 63];
      result[j++] = "="; result[j++] = "=";
    } else if (data.length - i == 2) {
      uint256 n = (uint256(uint8(data[i])) << 16) | (uint256(uint8(data[i+1])) << 8);
      result[j++] = tbl[(n >> 18) & 63]; result[j++] = tbl[(n >> 12) & 63];
      result[j++] = tbl[(n >> 6) & 63];  result[j++] = "=";
    }
    return string(result);
  }
}

contract KJPGear {
  string public constant name = "KJP Gear";
  string public constant symbol = "KJPGEAR";

  uint256 public constant MAX_SUPPLY = 100;
  uint256 public constant MAX_PER_TX = 5;
  uint256 public constant KJP_SHARE_BPS = 5000;   // 50% -> KJP burn, remainder -> WICK burn

  address public owner;
  bool public mintOpen;
  uint256 public mintPrice;
  uint256 public totalSupply;

  // remaining pool per type (index 0 unused): 22/20/16/14/12/8/5/3 = 100
  uint16[9] private _pool = [0, 22, 20, 16, 14, 12, 8, 5, 3];

  mapping(uint256 => address) private _ownerOf;
  mapping(address => uint256) private _balanceOf;
  mapping(uint256 => uint8) private _type;
  mapping(uint256 => address) public getApproved;
  mapping(address => mapping(address => bool)) public isApprovedForAll;
  mapping(address => uint256[]) private _owned;
  mapping(uint256 => uint256) private _ownedIndex;

  event Transfer(address indexed from, address indexed to, uint256 indexed id);
  event Approval(address indexed owner, address indexed spender, uint256 indexed id);
  event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
  event Minted(address indexed to, uint256 indexed id, uint8 gearType);
  event Burned(address indexed token, uint256 plsIn, uint256 tokensBurned, bool viaMint);

  // --- the burn route -------------------------------------------------------
  address public constant BURN_ADDR = 0x000000000000000000000000000000000000dEaD;
  address public immutable burnRouter;   // PulseX V2-style router (address(0) = everything pools for burnPool)
  address public immutable burnPathIn;   // WPLS
  address public immutable kjpToken;     // 50% of every mint becomes a KJP burn
  address public immutable wickToken;    // 50% of every mint becomes a $WICK burn

  constructor(uint256 _price, address _router, address _wpls, address _kjp, address _wick) {
    owner = msg.sender;
    mintPrice = _price;
    // a codeless router/token would silently swallow PLS — refuse a half-configured route
    require(_router == address(0) ||
      (_router.code.length > 0 && _kjp.code.length > 0 && _wick.code.length > 0 && _wpls != address(0)),
      "bad burn route");
    burnRouter = _router;
    burnPathIn = _wpls;
    kjpToken = _kjp;
    wickToken = _wick;
  }

  modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
  function setMintOpen(bool v) external onlyOwner { mintOpen = v; }
  function setMintPrice(uint256 p) external onlyOwner { mintPrice = p; }
  function transferOwnership(address to) external onlyOwner { require(to != address(0), "zero"); owner = to; }

  // withdraw() is deliberately ABSENT. 50% KJP burn + 50% WICK burn is a
  // property of the bytecode, not a promise.

  function _buyBurn(address tok, uint256 amount, uint256 minOut, bool viaMint) internal returns (bool) {
    if (burnRouter == address(0) || amount == 0) return false;
    address[] memory path = new address[](2);
    path[0] = burnPathIn; path[1] = tok;
    uint256 had = IERC20Min(tok).balanceOf(BURN_ADDR);
    try IPulseXRouter(burnRouter).swapExactETHForTokensSupportingFeeOnTransferTokens{value: amount}(
      minOut, path, BURN_ADDR, block.timestamp) {
      emit Burned(tok, amount, IERC20Min(tok).balanceOf(BURN_ADDR) - had, viaMint);
      return true;
    } catch { return false; }
  }
  /// split an amount 50/50 and burn both legs; wei-exact (KJP leg rounds down,
  /// WICK leg takes the remainder — nothing is stranded by division)
  function _splitBurn(uint256 amount, uint256 minOutKjp, uint256 minOutWick, bool viaMint) internal {
    if (amount == 0) return;
    uint256 kjpPart = amount * KJP_SHARE_BPS / 10000;
    _buyBurn(kjpToken, kjpPart, minOutKjp, viaMint);
    _buyBurn(wickToken, amount - kjpPart, minOutWick, viaMint);
    // failed legs simply leave PLS on this contract for the burnPool crank
  }
  /// Anyone may convert pooled PLS (failed auto-burns, direct sends) into the
  /// same 50/50 burn. Caller picks minOuts to defend against sandwiching.
  function burnPool(uint256 minOutKjp, uint256 minOutWick) external {
    uint256 bal = address(this).balance;
    require(bal > 0, "nothing pooled");
    _splitBurn(bal, minOutKjp, minOutWick, false);
  }
  receive() external payable {}   // stray PLS is welcome — it can only ever burn

  // ---------------- mint ----------------
  function mint(uint256 qty) external payable {
    require(mintOpen, "mint closed");
    require(qty >= 1 && qty <= MAX_PER_TX, "1-5 per tx");
    require(totalSupply + qty <= MAX_SUPPLY, "sold out");
    require(msg.value == mintPrice * qty, "wrong PLS");
    uint256 remaining = MAX_SUPPLY - totalSupply;
    for (uint256 i = 0; i < qty; i++) {
      uint256 id = ++totalSupply;
      uint8 t = _draw(uint256(keccak256(abi.encodePacked(
        block.prevrandao, blockhash(block.number - 1), msg.sender, id, remaining - i))));
      _type[id] = t;
      _mint(msg.sender, id);
      emit Minted(msg.sender, id, t);
    }
    _splitBurn(msg.value, 0, 0, true);
  }
  /// weighted draw from the remaining pools — supply-exact by construction
  function _draw(uint256 rand) internal returns (uint8) {
    uint256 left;
    for (uint8 t = 1; t <= 8; t++) left += _pool[t];
    uint256 roll = rand % left;
    for (uint8 t = 1; t <= 8; t++) {
      uint256 p = _pool[t];
      if (roll < p) { _pool[t] = uint16(p - 1); return t; }
      roll -= p;
    }
    revert("pool empty"); // unreachable while supply-gated
  }

  // ---------------- reads the games use ----------------
  function gearTypeOf(uint256 id) external view returns (uint8) {
    require(_ownerOf[id] != address(0), "no token");
    return _type[id];
  }
  function gearOfOwner(address a) external view returns (uint256[] memory ids, uint8[] memory types) {
    uint256[] storage own = _owned[a];
    ids = new uint256[](own.length);
    types = new uint8[](own.length);
    for (uint256 i = 0; i < own.length; i++) { ids[i] = own[i]; types[i] = _type[own[i]]; }
  }
  function poolLeft(uint8 t) external view returns (uint16) { require(t >= 1 && t <= 8, "type"); return _pool[t]; }

  // ---------------- ERC-721 core ----------------
  function balanceOf(address a) external view returns (uint256) { require(a != address(0), "zero"); return _balanceOf[a]; }
  function ownerOf(uint256 id) public view returns (address o) { o = _ownerOf[id]; require(o != address(0), "no token"); }

  function _mint(address to, uint256 id) internal {
    _ownerOf[id] = to;
    _balanceOf[to]++;
    _ownedIndex[id] = _owned[to].length;
    _owned[to].push(id);
    emit Transfer(address(0), to, id);
  }
  function _transfer(address from, address to, uint256 id) internal {
    require(_ownerOf[id] == from, "not owner");
    require(to != address(0), "zero to");
    require(msg.sender == from || msg.sender == getApproved[id] || isApprovedForAll[from][msg.sender], "not approved");
    delete getApproved[id];
    _ownerOf[id] = to;
    _balanceOf[from]--; _balanceOf[to]++;
    // owned-array bookkeeping (swap-pop)
    uint256[] storage fo = _owned[from];
    uint256 idx = _ownedIndex[id];
    uint256 lastId = fo[fo.length - 1];
    fo[idx] = lastId; _ownedIndex[lastId] = idx; fo.pop();
    _ownedIndex[id] = _owned[to].length; _owned[to].push(id);
    emit Transfer(from, to, id);
  }
  function transferFrom(address from, address to, uint256 id) public { _transfer(from, to, id); }
  function safeTransferFrom(address from, address to, uint256 id) external { safeTransferFrom(from, to, id, ""); }
  function safeTransferFrom(address from, address to, uint256 id, bytes memory data) public {
    _transfer(from, to, id);
    if (to.code.length > 0)
      require(IERC721Receiver(to).onERC721Received(msg.sender, from, id, data)
        == IERC721Receiver.onERC721Received.selector, "unsafe receiver");
  }
  function approve(address spender, uint256 id) external {
    address o = ownerOf(id);
    require(msg.sender == o || isApprovedForAll[o][msg.sender], "not owner");
    getApproved[id] = spender;
    emit Approval(o, spender, id);
  }
  function setApprovalForAll(address op, bool ok) external {
    isApprovedForAll[msg.sender][op] = ok;
    emit ApprovalForAll(msg.sender, op, ok);
  }
  function supportsInterface(bytes4 iid) external pure returns (bool) {
    return iid == 0x80ac58cd || iid == 0x5b5e139f || iid == 0x01ffc9a7; // 721, metadata, 165
  }

  // ---------------- on-chain metadata ----------------
  function _gearName(uint8 t) internal pure returns (string memory) {
    if (t == 1) return "SUPPRESSOR";
    if (t == 2) return "KEVLAR WEAVE";
    if (t == 3) return "TACTICAL BOOTS";
    if (t == 4) return "EXTENDED MAGS";
    if (t == 5) return "NIGHT OPTICS";
    if (t == 6) return "K9 TREATS";
    if (t == 7) return "SKELETON KEY";
    return "GOLD BRIEFCASE";
  }
  function _rarity(uint8 t) internal pure returns (string memory) {
    if (t <= 2) return "Common";
    if (t <= 4) return "Uncommon";
    if (t <= 6) return "Rare";
    if (t == 7) return "Epic";
    return "Legendary";
  }
  function _accent(uint8 t) internal pure returns (string memory) {
    if (t <= 2) return "#7cf9a5";
    if (t <= 4) return "#8fc7ff";
    if (t <= 6) return "#c792ff";
    if (t == 7) return "#ff9d5b";
    return "#ffd27c";
  }
  function _u(uint256 v) internal pure returns (string memory) {
    if (v == 0) return "0";
    uint256 j = v; uint256 len;
    while (j != 0) { len++; j /= 10; }
    bytes memory b = new bytes(len);
    while (v != 0) { b[--len] = bytes1(uint8(48 + v % 10)); v /= 10; }
    return string(b);
  }
  function tokenURI(uint256 id) external view returns (string memory) {
    require(_ownerOf[id] != address(0), "no token");
    uint8 t = _type[id];
    string memory nm = _gearName(t);
    string memory acc = _accent(t);
    string memory svg = string(abi.encodePacked(
      "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='560' viewBox='0 0 400 560'>",
      "<rect width='400' height='560' fill='#05070c'/>",
      "<rect x='14' y='14' width='372' height='532' fill='none' stroke='", acc, "' stroke-width='3'/>",
      "<text x='200' y='72' text-anchor='middle' font-family='Arial Black' font-size='30' fill='", acc, "'>KJP GEAR</text>",
      "<text x='200' y='108' text-anchor='middle' font-family='Verdana' font-size='13' fill='#8ba3b8'>FIELD ISSUE ", _u(id), " / 100</text>",
      "<rect x='60' y='170' width='280' height='170' fill='none' stroke='", acc, "' stroke-width='2'/>",
      "<text x='200' y='265' text-anchor='middle' font-family='Arial Black' font-size='26' fill='#e6f1ff'>", nm, "</text>",
      "<text x='200' y='380' text-anchor='middle' font-family='Verdana' font-size='15' fill='", acc, "'>", _rarity(t), "</text>",
      "<text x='200' y='452' text-anchor='middle' font-family='Verdana' font-size='11' fill='#57717f'>works in KJP + PEPE WICK</text>",
      "<text x='200' y='478' text-anchor='middle' font-family='Verdana' font-size='11' fill='#57717f'>50% burned as KJP - 50% burned as WICK</text>",
      "<text x='200' y='522' text-anchor='middle' font-family='Verdana' font-size='12' fill='#7cf9a5'>SEE YOU IN THE COURTROOM.</text>",
      "</svg>"));
    string memory json = string(abi.encodePacked(
      '{"name":"KJP GEAR #', _u(id), ' - ', nm,
      '","description":"Cross-game field equipment for the WICK universe. Works in KJP (kjp.wick.pics) and PEPE WICK (games.wick.pics). Every mint: 50% burned as KJP, 50% burned as WICK - enforced by code, no withdraw exists.",',
      '"attributes":[{"trait_type":"Gear","value":"', nm,
      '"},{"trait_type":"Rarity","value":"', _rarity(t),
      '"}],"image":"data:image/svg+xml;base64,', B64g.encode(bytes(svg)), '"}'));
    return string(abi.encodePacked("data:application/json;base64,", B64g.encode(bytes(json))));
  }
}
