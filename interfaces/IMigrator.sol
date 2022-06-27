// SPDX-License-Identifier: MIT

/**
 * @title Migrator Interface of the Pancake launchpad enviroment
 * @dev This interface describes the Migrator which is responsible for migrating locks.
 * It is called from the pancakeLocker contract to migrate a lock to an other contract.
 */

pragma solidity 0.6.12;

interface IMigrator {
    /**
     * @notice migrates an existing lock
     * @dev is called from PancakeLocker contract
     * @param lpToken address of the LP token to be migrated
     * @param amount total amount to be migrated
     * @param unlockDate unix timestamp of the date to unlock locked LP tokens
     * @param owner address of the lock owner
     */
    function migrate(
        address lpToken,
        uint256 amount,
        uint256 unlockDate,
        address owner
    ) external returns (bool);
}
