# FIER Token

FIER is a standard **ERC-20** token. ERC-20 is the most common token format in crypto. Wallets (MetaMask, Coinbase Wallet), exchanges and block explorers all understand it.

## What the token does

| Setting | Value |
|---|---|
| Name | FIER |
| Symbol | FIER |
| Total supply | 1,000,000,000 FIER (1 billion) |
| Decimals | 18 (the standard, like ETH) |
| Who gets the coins | The wallet that deploys the contract gets all of them |
| Can more be created? | **No, never.** This keeps holders safe from surprise "printing". |
| Can coins be destroyed? | Yes. Any holder can burn their own FIER. |

The contract is in [`contracts/FierToken.sol`](contracts/FierToken.sol). It's only about 20 lines because it builds on [OpenZeppelin](https://www.openzeppelin.com/contracts), a widely used and audited library of token code.

## Which blockchain?

We recommend **Base**. Base is a network built on top of Ethereum by Coinbase. It's the same technology as Ethereum, but fees are usually a few cents instead of several dollars.

Always practise on **Base Sepolia** first. It's a free test copy of Base that uses fake ETH.

> To change the name, symbol or supply, edit `contracts/FierToken.sol` **before** you deploy. After deployment the contract can't be changed.

---

## Option A: The easy way (no install, all in your browser)

1. **Get a wallet.** Install the [MetaMask](https://metamask.io) browser extension and create a wallet. Write down your secret recovery phrase on paper and never share it with anyone.
2. **Add the test network.** In MetaMask, add the **Base Sepolia** network (MetaMask lets you search for it by name).
3. **Get free test ETH.** Search "Base Sepolia faucet" (Base lists some at [docs.base.org](https://docs.base.org)) and send some test ETH to your wallet address.
4. **Open Remix.** Go to [remix.ethereum.org](https://remix.ethereum.org). Create a new file called `FierToken.sol` and paste in everything from `contracts/FierToken.sol`.
5. **Compile.** Click the **Solidity Compiler** tab on the left (the "S" icon), then click **Compile FierToken.sol**.
6. **Deploy.** Click the **Deploy & Run Transactions** tab. Set *Environment* to **Injected Provider - MetaMask**, choose **FierToken** in the *Contract* list, and click **Deploy**. Approve the popup in MetaMask.
7. **See your tokens.** Copy the contract address that Remix shows under *Deployed Contracts*. In MetaMask, choose **Import tokens** and paste that address. You should see 1,000,000,000 FIER.
8. **Go live.** When you're happy with the test, switch MetaMask to the real **Base** network, put a little real ETH on Base in your wallet, and repeat steps 6 and 7.

---

## Option B: The developer way (Hardhat)

You need [Node.js](https://nodejs.org) installed (version 18 or newer). Run these commands in a terminal, inside the `fier-token` folder.

```bash
npm install        # download the tools (only needed once)
npm test           # run the automated checks (should show "6 passing")
```

**Set your secrets.** Use a separate wallet just for deploying. Hardhat stores these secrets on your computer, outside this project, so they never get uploaded to GitHub.

```bash
npx hardhat vars set PRIVATE_KEY          # the deploy wallet's private key
npx hardhat vars set ETHERSCAN_API_KEY    # optional, free from etherscan.io, used for "verify" below
```

**Deploy:**

```bash
npm run deploy:testnet    # free test network (Base Sepolia)
npm run deploy:mainnet    # real Base network (costs a little real ETH)
```

The deploy command prints your token's address.

**Verify (optional but recommended).** This publishes your code on [basescan.org](https://basescan.org) so anyone can check that the token does what you say:

```bash
npx hardhat verify --network base YOUR_TOKEN_ADDRESS
```

---

## Good to know

- **Safety:** never share your private key or recovery phrase. Never commit them to GitHub.
- **Value and trading:** creating a token doesn't give it a price. For people to buy and sell FIER, you'd add it to a trading pool (for example on Uniswap or Aerodrome on Base), paired with some ETH or USDC.
- **Rules:** if you plan to sell FIER to other people, check the laws where you live. Some countries treat token sales like selling shares.
