// Browser test of the web wallet with no internet: it must open from its offline copy, and
// a whole mesh payment must work through the real screens. Needs Edge, Chrome or Chromium
// (set BROWSER=/path/to/browser if it isn't found). Skips if none is installed.
// Run: node --test 'fiercoin-release/mesh-gateway/*.test.js'
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const V = require('./test-vectors.json');

const WEB = path.join(__dirname, '../explorer/web');
const WORDS = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

function findBrowser() {
  const c = [process.env.BROWSER,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return c.find((p) => p && fs.existsSync(p));
}

// A stand-in FierCoin server: the wallet files plus a tiny API. `S` changes how it behaves:
// S.down = 502 for every wallet file (like Caddy with the Explorer stopped), S.slowMs = answer
// wallet files late, S.apiDown = no live data (no internet), S.version = a marker put into index.html, S.utxos = the online coin list.
function startServer(S = {}) {
  const calls = [];
  const srv = http.createServer((req, res) => {
    calls.push(req.url);
    if (S.apiDown && req.url.startsWith('/api/')) { res.writeHead(502); return res.end(); }
    if (req.url === '/api/status') return res.end(JSON.stringify({ blocks: 100, hashps: 1 }));
    if (req.url.startsWith('/api/utxos/')) return res.end(JSON.stringify({ tip: 100, utxos: S.utxos || [] }));
    if (req.url.startsWith('/api/')) { res.writeHead(404); return res.end('{}'); }
    if (S.down) { res.writeHead(502); return res.end('Bad Gateway'); }
    let p = path.join(WEB, decodeURIComponent(req.url.split('?')[0]));
    if (p.endsWith(path.sep) || p.endsWith('/')) p = path.join(p, 'index.html');
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404); return res.end(); }
      if (S.version && p.endsWith('index.html')) data = Buffer.from(String(data).replace('<head>', `<head><meta name="x-version" content="${S.version}">`));
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      }, S.slowMs || 0);
    });
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ srv, calls, port: srv.address().port })));
}

