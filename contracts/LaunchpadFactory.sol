// SPDX-License-Identifier: MIT

/**
 * @title Factory of Pancake launchpad enviroment
 * @dev This contract registeres launchpads and launchpad generators. Launchpad generators can be
 * registered by the contract owner (admin) and launchpads can only be registered by launchpad
 * generators.
 */
 
pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "../interfaces/ILaunchpadFactory.sol";

contract LaunchpadFactory is ILaunchpadFactory, Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;

    // holding all launchpad addresses registered by generator
    EnumerableSet.AddressSet private launchpads;

    // holding all generators addresses registered by owner (admin)
    EnumerableSet.AddressSet private launchpadGenerators;

    event launchpadRegistered(address indexed launchpadContract);

    /*---------------------------------------------------------------------------------------------
     * ------------------------------------Only owner function-------------------------------------
     */

    /**
     * @notice adds or removes a launchpad generator to the factory by owner
     * @param _address address of the launchpad generator to be added
     * @param _allow bool if the generator should be added(=true) or removed(=false)
     */
    function adminAllowLaunchpadGenerator(address _address, bool _allow)
        external
        onlyOwner
    {
        require(_address != address(0), "ZERO ADDRESS");

        if (_allow) {
            launchpadGenerators.add(_address);
        } else {
            launchpadGenerators.remove(_address);
        }
    }

    /*---------------------------------------------------------------------------------------------
     * ----------------------------------Only generator function-----------------------------------
     */

    /**
     * @notice adds a launchpad to factory by generator
     * @param _launchpadAddress address of the launchpad to be added
     */
    function registerLaunchpad(address _launchpadAddress) external override {
        require(launchpadGenerators.contains(msg.sender), "FORBIDDEN");
        launchpads.add(_launchpadAddress);
        emit launchpadRegistered(_launchpadAddress);
    }

    /*---------------------------------------------------------------------------------------------
     * --------------------------------------Getter functions--------------------------------------
     */

    /**
     * @notice returns the address of a launchpad at a given index
     * @param _index index of the launchpads address set
     */
    function launchpadAtIndex(uint256 _index)
        external
        view
        override
        returns (address)
    {
        return launchpads.at(_index);
    }

    /**
     * @notice returns the address of a launchpad generator at a given index
     * @param _index index of the launchpad generator address set
     */
    function launchpadGeneratorAtIndex(uint256 _index)
        external
        view
        override
        returns (address)
    {
        return launchpadGenerators.at(_index);
    }

    /**
     * @notice returns the total number of registered launchpad generators
     */
    function launchpadGeneratorsLength()
        external
        view
        override
        returns (uint256)
    {
        return launchpadGenerators.length();
    }

    /**
     * @notice returns if a given address is registered as a launchpad
     * @param _launchpadAddress address of the lauchpad to be checked
     */
    function launchpadIsRegistered(address _launchpadAddress)
        external
        view
        override
        returns (bool)
    {
        return launchpads.contains(_launchpadAddress);
    }

    /**
     * @notice returns the total number of registered launchpads
     */
    function launchpadsLength() external view override returns (uint256) {
        return launchpads.length();
    }
}
