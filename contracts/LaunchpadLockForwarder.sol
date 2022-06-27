// SPDX-License-Identifier: MIT

/**
 * @title Lock Forwarder of Pancake launchpad enviroment
 * @dev This contract checks if a pancake pair for the launchpad tokens exists
 * and locks liquidity by creating a LP on pancakeswap and forwards the LP token
 * to the pancakeLocker contract. The LP tokens will be locked in pancakeLocker.
 */

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/pancake/IPancakeFactory.sol";
import "../interfaces/pancake/IPancakePair.sol";
import "../interfaces/ILaunchpadFactory.sol";
import "../interfaces/IPancakeLocker.sol";
import "../interfaces/ILaunchpadLockForwarder.sol";

import "./TransferHelper.sol";

contract LaunchpadLockForwarder is ILaunchpadLockForwarder {
    ILaunchpadFactory public immutable LAUNCHPAD_FACTORY;
    IPancakeLocker public immutable KINKO_LOCKER;
    IPancakeFactory public immutable KINKO_FACTORY;

    /**
     * @dev sets initially contract dependend addresses
     * @param _launchpadFactory address of the launchpad factory
     * @param _pancakeFactory address of the pancake factory
     * @param _pancakeLocker address of the pancake locker contract
     */
    constructor(
        address _launchpadFactory,
        address _pancakeFactory,
        address _pancakeLocker
    ) public {
        require(
            _launchpadFactory != address(0) &&
                _pancakeFactory != address(0) &&
                _pancakeLocker != address(0),
            "ZERO ADDRESS"
        );
        LAUNCHPAD_FACTORY = ILaunchpadFactory(_launchpadFactory);
        KINKO_FACTORY = IPancakeFactory(_pancakeFactory);
        KINKO_LOCKER = IPancakeLocker(_pancakeLocker);
    }

    /**
     * @notice checks if a pancake pair with liquidity exists on pancakeswap for the given tokens
     * @param _token0 one address of the pancake pair base tokens
     * @param _token1 the other address of the pancake pair base tokens
     */
    function pancakeswapPairIsInitialised(address _token0, address _token1)
        external
        view
        override
        returns (bool)
    {
        // check for pancake pair
        address pairAddress = KINKO_FACTORY.getPair(_token0, _token1);
        if (pairAddress == address(0)) {
            return false;
        }

        // check for liquidity inside pair
        uint256 balance = IERC20(_token0).balanceOf(pairAddress);
        if (balance > 0) {
            return true;
        }
        return false;
    }

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
    ) external override {
        require(
            LAUNCHPAD_FACTORY.launchpadIsRegistered(msg.sender),
            "LAUNCHPAD NOT REGISTERED"
        );
        // get pancake pair if exists
        address pair = KINKO_FACTORY.getPair(
            address(_baseToken),
            address(_saleToken)
        );

        // create pancake pair if not exists
        if (pair == address(0)) {
            KINKO_FACTORY.createPair(
                address(_baseToken),
                address(_saleToken)
            );
            pair = KINKO_FACTORY.getPair(
                address(_baseToken),
                address(_saleToken)
            );
        }

        // transfer base token amount to pancake pair
        TransferHelper.safeTransferFrom(
            address(_baseToken),
            msg.sender,
            address(pair),
            _baseAmount
        );

        // transfer sale token amount to pancake pair
        TransferHelper.safeTransferFrom(
            address(_saleToken),
            msg.sender,
            address(pair),
            _saleAmount
        );

        // mint LP tokens
        IPancakePair(pair).mint(address(this));
        uint256 totalLPTokensMinted = IPancakePair(pair).balanceOf(
            address(this)
        );
        require(totalLPTokensMinted != 0, "LP creation failed");

        // approve locker contract with LP tokens
        TransferHelper.safeApprove(
            pair,
            address(KINKO_LOCKER),
            totalLPTokensMinted
        );

        // ensure max lock date
        uint256 unlock_date = _unlockDate > 9999999999
            ? 9999999999
            : _unlockDate;

        // lock the LP token with pancake locker contract
        KINKO_LOCKER.lockLPToken(
            pair,
            totalLPTokensMinted,
            unlock_date,
            address(0),
            true,
            _withdrawer
        );
    }
}
