# Web wallet key and signing code

`lib.js` is bundled into `explorer/web/wallet/firc-lib.js`:

```sh
npm install
npx esbuild@0.25.0 lib.js --bundle --minify --format=iife --global-name=FIRC --target=es2020 --outfile=../explorer/web/wallet/firc-lib.js
```

Uses @scure/btc-signer, @scure/bip39, @scure/bip32 and @noble (audited, pure JavaScript).
Wallet path: m/84'/2026'/0'/0/0 (one firc1 address per wallet).
