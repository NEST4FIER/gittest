// FierCoin over mesh radio: turns payments into short text lines for the Meshtastic app,
// and reads the gateway's replies. The format is in fiercoin-release/mesh-gateway/MESH-FORMAT.md.
// Plain JavaScript, no build step. In the wallet it's window.FIRCMesh.
(function (root) {
  'use strict';
  const MAX_LINE = 200, PART = 180, MAX_PARTS = 20;

  function hexToB64u(hex) {
    let bin = '';
    for (let i = 0; i < hex.length; i += 2) bin += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uToHex(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    let hex = '';
    for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, '0');
    return hex;
  }
  function newId() {
    const a = new Uint8Array(4);
    (root.crypto || globalThis.crypto).getRandomValues(a);
    return Array.from(a, (b) => (b % 36).toString(36)).join('');
  }

  function coinsRequest(address) { return 'FIRC U ' + address; }

  // Signed payment (hex) -> the lines to send, in order.
  function paymentLines(hex, id) {
    id = id || newId();
    const data = hexToB64u(hex), parts = [];
    for (let i = 0; i < data.length; i += PART) parts.push(data.slice(i, i + PART));
    if (parts.length > MAX_PARTS) throw new Error('This payment is too big for the mesh radio. Send a smaller amount, or fewer coins at once.');
    return parts.map((p, i) => `FIRC T ${id} ${i + 1}/${parts.length} ${p}`);
  }

  // Pasted text (any order, any extra chat) -> the coins for this address.
  // Radio text is untrusted: lines that can't be right (number 0 or above the count, counts
  // that disagree, two different lines with one number) set `conflict`, and damaged coins set
  // `bad`. Neither is ever "complete", so the wallet won't sign with it.
  const COIN = /^([A-Za-z0-9_-]{43})\.([0-9a-z]{1,8})\.([0-9a-z]{1,11})$/;
  function parseCoins(text, address) {
    const tag = address.slice(-6), got = new Map(), seen = new Map();
    let total = null, more = 0, none = false, conflict = false, bad = false;
    const re = /FIRC u (\S{6}) (\d+)\/(\d+) ([^\r\n]*)/g;
    let m;
    while ((m = re.exec(text))) {
      if (m[1] !== tag) continue;
      const i = +m[2], n = +m[3], body = m[4].trim();
      if (i < 1 || i > n || (total !== null && n !== total)) { conflict = true; continue; }
      total = n;
      if (seen.has(i)) { if (seen.get(i) !== body) conflict = true; continue; }
      seen.set(i, body);
      const rest = body.split(/\s+/);
      if (rest[0] === 'none') { none = true; got.set(i, []); continue; }
      const coins = [];
      for (const tok of rest) {
        if (/^\+\d+$/.test(tok)) { more = +tok.slice(1); continue; }
        const c = COIN.exec(tok);
        if (!c) { bad = true; continue; }
        const value = parseInt(c[3], 36);
        if (!Number.isSafeInteger(value)) { bad = true; continue; }
        coins.push({ txid: b64uToHex(c[1]), vout: parseInt(c[2], 36), value, mature: true });
      }
      got.set(i, coins);
    }
    const order = [...got.keys()].sort((a, b) => a - b);
    const utxos = [].concat(...order.map((k) => got.get(k)));
    const complete = total !== null && got.size === total && !conflict && !bad;
    return { utxos, have: got.size, total, more, none, conflict, bad, complete };
  }

  // A coin's amount never changes. Remember every amount the radio told us (newest 500), and
  // report coins whose amount differs from what we heard before. Signing the same payment twice
  // with different (fake) amounts would let a faker join the two signatures and burn the
  // difference as network fee, so the wallet refuses when `changed` isn't empty.
  const KEEP = 500;
  function rememberValues(known, utxos) {
    const out = Object.assign({}, known), changed = [];
    for (const c of utxos) {
      const k = c.txid + ':' + c.vout;
      if (k in out) { if (out[k] !== c.value) changed.push(c); continue; }
      out[k] = c.value;
    }
    const keys = Object.keys(out);
    for (const k of keys.slice(0, Math.max(0, keys.length - KEEP))) delete out[k];
    return { known: out, changed };
  }

  // Signed payment (hex) -> the coins it spends [{txid, vout}].
  function txInputs(hex) {
    let pos = 8; // version
    const byte = () => parseInt(hex.substr(pos, 2), 16);
    if (hex.substr(pos, 4) === '0001') pos += 4; // segwit marker + flag
    const varint = () => {
      const b = byte(); pos += 2;
      if (b < 0xfd) return b;
      const len = b === 0xfd ? 2 : b === 0xfe ? 4 : 8;
      let v = 0;
      for (let j = len - 1; j >= 0; j--) v = v * 256 + parseInt(hex.substr(pos + j * 2, 2), 16);
      pos += len * 2; return v;
    };
    const n = varint(), ins = [];
    for (let i = 0; i < n; i++) {
      const txid = hex.substr(pos, 64).match(/../g).reverse().join('');
      const v = hex.substr(pos + 64, 8).match(/../g).reverse().join('');
      pos += 72;
      const scriptLen = varint();
      pos += scriptLen * 2 + 8; // script + sequence
      ins.push({ txid, vout: parseInt(v, 16) });
    }
    return ins;
  }

  // True when none of the coins a payment used are in the new coin list: it most likely went
  // through, whatever answer came back.
  function coinsGone(used, utxos) {
    if (!used.length) return false;
    const have = new Set(utxos.map((c) => c.txid + ':' + c.vout));
    return used.every((c) => !have.has(c.txid + ':' + c.vout));
  }

  // Gateway answer for one payment id -> {ok, txid} / {ok:false, message} / {conflict:true}
  // (answers that disagree: someone may be faking them) / null if not there.
  function parseResult(text, id) {
    const re = new RegExp('FIRC (ok|err) ' + id + ' ([^\\r\\n]*)', 'g'), found = new Map();
    let m;
    while ((m = re.exec(text))) found.set(m[1] + ' ' + m[2].trim(), m);
    if (!found.size) return null;
    if (found.size > 1) return { conflict: true };
    const [only] = found.values();
    return only[1] === 'ok' ? { ok: true, txid: only[2].trim() } : { ok: false, message: only[2].trim() };
  }

  const api = { MAX_LINE, coinsRequest, paymentLines, parseCoins, parseResult, rememberValues, txInputs, coinsGone };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FIRCMesh = api;
})(typeof window !== 'undefined' ? window : globalThis);
