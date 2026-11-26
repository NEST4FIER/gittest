// Tests the wallet side of the mesh format (../explorer/web/wallet/mesh.js) against the
// shared examples in test-vectors.json, and a full offline payment with the real wallet library.
// Run: node --test 'fiercoin-release/mesh-gateway/*.test.js'
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

// ---------- Fake radio answers (review findings) ----------
const A = { txid: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', vout: 2, mature: true };
const B = { txid: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210', vout: 0, mature: true };

test('the "two signatures" trick is caught: a coin whose amount changes between answers', () => {
  // Real coins: A = 10, B = 5. A faker answers A=10,B=2, then (after the payment fails) A=7,B=5.
  // Signing both would let them join A's first signature with B's second and burn 3 FIRC as fee.
  const first = M.rememberValues({}, [{ ...A, value: 10e8 }, { ...B, value: 2e8 }]);
  assert.deepEqual(first.changed, []);
  const second = M.rememberValues(first.known, [{ ...A, value: 7e8 }, { ...B, value: 5e8 }]);
  assert.equal(second.changed.length, 2);
  assert.deepEqual(second.known, first.known, 'the first amounts are kept, not overwritten by the faker');
  // The same honest answer again is fine.
  assert.deepEqual(M.rememberValues(first.known, [{ ...A, value: 10e8 }]).changed, []);
});

test('remembered amounts stay a small, bounded list', () => {
  let known = {};
  for (let i = 0; i < 700; i++) known = M.rememberValues(known, [{ ...A, vout: i, value: 1 }]).known;
  assert.ok(Object.keys(known).length <= 500);
  assert.ok(known[A.txid + ':699'], 'the newest coins are the ones kept');
});

test('the coins a signed payment spends are read back out of it', () => {
  assert.deepEqual(M.txInputs(V.payment.hex), [{ txid: 'ab'.repeat(32), vout: 1 }]);
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../explorer/web/wallet/firc-lib.js'), 'utf8'));
  const k = FIRC.keyFromMnemonic('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', 'main');
  const utxos = [{ ...A, value: 3e8 }, { ...B, value: 2e8 }];
  const p = FIRC.buildPayment({ utxos, to: 'firc1q4rsdpgwhsqmgjjq5jzm8kcvq7ulhu4ws0k55t6', amount: 0, sendAll: true, feeRate: 5, priv: k.priv, net: 'main' });
  const got = M.txInputs(p.hex).map((c) => c.txid + ':' + c.vout).sort();
  assert.deepEqual(got, [A.txid + ':2', B.txid + ':0'].sort());
});

test('a payment whose coins are gone from the next answer most likely went through', () => {
  const used = [{ txid: A.txid, vout: 2 }];
  assert.equal(M.coinsGone(used, [{ ...B, value: 1 }]), true);
  assert.equal(M.coinsGone(used, [{ ...A, value: 1 }, { ...B, value: 1 }]), false);
  assert.equal(M.coinsGone([], [{ ...B, value: 1 }]), false);
});

test('both "ok" and "err" for one payment is reported as a conflict, not as "not sent"', () => {
  const text = `FIRC err k7q2 Not sent: fake\nFIRC ok k7q2 ${V.payment.txid}`;
  assert.deepEqual(M.parseResult(text, 'k7q2'), { conflict: true });
  assert.deepEqual(M.parseResult(`FIRC ok k7q2 ${V.payment.txid}\nFIRC ok k7q2 ${'0'.repeat(64)}`, 'k7q2'), { conflict: true });
  assert.deepEqual(M.parseResult(`FIRC ok k7q2 ${V.payment.txid}\nFIRC ok k7q2 ${V.payment.txid}`, 'k7q2'), { ok: true, txid: V.payment.txid });
});

test('coin lines with impossible numbers, or that disagree, are not "complete"', () => {
  const [l1, l2] = V.coins.lines; // "FIRC u <tag> 1/2 ..." and "... 2/2 ..."
  const tag = V.coins.address.slice(-6);
  const coin = l1.split(' ')[4];
  // A stray extra line "3/2" or "0/2" must not count.
  let r = M.parseCoins([l1, l2, `FIRC u ${tag} 3/2 ${coin}`].join('\n'), V.coins.address);
  assert.equal(r.conflict, true); assert.equal(r.complete, false);
  r = M.parseCoins([l1, l2, `FIRC u ${tag} 0/2 ${coin}`].join('\n'), V.coins.address);
  assert.equal(r.conflict, true); assert.equal(r.complete, false);
  // A "1/1" from a faker next to the real 1/2 + 2/2.
  r = M.parseCoins([l1, l2, `FIRC u ${tag} 1/1 ${coin}`].join('\n'), V.coins.address);
  assert.equal(r.conflict, true); assert.equal(r.complete, false);
  // Two different lines for the same number.
  r = M.parseCoins([l1, l2, l1.replace(/\.[0-9a-z]+(\s|$)/, '.1$1')].join('\n'), V.coins.address);
  assert.equal(r.conflict, true); assert.equal(r.complete, false);
  // The same line pasted twice is fine.
  r = M.parseCoins([l1, l2, l1].join('\n'), V.coins.address);
  assert.equal(r.conflict, false); assert.equal(r.complete, true);
});

test('a damaged coin line gives a message, never a crash', () => {
  const tag = V.coins.address.slice(-6);
  const r = M.parseCoins(`FIRC u ${tag} 1/1 ${'!'.repeat(43)}.0.1`, V.coins.address);
  assert.equal(r.bad, true); assert.equal(r.complete, false);
});

test('an amount too big to hold exactly is treated as damaged', () => {
  const tag = V.coins.address.slice(-6), txid = V.coins.lines[0].split(' ')[4].split('.')[0];
  const r = M.parseCoins(`FIRC u ${tag} 1/1 ${txid}.0.zzzzzzzzzzz`, V.coins.address); // 36^11 - 1
  assert.equal(r.bad, true); assert.equal(r.complete, false);
});
