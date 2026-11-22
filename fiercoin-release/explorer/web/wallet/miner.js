// FierCoin web miner worker: Scrypt (N=1024, r=1, p=1), the same as Litecoin.
'use strict';
const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const IV = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
const W = new Uint32Array(64);
function compress(st, blk, off) { // blk: Uint8Array, 64 bytes at off
  for (let i = 0; i < 16; i++) { const j = off + i * 4; W[i] = (blk[j] << 24) | (blk[j+1] << 16) | (blk[j+2] << 8) | blk[j+3]; }
  for (let i = 16; i < 64; i++) {
    const a = W[i-15], b = W[i-2];
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    W[i] = (W[i-16] + s0 + W[i-7] + s1) | 0;
  }
  let a=st[0],b=st[1],c=st[2],d=st[3],e=st[4],f=st[5],g=st[6],h=st[7];
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  st[0]=(st[0]+a)|0; st[1]=(st[1]+b)|0; st[2]=(st[2]+c)|0; st[3]=(st[3]+d)|0;
  st[4]=(st[4]+e)|0; st[5]=(st[5]+f)|0; st[6]=(st[6]+g)|0; st[7]=(st[7]+h)|0;
}
// sha256 of (prefix state) + data, returns 32 bytes into out
const PAD = new Uint8Array(256);
function finish(st, data, len, totalPrefix, out, outOff) {
  let off = 0;
  for (; len - off >= 64; off += 64) compress(st, data, off);
  const rem = len - off; PAD.fill(0, 0, 128);
  for (let i = 0; i < rem; i++) PAD[i] = data[off + i];
  PAD[rem] = 0x80;
  const n = rem + 9 <= 64 ? 64 : 128;
  const bits = (totalPrefix + len) * 8;
  PAD[n-4] = bits >>> 24; PAD[n-3] = bits >>> 16; PAD[n-2] = bits >>> 8; PAD[n-1] = bits;
  compress(st, PAD, 0); if (n === 128) compress(st, PAD, 64);
  for (let i = 0; i < 8; i++) { const v = st[i]; out[outOff+i*4]=v>>>24; out[outOff+i*4+1]=v>>>16; out[outOff+i*4+2]=v>>>8; out[outOff+i*4+3]=v; }
}
const keyHash = new Uint8Array(32), pad = new Uint8Array(64), inner = new Int32Array(8), outer = new Int32Array(8), st = new Int32Array(8);
const ihash = new Uint8Array(32);
function hmacInit(key80) { // key longer than 64 bytes -> hash it first
  st.set(IV); finish(st, key80, 80, 0, keyHash, 0);
  pad.fill(0x36); for (let i = 0; i < 32; i++) pad[i] ^= keyHash[i]; inner.set(IV); compress(inner, pad, 0);
  pad.fill(0x5c); for (let i = 0; i < 32; i++) pad[i] ^= keyHash[i]; outer.set(IV); compress(outer, pad, 0);
}
function hmac(msg, len, out, outOff) {
  st.set(inner); finish(st, msg, len, 64, ihash, 0);
  st.set(outer); finish(st, ihash, 32, 64, out, outOff);
}
const B = new Uint8Array(128), X = new Uint32Array(B.buffer), V = new Uint32Array(32 * 1024), T = new Uint32Array(16);
const msg1 = new Uint8Array(84), msg2 = new Uint8Array(132);
function salsa(Bv, o1, o2) { // Bv[o1..o1+16] ^= Bv[o2..o2+16]; salsa20/8 on Bv[o1..]
  for (let i = 0; i < 16; i++) T[i] = (Bv[o1+i] ^= Bv[o2+i]);
  let x0=T[0],x1=T[1],x2=T[2],x3=T[3],x4=T[4],x5=T[5],x6=T[6],x7=T[7],x8=T[8],x9=T[9],x10=T[10],x11=T[11],x12=T[12],x13=T[13],x14=T[14],x15=T[15],u;
  for (let i = 0; i < 8; i += 2) {
    u=x0+x12;x4^=u<<7|u>>>25;u=x4+x0;x8^=u<<9|u>>>23;u=x8+x4;x12^=u<<13|u>>>19;u=x12+x8;x0^=u<<18|u>>>14;
    u=x5+x1;x9^=u<<7|u>>>25;u=x9+x5;x13^=u<<9|u>>>23;u=x13+x9;x1^=u<<13|u>>>19;u=x1+x13;x5^=u<<18|u>>>14;
    u=x10+x6;x14^=u<<7|u>>>25;u=x14+x10;x2^=u<<9|u>>>23;u=x2+x14;x6^=u<<13|u>>>19;u=x6+x2;x10^=u<<18|u>>>14;
    u=x15+x11;x3^=u<<7|u>>>25;u=x3+x15;x7^=u<<9|u>>>23;u=x7+x3;x11^=u<<13|u>>>19;u=x11+x7;x15^=u<<18|u>>>14;
    u=x0+x3;x1^=u<<7|u>>>25;u=x1+x0;x2^=u<<9|u>>>23;u=x2+x1;x3^=u<<13|u>>>19;u=x3+x2;x0^=u<<18|u>>>14;
    u=x5+x4;x6^=u<<7|u>>>25;u=x6+x5;x7^=u<<9|u>>>23;u=x7+x6;x4^=u<<13|u>>>19;u=x4+x7;x5^=u<<18|u>>>14;
    u=x10+x9;x11^=u<<7|u>>>25;u=x11+x10;x8^=u<<9|u>>>23;u=x8+x11;x9^=u<<13|u>>>19;u=x9+x8;x10^=u<<18|u>>>14;
    u=x15+x14;x12^=u<<7|u>>>25;u=x12+x15;x13^=u<<9|u>>>23;u=x13+x12;x14^=u<<13|u>>>19;u=x14+x13;x15^=u<<18|u>>>14;
  }
  Bv[o1]+=x0;Bv[o1+1]+=x1;Bv[o1+2]+=x2;Bv[o1+3]+=x3;Bv[o1+4]+=x4;Bv[o1+5]+=x5;Bv[o1+6]+=x6;Bv[o1+7]+=x7;
  Bv[o1+8]+=x8;Bv[o1+9]+=x9;Bv[o1+10]+=x10;Bv[o1+11]+=x11;Bv[o1+12]+=x12;Bv[o1+13]+=x13;Bv[o1+14]+=x14;Bv[o1+15]+=x15;
}
const out32 = new Uint8Array(32);
function scrypt(header80) { // returns out32 (the block's proof-of-work hash, little-endian)
  hmacInit(header80);
  msg1.set(header80);
  for (let i = 1; i <= 4; i++) { msg1[80]=0; msg1[81]=0; msg1[82]=0; msg1[83]=i; hmac(msg1, 84, B, (i-1)*32); }
  for (let i = 0; i < 1024; i++) { V.set(X, i * 32); salsa(X, 0, 16); salsa(X, 16, 0); }
  for (let i = 0; i < 1024; i++) { const j = (X[16] & 1023) * 32; for (let k = 0; k < 32; k++) X[k] ^= V[j + k]; salsa(X, 0, 16); salsa(X, 16, 0); }
  msg2.set(B); msg2[128]=0; msg2[129]=0; msg2[130]=0; msg2[131]=1;
  hmac(msg2, 132, out32, 0);
  return out32;
}
function hexToBytes(h) { const b = new Uint8Array(h.length / 2); for (let i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16); return b; }

let job = 0;
function mine(id, header, target, nonce, step) {
  const hdr = hexToBytes(header), tgt = hexToBytes(target); // target is big-endian
  let count = 0, last = Date.now();
  const loop = () => {
    if (id !== job) return;
    for (let n = 0; n < 64; n++) {
      hdr[76] = nonce; hdr[77] = nonce >>> 8; hdr[78] = nonce >>> 16; hdr[79] = nonce >>> 24;
      const h = scrypt(hdr); count++;
      let ok = true;
      for (let i = 0; i < 32; i++) { const a = h[31 - i], b = tgt[i]; if (a < b) break; if (a > b) { ok = false; break; } }
      if (ok) { postMessage({ found: nonce >>> 0, id }); return; }
      nonce = (nonce + step) >>> 0;
    }
    const now = Date.now();
    if (now - last >= 1000) { postMessage({ hashes: count, ms: now - last }); count = 0; last = now; }
    setTimeout(loop, 0);
  };
  loop();
}
self.onmessage = (e) => {
  const m = e.data;
  job++;
  if (m.cmd === 'start') mine(job, m.header, m.target, m.nonce >>> 0, m.step);
};
if (typeof module !== 'undefined') module.exports = { scrypt };
