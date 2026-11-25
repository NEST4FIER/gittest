// Browser test of the web wallet with no internet: it must open from its offline copy, and
// a whole mesh payment must work through the real screens. Needs Edge, Chrome or Chromium
// (set BROWSER=/path/to/browser if it isn't found). Skips if none is installed.
// Run: node --test fiercoin-release/mesh-gateway/
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

// A stand-in FierCoin server: the wallet files plus a tiny API.
function startServer() {
  const calls = [];
  const srv = http.createServer((req, res) => {
    calls.push(req.url);
    if (req.url === '/api/status') return res.end(JSON.stringify({ blocks: 100, hashps: 1 }));
    if (req.url.startsWith('/api/')) { res.writeHead(404); return res.end('{}'); }
    let p = path.join(WEB, decodeURIComponent(req.url.split('?')[0]));
    if (p.endsWith(path.sep) || p.endsWith('/')) p = path.join(p, 'index.html');
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ srv, calls, port: srv.address().port })));
}

// Minimal Chrome DevTools Protocol client.
async function launch(exe) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'firc-browser-'));
  const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', ...(process.env.CI ? ['--no-sandbox'] : []), 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try { port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
  }
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
  const b = await launch(exe);
  try {
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
    b.close();
    srv.close();
  }
});
