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

  /* ---------------- THE ART ----------------
     Each piece is drawn as a technical schematic — the way the Agency would
     have filed it. Line art on a blueprint grid: cheap in bytecode, sharp at
     any size, and thematically the only style that made sense for a card whose
     whole story is "somebody kept the paperwork".
     Every group is stroked in the rarity accent, so rarity reads from across
     the room without a word being printed. */
  function _art(uint8 t) internal pure returns (string memory) {
    if (t == 1) return                                   // SUPPRESSOR — can, baffles, threads
      "<rect x='118' y='232' width='150' height='46' rx='23'/>"
      "<rect x='96' y='242' width='24' height='26' rx='4'/>"
      "<path d='M100 246h16M100 252h16M100 258h16M100 264h16'/>"
      "<path d='M148 232v46M170 232v46M192 232v46M214 232v46M236 232v46'/>"
      "<circle cx='268' cy='255' r='9'/>"
      "<path d='M282 255h26M296 241v28'/>";
    if (t == 2) return                                   // KEVLAR WEAVE — plate carrier
      "<path d='M148 208h64l20 16 30 10v66l-22 8v40h-120v-40l-22-8v-66l30-10z'/>"
      "<path d='M160 240h80v56h-80z'/>"
      "<path d='M160 254h80M160 268h80M160 282h80M180 240v56M200 240v56M220 240v56'/>"
      "<path d='M148 208l32 22M212 208l-32 22'/>"
      "<rect x='136' y='306' width='30' height='14' rx='3'/>"
      "<rect x='234' y='306' width='30' height='14' rx='3'/>";
    if (t == 3) return                                   // TACTICAL BOOTS — side profile, toe right
      "<path d='M146 198h52v100h56a12 12 0 0 1 12 12v14H146z'/>"
      "<path d='M134 324h140v16a10 10 0 0 1-10 10H144a10 10 0 0 1-10-10z'/>"
      "<path d='M138 350h132'/>"
      "<path d='M150 214l44 16M194 214l-44 16M150 240l44 16M194 240l-44 16M150 266l44 16M194 266l-44 16'/>"
      "<path d='M198 298v26M226 310h48'/>"
      "<circle cx='172' cy='198' r='5'/>";
    if (t == 4) return                                   // EXTENDED MAGS — curved magazine
      "<path d='M164 196h72v18h-72z'/>"
      "<path d='M168 214h64c6 40 14 76 26 112l-56 20c-16-42-28-88-34-132z'/>"
      "<circle cx='186' cy='205' r='5'/><circle cx='200' cy='205' r='5'/>"
      "<circle cx='214' cy='205' r='5'/><circle cx='228' cy='205' r='5'/>"
      "<path d='M180 246h56M186 274h56M194 302h54'/>"
      "<path d='M196 336l58-20'/>";
    if (t == 5) return                                   // NIGHT OPTICS — dual tube goggles
      "<rect x='120' y='226' width='72' height='58' rx='10'/>"
      "<rect x='208' y='226' width='72' height='58' rx='10'/>"
      "<circle cx='156' cy='255' r='19'/><circle cx='244' cy='255' r='19'/>"
      "<circle cx='156' cy='255' r='8'/><circle cx='244' cy='255' r='8'/>"
      "<path d='M192 248h16v14h-16z'/>"
      "<path d='M120 240h-22v30h22M280 240h22v30h-22'/>"
      "<path d='M156 226v-22h88v22'/>"
      "<path d='M110 296q90 34 180 0'/>";
    if (t == 6) return                                   // K9 TREATS — bone over a paw print
      "<circle cx='142' cy='226' r='17'/><circle cx='142' cy='258' r='17'/>"
      "<circle cx='258' cy='226' r='17'/><circle cx='258' cy='258' r='17'/>"
      "<path d='M150 228h100v28H150z'/>"
      "<path d='M158 242h84'/>"
      "<ellipse cx='200' cy='330' rx='26' ry='20'/>"
      "<ellipse cx='168' cy='300' rx='9' ry='12'/><ellipse cx='189' cy='291' rx='9' ry='12'/>"
      "<ellipse cx='211' cy='291' rx='9' ry='12'/><ellipse cx='232' cy='300' rx='9' ry='12'/>";
    if (t == 7) return                                   // SKELETON KEY — ornate
      "<circle cx='160' cy='236' r='36'/><circle cx='160' cy='236' r='16'/>"
      "<path d='M136 212l48 48M184 212l-48 48'/>"
      "<path d='M192 228h96v18h-96z'/>"
      "<path d='M252 246v26h14v-26M276 246v18h12v-18'/>"
      "<circle cx='296' cy='237' r='7'/>"
      "<path d='M160 272v34M148 292h24'/>";
    return                                               // GOLD BRIEFCASE — the drip
      "<rect x='108' y='232' width='184' height='118' rx='8'/>"
      "<path d='M170 232v-16a10 10 0 0 1 10-10h40a10 10 0 0 1 10 10v16'/>"
      "<path d='M108 286h184'/>"
      "<rect x='150' y='274' width='30' height='24' rx='3'/>"
      "<rect x='220' y='274' width='30' height='24' rx='3'/>"
      "<path d='M124 246v90M276 246v90'/>"
      "<path d='M108 244h184M108 338h184'/>"
      "<circle cx='200' cy='286' r='13'/><path d='M200 279v14M195 286h10'/>";
  }
  function tokenURI(uint256 id) external view returns (string memory) {
    require(_ownerOf[id] != address(0), "no token");
    uint8 t = _type[id];
    string memory nm = _gearName(t);
    string memory acc = _accent(t);
    string memory svg = string(abi.encodePacked(
      "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='560' viewBox='0 0 400 560'>"
      "<defs>"
        "<pattern id='g' width='20' height='20' patternUnits='userSpaceOnUse'>"
          "<path d='M20 0H0V20' fill='none' stroke='", acc, "' stroke-width='.5' opacity='.13'/></pattern>"
        "<radialGradient id='v'><stop offset='.55' stop-color='#000' stop-opacity='0'/>"
          "<stop offset='1' stop-color='#000' stop-opacity='.75'/></radialGradient>"
        "<filter id='b'><feGaussianBlur stdDeviation='4'/></filter>"
      "</defs>"
      "<rect width='400' height='560' fill='#05070c'/>"
      "<rect x='18' y='150' width='364' height='250' fill='url(#g)'/>",
      /* the schematic, drawn twice: once blurred as its own glow, once sharp */
      "<g fill='none' stroke='", acc, "' stroke-width='7' opacity='.30' filter='url(#b)'>", _art(t), "</g>"
      "<g fill='none' stroke='", acc, "' stroke-width='2.4' stroke-linejoin='round' stroke-linecap='round'>", _art(t), "</g>",
      "<rect width='400' height='560' fill='url(#v)'/>"
      /* HUD corner brackets — the game's own UI language */
      "<g fill='none' stroke='", acc, "' stroke-width='3'>"
        "<path d='M16 52V16h36M348 16h36v36M384 508v36h-36M52 544H16v-36'/></g>",
      "<text x='200' y='62' text-anchor='middle' font-family='Arial Black' font-size='30' fill='", acc, "'>KJP GEAR</text>"
      "<text x='200' y='84' text-anchor='middle' font-family='Verdana' font-size='11' fill='#8ba3b8' letter-spacing='3'>FIELD ISSUE ", _u(id), " / 100</text>"
      "<path d='M118 104h164' stroke='", acc, "' stroke-width='1' opacity='.5'/>",
      "<text x='200' y='452' text-anchor='middle' font-family='Arial Black' font-size='",
        bytes(nm).length > 13 ? "23" : "28", "' fill='#e6f1ff'>", nm, "</text>",
      "<text x='200' y='476' text-anchor='middle' font-family='Verdana' font-size='12' fill='", acc, "' letter-spacing='4'>", _rarity(t), "</text>"
      "<text x='200' y='508' text-anchor='middle' font-family='Verdana' font-size='10' fill='#57717f'>WORKS IN KJP + PEPE WICK</text>"
      "<text x='200' y='524' text-anchor='middle' font-family='Verdana' font-size='10' fill='#57717f'>50% BURNED AS KJP - 50% BURNED AS WICK</text>"
      "<text x='200' y='541' text-anchor='middle' font-family='Verdana' font-size='11' fill='#7cf9a5'>SEE YOU IN THE COURTROOM.</text>"
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
