// Tests the wallet side of the mesh format (../explorer/web/wallet/mesh.js) against the
// shared examples in test-vectors.json, and a full offline payment with the real wallet library.
// Run: node --test fiercoin-release/mesh-gateway/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const M = require('../explorer/web/wallet/mesh.js');
const V = require('./test-vectors.json');

test('asking for coins is one short line', () => {
  assert.equal(M.coinsRequest(V.coins.address), 'FIRC U ' + V.coins.address);
});

test('a signed payment becomes the exact radio lines in the examples', () => {
  assert.deepEqual(M.paymentLines(V.payment.hex, V.payment.id), V.payment.lines);
});

test('a payment id is 4 characters 0-9 a-z when the wallet picks it', () => {
  const lines = M.paymentLines(V.payment.hex);
  assert.match(lines[0], /^FIRC T [0-9a-z]{4} 1\/2 /);
});

test('the gateway coin lines give back the biggest spendable coins', () => {
  const r = M.parseCoins(V.coins.lines.join('\n'), V.coins.address);
  assert.deepEqual(r.utxos, V.coins.wallet_gets);
  assert.equal(r.more, V.coins.more);
  assert.equal(r.complete, true);
});

test('coin lines can be pasted in any order, with app text around them', () => {
  const pasted = `Gateway: ${V.coins.lines[1]}\n\nsome chat\n[10:02] Gateway: ${V.coins.lines[0]}`;
  assert.deepEqual(M.parseCoins(pasted, V.coins.address).utxos, V.coins.wallet_gets);
});

test('only half the coin lines means not complete yet', () => {
  const r = M.parseCoins(V.coins.lines[0], V.coins.address);
  assert.equal(r.complete, false);
  assert.equal(r.have, 1);
  assert.equal(r.total, 2);
});

test('replies for someone else on the channel are ignored', () => {
  const r = M.parseCoins(V.coins.lines.join('\n'), 'firc1q4rsdpgwhsqmgjjq5jzm8kcvq7ulhu4ws0k55t6');
  assert.deepEqual(r.utxos, []);
  assert.equal(r.complete, false);
});

test('"none" means an empty wallet, complete', () => {
  const r = M.parseCoins(V.none.lines[0], V.none.address);
  assert.deepEqual(r.utxos, []);
  assert.equal(r.complete, true);
});

test('the gateway result is read for this payment only', () => {
  assert.deepEqual(M.parseResult(`FIRC ok k7q2 ${V.payment.txid}`, 'k7q2'), { ok: true, txid: V.payment.txid });
  assert.deepEqual(M.parseResult('FIRC err k7q2 The network refused this payment: bad-txns', 'k7q2'),
    { ok: false, message: 'The network refused this payment: bad-txns' });
  assert.equal(M.parseResult(`FIRC ok zzzz ${V.payment.txid}`, 'k7q2'), null);
});

test('no line is ever over 200 characters, and too big a payment is refused', () => {
  const big = 'ab'.repeat(2700); // 2,700 bytes -> 20 parts, the most allowed
  const lines = M.paymentLines(big, 'aaaa');
  assert.equal(lines.length, 20);
  for (const l of lines) assert.ok(l.length <= 200, l.length);
  assert.throws(() => M.paymentLines('ab'.repeat(2701), 'aaaa'), /too big/i);
});

test('offline payment end to end: coins from the radio, signed by the real wallet code', () => {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../explorer/web/wallet/firc-lib.js'), 'utf8'));
  const words = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const k = FIRC.keyFromMnemonic(words, 'main');
  assert.equal(k.address, V.coins.address);
  const { utxos } = M.parseCoins(V.coins.lines.join('\n'), k.address);
  const p = FIRC.buildPayment({ utxos, to: 'firc1q4rsdpgwhsqmgjjq5jzm8kcvq7ulhu4ws0k55t6', amount: 100000000, feeRate: 5, priv: k.priv, net: 'main' });
  const lines = M.paymentLines(p.hex, 'e2e0');
  const back = lines.map((l) => l.split(' ')[4]).join('');
  assert.equal(Buffer.from(back, 'base64url').toString('hex'), p.hex);
});
