// SPDX-License-Identifier: MIT

/**
 * @title Locker Interface of Pancake launchpad enviroment
 * @dev This Interface holds a function to lock LP token with the PancakeLocker contract.
 * This function is called from LaunchpadLockForwarder to lock LP tokens.
 */
pragma solidity 0.6.12;

interface IPancakeLocker {
    /**
     * @notice locks specific amount of LP tokens for a given period of time
     * @dev fees are calculated if caller is not whitelisted
     * @param _lpToken address of the LP token to be locked
     * @param _amount total amount of LP tokens to be locked
     * @param _unlockDate unix timestamp when withdrawer is allowed to unlock LP tokens
     * @param _referral address of referrer for token locking
     * @param _feeInGlmr bool indicating if base token is BNB
     * @param _withdrawer address which is allowed to unlock lock LP tokens after unlock date
     */
    function lockLPToken(
        address _lpToken,
        uint256 _amount,
        uint256 _unlockDate,
        address payable _referral,
        bool _feeInGlmr,
        address payable _withdrawer
    ) external payable;
}
