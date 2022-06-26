// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

/**
 *@title Interface of Pancake factory
 *@notice This is an interface of the PancakeSwap factory
 *@dev A parital interface of the energyFi factory. The original code can be found on
 *https://github.com/energyFiswap/energyFi-swap-core/blob/master/contracts/interfaces/IPancakeFactory.sol
 */
interface IPancakeFactory {
    /**
     *@notice Creates a new pair of two tokens known as liquidity pool
     *@param tokenA The first token of the pair
     *@param tokenB The second token of the pair
     *@return pair address of the created pair
     */
    function createPair(address tokenA, address tokenB)
        external
        returns (address pair);

    /**
     *@notice Returns the pair address of two given tokens
     *@param tokenA The first token of the pair
     *@param tokenB The second token of the pair
     *@return pair address of the created pair
     */
    function getPair(address tokenA, address tokenB)
        external
        view
        returns (address pair);
}
