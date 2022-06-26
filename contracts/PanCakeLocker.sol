// SPDX-License-Identifier: MIT

/**
 * @title Locker of Pancake launchpad enviroment
 * @dev This contract manages locks of energyFiswap LP tokens. LP tokens can be locked for
 * a specific time, locks can be incremented, split up into multiple locks, relocked and
 * withdrawn by owner if the unlock date is met.
 */

pragma solidity 0.6.12;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/energyFi/IPancakePair.sol";
import "../interfaces/energyFi/IPancakeFactory.sol";
import "../interfaces/IERC20Burn.sol";
import "../interfaces/IMigrator.sol";
import "../interfaces/IPancakeLocker.sol";

import "./TransferHelper.sol";

contract PancakeLocker is IPancakeLocker, Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    /*---------------------------------------------------------------------------------------------
     * -------------------------------------------Structs-------------------------------------------
     */

    // holding lock information for user
    struct UserInfo {
        EnumerableSet.AddressSet lockedTokens; // list of locked LP tokens by user
        mapping(address => uint256[]) locksForToken;
    }

    // holding information about a token lock
    struct TokenLock {
        uint256 lockDate; // unix timestamp of locking date
        uint256 amount; // current amount in the lock
        uint256 initialAmount; // total amount added initially on locking
        uint256 unlockDate; // unix timestamp for ealiest unlock
        uint256 lockID; // unique identifier of a token lcok
        address owner; // owner address of the locked token allowed for access control
    }

    // holding information about the fees for a lock
    struct FeeStruct {
        uint256 bnbFee; // bnb fee charged on non whitelisted locking
        IERC20Burn secondaryFeeToken; // fee token optional to bnb
        uint256 secondaryTokenFee; // realative fee on fee token in parts per 1000
        uint256 secondaryTokenDiscount; // discount on liquidity fee
        uint256 liquidityFee; // fee on LP tokens
        uint256 referralPercent; // relative fee for referral in parts per 1000
        IERC20Burn referralToken; // token referrer has to hold
        uint256 referralHold; // amount of referral token referrer has to hold
        uint256 referralDiscount; // discount on fees for providing valid referrer
    }

    mapping(address => UserInfo) private users; // user infos for each user
    mapping(address => TokenLock[]) public tokenLocks; // token lock info for each LP token

    EnumerableSet.AddressSet private feeWhitelist; // addresses for locking without fees
    EnumerableSet.AddressSet private lockedTokens; // addresses of locked LP tokens

    FeeStruct public fees; // holding all fee information

    address payable public devaddr; // receiving fees
    address public migrator; //migrates locks
    IPancakeFactory public immutable KINKO_FACTORY; // factory of the LP token

    /*---------------------------------------------------------------------------------------------
     * -------------------------------------------Events-------------------------------------------
     */
    event onDeposit(
        address indexed lpToken,
        address indexed user,
        uint256 amount,
        uint256 lockDate,
        uint256 unlockDate
    );
    event onWithdraw(address indexed lpToken, uint256 amount);

    /**
     * @dev sets initially contract dependend addresses and fee parameter
     * @param _energyFiFactory address of the energyFi factory
     */
    constructor(address _energyFiFactory) public {
        require(_energyFiFactory != address(0), "ZERO ADDRESS");
        KINKO_FACTORY = IPancakeFactory(_energyFiFactory);
        devaddr = msg.sender;

        fees.referralPercent = 250; // 250/1000 => 25%
        fees.bnbFee = 1 ether;
        fees.secondaryTokenFee = 100 ether;
        fees.secondaryTokenDiscount = 200;
        fees.liquidityFee = 10;
        fees.referralHold = 10 ether;
        fees.referralDiscount = 100;
    }

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
    ) external payable override nonReentrant {
        require(_unlockDate < 10000000000, "TIMESTAMP INVALID");
        require(_amount > 0, "INSUFFICIENT");

        // get LP from energyFi factory
        IPancakePair lpair = IPancakePair(address(_lpToken));
        address factoryPairAddress = KINKO_FACTORY.getPair(
            lpair.token0(),
            lpair.token1()
        );
        require(factoryPairAddress == address(_lpToken), "NOT CAKE");

        // transfer lock amount to energyFi locker
        TransferHelper.safeTransferFrom(
            _lpToken,
            address(msg.sender),
            address(this),
            _amount
        );

        // check if referrer holds sufficient referral token
        if (
            _referral != address(0) && address(fees.referralToken) != address(0)
        ) {
            require(
                fees.referralToken.balanceOf(_referral) >= fees.referralHold,
                "INADEQUATE BALANCE"
            );
        }

        // caller not whitelisted - charge fees
        if (!feeWhitelist.contains(msg.sender)) {
            // charge fee with BNB token
            if (_feeInGlmr) {
                uint256 bnbFee = fees.bnbFee;
                // calculate discounted fee for providing valid referrer
                if (_referral != address(0)) {
                    bnbFee = bnbFee.mul(1000 - fees.referralDiscount).div(1000);
                }
                require(msg.value == bnbFee, "FEE NOT MET");

                // calculate referral fee
                uint256 devFee = bnbFee;
                if (bnbFee != 0 && _referral != address(0)) {
                    uint256 referralFee = devFee.mul(fees.referralPercent).div(
                        1000
                    );
                    _referral.transfer(referralFee);
                    devFee = devFee.sub(referralFee);
                }
                // transfer referral fee
                devaddr.transfer(devFee);
            } else {
                // burn fee in non BNB token
                uint256 burnFee = fees.secondaryTokenFee;
                // calculate discounted fee for providing valid referrer
                if (_referral != address(0)) {
                    burnFee = burnFee.mul(1000 - fees.referralDiscount).div(
                        1000
                    );
                }
                TransferHelper.safeTransferFrom(
                    address(fees.secondaryFeeToken),
                    address(msg.sender),
                    address(this),
                    burnFee
                );
                // calculate and transfer referral fee
                if (fees.referralPercent != 0 && _referral != address(0)) {
                    uint256 referralFee = burnFee.mul(fees.referralPercent).div(
                        1000
                    );
                    TransferHelper.safeApprove(
                        address(fees.secondaryFeeToken),
                        _referral,
                        referralFee
                    );
                    TransferHelper.safeTransfer(
                        address(fees.secondaryFeeToken),
                        _referral,
                        referralFee
                    );
                    burnFee = burnFee.sub(referralFee);
                }
                // burn remaining fee tokens
                fees.secondaryFeeToken.burn(burnFee);
            }
        } else if (msg.value > 0) {
            // send back BNB for whitelisted callers
            msg.sender.transfer(msg.value);
        }

        // calculate liquidity fee and send to dev address
        uint256 liquidityFee = _amount.mul(fees.liquidityFee).div(1000);
        if (!_feeInGlmr && !feeWhitelist.contains(msg.sender)) {
            liquidityFee = liquidityFee
                .mul(1000 - fees.secondaryTokenDiscount)
                .div(1000);
        }
        TransferHelper.safeTransfer(_lpToken, devaddr, liquidityFee);
        uint256 amountLocked = _amount.sub(liquidityFee);

        // set variables for token lock
        TokenLock memory token_lock;
        token_lock.lockDate = block.timestamp;
        token_lock.amount = amountLocked;
        token_lock.initialAmount = amountLocked;
        token_lock.unlockDate = _unlockDate;
        token_lock.lockID = tokenLocks[_lpToken].length;
        token_lock.owner = _withdrawer;

        // update LP token with token lock
        tokenLocks[_lpToken].push(token_lock);
        lockedTokens.add(_lpToken);

        // update user with locked LP token
        UserInfo storage user = users[_withdrawer];
        user.lockedTokens.add(_lpToken);
        uint256[] storage user_locks = user.locksForToken[_lpToken];
        user_locks.push(token_lock.lockID);

        emit onDeposit(
            _lpToken,
            msg.sender,
            token_lock.amount,
            token_lock.lockDate,
            token_lock.unlockDate
        );
    }

    /**
     * @notice relocks the locked LP token by lock owner. A liquidity fee is calculated on
     * the locking amount. The new locking amount is old locking amount minus liquidity fee.
     * @param _lpToken address of the LP token to be relocked
     * @param _index position of the lock in the user locks for specific LP token set
     * @param _lockID unique identifier of the token lock
     * @param _unlockDate unix timestamp when withdrawer is allowed to unlock LP tokens
     */
    function relock(
        address _lpToken,
        uint256 _index,
        uint256 _lockID,
        uint256 _unlockDate
    ) external nonReentrant {
        require(_unlockDate < 10000000000, "TIMESTAMP INVALID");

        // check if lock is valid and sender is owner
        uint256 lockID = users[msg.sender].locksForToken[_lpToken][_index];
        TokenLock storage tokenLock = tokenLocks[_lpToken][lockID];
        require(
            lockID == _lockID && tokenLock.owner == msg.sender,
            "LOCK MISMATCH"
        );
        // check if unlock timestamp is met to update LP tokens lock
        require(tokenLock.unlockDate < _unlockDate, "UNLOCK BEFORE");

        // calculate liquidity fee and new locking amount
        uint256 liquidityFee = tokenLock.amount.mul(fees.liquidityFee).div(
            1000
        );
        uint256 amountLocked = tokenLock.amount.sub(liquidityFee);

        // update lock parameter with new locking amount and unlock date
        tokenLock.amount = amountLocked;
        tokenLock.unlockDate = _unlockDate;

        // transfer liquidity fee to developer address
        TransferHelper.safeTransfer(_lpToken, devaddr, liquidityFee);
    }

    /**
     * @notice withdraws the desired amount of locked token by lock owner. Unlock timestamp
     * has to be met.
     * @param _lpToken address of the LP token to be withdrawn
     * @param _index position of the lock in the user locks for specific LP token set
     * @param _lockID unique identifier of the token lock
     * @param _amount amount to be withdrawn from the lock
     */
    function withdraw(
        address _lpToken,
        uint256 _index,
        uint256 _lockID,
        uint256 _amount
    ) external nonReentrant {
        require(_amount > 0, "ZERO WITHDRAWL");

        // check if lock is valid and sender is owner
        uint256 lockID = users[msg.sender].locksForToken[_lpToken][_index];
        TokenLock storage userLock = tokenLocks[_lpToken][lockID];
        require(
            lockID == _lockID && userLock.owner == msg.sender,
            "LOCK MISMATCH"
        );
        // check if unlock timestamp is met to update LP tokens lock
        require(userLock.unlockDate < block.timestamp, "NOT YET");
        userLock.amount = userLock.amount.sub(_amount);

        // remove lock if total amount is withdrawn
        if (userLock.amount == 0) {
            uint256[] storage userLocks = users[msg.sender].locksForToken[
                _lpToken
            ];
            userLocks[_index] = userLocks[userLocks.length - 1];
            userLocks.pop();
            // remove users locked tokens if user has no other locks for same LP left
            if (userLocks.length == 0) {
                users[msg.sender].lockedTokens.remove(_lpToken);
            }
        }

        // transfer desired unlocked amount to caller (lock owner)
        TransferHelper.safeTransfer(_lpToken, msg.sender, _amount);
        emit onWithdraw(_lpToken, _amount);
    }

    /**
     * @notice increments the locked LP tokens amount by lock owner. A liquidity fee is
     * charged on sending additional tokens to the locking contract.
     * @param _lpToken address of the LP token to increment lock
     * @param _index position of the lock in the user locks for specific LP token set
     * @param _lockID unique identifier of the token lock
     * @param _amount additional LP amount to be locked
     */
    function incrementLock(
        address _lpToken,
        uint256 _index,
        uint256 _lockID,
        uint256 _amount
    ) external nonReentrant {
        require(_amount > 0, "ZERO AMOUNT");

        // check if lock is valid and sender is owner
        uint256 lockID = users[msg.sender].locksForToken[_lpToken][_index];
        TokenLock storage userLock = tokenLocks[_lpToken][lockID];
        require(
            lockID == _lockID && userLock.owner == msg.sender,
            "LOCK MISMATCH"
        );

        // transfer desired additional LP lock amount
        TransferHelper.safeTransferFrom(
            _lpToken,
            address(msg.sender),
            address(this),
            _amount
        );

        // calculate and transfer liquidity fee to developer address
        uint256 liquidityFee = _amount.mul(fees.liquidityFee).div(1000);
        TransferHelper.safeTransfer(_lpToken, devaddr, liquidityFee);

        // increment amount in token lock
        uint256 amountLocked = _amount.sub(liquidityFee);
        userLock.amount = userLock.amount.add(amountLocked);

        emit onDeposit(
            _lpToken,
            msg.sender,
            amountLocked,
            userLock.lockDate,
            userLock.unlockDate
        );
    }

    /**
     * @notice splits up a specific token lock and creates an other new token lock with
     * the given amount. The existing token lock is reduced by the equivalent amount.
     * @dev a fee in BNB (bnbFee) is required to be sent by calling to create a new lock
     * @param _lpToken address of the LP token to be split up
     * @param _index position of the lock in the user locks for specific LP token set
     * @param _lockID unique identifier of the token lock to be split up
     * @param _amount LP amount to create a new lock with
     */
    function splitLock(
        address _lpToken,
        uint256 _index,
        uint256 _lockID,
        uint256 _amount
    ) external payable nonReentrant {
        require(_amount > 0, "ZERO AMOUNT");

        // check if lock is valid and sender is owner
        uint256 lockID = users[msg.sender].locksForToken[_lpToken][_index];
        TokenLock storage userLock = tokenLocks[_lpToken][lockID];
        require(
            lockID == _lockID && userLock.owner == msg.sender,
            "LOCK MISMATCH"
        );

        // trasnfer BNB as fee to developer address
        require(msg.value == fees.bnbFee, "FEE NOT MET");
        devaddr.transfer(fees.bnbFee);

        // reduce existing lock amount with given amount
        userLock.amount = userLock.amount.sub(_amount);

        // create new lock with given amount
        TokenLock memory token_lock;
        token_lock.lockDate = userLock.lockDate;
        token_lock.amount = _amount;
        token_lock.initialAmount = _amount;
        token_lock.unlockDate = userLock.unlockDate;
        token_lock.lockID = tokenLocks[_lpToken].length;
        token_lock.owner = msg.sender;
        tokenLocks[_lpToken].push(token_lock);

        // update users locks
        UserInfo storage user = users[msg.sender];
        uint256[] storage user_locks = user.locksForToken[_lpToken];
        user_locks.push(token_lock.lockID);
    }

    /**
     * @notice transfers the lock owner ship to a new owner by the current owner
     * @param _lpToken address of the LP token to transfer the ownership of the lock for
     * @param _index position of the lock in the user locks for specific LP token set
     * @param _lockID unique identifier of the token lock to be split up
     * @param _newOwner address of the new lock owner
     */
    function transferLockOwnership(
        address _lpToken,
        uint256 _index,
        uint256 _lockID,
        address payable _newOwner
    ) external {
        require(
            msg.sender != _newOwner && msg.sender != address(0),
            "INVALID ADDRESS"
        );
        // check if lock is valid and sender is owner
        uint256 lockID = users[msg.sender].locksForToken[_lpToken][_index];
        TokenLock storage transferredLock = tokenLocks[_lpToken][lockID];
        require(
            lockID == _lockID && transferredLock.owner == msg.sender,
            "LOCK MISMATCH"
        );

        // add lock information to the new owner
        UserInfo storage user = users[_newOwner];
        user.lockedTokens.add(_lpToken);
        uint256[] storage newOwnerLocks = user.locksForToken[_lpToken];
        newOwnerLocks.push(transferredLock.lockID);

        // remove lock information from old owner
        uint256[] storage oldOwnerLocks = users[msg.sender].locksForToken[
            _lpToken
        ];
        oldOwnerLocks[_index] = oldOwnerLocks[oldOwnerLocks.length - 1];
        oldOwnerLocks.pop();
        if (oldOwnerLocks.length == 0) {
            users[msg.sender].lockedTokens.remove(_lpToken);
        }
        transferredLock.owner = _newOwner;
    }

    /**
     * @notice migrates a existing lock to an other contract with help of migrator
     * @param _lpToken address of the LP token to migrate the lock for
     * @param _index position of the lock in the user locks for specific LP token set
     * @param _lockID unique identifier of the token lock to be split up
     * @param _amount amount of locked LP token to be migrated
     */
    function migrate(
        address _lpToken,
        uint256 _index,
        uint256 _lockID,
        uint256 _amount
    ) external nonReentrant {
        require(migrator != address(0), "NOT SET");
        require(_amount > 0, "ZERO MIGRATION");

        // check if lock is valid and sender is owner
        uint256 lockID = users[msg.sender].locksForToken[_lpToken][_index];
        TokenLock storage userLock = tokenLocks[_lpToken][lockID];
        require(
            lockID == _lockID && userLock.owner == msg.sender,
            "LOCK MISMATCH"
        );

        // decreases lock amount
        userLock.amount = userLock.amount.sub(_amount);

        // removes lock if total left amount is migrated
        if (userLock.amount == 0) {
            uint256[] storage userLocks = users[msg.sender].locksForToken[
                _lpToken
            ];
            userLocks[_index] = userLocks[userLocks.length - 1];
            userLocks.pop();
            // remove lock from user if no lock for same LP is left
            if (userLocks.length == 0) {
                users[msg.sender].lockedTokens.remove(_lpToken);
            }
        }

        // migrate token with migrator
        TransferHelper.safeApprove(_lpToken, migrator, _amount);
        IMigrator(migrator).migrate(
            _lpToken,
            _amount,
            userLock.unlockDate,
            msg.sender
        );
    }

    /*---------------------------------------------------------------------------------------------
     * --------------------------------------Setter functions--------------------------------------
     */

    /**
     * @notice set the dev address for receiving fees by owner
     * @param _devaddr fee receiver address
     */
    function setDev(address payable _devaddr) external onlyOwner {
        devaddr = _devaddr;
    }

    /**
     * @notice set the fees and fee tokens by owner
     * @param _referralPercent relative referral fee in parts per 1000
     * @param _referralDiscount relative discount fee in parts per 1000
     * @param _bnbFee BNB fee charged on lock creation for BNB base tokens
     * @param _secondaryTokenFee fee charged on locking non BNB base token
     * @param _secondaryTokenDiscount discount on liquidity fee
     * @param _liquidityFee fee on LP tokens
     */
    function setFees(
        uint256 _referralPercent,
        uint256 _referralDiscount,
        uint256 _bnbFee,
        uint256 _secondaryTokenFee,
        uint256 _secondaryTokenDiscount,
        uint256 _liquidityFee
    ) external onlyOwner {
        fees.referralPercent = _referralPercent;
        fees.referralDiscount = _referralDiscount;
        fees.bnbFee = _bnbFee;
        fees.secondaryTokenFee = _secondaryTokenFee;
        fees.secondaryTokenDiscount = _secondaryTokenDiscount;
        fees.liquidityFee = _liquidityFee;
    }

    /**
     * @notice set the referral token and amount to hold by a referrer
     * @param _referralToken address of burnable ERC20 token
     * @param _hold amount of referral token a referrer has to hold
     */
    function setReferralTokenAndHold(IERC20Burn _referralToken, uint256 _hold)
        external
        onlyOwner
    {
        fees.referralToken = _referralToken;
        fees.referralHold = _hold;
    }

    /**
     * @notice set secondary fee token as option to bnb as fee by owner
     * @param _secondaryFeeToken address of burnable ERC20 token
     */
    function setSecondaryFeeToken(address _secondaryFeeToken)
        external
        onlyOwner
    {
        fees.secondaryFeeToken = IERC20Burn(_secondaryFeeToken);
    }

    /**
     * @notice set migrator by owner
     * @param _migrator address of the new migrator contract
     */
    function setMigrator(address _migrator) external onlyOwner {
        migrator = _migrator;
    }

    /**
     * @notice whitelists a user by owner
     * @param _user address of the user to whitelist
     * @param _add bool if the given user should be added to (=true) or removed from (=false) whitelist
     */
    function whitelistFeeAccount(address _user, bool _add) external onlyOwner {
        if (_add) {
            feeWhitelist.add(_user);
        } else {
            feeWhitelist.remove(_user);
        }
    }

    /*---------------------------------------------------------------------------------------------
     * --------------------------------------Getter functions--------------------------------------
     */

    /**
     * @notice returns address of a LP token at a specific index of the set
     */
    function getLockedTokenAtIndex(uint256 _index)
        external
        view
        returns (address)
    {
        return lockedTokens.at(_index);
    }

    /**
     * @notice returns the total number of locks for given token
     * @param _lpToken address of token to get amount of locks for
     */
    function getNumLocksForToken(address _lpToken)
        external
        view
        returns (uint256)
    {
        return tokenLocks[_lpToken].length;
    }

    /**
     * @notice returns the total number of different locked lp tokens
     */
    function getNumLockedTokens() external view returns (uint256) {
        return lockedTokens.length();
    }

    /**
     * @notice returns the LP token address at a given index of the users set
     * @param _user address of the user
     * @param _index position of LP token in users lockedTokens set
     */
    function getUserLockedTokenAtIndex(address _user, uint256 _index)
        external
        view
        returns (address)
    {
        UserInfo storage user = users[_user];
        return user.lockedTokens.at(_index);
    }

    /**
     * @notice returns the token lock of a given position in the users lp token lock set
     * @param _user address of the user
     * @param _lpToken address of LP token
     * @param _index position of the token lock in the users token lock set for specific LP
     */
    function getUserLockForTokenAtIndex(
        address _user,
        address _lpToken,
        uint256 _index
    )
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            address
        )
    {
        uint256 lockID = users[_user].locksForToken[_lpToken][_index];
        TokenLock storage tokenLock = tokenLocks[_lpToken][lockID];
        return (
            tokenLock.lockDate,
            tokenLock.amount,
            tokenLock.initialAmount,
            tokenLock.unlockDate,
            tokenLock.lockID,
            tokenLock.owner
        );
    }

    /**
     * @notice returns the amount of different locked LP tokens for a given user
     * @param _user address of user to be checked
     */
    function getUserNumLockedTokens(address _user)
        external
        view
        returns (uint256)
    {
        UserInfo storage user = users[_user];
        return user.lockedTokens.length();
    }

    /**
     * @notice returns the amount of users locks for a specific LP token
     * @param _user address of the user
     * @param _lpToken address of LP token
     */
    function getUserNumLocksForToken(address _user, address _lpToken)
        external
        view
        returns (uint256)
    {
        UserInfo storage user = users[_user];
        return user.locksForToken[_lpToken].length;
    }

    /**
     * @notice returns if the given user is whitelisted
     * @param _user users address to be checked
     */
    function getUserWhitelistStatus(address _user)
        external
        view
        returns (bool)
    {
        return feeWhitelist.contains(_user);
    }

    /**
     * @notice returns the address of the user at a given index of the whitelist set
     * @param _index position of the user in the whitelist
     */
    function getWhitelistedUserAtIndex(uint256 _index)
        external
        view
        returns (address)
    {
        return feeWhitelist.at(_index);
    }

    /**
     * @notice returns the total amout of whitelisted users
     */
    function getWhitelistedUsersLength() external view returns (uint256) {
        return feeWhitelist.length();
    }
}
