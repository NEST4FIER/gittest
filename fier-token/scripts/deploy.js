const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying FIER to "${network.name}" from wallet ${deployer.address} ...`);

  const token = await ethers.deployContract("FierToken");
  await token.waitForDeployment();

  const address = await token.getAddress();
  const creatorSupply = ethers.formatUnits(await token.CREATOR_SUPPLY(), 18);
  const mineable = ethers.formatUnits(await token.MINEABLE_SUPPLY(), 18);
  console.log(`FIER deployed at: ${address}`);
  console.log(`${creatorSupply} FIER sent to ${deployer.address}`);
  console.log(`${mineable} FIER are waiting to be mined. Mining is open to everyone now.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
