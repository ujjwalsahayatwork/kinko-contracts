// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

/**
 * @title Interface of a wrapped BNB token
 * @dev This interface describes a wrapping ERC20 token for native BNB currency
 */
interface IWBNB {
    /**
     * @dev Deposits native currency by sending it with the function call and creates
     * an equivalent amount of ERC20 token known as wrapping. The equivalent amount of
     * wrapped tokens is added to the senders account.
     */
    function deposit() external payable;

    /**
     * @dev Moves `amount` tokens from the caller's account to `recipient`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Withraws the native currency for the given amount of wrapped token hold
     * by the function caller. The equivalent amount of native currency is sent to
     * the function caller.
     */
    function withdraw(uint256) external;
}
