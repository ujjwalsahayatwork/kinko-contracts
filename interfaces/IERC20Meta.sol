// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 *@title Interface of a burnable ERC20 token
 *@dev This interface describes a burnable ERC20 token providing a burn function.
 */
interface IERC20Meta is IERC20 {
    /**
     * @dev Returns the number of decimals of an ERC20 token.
     */
    function decimals() external view returns (uint8);
}
