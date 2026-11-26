# FierCoin over mesh radio: the message format

Meshtastic radios send short text messages (about 200 characters) over many kilometres with
no internet. FierCoin uses plain text lines so they can be copied in and out of the normal
Meshtastic app. Every line is at most **200 characters** and starts with `FIRC `.
Upper-case commands come from a phone, lower-case replies come from a gateway, so a gateway
never answers another gateway.

## Phone to gateway

| Line | Meaning |
|------|---------|
| `FIRC U <address>` | "Which coins can this address spend?" |
| `FIRC T <id> <i>/<n> <data>` | Part `i` of `n` of a signed payment. |

- `<id>`: 4 characters `0-9 a-z`, picked by the wallet, the same in every part of one payment.
- `<data>`: the raw signed payment bytes as base64url without padding (`A-Z a-z 0-9 - _`),
  cut into pieces of at most 180 characters. Parts count from 1; at most 20 parts.

## Gateway to phone

| Line | Meaning |
|------|---------|
| `FIRC u <tag> <i>/<n> <coin> <coin> ... [+<k>]` | Spendable coins, line `i` of `n`. |
| `FIRC u <tag> 1/1 none` | No spendable coins. |
| `FIRC ok <id> <txid>` | The payment was sent to the network (`<txid>` in hex). |
| `FIRC err <id> <message>` | It wasn't. `<id>` is `-` when the line couldn't be read at all. |

- `<tag>`: the last 6 characters of the address asked about, so a wallet ignores replies meant
  for someone else on the same channel.
- `<coin>`: `<txid>.<vout>.<value>`. `<txid>` is base64url of the 32 bytes of the txid as
  shown in hex. `<vout>` and `<value>` (in satoshis) are base36, lower case.
- At most 3 coins per line and 6 coins in total: the biggest spendable ones. If the address
  has more, the last line ends with `+<k>`: k coins weren't sent.
- `<message>` is at most 150 characters.

## How the wallet reads answers (anyone on the channel can send lines)

- Coin lines must agree: every line has `1 ≤ i ≤ n` and the same `n`, and one number never
  has two different lines (the same line pasted twice is fine). A damaged coin, or a value
  above 2^53, also stops the list. Such a list is never used for signing.
- A coin's value never changes. The wallet remembers every `<txid>.<vout>` → value it has
  heard (newest 500, per address) and refuses to sign when an answer gives a different value.
  Without this, two signatures made with different fake values could be combined (BIP143
  signs only its own input's value) and the difference would go to fees. Online, the
  server's coin list replaces the remembered values.
- More than one different `ok`/`err` line for one `<id>` is reported as a conflict.
- After a payment, if a later coin answer no longer has the coins it spent, the wallet says
  it most likely went through, whatever `ok`/`err` said.

## Example

`FIRC U firc1quspe8ts4nmm7swdcx8f3vz9f2cuecamldkjmgk` gets the answer
`FIRC u dkjmgk ...`. The exact lines for a real signed payment are in `test-vectors.json`;
both the wallet (`../explorer/web/wallet/mesh.js`) and the gateway are tested against them.
