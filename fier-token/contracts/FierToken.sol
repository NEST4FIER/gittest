// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title FIER Token
/// @notice A standard ERC-20 token.
///         - All 1,000,000,000 FIER are created once, when the contract is deployed,
///           and sent to the wallet that deploys it.
///         - Nobody (not even the creator) can ever create more.
///         - Any holder can burn (permanently destroy) their own FIER.
contract FierToken is ERC20, ERC20Burnable {
    /// @notice Every FIER that will ever exist: 1 billion, with 18 decimal places.
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10 ** 18;

    constructor() ERC20("FIER", "FIER") {
        _mint(msg.sender, TOTAL_SUPPLY);
    }
}
