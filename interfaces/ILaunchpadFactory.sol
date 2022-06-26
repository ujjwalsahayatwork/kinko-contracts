// SPDX-License-Identifier: MIT

/**
 * @title Factory interface of Pancake launchpad enviroment
 * @dev This interface holds functions for registering launchpads and get information about
 * registered launchpads and launchpad generators.
 */

pragma solidity 0.6.12;

interface ILaunchpadFactory {
    /**
     * @notice adds a launchpad to factory by generator
     * @param _launchpadAddress address of the launchpad to be added
     */
    function registerLaunchpad(address _launchpadAddress) external;

    /**
     * @notice returns the address of a launchpad at a given index
     * @param _index index of the launchpads address set
     */
    function launchpadAtIndex(uint256 _index) external view returns (address);

    /**
     * @notice returns the address of a launchpad generator at a given index
     * @param _index index of the launchpad generator address set
     */
    function launchpadGeneratorAtIndex(uint256 _index)
        external
        view
        returns (address);

    /**
     * @notice returns the total number of registered launchpad generators
     */
    function launchpadGeneratorsLength() external view returns (uint256);

    /**
     * @notice returns if a given address is registered as a launchpad
     * @param _launchpadAddress address of the lauchpad to be checked
     */
    function launchpadIsRegistered(address _launchpadAddress)
        external
        view
        returns (bool);

    /**
     * @notice returns the total number of registered launchpads
     */
    function launchpadsLength() external view returns (uint256);
}
