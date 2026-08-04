// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/* Test doubles for KJPGear: a mintable token and a router that behaves like
   PulseX's swapExactETHForTokensSupportingFeeOnTransferTokens — mints
   amountIn * rate of the path's out-token to the recipient. Can be told to
   revert to exercise the pooling + burnPool crank path. */

contract MockToken {
  string public name; string public symbol;
  uint8 public constant decimals = 18;
  mapping(address => uint256) public balanceOf;
  event Transfer(address indexed from, address indexed to, uint256 value);
  constructor(string memory n, string memory s){ name = n; symbol = s; }
  function mint(address to, uint256 v) external { balanceOf[to] += v; emit Transfer(address(0), to, v); }
  function transfer(address to, uint256 v) external returns (bool) {
    balanceOf[msg.sender] -= v; balanceOf[to] += v; emit Transfer(msg.sender, to, v); return true;
  }
}

contract MockRouter {
  uint256 public rate = 1000;          // tokens minted per wei in
  bool public broken;                  // true -> swaps revert (pool path)
  event Swapped(address tokenOut, uint256 plsIn, uint256 out, address to);
  function setRate(uint256 r) external { rate = r; }
  function setBroken(bool b) external { broken = b; }
  function swapExactETHForTokensSupportingFeeOnTransferTokens(
    uint256 minOut, address[] calldata path, address to, uint256
  ) external payable {
    require(!broken, "router down");
    uint256 out = msg.value * rate;
    require(out >= minOut, "slippage");
    MockToken(path[path.length - 1]).mint(to, out);
    emit Swapped(path[path.length - 1], msg.value, out, to);
  }
}
