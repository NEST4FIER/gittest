// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title FIER Token
/// @notice A people-powered ERC-20 token with Bitcoin-style mining.
///         - Hard cap: no more than 2,000,000,000 FIER can ever exist.
///         - 200,000,000 FIER (10%) go to the creator at launch, e.g. to start a trading pool.
///         - The other 1,800,000,000 FIER can only be created by mining. Anyone can mine by
///           solving a proof-of-work puzzle on their computer and calling `mine`.
///         - The mining reward starts at 5,000 FIER and halves every 180,000 rewards
///           (about every 3.4 years), like Bitcoin.
///         - The puzzle gets harder or easier by itself so a reward is found about every 10 minutes.
///         - Built-in voting power, so holders can vote on community decisions.
///         - No owner or admin: once deployed, nobody can change these rules.
contract FierToken is ERC20, ERC20Burnable, ERC20Permit, ERC20Votes {
    /// @notice The mission, stored on the blockchain forever.
    string public constant MISSION =
        "FIER: power to the people. Mined by the many, controlled by no one, to help restore democracy in the USA.";

    uint256 public constant MAX_SUPPLY = 2_000_000_000 * 10 ** 18;
    uint256 public constant CREATOR_SUPPLY = 200_000_000 * 10 ** 18;
    uint256 public constant MINEABLE_SUPPLY = MAX_SUPPLY - CREATOR_SUPPLY;

    uint256 public constant INITIAL_REWARD = 5_000 * 10 ** 18;
    uint256 public constant HALVING_INTERVAL = 180_000;
    uint256 public constant TARGET_TIME_PER_REWARD = 10 minutes;
    uint256 public constant ADJUSTMENT_INTERVAL = 144;
    /// @notice Hardest allowed puzzle (smaller target = harder).
    uint256 public constant MIN_TARGET = 2 ** 16;
    /// @notice Easiest allowed puzzle. About 4 million tries on average, so a normal computer can mine at launch.
    uint256 public constant MAX_TARGET = 2 ** 234;

    /// @notice The current puzzle. It changes every time someone mines a reward.
    bytes32 public challengeNumber;
    /// @notice A solution is valid when its hash, read as a number, is at or below this.
    uint256 public miningTarget;
    /// @notice How many mining rewards have been paid so far.
    uint256 public rewardCount;
    /// @notice Total FIER created by mining so far. Burning does not lower this.
    uint256 public totalMined;
    /// @notice When the difficulty was last adjusted.
    uint256 public lastAdjustmentTime;

    event Mined(address indexed miner, uint256 reward, uint256 rewardCount, bytes32 newChallengeNumber);

    error InvalidSolution();
    error MiningFinished();

    constructor() ERC20("FIER", "FIER") ERC20Permit("FIER") {
        _mint(msg.sender, CREATOR_SUPPLY);
        challengeNumber = keccak256(abi.encode(address(this), blockhash(block.number - 1)));
        miningTarget = MAX_TARGET;
        lastAdjustmentTime = block.timestamp;
    }

    /// @notice Claim a mining reward. `nonce` must make
    ///         keccak256(abi.encode(challengeNumber, msg.sender, nonce)) <= miningTarget.
    ///         Your address is part of the puzzle, so nobody can steal your solution.
    function mine(uint256 nonce) external {
        bytes32 digest = keccak256(abi.encode(challengeNumber, msg.sender, nonce));
        if (uint256(digest) > miningTarget) revert InvalidSolution();

        uint256 reward = Math.min(rewardAt(rewardCount), MINEABLE_SUPPLY - totalMined);
        if (reward == 0) revert MiningFinished();

        rewardCount += 1;
        totalMined += reward;
        challengeNumber = keccak256(abi.encode(digest, blockhash(block.number - 1)));
        if (rewardCount % ADJUSTMENT_INTERVAL == 0) _adjustDifficulty();

        _mint(msg.sender, reward);
        emit Mined(msg.sender, reward, rewardCount, challengeNumber);
    }

    /// @notice The reward paid for mining reward number `count` (counting from 0).
    function rewardAt(uint256 count) public pure returns (uint256) {
        return INITIAL_REWARD >> (count / HALVING_INTERVAL);
    }

    /// @dev Like Bitcoin: if the last 144 rewards came faster than 10 minutes each, make the
    ///      puzzle harder; if slower, make it easier. Changes by at most 4x each time.
    function _adjustDifficulty() internal {
        uint256 expected = ADJUSTMENT_INTERVAL * TARGET_TIME_PER_REWARD;
        uint256 actual = Math.min(Math.max(block.timestamp - lastAdjustmentTime, expected / 4), expected * 4);

        uint256 newTarget = Math.mulDiv(miningTarget, actual, expected);
        miningTarget = Math.min(Math.max(newTarget, MIN_TARGET), MAX_TARGET);
        lastAdjustmentTime = block.timestamp;
    }

    // The functions below are required because several OpenZeppelin parts define them.

    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
