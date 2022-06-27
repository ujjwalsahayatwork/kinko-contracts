// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

/**
 *@title Interface of Pancake pair
 *@notice This is an interface of the PancakeSwap pair
 *@dev A parital interface of the pancake pair to get token and factory addresses. The original code can be found on
 *https://github.com/pancakeswap/pancake-swap-core/blob/master/contracts/interfaces/IPancakePair.sol
 */
interface IPancakePair {
    /**
     *@notice Returns the address of the pairs pancake factory
     *@return address of the related pancake factory
     */
    function factory() external view returns (address);

    /**
     *@notice Returns the address of the first token of the pair
     *@dev The order of the tokens may switch on pair creation. TokenA on creation has not to be token0
     *inside the pair contract.
     *@return address of the first token of the pair (token0)
     */
    function token0() external view returns (address);

    /**
     *@notice Returns the address of the second token of the pair
     *@dev The order of the tokens may switch on pair creation. TokenB on creation has not to be token1
     *inside the pair contract.
     *@return address of the second token of the pair (token1)
     */
    function token1() external view returns (address);

    /**
     *@notice Mints an amount of token to the given address
     *@dev This low-level function should be called from a contract which performs important safety checks
     *@param to address to mint the tokens to
     *@return the minted liquidity amount of tokens
     */
    function mint(address to) external returns (uint256);

    /**
     *@dev Returns the amount of tokens owned by `owner`.
     *@param owner the address off the account owning tokens
     */
    function balanceOf(address owner) external view returns (uint256);
}
