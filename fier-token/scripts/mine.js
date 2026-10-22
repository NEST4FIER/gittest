const { ethers, network } = require("hardhat");
const { vars } = require("hardhat/config");

// A simple FIER miner that runs on your computer's processor (CPU).
// It keeps guessing numbers ("nonces") until one solves the current puzzle, then claims the reward.
//
//   Practice run (fake local blockchain):  npm run mine
//   Real mining:                           npx hardhat vars set FIER_ADDRESS   (your token's address)
//                                          npm run mine:testnet   or   npm run mine:mainnet

const BATCH = 200_000; // guesses between checks for a new puzzle

async function main() {
  const [miner] = await ethers.getSigners();
  const practice = network.name === "hardhat";

  const token = practice
    ? await ethers.deployContract("FierToken")
    : await ethers.getContractAt("FierToken", vars.get("FIER_ADDRESS"));
  console.log(`Mining FIER at ${await token.getAddress()} on "${network.name}" with wallet ${miner.address}`);
  if (practice) console.log("(Practice run on a fake local blockchain: stops after 1 reward.)");

  // The contract hashes 96 bytes: [puzzle (32 bytes)][your address (32 bytes)][nonce (32 bytes)].
  const input = new Uint8Array(96);
  input.set(ethers.getBytes(ethers.zeroPadValue(miner.address, 32)), 32);
  const view = new DataView(input.buffer);

  for (let rewards = 0; !practice || rewards < 1; ) {
    const challenge = await token.challengeNumber();
    const target = "0x" + (await token.miningTarget()).toString(16).padStart(64, "0");
    input.set(ethers.getBytes(challenge), 0);
    input.set(ethers.randomBytes(24), 64); // random start so separate miners don't repeat each other's guesses

    const started = Date.now();
    let tries = 0;
    let nonce = null;
    while (nonce === null) {
      for (let i = 0; i < BATCH; i++, tries++) {
        view.setUint32(88, Math.floor(tries / 2 ** 32));
        view.setUint32(92, tries >>> 0);
        if (ethers.keccak256(input) <= target) {
          nonce = BigInt(ethers.hexlify(input.slice(64)));
          break;
        }
      }
      if (nonce === null && (await token.challengeNumber()) !== challenge) break; // someone else won this round
    }

    const seconds = (Date.now() - started) / 1000;
    const speed = Math.round(tries / seconds).toLocaleString();
    if (nonce === null) {
      console.log(`Someone else solved this puzzle first. Starting on the new one... (${speed} guesses/sec)`);
      continue;
    }

    console.log(`Solved after ${tries.toLocaleString()} guesses in ${seconds.toFixed(1)}s (${speed} guesses/sec). Claiming...`);
    try {
      await (await token.mine(nonce)).wait();
      rewards++;
      const balance = ethers.formatUnits(await token.balanceOf(miner.address), 18);
      console.log(`Reward claimed! Your balance: ${balance} FIER`);
    } catch (error) {
      console.log(`Claim failed (usually someone else claimed this round first): ${error.shortMessage ?? error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
