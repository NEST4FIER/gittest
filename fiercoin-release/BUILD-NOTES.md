# How to rebuild FierCoin from source

FierCoin is Litecoin Core v0.21.4 plus three patches, applied in this order:

1. `fiercoin-changes.patch` makes the coin itself: name, genesis block, addresses, consensus rules and the built-in miner.
2. `fiercoin-network.patch` builds in the seed node, so every app finds the network by itself. It only applies on top of the first patch.
3. `fiercoin-tipage.patch` makes a node count as "still syncing" only if its newest block is over 30 days old.

```sh
git clone --depth 1 --branch v0.21.4 https://github.com/litecoin-project/litecoin fiercoin
cd fiercoin
git apply /path/to/fiercoin-changes.patch
git apply /path/to/fiercoin-network.patch
git apply /path/to/fiercoin-tipage.patch
```

## Windows installer (cross-compiled on Ubuntu 24.04)

```sh
sudo apt install build-essential libtool autotools-dev automake pkg-config bsdmainutils \
  python3 curl g++-mingw-w64-x86-64-posix nsis
sudo update-alternatives --set x86_64-w64-mingw32-gcc /usr/bin/x86_64-w64-mingw32-gcc-posix
sudo update-alternatives --set x86_64-w64-mingw32-g++ /usr/bin/x86_64-w64-mingw32-g++-posix
cd depends && make HOST=x86_64-w64-mingw32 NO_ZMQ=1 -j4 && cd ..
./autogen.sh
CONFIG_SITE=$PWD/depends/x86_64-w64-mingw32/share/config.site ./configure --prefix=/ \
  --disable-tests --disable-bench --disable-zmq --with-miniupnpc --enable-upnp-default
make -j4 && make deploy   # produces fiercoin-0.21.4-win64-setup.exe
```

UPnP is built in and on by default, like in the shipped wallet. That's how the wallet opens port 29333 on the user's router by itself, so other computers can connect to it without any port forwarding.

- Don't add `NO_UPNP=1` to the `depends` line. Without it, `depends` builds miniupnpc.
- `--with-miniupnpc` makes `configure` stop with an error if miniupnpc is missing, instead of quietly building without it.
- `--enable-upnp-default` turns UPnP on by default. In the finished wallet, Settings > Options > Network > "Map port using UPnP" is ticked.

If the `libfmt` 7.1.3 download fails, make the archive from git. It matches the expected hash `5cae7072…`:

```sh
git clone --depth 1 --branch 7.1.3 https://github.com/fmtlib/fmt fmt-src
git -C fmt-src archive --format=tar --prefix=fmt-7.1.3/ HEAD | gzip -n > depends/sources/7.1.3.tar.gz
```

## Linux (daemon only)

```sh
sudo apt install build-essential libtool autotools-dev automake pkg-config bsdmainutils python3 \
  libssl-dev libevent-dev libboost-system-dev libboost-filesystem-dev libboost-thread-dev \
  libfmt-dev libdb5.3++-dev libsqlite3-dev libminiupnpc-dev
./autogen.sh && ./configure --without-gui --disable-tests --disable-bench --with-incompatible-bdb \
  --with-miniupnpc --enable-upnp-default && make -j4
```

This matches the server's `fiercoind` in `server/bin`, which also has UPnP built in and on by default. It uses Ubuntu's miniupnpc library, so it needs `libminiupnpc17` to run. That's why `server/install.sh` installs it. (A cloud server has no router to open, so UPnP finds nothing there, and that's fine: `install.sh` opens port 29333 in the server's firewall.)

## What the patches change

Everything here comes from `fiercoin-changes.patch`, except where it says otherwise.

- **Name and branding.** Litecoin becomes FierCoin, LTC becomes FIRC, and there is a new logo and installer art.
- **Network.**
  - New genesis block: "FierCoin 13/Nov/2026 Regaining our democracy in the USA".
  - New network magic bytes.
  - Ports: P2P 29333, RPC 29332.
  - No DNS seeds.
  - A built-in seed node instead: `68.183.155.121:29333` (New York), plus its IPv6 address. Every app connects to it by itself, then learns about other computers on its own. (`fiercoin-network.patch`: the list is in `src/chainparamsseeds.h`, and `src/chainparams.cpp` turns it on.)
  - Quick fallback to the seed node. With no DNS seeds, a new app tries the seed node after 2 seconds instead of 60, and again whenever it has had no outbound connection for a minute. (`fiercoin-network.patch`, in `src/net.cpp`.)
  - To change the seed nodes, run `contrib/seeds/fiercoin-set-seeds.sh` (also from `fiercoin-network.patch`) with the public IP address of every always-on node you want built in, then rebuild. It replaces the whole list, so include the ones you're keeping. For example, if a second server's address is 203.0.113.10:

    ```sh
    contrib/seeds/fiercoin-set-seeds.sh 68.183.155.121 2604:a880:800:14:0:3:e645:2000 203.0.113.10
    ```

    It adds port 29333, rewrites `contrib/seeds/nodes_main.txt` and `src/chainparamsseeds.h`, and makes sure fixed seeds are on in `src/chainparams.cpp`. The Android app keeps its own copy of the list (`SEEDS` in `android-app/src/org/fiercoin/wallet/Node.java`), so change it there too.
  - UPnP is on by default in the Windows wallet and the server node. That comes from the build steps above (`--enable-upnp-default`), not from a patch.
- **Syncing.** A node only counts as "still syncing" if its newest block is over 30 days old, instead of 24 hours. A node that's still syncing stops sharing the chain and handing out mining jobs, and a young network can go quiet for a while. (`fiercoin-tipage.patch`, in `src/validation.h`.)
- **Addresses.** `firc1…` (bech32), `F…` (legacy), `f…` (script).
- **Consensus.**
  - Scrypt proof of work, 2.5-minute blocks, 50 FIRC reward halving every 840,000 blocks (84M max).
  - Difficulty retargets every 24 blocks (1 hour).
  - SegWit and Taproot are active from the start, and MWEB is disabled.
- **Miner.** Built-in CPU miner: the `setgenerate` / `getgenerate` RPCs and the `-gen`, `-genaddress` and `-genproclimit` options.
- **Build fixes for GCC 13.** Missing `<limits>` includes (in `fs.cpp` and Qt) and the mingw TOUCHINPUT clash in Qt.
