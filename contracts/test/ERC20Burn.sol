// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./ERC20.sol";

contract ERC20Burn is ERC20, ERC20Burnable {
    constructor(uint8 _decimals) public ERC20("Burn Token", "BTK", _decimals) {
        _mint(msg.sender, 10_000_000_000_000 * uint256(10)**_decimals);
    }
}
