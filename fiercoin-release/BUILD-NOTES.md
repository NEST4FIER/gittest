# How to rebuild FierCoin from source

FierCoin is Litecoin Core v0.21.4 plus the changes in `fiercoin-changes.patch`.

```sh
git clone --depth 1 --branch v0.21.4 https://github.com/litecoin-project/litecoin fiercoin
cd fiercoin
git apply /path/to/fiercoin-changes.patch
```

## Windows installer (cross-compiled on Ubuntu 24.04)

```sh
sudo apt install build-essential libtool autotools-dev automake pkg-config bsdmainutils \
  python3 curl g++-mingw-w64-x86-64-posix nsis
sudo update-alternatives --set x86_64-w64-mingw32-gcc /usr/bin/x86_64-w64-mingw32-gcc-posix
sudo update-alternatives --set x86_64-w64-mingw32-g++ /usr/bin/x86_64-w64-mingw32-g++-posix
cd depends && make HOST=x86_64-w64-mingw32 NO_ZMQ=1 NO_UPNP=1 -j4 && cd ..
./autogen.sh
CONFIG_SITE=$PWD/depends/x86_64-w64-mingw32/share/config.site ./configure --prefix=/ \
  --disable-tests --disable-bench --disable-zmq --without-miniupnpc
make -j4 && make deploy   # produces fiercoin-0.21.4-win64-setup.exe
```

If the `libfmt` 7.1.3 download fails, make the archive from git. It matches the expected hash `5cae7072…`:

```sh
git clone --depth 1 --branch 7.1.3 https://github.com/fmtlib/fmt fmt-src
git -C fmt-src archive --format=tar --prefix=fmt-7.1.3/ HEAD | gzip -n > depends/sources/7.1.3.tar.gz
```

## Linux (daemon only)

```sh
./autogen.sh && ./configure --without-gui --disable-tests --disable-bench --with-incompatible-bdb && make -j4
```

## What the patch changes

- **Name and branding.** Litecoin becomes FierCoin, LTC becomes FIRC, and there is a new logo and installer art.
- **Network.**
  - New genesis block: "FierCoin 13/Nov/2026 Regaining our democracy in the USA".
  - New network magic bytes.
  - Ports: P2P 29333, RPC 29332.
  - No DNS seeds.
- **Addresses.** `firc1…` (bech32), `F…` (legacy), `f…` (script).
- **Consensus.**
  - Scrypt proof of work, 2.5-minute blocks, 50 FIRC reward halving every 840,000 blocks (84M max).
  - Difficulty retargets every 24 blocks (1 hour).
  - SegWit and Taproot are active from the start, and MWEB is disabled.
- **Miner.** Built-in CPU miner: the `setgenerate` / `getgenerate` RPCs and the `-gen`, `-genaddress` and `-genproclimit` options.
- **Build fixes for GCC 13.** Missing `<limits>` includes (in `fs.cpp` and Qt) and the mingw TOUCHINPUT clash in Qt.
