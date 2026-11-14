# FierCoin Explorer

A small block explorer website, like Litecoin's explorers, that reads from a local FierCoin wallet or node. It only uses read-only node commands and never touches the wallet.

- **Pages:** network stats, latest blocks, block and transaction pages (with from/to addresses and spent status), address pages with balance and history, a rich list, and search.
- **First run:** it adds `server=1` and `txindex=1` to `fiercoin.conf` and asks you to restart FierCoin. After that it logs in using FierCoin's `.cookie` file.
- **Address balances:** these come from an in-memory index that the explorer builds by reading every block. On a reorg it rebuilds the whole index.
- **Website address:** it serves on `:8080` by default. Change it with `-listen :8090`.

Build for Windows:

```sh
GOOS=windows GOARCH=amd64 go build -ldflags "-s -w" -o FierCoin-Explorer.exe .
```
