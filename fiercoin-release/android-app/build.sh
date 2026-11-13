#!/bin/bash
# Builds FierCoin.apk without Gradle. Needs: Android SDK build-tools 34, platform android-34, JDK 17,
# and an arm64 fiercoind built from the FierCoin source (pass its path as $1).
set -e
A=$(cd "$(dirname "$0")" && pwd)
SDK=${ANDROID_SDK:-/home/user/android/sdk}
BT=$SDK/build-tools/34.0.0
JAR=$SDK/platforms/android-34/android.jar
NODE_BIN=${1:?path to arm64 fiercoind}
O=$A/build
rm -rf "$O"; mkdir -p "$O/gen" "$O/classes" "$O/dex" "$O/lib/arm64-v8a"
cd "$A"
"$BT/aapt2" compile --dir res -o "$O/res.zip"
"$BT/aapt2" link -I "$JAR" --manifest AndroidManifest.xml -A assets --java "$O/gen" -o "$O/unsigned.apk" "$O/res.zip" \
  --min-sdk-version 26 --target-sdk-version 34 --version-code 1 --version-name 0.21.4
javac -source 8 -target 8 -bootclasspath "$JAR" -Xlint:-options -d "$O/classes" $(find src "$O/gen" -name '*.java')
"$BT/d8" --lib "$JAR" --min-api 26 --release --output "$O/dex" $(find "$O/classes" -name '*.class')
cp "$NODE_BIN" "$O/lib/arm64-v8a/libfiercoind.so"
cp "${ANDROID_NDK:-/home/user/android/android-ndk-r26d}/toolchains/llvm/prebuilt/linux-x86_64/sysroot/usr/lib/aarch64-linux-android/libc++_shared.so" "$O/lib/arm64-v8a/"
(cd "$O/dex" && zip -q "$O/unsigned.apk" classes.dex)
(cd "$O" && zip -q -r unsigned.apk lib)
"$BT/zipalign" -p -f 4 "$O/unsigned.apk" "$O/aligned.apk"
"$BT/apksigner" sign --ks "$A/fiercoin-release.keystore" --ks-pass pass:fiercoin-local-key --ks-key-alias fiercoin \
  --out "$A/FierCoin.apk" "$O/aligned.apk"
"$BT/apksigner" verify --print-certs "$A/FierCoin.apk" | head -3
ls -la "$A/FierCoin.apk"
