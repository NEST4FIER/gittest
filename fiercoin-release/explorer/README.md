# FierCoin Explorer

A small block explorer website, like Litecoin's explorers, that reads from a local FierCoin wallet or node. It never touches the node's wallet.

- **Pages:** network stats, latest blocks, block and transaction pages (with from/to addresses and spent status), address pages with balance and history, a rich list, and search.
- **First run:** it adds `server=1` and `txindex=1` to `fiercoin.conf` and asks you to restart FierCoin. After that it logs in using FierCoin's `.cookie` file.
- **Address balances:** these come from an in-memory index that the explorer builds by reading every block. On a reorg it rebuilds the whole index.
- **Web wallet for iPhone (`/wallet/`):** a wallet and miner that runs in the browser. Keys are made and kept on the phone (12 words, encrypted with the user's password); the server never sees them. The explorer helps it through four extra endpoints: `/api/utxos/<address>` (spendable coins), `/api/broadcast` (passes on an already-signed payment with `sendrawtransaction`), `/api/work?addr=` and `/api/submit` (mining jobs via `getblocktemplate` and `submitblock`). The key and signing code is built from `../webwallet-src` with esbuild.
- **Getting paid (web wallet and Android app):** the Receive screen can charge an amount. Its QR code then reads `fiercoin:<address>?amount=2.5`, which both apps' scanners fill in. The screen shows Paid when coins that weren't there before, and weren't mined, reach the address, and Confirmed once they're in a block. **Print a pay-me card** makes business cards (3.5 x 2 in) with the address and its QR code, from `wallet/fierpay.js` (the Android app has an identical copy). An iPhone home-screen app can't open the print window, so there it hands the share menu a one-page PDF of 10 cards instead.
- **Website address:** it serves on `:8080` by default. Change it with `-listen :8090`.

Build for Windows:

```sh
GOOS=windows GOARCH=amd64 go build -ldflags "-s -w" -o FierCoin-Explorer.exe .
```
