# FierCoin Android app

A stand-alone Android app (arm64, Android 8+) that runs the full FierCoin node and built-in miner on the phone.

- **Engine:** `fiercoind`, cross-compiled from the FierCoin source with depends `HOST=aarch64-linux-android ANDROID_API_LEVEL=24 NO_QT=1 NO_ZMQ=1 NO_UPNP=1`, using NDK r26d. Pass `android_AR`/`android_RANLIB` pointing to `llvm-ar`/`llvm-ranlib`, and apply `depends-libfmt-android.patch`. It is shipped as `lib/arm64-v8a/libfiercoind.so` with `libc++_shared.so`.
- **App:** a WebView screen (`assets/index.html`) plus a foreground service (`NodeService`) that keeps the node and miner running.
- **Build:** run `./build.sh /path/to/stripped/fiercoind` (needs Android SDK build-tools 34, platform 34, and JDK 17). Signing needs your own keystore, which is not stored here.
