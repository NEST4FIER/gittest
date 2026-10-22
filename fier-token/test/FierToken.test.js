const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const coder = ethers.AbiCoder.defaultAbiCoder();
const FIER = (amount) => ethers.parseUnits(String(amount), 18);
const MAX_TARGET = 2n ** 234n;
const MIN_TARGET = 2n ** 16n;
const EASY_TARGET = 2n ** 250n; // about 64 tries per solution, so the tests run fast
const HALVING_INTERVAL = 180_000n;
const ONE_DAY = 144 * 10 * 60; // 144 rewards x 10 minutes

function digestOf(challenge, miner, nonce) {
  return BigInt(ethers.keccak256(coder.encode(["bytes32", "address", "uint256"], [challenge, miner, nonce])));
}

// Finds a nonce that solves the puzzle for `miner` (and, if given, does NOT solve it for `notFor`).
function solve(challenge, miner, target, notFor) {
  for (let nonce = 0n; ; nonce++) {
    if (digestOf(challenge, miner, nonce) > target) continue;
    if (notFor && digestOf(challenge, notFor, nonce) <= target) continue;
    return nonce;
  }
}

async function mineOnce(token, signer) {
  const nonce = solve(await token.challengeNumber(), signer.address, await token.miningTarget());
  return token.connect(signer).mine(nonce);
}

