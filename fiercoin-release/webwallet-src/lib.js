// FierCoin web wallet core: keys, addresses and signing. Runs only in the browser;
// private keys never leave the device.
import * as btc from '@scure/btc-signer';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { base58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import { hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';

export const NETWORKS = {
  main: { bech32: 'firc', pubKeyHash: 35, scriptHash: 5, wif: 163 },
  regtest: { bech32: 'rfirc', pubKeyHash: 111, scriptHash: 58, wif: 239 },
};
const PATH = "m/84'/2026'/0'/0/0";
const b58 = base58check(sha256);

export function newMnemonic() { return generateMnemonic(wordlist, 128); }
export function isMnemonic(m) { return validateMnemonic(norm(m), wordlist); }
function norm(m) { return m.trim().toLowerCase().split(/\s+/).join(' '); }

export function keyFromMnemonic(m, net = 'main') {
  const key = HDKey.fromMasterSeed(mnemonicToSeedSync(norm(m))).derive(PATH);
  const pay = btc.p2wpkh(key.publicKey, NETWORKS[net]);
  return { address: pay.address, script: hex.encode(pay.script), priv: hex.encode(key.privateKey) };
}

// Turns any FierCoin address into its locking script, or throws.
export function addressScript(addr, net = 'main') {
  addr = addr.trim();
  try { return btc.OutScript.encode(btc.Address(NETWORKS[net]).decode(addr)); } catch (e) {}
  if (net === 'main') {
    try {
      const raw = b58.decode(addr);
      if (raw.length === 21 && raw[0] === 95) return btc.OutScript.encode({ type: 'sh', hash: raw.slice(1) });
    } catch (e) {}
  }
  throw new Error('That is not a FierCoin address.');
}
export function isAddress(addr, net = 'main') { try { addressScript(addr, net); return true; } catch (e) { return false; } }

// utxos: [{txid, vout, value}] (value in satoshis). Spends the biggest coins first.
export function buildPayment({ utxos, to, amount, sendAll, feeRate, priv, net = 'main' }) {
  const N = NETWORKS[net];
  const privKey = hex.decode(priv);
  const me = btc.p2wpkh(secp256k1.getPublicKey(privKey, true), N);
  const toScript = addressScript(to, net);
  const coins = [...utxos].sort((a, b) => b.value - a.value);
  const vsize = (ins, outs) => 11 + 68 * ins + 43 * outs;
  let chosen = [], total = 0n, fee = 0n, change = 0n;
  amount = BigInt(amount || 0);
  if (sendAll) {
    chosen = coins; total = coins.reduce((s, c) => s + BigInt(c.value), 0n);
    fee = BigInt(Math.ceil(vsize(chosen.length, 1) * feeRate));
    amount = total - fee;
    if (amount <= 1000n) throw new Error('Not enough FIRC to pay the network fee.');
  } else {
    for (const c of coins) {
      chosen.push(c); total += BigInt(c.value);
      fee = BigInt(Math.ceil(vsize(chosen.length, 2) * feeRate));
      if (total >= amount + fee) break;
    }
    if (total < amount + fee) throw new Error('Not enough spendable FIRC (fee included).');
    change = total - amount - fee;
    if (change < 1000n) { fee += change; change = 0n; } // too small to keep: goes to the fee
  }
  const tx = new btc.Transaction();
  for (const c of chosen) tx.addInput({ txid: c.txid, index: c.vout, witnessUtxo: { script: me.script, amount: BigInt(c.value) } });
  tx.addOutput({ script: toScript, amount });
  if (change > 0n) tx.addOutput({ script: me.script, amount: change });
  tx.sign(privKey); tx.finalize();
  return { hex: tx.hex, txid: tx.id, fee: Number(fee), amount: Number(amount) };
}
