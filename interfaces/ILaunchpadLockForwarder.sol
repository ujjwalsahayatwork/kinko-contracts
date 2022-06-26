// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

/**
 * @title LockForwarder Interface of the Pancake launchpad enviroment
 * @dev This interface describes the LaunchpadLockForwarder. It holds functions for interacting
 * with the energyFiswap factory for getting LP information and creating a LP on locking liquidity.
 * The locked liquidity amount is forwarded to PancakeLocker contract.
 */

import "./IERC20Meta.sol";

interface ILaunchpadLockForwarder {
    /**
     * @notice locks iquidity by creating a liquidity pair (LP) with base and sale token,
     * sending liquidity amount of both tokens to the LP and locks the minted LP token
     * with PancakeLocker contract.
     * @param _baseToken token received for sold launchpad token
     * @param _saleToken token sold in launchpad
     * @param _baseAmount amount of base tokens to be locked
     * @param _saleAmount amount of sale tokens to be locked
     * @param _unlockDate timestamp to unlock the locked lp token
     * @param _withdrawer address allowed to withdraw token after unlock date
     */
    function lockLiquidity(
        IERC20Meta _baseToken,
        IERC20 _saleToken,
        uint256 _baseAmount,
        uint256 _saleAmount,
        uint256 _unlockDate,
        address payable _withdrawer
    ) external;

    /**
     * @notice checks if a energyFi pair with liquidity exists on energyFiswap for the given tokens
     * @param _token0 one address of the energyFi pair base tokens
     * @param _token1 the other address of the energyFi pair base tokens
     */
    function energyFiswapPairIsInitialised(address _token0, address _token1)
        external
        view
        returns (bool);
}
