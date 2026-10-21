const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FierToken", function () {
  const ONE_BILLION = ethers.parseUnits("1000000000", 18);

  async function deploy() {
    const [owner, alice, bob] = await ethers.getSigners();
    const token = await ethers.deployContract("FierToken");
    return { token, owner, alice, bob };
  }

  it("has the right name, symbol and decimals", async function () {
    const { token } = await deploy();
    expect(await token.name()).to.equal("FIER");
    expect(await token.symbol()).to.equal("FIER");
    expect(await token.decimals()).to.equal(18n);
  });

  it("gives the whole 1 billion supply to the deployer", async function () {
    const { token, owner } = await deploy();
    expect(await token.totalSupply()).to.equal(ONE_BILLION);
    expect(await token.balanceOf(owner.address)).to.equal(ONE_BILLION);
  });

  it("lets holders send tokens to each other", async function () {
    const { token, owner, alice, bob } = await deploy();
    const amount = ethers.parseUnits("500", 18);

    await expect(token.transfer(alice.address, amount)).to.changeTokenBalances(
      token,
      [owner, alice],
      [-amount, amount]
    );
    await expect(token.connect(alice).transfer(bob.address, amount)).to.changeTokenBalances(
      token,
      [alice, bob],
      [-amount, amount]
    );
  });

  it("does not let anyone send more than they have", async function () {
    const { token, alice, bob } = await deploy();
    await expect(token.connect(alice).transfer(bob.address, 1n)).to.be.revertedWithCustomError(
      token,
      "ERC20InsufficientBalance"
    );
  });

  it("lets holders burn their own tokens, which lowers the total supply", async function () {
    const { token, owner } = await deploy();
    const amount = ethers.parseUnits("1000", 18);

    await token.burn(amount);
    expect(await token.totalSupply()).to.equal(ONE_BILLION - amount);
    expect(await token.balanceOf(owner.address)).to.equal(ONE_BILLION - amount);
  });

  it("has no way to create more tokens after launch", async function () {
    const { token } = await deploy();
    expect(token.mint).to.equal(undefined);
  });
});
