require("@nomicfoundation/hardhat-toolbox");
const { vars } = require("hardhat/config");

// Secrets are stored with `npx hardhat vars set <NAME>`, never in this file.
const accounts = vars.has("PRIVATE_KEY") ? [vars.get("PRIVATE_KEY")] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    // Base supports Cancun, and OpenZeppelin's voting code needs it.
    settings: { evmVersion: "cancun" },
  },
  networks: {
    // Free test network for Base. Practice here first.
    baseSepolia: {
      url: vars.get("BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org"),
      accounts,
    },
    // The real Base network. Costs real ETH (usually a few cents).
    base: {
      url: vars.get("BASE_RPC_URL", "https://mainnet.base.org"),
      accounts,
    },
  },
  etherscan: {
    apiKey: vars.get("ETHERSCAN_API_KEY", ""),
  },
};