describe("FierToken", function () {
  async function deploy(contractName = "FierTokenHarness") {
    const [creator, alice, bob] = await ethers.getSigners();
    const token = await ethers.deployContract(contractName);
    return { token, creator, alice, bob };
  }

  async function deployEasy() {
    const ctx = await deploy();
    await ctx.token.setMiningTarget(EASY_TARGET);
    return ctx;
  }

  describe("launch", function () {
    it("has the right name, symbol, decimals and mission", async function () {
      const { token } = await deploy("FierToken");
      expect(await token.name()).to.equal("FIER");
      expect(await token.symbol()).to.equal("FIER");
      expect(await token.decimals()).to.equal(18n);
      expect(await token.MISSION()).to.contain("democracy");
    });

    it("caps supply at 2 billion and gives the creator 200 million", async function () {
      const { token, creator } = await deploy("FierToken");
      expect(await token.MAX_SUPPLY()).to.equal(FIER(2_000_000_000));
      expect(await token.MINEABLE_SUPPLY()).to.equal(FIER(1_800_000_000));
      expect(await token.totalSupply()).to.equal(FIER(200_000_000));
      expect(await token.balanceOf(creator.address)).to.equal(FIER(200_000_000));
    });

    it("starts mining at the easiest difficulty", async function () {
      const { token } = await deploy("FierToken");
      expect(await token.miningTarget()).to.equal(MAX_TARGET);
      expect(await token.rewardCount()).to.equal(0n);
      expect(await token.totalMined()).to.equal(0n);
    });

    it("has no owner or admin who could change the rules", async function () {
      const { token } = await deploy("FierToken");
      expect(token.owner).to.equal(undefined);
      expect(token.mint).to.equal(undefined);
    });
  });

  describe("mining", function () {
    it("pays 5,000 FIER for a valid solution and sets a new puzzle", async function () {
      const { token, alice } = await deployEasy();
      const oldChallenge = await token.challengeNumber();

      await expect(mineOnce(token, alice)).to.emit(token, "Mined");
      expect(await token.balanceOf(alice.address)).to.equal(FIER(5000));
      expect(await token.rewardCount()).to.equal(1n);
      expect(await token.totalMined()).to.equal(FIER(5000));
      expect(await token.challengeNumber()).to.not.equal(oldChallenge);
    });

    it("rejects a wrong solution", async function () {
      const { token, alice } = await deploy();
      await token.setMiningTarget(1n);
      await expect(token.connect(alice).mine(0n)).to.be.revertedWithCustomError(token, "InvalidSolution");
    });

    it("won't let someone steal another miner's solution", async function () {
      const { token, alice, bob } = await deployEasy();
      const nonce = solve(await token.challengeNumber(), alice.address, EASY_TARGET, bob.address);

      await expect(token.connect(bob).mine(nonce)).to.be.revertedWithCustomError(token, "InvalidSolution");
      await expect(token.connect(alice).mine(nonce)).to.emit(token, "Mined");
    });

    it("won't accept the same solution twice", async function () {
      const { token, alice } = await deployEasy();
      const nonce = solve(await token.challengeNumber(), alice.address, EASY_TARGET);
      await token.connect(alice).mine(nonce);

      await token.setMiningTarget(MAX_TARGET);
      await expect(token.connect(alice).mine(nonce)).to.be.revertedWithCustomError(token, "InvalidSolution");
    });

    it("halves the reward every 180,000 rewards", async function () {
      const { token } = await deploy();
      expect(await token.rewardAt(0n)).to.equal(FIER(5000));
      expect(await token.rewardAt(HALVING_INTERVAL - 1n)).to.equal(FIER(5000));
      expect(await token.rewardAt(HALVING_INTERVAL)).to.equal(FIER(2500));
      expect(await token.rewardAt(HALVING_INTERVAL * 2n)).to.equal(FIER(1250));
      expect(await token.rewardAt(HALVING_INTERVAL * 80n)).to.equal(0n);
    });

    it("pays the halved reward after a halving", async function () {
      const { token, alice } = await deployEasy();
      await token.setRewardCount(HALVING_INTERVAL);
      await mineOnce(token, alice);
      expect(await token.balanceOf(alice.address)).to.equal(FIER(2500));
    });

    it("never mines more than 1.8 billion FIER", async function () {
      const { token, alice } = await deployEasy();
      await token.setTotalMined(FIER(1_800_000_000) - 1n);

      await mineOnce(token, alice);
      expect(await token.balanceOf(alice.address)).to.equal(1n);
      expect(await token.totalMined()).to.equal(FIER(1_800_000_000));
      await expect(mineOnce(token, alice)).to.be.revertedWithCustomError(token, "MiningFinished");
    });

    it("stops once the reward has halved down to zero", async function () {
      const { token, alice } = await deployEasy();
      await token.setRewardCount(HALVING_INTERVAL * 80n);
      await expect(mineOnce(token, alice)).to.be.revertedWithCustomError(token, "MiningFinished");
    });

    it("does not let burned tokens be mined again", async function () {
      const { token, alice } = await deployEasy();
      await mineOnce(token, alice);
      await token.connect(alice).burn(FIER(5000));
      expect(await token.totalMined()).to.equal(FIER(5000));
    });
  });

  describe("difficulty", function () {
    it("makes the puzzle 4x harder when rewards come far too fast", async function () {
      const { token } = await deploy();
      await token.setMiningTarget(2n ** 200n);
      await time.increase(60);
      await token.adjustDifficulty();
      expect(await token.miningTarget()).to.equal(2n ** 198n);
    });

    it("makes the puzzle 4x easier when rewards come far too slowly", async function () {
      const { token } = await deploy();
      await token.setMiningTarget(2n ** 200n);
      await time.increase(30 * 24 * 60 * 60);
      await token.adjustDifficulty();
      expect(await token.miningTarget()).to.equal(2n ** 202n);
    });

    it("keeps the puzzle the same when rewards arrive on schedule", async function () {
      const { token } = await deploy();
      await token.setMiningTarget(2n ** 200n);
      await time.setNextBlockTimestamp((await token.lastAdjustmentTime()) + BigInt(ONE_DAY));
      await token.adjustDifficulty();
      expect(await token.miningTarget()).to.equal(2n ** 200n);
    });

    it("never goes past the easiest or hardest limits", async function () {
      const { token } = await deploy();
      await time.increase(30 * 24 * 60 * 60);
      await token.adjustDifficulty();
      expect(await token.miningTarget()).to.equal(MAX_TARGET);

      await token.setMiningTarget(MIN_TARGET);
      await token.adjustDifficulty();
      expect(await token.miningTarget()).to.equal(MIN_TARGET);
    });

    it("adjusts by itself every 144 rewards", async function () {
      this.timeout(120_000);
      const { token, alice } = await deployEasy();
      for (let i = 0; i < 143; i++) await mineOnce(token, alice);
      expect(await token.miningTarget()).to.equal(EASY_TARGET);

      await mineOnce(token, alice);
      expect(await token.miningTarget()).to.equal(MAX_TARGET);
      expect(await token.lastAdjustmentTime()).to.equal(BigInt(await time.latest()));
    });
  });

  describe("sending, burning and voting", function () {
    it("lets holders send tokens to each other", async function () {
      const { token, creator, alice } = await deploy("FierToken");
      const amount = FIER(500);
      await expect(token.transfer(alice.address, amount)).to.changeTokenBalances(
        token,
        [creator, alice],
        [-amount, amount]
      );
    });

    it("does not let anyone send more than they have", async function () {
      const { token, alice, bob } = await deploy("FierToken");
      await expect(token.connect(alice).transfer(bob.address, 1n)).to.be.revertedWithCustomError(
        token,
        "ERC20InsufficientBalance"
      );
    });

    it("lets holders burn their own tokens, which lowers the total supply", async function () {
      const { token, creator } = await deploy("FierToken");
      await token.burn(FIER(1000));
      expect(await token.totalSupply()).to.equal(FIER(200_000_000 - 1000));
      expect(await token.balanceOf(creator.address)).to.equal(FIER(200_000_000 - 1000));
    });

    it("gives holders voting power once they turn it on", async function () {
      const { token, alice, bob } = await deploy("FierToken");
      await token.transfer(alice.address, FIER(1000));
      expect(await token.getVotes(alice.address)).to.equal(0n);

      await token.connect(alice).delegate(alice.address);
      expect(await token.getVotes(alice.address)).to.equal(FIER(1000));

      await token.connect(alice).transfer(bob.address, FIER(400));
      expect(await token.getVotes(alice.address)).to.equal(FIER(600));
    });

    it("lets holders hand their votes to someone they trust", async function () {
      const { token, alice, bob } = await deploy("FierToken");
      await token.transfer(alice.address, FIER(1000));
      await token.connect(alice).delegate(bob.address);
      expect(await token.getVotes(bob.address)).to.equal(FIER(1000));
      expect(await token.balanceOf(bob.address)).to.equal(0n);
    });
  });
});