// Minimal Chrome DevTools Protocol client.
async function launch(exe) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'firc-browser-'));
  const ci = process.env.CI ? ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] : [];
  const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', ...ci, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let errText = '';
  proc.stderr.on('data', (d) => { errText = (errText + d).slice(-3000); });
  let port;
  for (let i = 0; i < 300 && !port; i++) {
    try { port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
  }
  if (!port) { proc.kill(); throw new Error('The browser did not start within 30 s. Its messages:\n' + errText); }
  const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((ok) => ws.addEventListener('open', ok, { once: true }));
  let id = 0; const waiting = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
  const send = (method, params = {}, sessionId) => new Promise((ok, bad) => {
    const n = ++id; waiting.set(n, (m) => (m.error ? bad(new Error(m.error.message)) : ok(m.result)));
    ws.send(JSON.stringify({ id: n, method, params, sessionId }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const page = (m, p) => send(m, p, sessionId);
  const evaluate = async (expression) => {
    const r = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const close = () => { try { ws.close(); } catch (e) {} proc.kill(); };
  // SHOTS=<folder> saves phone-size screenshots, for a person to look at.
  const shot = async (name) => {
    if (!process.env.SHOTS) return;
    await page('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    const { data } = await page('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(process.env.SHOTS, name + '.png'), Buffer.from(data, 'base64'));
  };
  return { page, evaluate, close, shot };
}

async function until(evaluate, expr, what, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await evaluate(expr)) return; } catch (e) { /* page still loading */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Timed out waiting for: ' + what);
}

const exe = findBrowser();
if (!exe && process.env.REQUIRE_BROWSER) throw new Error('No browser found, and REQUIRE_BROWSER is set.');
test('wallet opens with no internet, and pays over the mesh', { skip: !exe && 'no Edge/Chrome/Chromium found' }, async () => {
  const { srv, calls, port } = await startServer();
  let b;
  try {
    b = await launch(exe);
    // Online once: the wallet saves its offline copy.
    await b.page('Page.navigate', { url: `http://127.0.0.1:${port}/wallet/` });
    await until(b.evaluate, '!!(navigator.serviceWorker && navigator.serviceWorker.controller)', 'offline copy to be ready');

    // Internet gone: the server stops. The wallet must still open, with everything it needs.
    await new Promise((ok) => srv.close(ok));
    srv.closeAllConnections();
    await b.page('Page.reload', { ignoreCache: false });
    await until(b.evaluate, "document.readyState === 'complete' && typeof FIRC === 'object' && typeof FIRCMesh === 'object'", 'wallet to open offline');

    // Restore the test wallet (keys are made on the device, no server needed).
    await b.evaluate(`(async () => { show('s-restore'); $('r-words').value = '${WORDS}'; $('r-pass').value = 'secret1'; await restore(); })()`);
    assert.equal(await b.evaluate('wallet.address'), V.coins.address);

    // Step 1: ask for coins, paste the gateway's answer.
    await b.evaluate('openMesh()');
    assert.equal(await b.evaluate("$('mesh-ask').textContent"), 'FIRC U ' + V.coins.address);
    assert.equal(await b.evaluate("$('mesh-pay').disabled"), true);
    await b.evaluate(`$('mesh-in').value = ${JSON.stringify(V.coins.lines.join('\n'))}; meshReadCoins()`);
    assert.equal(await b.evaluate("$('mesh-pay').disabled"), false);
    // 6 biggest coins came over the radio (84,000,052.50112444 FIRC), and 1 more stayed behind.
    assert.match(await b.evaluate("$('mesh-coins').textContent"), /84,000,052\.50\d* FIRC/);
    assert.match(await b.evaluate("$('mesh-coins').textContent"), /1 smaller coin/);
    await b.shot('1-mesh-screen');

    // Switching to another wallet must not leave the first wallet's radio coins on screen.
    await b.evaluate(`(async () => { startAdd('s-restore'); $('r-words').value = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong'; $('r-pass').value = 'secret2'; await restore(); })()`);
    assert.notEqual(await b.evaluate('wallet.address'), V.coins.address);
    assert.equal(await b.evaluate("$('mesh-pay').disabled"), true, 'mesh screen must reset for the other wallet');
    assert.equal(await b.evaluate("$('mesh-coins').textContent"), '');
    assert.equal(await b.evaluate("$('mesh-in').value"), '');
    await b.evaluate(`switchWallet('${V.coins.address}')`);
    await b.evaluate(`openMesh(); $('mesh-in').value = ${JSON.stringify(V.coins.lines.join('\n'))}; meshReadCoins()`);
    assert.equal(await b.evaluate("$('mesh-pay').disabled"), false);

    // Step 2: pay. The wallet must show radio lines instead of using the internet.
    await b.evaluate(`(async () => { openSend(true); $('to').value = 'firc1q4rsdpgwhsqmgjjq5jzm8kcvq7ulhu4ws0k55t6'; $('amt').value = '1'; $('s-pass').value = 'secret1'; await doSend(); })()`);
    await until(b.evaluate, "$('ov-confirm').classList.contains('on')", 'confirm pop-up');
    await b.evaluate("$('cf-ok').click()");
    await until(b.evaluate, "$('ov-mesh').classList.contains('on')", 'mesh lines pop-up');
    const lines = await b.evaluate("[...document.querySelectorAll('#mesh-lines .addr')].map((e) => e.textContent)");
    assert.ok(lines.length >= 1 && lines.length <= 20, lines.length);
    for (const l of lines) { assert.match(l, /^FIRC T [0-9a-z]{4} \d+\/\d+ [A-Za-z0-9_-]+$/); assert.ok(l.length <= 200); }
    const hex = Buffer.from(lines.map((l) => l.split(' ')[4]).join(''), 'base64url').toString('hex');
    assert.match(hex, /^02000000000101/); // a signed segwit payment with 1 input (the 84M coin)

    // The gateway's answer, pasted back.
    const id = lines[0].split(' ')[2];
    await b.evaluate(`$('mesh-res').value = 'Gateway: FIRC ok ${id} ${V.payment.txid}'; meshReadResult()`);
    assert.match(await b.evaluate("$('mesh-done').textContent"), /Sent/);
    await b.shot('2-radio-messages');
    assert.equal(await b.evaluate("$('mesh-pay').disabled"), true, 'coins must be asked for again before the next payment');
    assert.equal(calls.filter((u) => u.startsWith('/api/broadcast')).length, 0);
  } finally {
    if (b) b.close();
    srv.close();
    srv.closeAllConnections();
  }
});

// Gateway-style coin line for the test wallet.
const toLine = (coins, i = 1, n = 1) => `FIRC u ${V.coins.address.slice(-6)} ${i}/${n} ` +
  coins.map((c) => `${Buffer.from(c.txid, 'hex').toString('base64url')}.${c.vout.toString(36)}.${c.value.toString(36)}`).join(' ');
const CA = { txid: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', vout: 2 };
const CB = { txid: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210', vout: 0 };
const CC = { txid: '1111111111111111111111111111111111111111111111111111111111111111', vout: 1 };

async function withWallet(S, fn) {
  const { srv, port } = await startServer(S);
  let b;
  try {
    b = await launch(exe);
    await b.page('Page.navigate', { url: `http://127.0.0.1:${port}/wallet/` });
    await until(b.evaluate, '!!(navigator.serviceWorker && navigator.serviceWorker.controller)', 'offline copy to be ready');
    await fn(b);
  } finally {
    if (b) b.close();
    srv.close();
    srv.closeAllConnections();
  }
}

test('fake radio answers: changed amounts, forged "not sent", mixed answers, coins gone', { skip: !exe && 'no Edge/Chrome/Chromium found' }, async () => {
  const S = { apiDown: true }; // no internet: only the radio
  await withWallet(S, async (b) => {
    await b.evaluate(`(async () => { show('s-restore'); $('r-words').value = '${WORDS}'; $('r-pass').value = 'secret1'; await restore(); })()`);
    await b.evaluate('openMesh()');
    const read = async (text) => { await b.evaluate(`$('mesh-in').value = ${JSON.stringify(text)}; meshReadCoins()`); return b.evaluate("$('mesh-coins').textContent"); };

    // 1. A faker answers A=10, B=2, and later A=7, B=5 (the "two signatures" trick).
    await read(toLine([{ ...CA, value: 10e8 }, { ...CB, value: 2e8 }]));
    assert.equal(await b.evaluate("$('mesh-pay').disabled"), false);
    assert.match(await read(toLine([{ ...CA, value: 7e8 }, { ...CB, value: 5e8 }])), /fake/i);
    assert.equal(await b.evaluate("$('mesh-pay').disabled"), true, 'must not sign with changed amounts');
    // Still refused after a page reload (the amounts are remembered on the phone).
    await b.page('Page.reload', {});
    await until(b.evaluate, "document.readyState === 'complete' && typeof wallet === 'object' && !!wallet", 'wallet to reload');
    await b.evaluate('openMesh()');
    assert.match(await read(toLine([{ ...CA, value: 7e8 }, { ...CB, value: 5e8 }])), /fake/i);

    // 2. Online, the server's real amounts replace what the radio said.
    S.apiDown = false;
    S.utxos = [{ ...CA, value: 10e8, mature: true, height: 5 }, { ...CB, value: 5e8, mature: true, height: 5 }];
    await b.evaluate('refresh()');
    await b.evaluate('openMesh()');
    assert.doesNotMatch(await read(toLine([{ ...CA, value: 10e8 }, { ...CB, value: 5e8 }])), /fake/i);
    assert.equal(await b.evaluate("$('mesh-pay').disabled"), false);

    // 3. Lines that disagree with each other.
    assert.match(await read(toLine([{ ...CA, value: 10e8 }], 1, 1) + '\n' + toLine([{ ...CC, value: 1e8 }], 2, 1)), /don't agree/i);
    assert.equal(await b.evaluate("$('mesh-pay').disabled"), true);
    await read(toLine([{ ...CA, value: 10e8 }, { ...CB, value: 5e8 }]));

    // 4. Pay; a forged "not sent" must not make it look safe to pay again.
    await b.evaluate(`(async () => { openSend(true); $('to').value = 'firc1q4rsdpgwhsqmgjjq5jzm8kcvq7ulhu4ws0k55t6'; $('amt').value = '1'; $('s-pass').value = 'secret1'; await doSend(); })()`);
    await until(b.evaluate, "$('ov-confirm').classList.contains('on')", 'confirm pop-up');
    await b.evaluate("$('cf-ok').click()");
    await until(b.evaluate, "$('ov-mesh').classList.contains('on')", 'mesh lines pop-up');
    const id = await b.evaluate("document.querySelector('#mesh-lines .addr').textContent.split(' ')[2]");
    await b.evaluate(`$('mesh-res').value = 'FIRC err ${id} Not sent'; meshReadResult()`);
    assert.match(await b.evaluate("$('mesh-done').textContent"), /ask for your coins again/i);
    await b.evaluate(`$('mesh-res').value = ${JSON.stringify(`FIRC err ${id} Not sent\n`)} + 'FIRC ok ${id} ${V.payment.txid}'; meshReadResult()`);
    assert.match(await b.evaluate("$('mesh-done').textContent"), /both/i);

    // 5. The next coin answer no longer has the coins the payment used: it went through.
    await b.evaluate("closeOv('ov-mesh')");
    assert.match(await read(toLine([{ ...CC, value: 3e8 }])), /went through/i);
  });
});

test('offline copy: a server error page or a slow update never breaks the wallet', { skip: !exe && 'no Edge/Chrome/Chromium found' }, async () => {
  const S = {};
  await withWallet(S, async (b) => {
    const ready = "document.readyState === 'complete' && typeof FIRC === 'object' && typeof FIRCMesh === 'object'";
    // The server is up but the Explorer behind it isn't: every file is a 502 error page.
    S.down = true;
    await b.page('Page.reload', {});
    await until(b.evaluate, ready, 'wallet to open from its saved copy');
    // A new version arrives on a very slow link: this time the saved copy opens...
    S.down = false; S.version = 'v2'; S.slowMs = 6500;
    await b.page('Page.reload', {});
    await until(b.evaluate, ready, 'wallet to open while the network is slow');
    assert.equal(await b.evaluate("document.querySelector('meta[name=x-version]')"), null);
    await new Promise((r) => setTimeout(r, 4000)); // ...and the late answer still updates the copy.
    S.down = true; S.slowMs = 0;
    await b.page('Page.reload', {});
    await until(b.evaluate, ready, 'wallet to open from its saved copy');
    assert.equal(await b.evaluate("document.querySelector('meta[name=x-version]')?.content"), 'v2');
  });
});
