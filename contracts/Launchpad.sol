// SPDX-License-Identifier: MIT

/**
 * @title Launchpad of Pancake launchpad enviroment
 * @dev This contract represents a launchpad. A launchpad can be created and initilized by a
 * launchpad generator. Users can deposit base token if the launchpad is active and get an
 * amount of sale token in raltion to the token price. The sale tokens can be withdrawn if the
 * the launchpad is successful. Otherwise the users and the launchpad owner get back their
 * vested tokens. On launchpad success a pancakeswap liquidity pair will be created and the
 * specified amount of liquidity will be locked in pancake locker contract.
 */

pragma solidity 0.6.12;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IERC20Meta.sol";
import "../interfaces/ILaunchpadLockForwarder.sol";
import "../interfaces/ILaunchpadSettings.sol";
import "../interfaces/IWBNB.sol";
import "./TransferHelper.sol";

contract Launchpad is ReentrancyGuard {
    using SafeMath for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 public constant CONTRACT_VERSION = 1;

    /*---------------------------------------------------------------------------------------------
     * ------------------------------------Structs definitions-------------------------------------
     */

    // struct holding accounting information about a buyer
    struct BuyerInfo {
        uint256 baseDeposited; // amount of deposited base tokens
        uint256 tokensOwed; // amount of owed sale tokens
    }

    // struct holding information about the fees during the ilo
    struct LaunchpadFeeInfo {
        uint256 pancakeTokenFee; // fee on adding liquidity calculated on sale token (in parts per 1000)
        uint256 referralFee; // fee on adding liquidity calculated on baseFee and token fee (in parts per 1000)
        address payable baseFeeAddress; // address receiving base token fee amount
        address payable tokenFeeAddress; // address receiving sale token fee amount
        address payable referralFeeAddress; // address receiving referral fee amount in base and sale token
    }

    // struct holding information about the launchpad
    struct LaunchpadInfo {
        address payable launchpadOwner; // the owner address of the launchpad
        IERC20 sToken; // token to be sold in the launchpad (sale token)
        IERC20Meta bToken; // token to purchase the sale token (base token)
        uint256 amount; // min 10 000
        uint256 tokenPrice; // the amount of sale tokens received for one base token
        uint256 maxSpendPerBuyer; // the maximum amount to be spent by a specific buyer
        uint256 softCap; // minimum sold amount reached at end time for successful ilo
        uint256 hardcap; // amount to be reached for successful ilo
        uint256 liquidityPercentage; // min 250(=25%) max 1000(=100%)
        uint256 listingRate; // listing price of sale token on pancakeswap
        uint256 lockPeriod; // duration of the token lock in seconds (min 1 year)
        uint256 startTime; // the timestamp to start the launchpad
        uint256 endTime; // the timestamp to end the launchpad (max length of settings contract must be met)
        bool isBNB; // if the base token is native currency
    }

    // struct with information about the current launchpad status
    struct LaunchpadStatus {
        bool forceFailed; // if the ilo failed (is invalid)
        bool lpGenerationComplete; // if the lp generation was successful
        bool whitelistOnly; // allow deposits only for whitelisted users
        uint256 lpGenerationTimestamp; // set to block.timestamp when lpGenerationComplete is set to true
        uint256 totalBaseCollected; // tracks total collected amount of base tokens
        uint256 totalBaseWithdrawn; // tracks withdraws base tokens after failed ilo
        uint256 totalTokensSold; // tracks the total sold sale tokens
        uint256 totalTokensWithdrawn; // tracks withdraws sale tokens after successful ilo
        uint256 numBuyers; // total number of sale token buyers
        uint256 round1Length; // the length of round 1 in seconds
    }

    struct ReffrealDetails {
        address[3] reffers;
        bytes32[3] reffersSign;
    }

    /*---------------------------------------------------------------------------------------------
     * --------------------------------------Global Variables--------------------------------------
     */
    // struct variables holding launchpad information
    LaunchpadInfo public launchpadInfo;
    LaunchpadFeeInfo public launchpadFeeInfo;
    LaunchpadStatus public launchpadStatus;

    // interface variables
    ILaunchpadLockForwarder public immutable launchpadLockForwarder;
    ILaunchpadSettings public immutable launchpadSettings;
    IWBNB public immutable WBNB;

    // addresses used for access control
    address public immutable LAUNCHPAD_GENERATOR;
    address immutable KINKO_DEV;

    // variables holding information about users
    mapping(address => BuyerInfo) public buyers;
    mapping(address => uint256) public rewardTokens;



    EnumerableSet.AddressSet private whitelist;

    /*---------------------------------------------------------------------------------------------
     * ------------------------------------Initilize functions-------------------------------------
     */

    /**
     * @dev sets initially contract dependend addresses
     * @param _launchpadGenerator address of the launchpad generator
     * @param _wbnb address of the wrapped bnb contract
     * @param _launchpadSettings address of the settings contract
     * @param _launchpadLockForwarder address of LanchpadLockForwarder contract
     * @param _pancakeDev address of the developer account
     */
    constructor(
        address _launchpadGenerator,
        address _wbnb,
        address _launchpadSettings,
        address _launchpadLockForwarder,
        address _pancakeDev
    ) public {
        require(
            _launchpadGenerator != address(0) &&
                _wbnb != address(0) &&
                _launchpadSettings != address(0) &&
                _launchpadLockForwarder != address(0) &&
                _pancakeDev != address(0),
            "ZERO ADDRESS"
        );
        LAUNCHPAD_GENERATOR = _launchpadGenerator;
        WBNB = IWBNB(_wbnb);
        launchpadSettings = ILaunchpadSettings(_launchpadSettings);
        launchpadLockForwarder = ILaunchpadLockForwarder(
            _launchpadLockForwarder
        );
        KINKO_DEV = _pancakeDev;
    }

    /**
     * @notice first initilize function sets launchpad information by the launchpad generator
     * @dev this function can only be called by the launchpad generator
     * @param _launchpadOwner the owner address of the launchpad
     * @param _amount the total amount of sale tokens (min 10 000)
     * @param _tokenPrice the amount of sale tokens for one base token
     * @param _maxSpendPerBuyer the total amount of base token a specific buyer can spend
     * @param _hardcap the maximum amount of tokens to be reached for success
     * @param _softcap the minumum amount of tokens to be reached until end time for success
     * @param _liquidityPercent the percent of locked liquidity in parts per 1000 (min 250)
     * @param _listingRate the listing rate on pancakeswap
     * @param _startTime the timestamp to start launchpad
     * @param _endTime the timestamp of the launchpad end
     * @param _lockPeriod the duration of the locking period in seconds
     */
    function init1(
        address payable _launchpadOwner,
        uint256 _amount,
        uint256 _tokenPrice,
        uint256 _maxSpendPerBuyer,
        uint256 _hardcap,
        uint256 _softcap,
        uint256 _liquidityPercent,
        uint256 _listingRate,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _lockPeriod
    ) external {
        require(msg.sender == LAUNCHPAD_GENERATOR, "FORBIDDEN");
        launchpadInfo.launchpadOwner = _launchpadOwner;
        launchpadInfo.amount = _amount;
        launchpadInfo.tokenPrice = _tokenPrice;
        launchpadInfo.maxSpendPerBuyer = _maxSpendPerBuyer;
        launchpadInfo.hardcap = _hardcap;
        launchpadInfo.softCap = _softcap;
        launchpadInfo.liquidityPercentage = _liquidityPercent;
        launchpadInfo.listingRate = _listingRate;
        launchpadInfo.startTime = _startTime;
        launchpadInfo.endTime = _endTime;
        launchpadInfo.lockPeriod = _lockPeriod;
    }

    /**
     * @notice second initilize function sets launchpad information by the launchpad generator
     * @dev this function can only be called by the launchpad generator
     * @param _baseToken the token to purchase the sale token
     * @param _launchpadToken the token to be sold in the launchpad (sale token)
     * @param _pancakeTokenFee the fee on the sale token by adding liquidity in parts per 1000
     * @param _referralFee the fee calculated on base fee an token fee in parts per 1000
     * @param _baseFeeAddress the receiver of the base token fee amount
     * @param _tokenFeeAddress the receiver of the sale token fee amount
     * @param _referralAddress the receiver of the sale and base token referral fee amounts
     */
    function init2(
        IERC20Meta _baseToken,
        IERC20 _launchpadToken,
        uint256 _pancakeTokenFee,
        uint256 _referralFee,
        address payable _baseFeeAddress,
        address payable _tokenFeeAddress,
        address payable _referralAddress
    ) external {
        require(msg.sender == LAUNCHPAD_GENERATOR, "FORBIDDEN");

        launchpadInfo.isBNB = address(_baseToken) == address(WBNB);
        launchpadInfo.sToken = _launchpadToken;
        launchpadInfo.bToken = _baseToken;
        launchpadFeeInfo.pancakeTokenFee = _pancakeTokenFee;
        launchpadFeeInfo.referralFee = _referralFee;

        launchpadFeeInfo.baseFeeAddress = _baseFeeAddress;
        launchpadFeeInfo.tokenFeeAddress = _tokenFeeAddress;
        launchpadFeeInfo.referralFeeAddress = _referralAddress;
        launchpadStatus.round1Length = launchpadSettings.getRound1Length();
    }

    /*---------------------------------------------------------------------------------------------
     * -----------------------------------External user functions----------------------------------
     */
    /**
     * @notice has to be called after the launchpad was successful to end the launchpad.
     * @dev it creates a liquidity pair, locks liquidty and enables the withdraw of users sale tokens.
     */
    function addLiquidity() external nonReentrant {
        require(!launchpadStatus.lpGenerationComplete, "GENERATION COMPLETE");
        require(getLaunchpadStatus() == 2, "NOT SUCCESS");

        // abort the launch and set launchpad to failed if a pair already exists on pancakeswap
        if (
            launchpadLockForwarder.pancakeswapPairIsInitialised(
                address(launchpadInfo.sToken),
                address(launchpadInfo.bToken)
            )
        ) {
            launchpadStatus.forceFailed = true;
            return;
        }

        // calculate eneryFi fee on base token
        uint256 pancakeBaseFee = launchpadStatus
            .totalBaseCollected
            .mul(launchpadFeeInfo.pancakeTokenFee)
            .div(1000);

        // calculate liquidity amount of base token
        uint256 baseLiquidity = launchpadStatus
            .totalBaseCollected
            .sub(pancakeBaseFee)
            .mul(launchpadInfo.liquidityPercentage)
            .div(1000);

        // wrap BNB if base token is BNB
        if (launchpadInfo.isBNB) {
            WBNB.deposit{value: baseLiquidity}();
        }

        // approve lock forwarder with base token liquidity amount
        TransferHelper.safeApprove(
            address(launchpadInfo.bToken),
            address(launchpadLockForwarder),
            baseLiquidity
        );

        // calculate pancake sale token fee amount
        uint256 pancakeTokenFee = launchpadStatus
            .totalTokensSold
            .mul(launchpadFeeInfo.pancakeTokenFee)
            .div(1000);

        // calculate equivalent sale token liquidity amount
        uint256 tokenLiquidity = launchpadStatus
            .totalTokensSold
            .sub(pancakeTokenFee)
            .mul(100 - launchpadInfo.listingRate)
            .mul(launchpadInfo.liquidityPercentage)
            .div(100000);

        // approve lock forwarder with sale token liquidity amount
        TransferHelper.safeApprove(
            address(launchpadInfo.sToken),
            address(launchpadLockForwarder),
            tokenLiquidity
        );

        // create liquidity pool and lock liquidity
        launchpadLockForwarder.lockLiquidity(
            launchpadInfo.bToken,
            launchpadInfo.sToken,
            baseLiquidity,
            tokenLiquidity,
            block.timestamp.add(launchpadInfo.lockPeriod),
            launchpadInfo.launchpadOwner
        );

        // calculate referral fee on pancake base fee and kinko token fee
        if (launchpadFeeInfo.referralFeeAddress != address(0)) {
            // calculate base token referral fee
            uint256 referralBaseFee = pancakeBaseFee
                .mul(launchpadFeeInfo.referralFee)
                .div(1000);
            // send base token referral fee to referral receiver address
            TransferHelper.safeTransferBaseToken(
                address(launchpadInfo.bToken),
                launchpadFeeInfo.referralFeeAddress,
                referralBaseFee,
                !launchpadInfo.isBNB
            );
            pancakeBaseFee = pancakeBaseFee.sub(referralBaseFee);

            // calculate sale token referral fee
            uint256 referralTokenFee = pancakeTokenFee
                .mul(launchpadFeeInfo.referralFee)
                .div(1000);
            // send sale token referral fee to referral receiver address
            TransferHelper.safeTransfer(
                address(launchpadInfo.sToken),
                launchpadFeeInfo.referralFeeAddress,
                referralTokenFee
            );
            pancakeTokenFee = pancakeTokenFee.sub(referralTokenFee);
        }
        // transfer pancake base token fee to base token fee receiver
        TransferHelper.safeTransferBaseToken(
            address(launchpadInfo.bToken),
            launchpadFeeInfo.baseFeeAddress,
            pancakeBaseFee,
            !launchpadInfo.isBNB
        );
        // transfer pancake sale token fee to sale token fee receiver
        TransferHelper.safeTransfer(
            address(launchpadInfo.sToken),
            launchpadFeeInfo.tokenFeeAddress,
            pancakeTokenFee
        );

        uint256 remainingSBalance = launchpadInfo.sToken.balanceOf(
            address(this)
        );

        // burn unsold amount of sale tokens
        if (remainingSBalance > launchpadStatus.totalTokensSold) {
            uint256 burnAmount = remainingSBalance.sub(
                launchpadStatus.totalTokensSold
            );
            TransferHelper.safeTransfer(
                address(launchpadInfo.sToken),
                0x000000000000000000000000000000000000dEaD,
                burnAmount
            );
        }

        // send remaining base token balance to launchpad owner
        uint256 remainingBaseBalance = launchpadInfo.isBNB
            ? address(this).balance
            : launchpadInfo.bToken.balanceOf(address(this));
        TransferHelper.safeTransferBaseToken(
            address(launchpadInfo.bToken),
            launchpadInfo.launchpadOwner,
            remainingBaseBalance,
            !launchpadInfo.isBNB
        );

        // end launchpad by setting pair generation to true
        launchpadStatus.lpGenerationComplete = true;
        launchpadStatus.lpGenerationTimestamp = block.timestamp;
    }

    /**
     * @notice set the status of the launchpad to failed, if a the liquidity pair exists on
     * pancakeswap before the launchpad is successfully finished
     * @dev this function can be called by anyone and requires the launchpad to be active
     */
    function forceFailIfPairExists() external {
        require(
            !launchpadStatus.lpGenerationComplete &&
                !launchpadStatus.forceFailed,
            "LAUNCHPAD NOT ACTIVE"
        );
        if (
            launchpadLockForwarder.pancakeswapPairIsInitialised(
                address(launchpadInfo.sToken),
                address(launchpadInfo.bToken)
            )
        ) {
            launchpadStatus.forceFailed = true;
        }
    }

    /**
     * @notice deposits the given amount of base tokens and calculates the equivalent amount
     * of sale tokens owed by the caller.
     * @dev this function uses msg.value and ignores _amount param for BNB as base token.
     * The correct amount is required for ERC20 base tokens
     * @param _amount the amount of base token to deposit
     */
    function userDeposit(uint256 _amount, ReffrealDetails calldata _reffrealDetails)
        external
        payable
        nonReentrant
    {
        require(getLaunchpadStatus() == 1, "NOT ACTIVE");

        // check for whitelisted auction
        if (launchpadStatus.whitelistOnly) {
            require(whitelist.contains(msg.sender), "NOT WHITELISTED");
        }

        // check if token balance for round 1 deposit is met
        // round 1 deposits require the user to hold a specific token and balance
        if (
            block.timestamp <
            launchpadInfo.startTime.add(launchpadStatus.round1Length)
        ) {
            require(
                launchpadSettings.userHoldsSufficientRound1Token(msg.sender),
                "INSUFFICENT ROUND 1 TOKEN BALANCE"
            );
        }
        require(ver());

        // check if user is allowed to spend the desired token and calculate max amount
        BuyerInfo storage buyer = buyers[msg.sender];
        uint256 amount_in = launchpadInfo.isBNB ? msg.value : _amount;
        uint256 allowance = launchpadInfo.maxSpendPerBuyer.sub(
            buyer.baseDeposited
        );
        uint256 remaining = launchpadInfo.hardcap.sub(
            launchpadStatus.totalBaseCollected
        );
        allowance = allowance > remaining ? remaining : allowance;
        if (amount_in > allowance) {
            amount_in = allowance;
        }

        // calculate amount of sale token for deposit
        uint256 tokensSold = amount_in.mul(10**18).div(
            launchpadInfo.tokenPrice
        );
        require(tokensSold > 0, "ZERO TOKENS");

        // increase total number of buyers
        if (buyer.baseDeposited == 0) {
            launchpadStatus.numBuyers++;
        }

        // update buyer token information
        buyer.baseDeposited = buyer.baseDeposited.add(amount_in);
        buyer.tokensOwed = buyer.tokensOwed.add(tokensSold);

        //  calculate and add reward for lauchpad prompts
        uint256 reward = 0;
        require(_reffrealDetails.reffers.length<=3,"reffreal not be more than 3 level");
        if (_reffrealDetails.reffers.length != 0) {
            for (uint256 i = 0; i < _reffrealDetails.reffers.length; i++) {
                reward = tokensSold.mul(100).div(10000);

                if (_reffrealDetails.reffers[i] != address(0)) {
                    rewardTokens[_reffrealDetails.reffers[i]] = reward;
                }
            }
            reward = reward.mul(_reffrealDetails.reffers.length);
        }

        // update launchpad token information
        launchpadStatus.totalBaseCollected = launchpadStatus
            .totalBaseCollected
            .add(amount_in);
        launchpadStatus.totalTokensSold = launchpadStatus.totalTokensSold.add(
            tokensSold + reward
        );

        // transfer unused BNB back to user if base token is BNB
        if (launchpadInfo.isBNB && amount_in < msg.value) {
            msg.sender.transfer(msg.value.sub(amount_in));
        }

        // transfer non BNB base token to launchpad
        if (!launchpadInfo.isBNB) {
            TransferHelper.safeTransferFrom(
                address(launchpadInfo.bToken),
                msg.sender,
                address(this),
                amount_in
            );
        }
    }

    /**
     * @notice withdraws deposited base tokens of the caller if the launchpad failed
     */
    function userWithdrawBaseTokens() external nonReentrant {
        require(getLaunchpadStatus() == 3, "NOT FAILED");

        // calculate user base tokens to be withdrawn
        BuyerInfo storage buyer = buyers[msg.sender];
        uint256 baseDeposited = buyer.baseDeposited;
        require(baseDeposited > 0, "NOTHING TO WITHDRAW");

        // update deposited tokens value
        launchpadStatus.totalBaseWithdrawn = launchpadStatus
            .totalBaseWithdrawn
            .add(buyer.baseDeposited);
        buyer.baseDeposited = 0;

        // tranfer base token back to the depositor
        TransferHelper.safeTransferBaseToken(
            address(launchpadInfo.bToken),
            msg.sender,
            baseDeposited,
            !launchpadInfo.isBNB
        );
    }

    /**
     * @notice withdraws users sale token amount if the launchpad was successful and the
     * liquidity pool creation is completed.
     */
    function userWithdrawTokens() external nonReentrant {
        require(launchpadStatus.lpGenerationComplete, "AWAITING LP GENERATION");

        // get sale tokens amount to withdraw
        BuyerInfo storage buyer = buyers[msg.sender];
        uint256 tokensOwed = buyer.tokensOwed;
        require(tokensOwed > 0, "NOTHING TO WITHDRAW");

        // update withdrawn sale token amount
        launchpadStatus.totalTokensWithdrawn = launchpadStatus
            .totalTokensWithdrawn
            .add(buyer.tokensOwed);
        buyer.tokensOwed = 0;

        // transfer sale token to function caller
        TransferHelper.safeTransfer(
            address(launchpadInfo.sToken),
            msg.sender,
            tokensOwed
        );
    }

    function withdrawRewardTokens() external nonReentrant {
        require(launchpadStatus.lpGenerationComplete, "AWAITING LP GENERATION");

        // get sale tokens amount to withdraw
        uint256 reward = rewardTokens[msg.sender];
        require(reward > 0, "NOTHING TO WITHDRAW");

        // update withdrawn sale token amount
        launchpadStatus.totalTokensWithdrawn = launchpadStatus
            .totalTokensWithdrawn
            .add(reward);
        rewardTokens[msg.sender] = 0;

        // transfer sale token to function caller
        TransferHelper.safeTransfer(
            address(launchpadInfo.sToken),
            msg.sender,
            reward
        );
    }

    /*---------------------------------------------------------------------------------------------
     * ------------------------------------Only Owner functions------------------------------------
     */
    modifier onlyLaunchpadOwner() {
        require(
            launchpadInfo.launchpadOwner == msg.sender,
            "NOT LAUNCHPAD OWNER"
        );
        _;
    }

    /**
     * @notice update the whitelisted users by owner. Users can be added to or removed from whitelist
     * @param _users array of user addresses to be added to or removed from whitelist
     * @param _add indicating if the given user(s) should be added to(=true) or removed from (=false) whitelist
     */
    function editWhitelist(address[] memory _users, bool _add)
        external
        onlyLaunchpadOwner
    {
        if (_add) {
            for (uint256 i = 0; i < _users.length; i++) {
                whitelist.add(_users[i]);
            }
        } else {
            for (uint256 i = 0; i < _users.length; i++) {
                whitelist.remove(_users[i]);
            }
        }
    }

    /**
     * @notice withdraws all sale tokens by launchpad owner if the launchpad failed
     * the sale tokens are sent to the launchpad owner address
     */
    function ownerWithdrawTokens() external onlyLaunchpadOwner {
        require(getLaunchpadStatus() == 3, "NOT FAILED");
        TransferHelper.safeTransfer(
            address(launchpadInfo.sToken),
            launchpadInfo.launchpadOwner,
            launchpadInfo.sToken.balanceOf(address(this))
        );
    }

    /**
     * @notice sets if the launchpad is only for whitelisted users by launchpad owner
     */
    function setWhitelistFlag(bool _flag) external onlyLaunchpadOwner {
        launchpadStatus.whitelistOnly = _flag;
    }

    /**
     * @notice updates the start and end time of the launchpad by launchpad owner
     */
    function updateDuration(uint256 _startTime, uint256 _endTime)
        external
        onlyLaunchpadOwner
    {
        require(
            getLaunchpadStatus() == 0 &&
                launchpadInfo.startTime > block.timestamp,
            "LAUNCHPAD NOT ACTIVE"
        );
        require(
            _endTime.sub(_startTime) <=
                launchpadSettings.getMaxLaunchpadLength(),
            "DURATION TOO LONG"
        );
        launchpadInfo.startTime = _startTime;
        launchpadInfo.endTime = _endTime;
    }

    /**
     * @notice updates the limit a single user can spend on the launchpad
     */
    function updateMaxSpendLimit(uint256 _maxSpend)
        external
        onlyLaunchpadOwner
    {
        launchpadInfo.maxSpendPerBuyer = _maxSpend;
    }

    /*---------------------------------------------------------------------------------------------
     * ---------------------------------Only Pancake Dev functions--------------------------------
     */
    /**
     * @notice enegyFi developers can force a fail in case of an unintended behaviour
     * @dev security function to ensure the launchpad can be cancelled at any time to unlock funds
     */
    function forceFailByPancake() external {
        require(msg.sender == KINKO_DEV);
        launchpadStatus.forceFailed = true;
    }

    /*---------------------------------------------------------------------------------------------
     * --------------------------------------Getter functions--------------------------------------
     */
    /**
     * @notice returns the current status of the launchpad
     */
    function getLaunchpadStatus() public view returns (uint256) {
        if (launchpadStatus.forceFailed) {
            return 3; // launchpad failed
        }
        if (
            (block.timestamp > launchpadInfo.endTime) &&
            (launchpadStatus.totalBaseCollected < launchpadInfo.softCap)
        ) {
            return 3; // launchpad failed - softcap not met
        }
        if (launchpadStatus.totalBaseCollected >= launchpadInfo.hardcap) {
            return 2; // launchpad successful - hardcap met
        }
        if (
            (block.timestamp > launchpadInfo.endTime) &&
            (launchpadStatus.totalBaseCollected >= launchpadInfo.softCap)
        ) {
            return 2; // launchpad successful - softcap met
        }
        if (
            (block.timestamp >= launchpadInfo.startTime) &&
            (block.timestamp <= launchpadInfo.endTime)
        ) {
            return 1; // launchpad active
        }
        return 0; // launchpad not active yet
    }

    /**
     * @notice returns if a user if whitelisted
     * @param _user address of the user to be checked
     */
    function getUserWhitelistStatus(address _user)
        external
        view
        returns (bool)
    {
        return whitelist.contains(_user);
    }

    /**
     * @notice returns the users address at the given whitelist index
     * @param _index whitelist index
     */
    function getWhitelistedUserAtIndex(uint256 _index)
        external
        view
        returns (address)
    {
        return whitelist.at(_index);
    }

    /**
     * @notice returns the total number of whitelisted users
     */
    function getWhitelistedUsersLength() external view returns (uint256) {
        return whitelist.length();
    }
}
