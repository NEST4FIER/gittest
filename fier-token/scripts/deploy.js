const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying FIER to "${network.name}" from wallet ${deployer.address} ...`);

  const token = await ethers.deployContract("FierToken");
  await token.waitForDeployment();

  const address = await token.getAddress();
  const supply = ethers.formatUnits(await token.totalSupply(), 18);
  console.log(`FIER deployed at: ${address}`);
  console.log(`${supply} FIER sent to ${deployer.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
