# FIER Token

> *"FIER: power to the people. Mined by the many, controlled by no one, to help restore democracy in the USA."*
> This message is stored inside the token forever, like the message in Bitcoin's first block.

FIER is a standard **ERC-20** token, the most common token format in crypto. Wallets (MetaMask, Coinbase Wallet), exchanges and block explorers all understand it. It runs on **Base**, a network built on top of Ethereum where fees are usually a few cents.

## What the token does

| Setting | Value |
|---|---|
| Name / symbol | FIER / FIER |
| Maximum supply | **2,000,000,000 FIER**, ever. No more can be created. |
| Creator's share | 200,000,000 FIER (10%), sent to the wallet that launches the token |
| Mineable | 1,800,000,000 FIER (90%), earned by anyone who mines |
| Mining reward | Starts at 5,000 FIER per puzzle solved and **halves about every 3.4 years**, like Bitcoin |
| Puzzle speed | Adjusts itself so a reward is found about every 10 minutes |
| Voting | Every FIER is a vote. Holders can vote on community decisions or hand their votes to someone they trust. |
| Burning | Any holder can permanently destroy their own FIER |
| Admin / owner | **None.** After launch, nobody (not even the creator) can change the rules. |

The contract is in [`contracts/FierToken.sol`](contracts/FierToken.sol). It's built on [OpenZeppelin](https://www.openzeppelin.com/contracts), a widely used and audited library of token code.

> **Before you launch**, decide if you want to change anything. You can't change it afterwards. The easy things to change in `FierToken.sol` are:
> - `MISSION`: the message stored forever
> - `CREATOR_SUPPLY`: your share (currently 200 million)

### How mining works (simple version)

Bitcoin mining is a guessing game. The token sets a puzzle, and computers race to guess a number that solves it. The first one to solve it gets the reward, then a new puzzle starts. If lots of people mine, the puzzles get harder. If few people mine, they get easier. Your wallet address is part of every puzzle, so nobody can steal your answer.

The included miner runs on a normal computer's processor. At launch, an average computer should find a reward every few minutes. As more people mine, it gets harder, just like Bitcoin. Serious miners eventually write faster graphics-card (GPU) miners.

### How voting works

Holders turn on their voting power once, by "delegating" to themselves (or to someone they trust). After that, FIER works with free voting tools like [Snapshot](https://snapshot.box), so the community can create proposals and vote on them. Later on, you can add fully on-chain voting (an OpenZeppelin "Governor" contract) without changing the token.

Note: one FIER = one vote, so people who hold more FIER get more votes.

### About a $1 price

**No code can make a token worth $1.** The price is whatever buyers are willing to pay. But you *can* set the starting price at $1:

1. Open a trading pool on a Base exchange such as [Uniswap](https://app.uniswap.org) or [Aerodrome](https://aerodrome.finance).
2. Pair FIER with **USDC** (a digital dollar) in equal dollar amounts. For example, 1,000 FIER and 1,000 USDC sets the price at $1.00.
3. After that, buying pushes the price up and selling pushes it down. The more money in the pool, the more steadily the price moves.

(Coins that always stay at exactly $1, like USDC, do it by holding $1 in a bank for every coin. That's a regulated financial business, not just code.)

---

## Launch: Option A, the easy way (in your browser, no install)

1. **Get a wallet.** Install the [MetaMask](https://metamask.io) browser extension and create a wallet. Write your secret recovery phrase on paper and never share it.
2. **Add the test network.** In MetaMask, add **Base Sepolia** (search for it by name).
3. **Get free test ETH.** Search "Base Sepolia faucet" (Base lists some at [docs.base.org](https://docs.base.org)) and send some test ETH to your wallet address.
4. **Open Remix.** Go to [remix.ethereum.org](https://remix.ethereum.org). Create a file called `FierToken.sol` and paste in everything from `contracts/FierToken.sol`.
5. **Compile.** Click the **Solidity Compiler** tab (the "S" icon). Under *Advanced Configurations*, set *EVM version* to **cancun**. Then click **Compile FierToken.sol**.
6. **Deploy.** Click the **Deploy & Run Transactions** tab. Set *Environment* to **Injected Provider - MetaMask**, choose **FierToken** in the *Contract* list, and click **Deploy**. Approve the popup in MetaMask.
7. **See your tokens.** Copy the contract address under *Deployed Contracts*. In MetaMask, choose **Import tokens** and paste that address. You should see 200,000,000 FIER.
8. **Go live.** When you're happy, switch MetaMask to the real **Base** network, add a little real ETH on Base to your wallet, and repeat steps 6 and 7.

## Launch: Option B, the developer way (Hardhat)

You need [Node.js](https://nodejs.org) installed (version 18 or newer). Run these commands in a terminal, inside the `fier-token` folder.

```bash
npm install        # download the tools (only needed once)
npm test           # run the automated checks (should show "23 passing")
npm run mine       # practice mining on a fake local blockchain
```

**Set your secrets.** Use a separate wallet just for this. Hardhat stores these secrets on your computer, outside this project, so they never get uploaded to GitHub.

```bash
npx hardhat vars set PRIVATE_KEY          # the wallet's private key
npx hardhat vars set ETHERSCAN_API_KEY    # optional, free from etherscan.io, used for "verify" below
```

**Deploy:**

```bash
npm run deploy:testnet    # free test network (Base Sepolia)
npm run deploy:mainnet    # real Base network (costs a little real ETH)
```

**Verify (recommended).** This publishes your code on [basescan.org](https://basescan.org) so anyone can check that there's no admin and the rules are real. That's a big part of earning people's trust.

```bash
npx hardhat verify --network base YOUR_TOKEN_ADDRESS
```

## Mining FIER

Anyone can mine once the token is live. Each reward claim is a small transaction, so the miner's wallet needs a little ETH on Base to pay fees.

```bash
npx hardhat vars set PRIVATE_KEY      # the mining wallet's private key
npx hardhat vars set FIER_ADDRESS     # the token's address
npm run mine:testnet                  # or: npm run mine:mainnet
```

Leave it running. It prints each reward it claims. Press `Ctrl + C` to stop.

---

## Good to know

- **Safety:** never share your private key or recovery phrase, and never put them in a file in this project.
- **Honest expectations:** a token gets attention from its community and story, not its code. Bitcoin, Ethereum and Solana are whole blockchains with millions of users built up over many years. The strengths FIER can honestly claim are a fair, open mining launch, a hard cap, no admin, and built-in voting.
- **Rules:** if you sell FIER to people or tell them it will go up in value, US securities laws may apply. If any money raised goes to political campaigns, election finance rules may apply too. It's worth a quick talk with a lawyer before a public launch.
