// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FierToken} from "../FierToken.sol";

/// @dev Test-only helper that lets the tests jump the mining state around. Never deploy this.
contract FierTokenHarness is FierToken {
    function setMiningTarget(uint256 target) external {
        miningTarget = target;
    }

    function setRewardCount(uint256 count) external {
        rewardCount = count;
    }

    function setTotalMined(uint256 amount) external {
        totalMined = amount;
    }

    function adjustDifficulty() external {
        _adjustDifficulty();
    }
}
