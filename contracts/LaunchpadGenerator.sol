// SPDX-License-Identifier: MIT

/**
 * @title Generator of Pancake launchpad enviroment
 * @dev This contract generate new launchpad with the given launchpad params. Launchpad
 * creation charges a fee in BNB which is defined in the launchpad settings.
 */
pragma solidity 0.6.12;

import "../interfaces/IERC20Meta.sol";
import "../interfaces/ILaunchpadFactory.sol";
import "./Launchpad.sol";
import "./TransferHelper.sol";

contract LaunchpadGenerator {
    using SafeMath for uint256;

    // struct with parameter needed to create a new launchpad
    struct LaunchpadParams {
        uint256 amount; // min 10 000
        uint256 hardcap; // amount to be reached for successful ilo
        uint256 softcap; // minimum sold amount reached at end time for successful ilo
        uint256 liquidityPercent; // min 250(=25%) max 1000(=100%)
        uint256 listingRate; // listing price of sale token on pancakeswap
        uint256 maxSpendPerBuyer; // the maximum amount to be spent by a specific buyer
        uint256 tokenPrice; // the amount of sale tokens for one base token
        uint256 lockPeriod; // min 1 year in seconds
        uint256 startTime; // the timestamp to start the launchpad
        uint256 endTime; // the timestamp to end the launchpad (max length of settings contract must be met)
    }

    // addresses of dependen contracts
    address public immutable LAUNCHPAD_FACTORY;
    address public immutable LAUNCHPAD_LOCK_FORWARDER;
    address public immutable KINKO_DEV;
    address public immutable WBNB;
    ILaunchpadSettings public immutable LAUNCHPAD_SETTINGS;

    /**
     *@dev sets initially contract dependend addresses
     *@param _launchpadFactory address of the launchpad factory contract
     *@param _launchpadSettings address of the settings contract
     *@param _wbnb address of the wrapped bnb contract
     *@param _launchpadLockForwarder address of LanchpadLockForwarder contract
     *@param _pancakeDev address of the developer account
     */
    constructor(
        address _launchpadFactory,
        address _launchpadSettings,
        address _wbnb,
        address _launchpadLockForwarder,
        address _pancakeDev
    ) public {
        require(
            _launchpadFactory != address(0) &&
                _launchpadSettings != address(0) &&
                _wbnb != address(0) &&
                _launchpadLockForwarder != address(0) &&
                _pancakeDev != address(0),
            "ZERO ADDRESS"
        );
        LAUNCHPAD_FACTORY = _launchpadFactory;
        LAUNCHPAD_SETTINGS = ILaunchpadSettings(_launchpadSettings);
        LAUNCHPAD_LOCK_FORWARDER = _launchpadLockForwarder;
        KINKO_DEV = _pancakeDev;
        WBNB = _wbnb;
    }

    /**
     * @notice creates a new launchpad with the given parameters
     * @dev requires to receive the creation fee in BNB (defined in settings)
     * @param _launchpadOwner address of the launchpad owner account
     * @param _launchpadToken the token to be sold
     * @param _referralAddress the address to send the referral fee to
     * @param uint_params the parameters defined in LaunchpadParams struct (order matters)
     */
    function createLaunchpad(
        address payable _launchpadOwner,
        IERC20 _launchpadToken,
        IERC20Meta _baseToken,
        address payable _referralAddress,
        uint256[9] memory uint_params
    ) external payable {
        // read parameter from function call
        LaunchpadParams memory params;
        params.amount = uint_params[0];
        params.hardcap = uint_params[1];
        params.softcap = uint_params[2];
        params.liquidityPercent = uint_params[3];
        params.listingRate = uint_params[4];
        params.maxSpendPerBuyer = uint_params[5];
        params.lockPeriod = uint_params[6];
        params.startTime = uint_params[7];
        params.endTime = uint_params[8];

        // calculate token price and check precision
        params.tokenPrice = params.hardcap.mul(10**18).div(
            params.amount
        );
        require(
            params.tokenPrice.mul(params.amount).div(10**18) ==
                params.hardcap,
            "INVALID PARAMS"
        );

        // set locking period to a minimum of one year
        if (params.lockPeriod < LAUNCHPAD_SETTINGS.getMinLockingDuration()) {
            params.lockPeriod = LAUNCHPAD_SETTINGS.getMinLockingDuration();
        }

        // exact amount of creation fee has to be sent by function call
        require(
            msg.value == LAUNCHPAD_SETTINGS.getGlmrCreationFee(),
            "FEE NOT MET"
        );
        // send creation fee to registered address
        LAUNCHPAD_SETTINGS.getBaseFeeReceiver().transfer(
            LAUNCHPAD_SETTINGS.getGlmrCreationFee()
        );

        // check for valid referrer address
        if (_referralAddress != address(0)) {
            require(
                LAUNCHPAD_SETTINGS.referrerIsValid(_referralAddress),
                "INVALID REFERRAL"
            );
        }

        // check for sufficient amount
        require(params.amount >= 10000, "MIN DIVIS");

        // check if max time length is not met
        require(
            params.endTime.sub(params.startTime) <=
                LAUNCHPAD_SETTINGS.getMaxLaunchpadLength(),
            "INVALID TIME PERIOD"
        );

        // check for valid liquidity params (min 30% max 100%)
        require(
            params.liquidityPercent >= 250 && params.liquidityPercent <= 1000,
            "INVALID LIQUIDITY"
        );

        // calculate required token amount
        uint256 tokensRequiredForLaunchpad = calculateAmountRequired(
            params.amount,
            params.listingRate,
            params.liquidityPercent
        );

        // create launchpad
        Launchpad newLaunchpad = new Launchpad(
            address(this),
            WBNB,
            address(LAUNCHPAD_SETTINGS),
            LAUNCHPAD_LOCK_FORWARDER,
            KINKO_DEV
        );

        // send required launchpad token amount to launchpad contract
        TransferHelper.safeTransferFrom(
            address(_launchpadToken),
            address(msg.sender),
            address(newLaunchpad),
            tokensRequiredForLaunchpad
        );

        // first part of launchpad initilization
        newLaunchpad.init1(
            _launchpadOwner,
            params.amount,
            params.tokenPrice,
            params.maxSpendPerBuyer,
            params.hardcap,
            params.softcap,
            params.liquidityPercent,
            params.listingRate,
            params.startTime,
            params.endTime,
            params.lockPeriod
        );

        // second part of launchpad initilization
        newLaunchpad.init2(
            _baseToken,
            _launchpadToken,
            LAUNCHPAD_SETTINGS.getTokenFee(),
            LAUNCHPAD_SETTINGS.getReferralFee(),
            LAUNCHPAD_SETTINGS.getBaseFeeReceiver(),
            LAUNCHPAD_SETTINGS.getSaleFeeReceiver(),
            _referralAddress
        );

        // register the created launchpad in factory
        ILaunchpadFactory(LAUNCHPAD_FACTORY).registerLaunchpad(
            address(newLaunchpad)
        );
    }

    /**
     *@notice calculates the amount of launchpad tokens to be required for creating a new launchpad
     *@dev this amount is sent to the new created launchpad contract
     */
    function calculateAmountRequired(
        uint256 _amount,
        uint256 _listingRate,
        uint256 _liquidityRate
    ) public view returns (uint256) {
        // calculate sale token fee
        uint256 tokenFee = LAUNCHPAD_SETTINGS.getTokenFee();
        uint256 feeAmount = _amount.mul(tokenFee).div(1000);

        // calculate required liquidity amount for locking
        uint256 liquidityRequired = _amount
            .mul(100 - _listingRate)
            .mul(_liquidityRate)
            .mul(1000 - tokenFee)
            .div(100000000);

        // calculate total required amount
        uint256 tokensRequiredForLaunchpad = _amount.add(liquidityRequired).add(
            feeAmount
        );
        return tokensRequiredForLaunchpad;
    }
}
