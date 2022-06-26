// SPDX-License-Identifier: MIT

/**
 * @title Settings Interface of Pancake launchpad enviroment
 * @dev This Interface holds getter functions for getting the current general settings
 * of the launchpad. General settings are fees, fee receiver, launchpad length limitations,
 * allowed referrers and early access token to participate on round 1.
 */

pragma solidity 0.6.12;

interface ILaunchpadSettings {
    /**
     * @notice returns the address of the base fee receiver
     */
    function getBaseFeeReceiver() external view returns (address payable);

    /**
     * @notice returns the absolute fee in BNB for launchpad creation
     */
    function getGlmrCreationFee() external view returns (uint256);

    /**
     * @notice returns the maximum duration of a launchpad in seconds
     */
    function getMaxLaunchpadLength() external view returns (uint256);

    /**
     * @notice returns the minimum duration of the lp locking period in seconds
     */
    function getMinLockingDuration() external view returns (uint256);

    /**
     * @notice returns the relative referral fee charged on base and sale token fee in parts per 1000
     */
    function getReferralFee() external view returns (uint256);

    /**
     * @notice returns the duration of round 1 in seconds
     */
    function getRound1Length() external view returns (uint256);

    /**
     * @notice returns the sale token fee receiver address
     */
    function getSaleFeeReceiver() external view returns (address payable);

    /**
     * @notice returns the relative sale token fee in parts per 1000
     */
    function getTokenFee() external view returns (uint256);

    /**
     * @notice returns if a given referrer is valid
     * @param _referrer address of the checked referrer
     */
    function referrerIsValid(address _referrer) external view returns (bool);

    /**
     * @notice returns if a given user has sufficient balance of early access tokens
     * registered in the EARLY_ACCESS_TOKENS set to participate in round 1
     * @param _user address of the user to be checked
     */
    function userHoldsSufficientRound1Token(address _user)
        external
        view
        returns (bool);
}
