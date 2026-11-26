# FierCoin mesh gateway

Lets people pay with FierCoin when there's **no internet** where they are: no cell service, a
blackout, or a network that's been switched off. Their phone talks to a cheap
[Meshtastic](https://meshtastic.org) radio. Radios pass short text messages to each other,
often several kilometres per hop. Somewhere in the mesh, one computer that still has internet
runs this gateway, and it passes payments on to the FierCoin network.

```
phone (no internet) --Bluetooth--> radio ~~~ radio ~~~ radio --USB--> gateway PC --internet--> FierCoin
```

The gateway never sees anyone's 12 words or password. Payments are signed on the phone, and
the gateway only passes them on. It can refuse to pass one on, but it can't change it or take
the coins.

## Set up a gateway

You need: a computer that stays on and has internet (Windows, Mac, Linux or a Raspberry Pi), a
Meshtastic radio plugged in by USB, and Python 3.

1. **Set up the radio** with the Meshtastic app: set the region (US: `US`, 915 MHz) and make a
   **private channel** (Channels > add). Share that channel's QR code only with the people who
   will use this gateway. (The default channel, "LongFast", has a public key: anyone in
   range can read it.)
2. **Install the Meshtastic library:** `pip install meshtastic`
3. **Plug the radio in and start the gateway:**

   ```
   python firc_mesh_gateway.py
   ```

   It finds the radio by itself. If it doesn't, name the port: `--port COM5` (Windows) or
   `--port /dev/ttyUSB0` (Linux). It uses the main FierCoin server; to use your own, add
   `--server http://localhost:8080` (the FierCoin Explorer on that PC).
4. Leave the window open. Every message and answer is shown in it.

## How a payment goes (in the iPhone/web wallet)

More > **No internet? Pay over mesh radio**:

1. The wallet shows `FIRC U <your address>`. Send it in the Meshtastic app on the gateway's
   channel. The gateway answers with your coins (`FIRC u ...` lines); paste them into the wallet.
2. Tap **Make a payment**, fill it in as usual, and the wallet shows 1 to a few short messages
   (`FIRC T ...`). Send each one in the Meshtastic app.
3. The gateway answers `FIRC ok <id> <payment number>` (sent) or `FIRC err <id> <why>`.
   Paste it into the wallet to check.

The wallet saves a copy of itself on the phone the first time it's opened with internet, so it
opens with no internet later. Open it once online before you need it. On an iPhone, add it to
the Home Screen and open it from there: Safari deletes saved website data after 7 days without
a visit, and Onion Browser can't keep a copy at all. Test it in airplane mode now and then.

## Honest limits

- **Slow.** Each radio message takes seconds, more with many hops. A payment takes about 6 messages (asking for coins, the answer, the payment and its answer).
- **Only your 6 biggest coins** come over the radio. If you have many small ones (from
  mining), send yourself a payment of everything while you still have internet.
- **Channel privacy.** On a private channel, only people with its key can read the messages.
  The payment itself becomes public on the blockchain anyway, like every FierCoin payment.
- **Radios can be found.** Anyone with the right equipment can tell roughly where a radio is
  sending from.
- **"FIRC ok" and "FIRC err" are the gateway's word.** Anyone on the channel could send a fake
  one. For anything that matters, have the person you paid check that the coins arrived. After
  "not sent", ask for your coins again: if the wallet says the coins are gone, it went through.
- **Fake coin lists.** Each signature covers its own coin's amount, so one wrong amount just
  makes the payment invalid. But two payments signed with *different* wrong amounts could be
  combined into one valid payment that spends the difference as network fee (a known weakness
  of this kind of signature). So the wallet remembers every amount it hears for a coin and
  refuses to sign if a later answer gives a different one, and it refuses coin lines that
  don't agree with each other. Online, the server's real amounts replace what the radio said.
- **Wait for the answer** before paying again. Ask for your coins again before each payment,
  so you don't try to spend the same coin twice.
- **The Android app** doesn't have the mesh screen yet; use the web wallet in Chrome.

## For developers

The message format is in `MESH-FORMAT.md`. `test-vectors.json` holds shared examples that both
sides are tested against.

```
python -m unittest discover -s fiercoin-release/mesh-gateway  # gateway (no radio needed)
node --test 'fiercoin-release/mesh-gateway/*.test.js'        # wallet side + browser test
```

The browser test needs Edge, Chrome or Chromium; it opens the wallet with the server switched
off and makes a payment over the (simulated) mesh.
