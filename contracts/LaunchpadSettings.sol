// SPDX-License-Identifier: MIT

/**
 * @title Settings of Pancake launchpad enviroment
 * @dev This contract holds variables with getter and setter to manage general settings of the launchpads.
 * The core is to manage fees, fee receiver, launchpad length limitations, allowed referrers and early
 * access token to participate on round 1. The values can only be changed by the contract owner.
 */

pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/ILaunchpadSettings.sol";

contract LaunchpadSettings is ILaunchpadSettings, Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;

    // holding all launchpad settings parameter
    struct Settings {
        uint256 tokenFee; // fee charged on base and sale token to dev address in parts per 1000
        uint256 referralFee; // fee charged on base and sale token fees to referral address in parts per 1000
        address payable baseFeeReceiver; // address to send the base token fee to
        address payable tokenFeeReceiver; // address to send the sale token fee to
        uint256 creationFee; // absolute fee in BNB used by generator on launchpad creation
        uint256 round1Length; // the duration of round 1 in seconds
        uint256 maxLaunchpadLength; // maximum duration of launchpad in seconds
        uint256 minLockingDuration; // minimum locking period in seconds
    }

    // holds addresses allowed to receive referral fee
    EnumerableSet.AddressSet private ALLOWED_REFERRERS;

    // set of tokens allowing early access (round1 purchase)
    EnumerableSet.AddressSet private EARLY_ACCESS_TOKENS;
    // specifing the amount of early acces token to be held by a user
    // EARLY_ACCESS_TOKEN => REQUIRED HOLDING AMOUNT
    mapping(address => uint256) public EARLY_ACCESS_AMOUNTS;

    // holding all launchpad settings parameter
    Settings public settings;

    /**
     * @dev Sets initial settings for launchpads
     */
    constructor() public {
        settings.tokenFee = 15; // 1.5%
        settings.referralFee = 100; // 10%
        settings.creationFee = 5e17; // 0.5 BNB
        settings.baseFeeReceiver = msg.sender;
        settings.tokenFeeReceiver = msg.sender;
        settings.round1Length = 7200; // 7,200 seconds = 2 hours
        settings.maxLaunchpadLength = 1209600; // 1,209,600 seconds = 2 weeks
        settings.minLockingDuration = 365 days; // 1 year
    }

    /*---------------------------------------------------------------------------------------------
     * --------------------------------------Setter functions--------------------------------------
     */

    /**
     * @notice edits the list of allowed referrers by owner. Referrers can be added to or removed from
     * the allowed referrers list.
     * @dev referrers are checked in create function of generator
     * @param _referrer address of the referrer to be changed
     * @param _allow bool if the referrer should be added to (=true) or removed from (=false) the list
     */
    function editAllowedReferrers(address payable _referrer, bool _allow)
        external
        onlyOwner
    {
        if (_allow) {
            ALLOWED_REFERRERS.add(_referrer);
        } else {
            ALLOWED_REFERRERS.remove(_referrer);
        }
    }

    /**
     * @notice edits the list of early access tokens by owner.
     * @param _token address of the token to be changed for early access
     * @param _holdAmount the minimum amount of early acces token hold by user for early access
     * @param _allow bool if the token should be added to (=true) or removed from (=false) the list
     */
    function editEarlyAccessTokens(
        address _token,
        uint256 _holdAmount,
        bool _allow
    ) external onlyOwner {
        if (_allow) {
            EARLY_ACCESS_TOKENS.add(_token);
        } else {
            EARLY_ACCESS_TOKENS.remove(_token);
        }
        EARLY_ACCESS_AMOUNTS[_token] = _holdAmount;
    }

    /**
     * @notice sets the fee receiver addresses for base token and sale token fees
     * @param _baseFeeReceiver address of the base token fee receiver
     * @param _tokenFeeReceiver address of the sale token fee receiver
     */
    function setFeeAddresses(
        address payable _baseFeeReceiver,
        address payable _tokenFeeReceiver
    ) external onlyOwner {
        settings.baseFeeReceiver = _baseFeeReceiver;
        settings.tokenFeeReceiver = _tokenFeeReceiver;
    }

    /**
     * @notice sets the fees for the launchpad by owner
     * @param _tokenFee relative fee charged on base and sale tokens in parts per 1000
     * @param _creationFee absolute fee in BNB charged on launchpad creation
     * @param _referralFee relative fee charged on base and sale tokens fee in parts per 1000
     */
    function setFees(
        uint256 _tokenFee,
        uint256 _creationFee,
        uint256 _referralFee
    ) external onlyOwner {
        settings.tokenFee = _tokenFee;
        settings.referralFee = _referralFee;
        settings.creationFee = _creationFee;
    }

    /**
     * @notice sets the maximum duration of a launchpad by owner
     * @param _maxLength duration in seconds (difference between start and end time)
     */
    function setMaxLaunchpadLength(uint256 _maxLength) external onlyOwner {
        settings.maxLaunchpadLength = _maxLength;
    }

    /**
     * @notice sets the minimum duration of locking lp tockens
     * @param _minLength locking duration in seconds
     */
    function setMinLockingDuration(uint256 _minLength) external onlyOwner {
        settings.minLockingDuration = _minLength;
    }

    /**
     * @notice set the duration of round 1 by owner
     * @param _round1Length the duration of round 1 in seconds
     */
    function setRound1Length(uint256 _round1Length) external onlyOwner {
        settings.round1Length = _round1Length;
    }

    /*---------------------------------------------------------------------------------------------
     * --------------------------------------Getter functions--------------------------------------
     */

    /**
     * @notice returns total amount of allowed referrers
     */
    function allowedReferrersLength() external view returns (uint256) {
        return ALLOWED_REFERRERS.length();
    }

    /**
     * @notice returns total amount registered early access tokens
     */
    function earlyAccessTokensLength() public view returns (uint256) {
        return EARLY_ACCESS_TOKENS.length();
    }

    /**
     * @notice returns the address of the base fee receiver
     */
    function getBaseFeeReceiver()
        external
        view
        override
        returns (address payable)
    {
        return settings.baseFeeReceiver;
    }

    /**
     * @notice returns the absolute fee in BNB for launchpad creation
     */
    function getGlmrCreationFee() external view override returns (uint256) {
        return settings.creationFee;
    }

    /**
     * @notice returns the address and holding amount of the early access token at given index
     * @param _index  position of the early access token in the EARLY_ACCESS_TOKENS set
     */
    function getEarlyAccessTokenAtIndex(uint256 _index)
        public
        view
        returns (address, uint256)
    {
        address tokenAddress = EARLY_ACCESS_TOKENS.at(_index);
        return (tokenAddress, EARLY_ACCESS_AMOUNTS[tokenAddress]);
    }

    /**
     * @notice returns the maximum duration of a launchpad in seconds
     */
    function getMaxLaunchpadLength() external view override returns (uint256) {
        return settings.maxLaunchpadLength;
    }

    /**
     * @notice gets the minimum duration of locking lp tockens
     */
    function getMinLockingDuration() external view override returns (uint256) {
        return settings.minLockingDuration;
    }

    /**
     * @notice returns the relative referral fee charged on base and sale token fee in parts per 1000
     */
    function getReferralFee() external view override returns (uint256) {
        return settings.referralFee;
    }

    /**
     * @notice returns the address of the referrer at a given index
     * @param _index position of the referrer in the ALLOWED_REFERRERS set
     */
    function getReferrerAtIndex(uint256 _index)
        external
        view
        returns (address)
    {
        return ALLOWED_REFERRERS.at(_index);
    }

    /**
     * @notice returns the duration of round 1 in seconds
     */
    function getRound1Length() external view override returns (uint256) {
        return settings.round1Length;
    }

    /**
     * @notice returns the sale token fee receiver address
     */
    function getSaleFeeReceiver()
        external
        view
        override
        returns (address payable)
    {
        return settings.tokenFeeReceiver;
    }

    /**
     * @notice returns the relative sale token fee in parts per 1000
     */
    function getTokenFee() external view override returns (uint256) {
        return settings.tokenFee;
    }

    /**
     * @notice returns if a given referrer is valid
     * @param _referrer address of the checked referrer
     */
    function referrerIsValid(address _referrer)
        external
        view
        override
        returns (bool)
    {
        return ALLOWED_REFERRERS.contains(_referrer);
    }

    /**
     * @notice returns if a given user has sufficient balance of early access tokens
     * registered in the EARLY_ACCESS_TOKENS set to participate in round 1
     * @dev we are aware of out of gas scenarios in for loop. It is intended to keep
     * the early access tokens list very small (max. 5)
     * @param _user address of the user to be checked
     */
    function userHoldsSufficientRound1Token(address _user)
        external
        view
        override
        returns (bool)
    {
        if (earlyAccessTokensLength() == 0) {
            return true;
        }
        for (uint256 i = 0; i < earlyAccessTokensLength(); i++) {
            (address token, uint256 amountHold) = getEarlyAccessTokenAtIndex(i);
            if (IERC20(token).balanceOf(_user) >= amountHold) {
                return true;
            }
        }
        return false;
    }
}
