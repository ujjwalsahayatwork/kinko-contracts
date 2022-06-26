// SPDX-License-Identifier: MIT

/**
 * @title TransferHelper of Pancake launchpad enviroment
 * @dev This library holds function to transfer tokens safely. It allows safe transfer
 * for BNB as well as ERC20 tokens from a sender to a receiver. The ERC20 token functions
 * are used with low level call function.
 */

pragma solidity 0.6.12;

library TransferHelper {
    /**
     * @notice calls the aprove function of a given token in a safe way
     * @dev uses low level call and reverts on fail
     * @param token address of the base token to be transferred
     * @param to address of token spender (allowed to call transferFrom)
     * @param value amount of tokens to transfer
     */
    function safeApprove(
        address token,
        address to,
        uint256 value
    ) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(0x095ea7b3, to, value)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "TransferHelper: APPROVE_FAILED"
        );
    }

    /**
     * @notice calls the transfer function of a given token in a safe way
     * @dev uses low level call and reverts on fail
     * @param token address of the base token to be transferred
     * @param to address of token receiver
     * @param value amount of tokens to transfer
     */
    function safeTransfer(
        address token,
        address to,
        uint256 value
    ) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(0xa9059cbb, to, value)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "TransferHelper: TRANSFER_FAILED"
        );
    }

    /**
     * @notice calls the transferFrom function of a given token in a safe way
     * @dev transfers needs to be approved first. uses low level call and reverts on fail
     * @param token address of the base token to be transferred
     * @param from address of token sender
     * @param to address of token receiver
     * @param value amount of tokens to transfer
     */
    function safeTransferFrom(
        address token,
        address from,
        address to,
        uint256 value
    ) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(0x23b872dd, from, to, value)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "TransferHelper: TRANSFER_FROM_FAILED"
        );
    }

    /**
     * @notice calls the transfer function of a given token in a safe way or transfers BNB
     * if base token is not a ERC20 token
     * @dev uses low level call and reverts on fail
     * @param token address of the base token to be transferred
     * @param to address of the token receiver
     * @param value amount of tokens to transfer
     * @param isERC20 bool to indicate if the base token in BNB (=false) or ERC20 token (=true)
     */
    function safeTransferBaseToken(
        address token,
        address payable to,
        uint256 value,
        bool isERC20
    ) internal {
        if (!isERC20) {
            to.transfer(value);
        } else {
            (bool success, bytes memory data) = token.call(
                abi.encodeWithSelector(0xa9059cbb, to, value)
            );
            require(
                success && (data.length == 0 || abi.decode(data, (bool))),
                "TransferHelper: TRANSFER_FAILED"
            );
        }
    }
}
