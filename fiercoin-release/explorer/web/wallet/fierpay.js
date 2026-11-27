// FierCoin "pay me" helpers. The iPhone web wallet (explorer/web/wallet/fierpay.js) and the
// Android app (android-app/assets/fierpay.js) use this same file: keep the two copies identical.
//  - payUri(): the text inside a "pay me" QR code, with an amount if one is asked for.
//    Both FierCoin apps read the address and the amount when they scan it.
//  - drawCard(): a printable pay-me card, 3.5 x 2 inches at 300 dots per inch.
//  - sheetPdf(): a one-page Letter PDF with 10 of those cards, laid out like standard
//    business-card sheets (2 across, 5 down), with dashed lines to cut along.
(function (root) {
  'use strict';
  const W = 1050, H = 600; // one card: 3.5 x 2 inches at 300 dots per inch
  const FONT = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const MONO = 'ui-monospace, Menlo, "Roboto Mono", "DejaVu Sans Mono", monospace';

  // 250000000 (satoshis) -> "2.5". No thousands commas: wallets read this number back.
  function plainAmount(sats) {
    const s = String(Math.max(0, Math.round(Number(sats) || 0))).padStart(9, '0');
    const whole = s.slice(0, -8).replace(/^0+(?=\d)/, '');
    const frac = s.slice(-8).replace(/0+$/, '');
    return frac ? whole + '.' + frac : whole;
  }

  function payUri(address, sats) {
    return 'fiercoin:' + address + (sats > 0 ? '?amount=' + plainAmount(sats) : '');
  }

  // Picks the biggest font size (down to `min`) at which `text` fits in `maxW`.
  function fitFont(g, text, style, size, min, maxW, family) {
    for (let s = size; s > min; s -= 2) {
      g.font = style + ' ' + s + 'px ' + family;
      if (g.measureText(text).width <= maxW) return s;
    }
    g.font = style + ' ' + min + 'px ' + family;
    return min;
  }

  // Splits text into at most `lines` lines that fit `maxW`; cuts the end with "…" if needed.
  function wrap(g, text, maxW, lines) {
    const out = [];
    let cur = '';
    for (const w of String(text).split(/\s+/).filter(Boolean)) {
      const t = cur ? cur + ' ' + w : w;
      if (!cur || g.measureText(t).width <= maxW) cur = t;
      else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    if (out.length > lines) { out.length = lines; out[lines - 1] += '…'; }
    return out.map((l) => {
      while (l.length > 1 && g.measureText(l).width > maxW) l = l.slice(0, -2).trimEnd() + '…';
      return l;
    });
  }

  // o = { address, name (optional), logo (a loaded <img>, optional), qrcode (the QR maker) }
  function drawCard(canvas, o) {
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#d84315'; g.fillRect(0, 0, 24, H); // orange edge

    // QR code at the top right, with the white space around it that scanners need.
    const qr = o.qrcode(0, 'M'); qr.addData(payUri(o.address)); qr.make();
    const n = qr.getModuleCount(), cell = Math.floor(360 / n), size = cell * n;
    const qx = W - 54 - size, qy = 54;
    g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect(qx + c * cell, qy + r * cell, cell, cell);

    // Left side: logo, name, and how to pay.
    const x = 76, maxW = qx - 46 - x;
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    if (o.logo && o.logo.complete && o.logo.naturalWidth) g.drawImage(o.logo, x, 50, 88, 88);
    else {
      g.fillStyle = '#d84315'; g.beginPath(); g.arc(x + 44, 94, 44, 0, 2 * Math.PI); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 56px ' + FONT; g.textAlign = 'center'; g.fillText('F', x + 44, 114); g.textAlign = 'left';
    }
    g.fillStyle = '#1d1712'; g.font = 'bold 50px ' + FONT; g.fillText('FierCoin', x + 106, 112);

    let y = 214;
    const name = String(o.name || '').trim();
    if (name) {
      fitFont(g, name, 'bold', 58, 44, maxW, FONT);
      for (const line of wrap(g, name, maxW, 2)) { g.fillText(line, x, y); y += 64; }
      g.fillStyle = '#d84315'; fitFont(g, 'Pay me with FierCoin', '600', 36, 26, maxW, FONT);
      g.fillText('Pay me with FierCoin', x, y - 8);
    } else {
      g.font = 'bold 58px ' + FONT;
      for (const line of wrap(g, 'Pay me with FierCoin', maxW, 2)) { g.fillText(line, x, y); y += 64; }
    }
    g.fillStyle = '#6b5a4e'; g.font = '28px ' + FONT;
    const how = wrap(g, 'Scan with the FierCoin app to pay', maxW, 2);
    const last = 428; // baseline of the last line, kept clear of the address below
    how.forEach((line, i) => g.fillText(line, x, last - (how.length - 1 - i) * 36));

    // Bottom: the whole address (so it can be checked by eye) and the motto.
    g.fillStyle = '#1d1712'; fitFont(g, o.address, '', 31, 18, W - 54 - x, MONO);
    g.fillText(o.address, x, 508);
    g.fillStyle = '#d84315'; g.font = '600 28px ' + FONT;
    g.fillText('FIRC  ·  Freedom Is Everyone’s Right', x, 556);
    return canvas;
  }

  function bytesFromDataUrl(url) {
    const bin = atob(String(url).split(',')[1] || '');
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // A one-page Letter PDF (8.5 x 11 in) with the card picture (a JPEG) 10 times, at its real
  // size (3.5 x 2 in), 0.75 in from the sides and 0.5 in from the top, and dashed cut lines.
  function sheetPdf(jpeg, imgW, imgH) {
    const te = new TextEncoder(), parts = [], at = [];
    let len = 0;
    const add = (x) => { const b = typeof x === 'string' ? te.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (n, write) => { at[n] = len; add(n + ' 0 obj\n'); write(); add('\nendobj\n'); };
    const cw = 252, ch = 144, left = 54, top = 756; // points (1 in = 72 points); PDF counts y from the bottom
    let page = '';
    for (let r = 0; r < 5; r++) for (let c = 0; c < 2; c++) page += 'q ' + cw + ' 0 0 ' + ch + ' ' + (left + c * cw) + ' ' + (top - (r + 1) * ch) + ' cm /Card Do Q\n';
    page += '0.6 G 0.6 w [4 3] 0 d\n';
    for (let r = 0; r <= 5; r++) page += left + ' ' + (top - r * ch) + ' m ' + (left + 2 * cw) + ' ' + (top - r * ch) + ' l S\n';
    for (let c = 0; c <= 2; c++) page += (left + c * cw) + ' ' + (top - 5 * ch) + ' m ' + (left + c * cw) + ' ' + top + ' l S\n';
    const content = te.encode(page);

    add(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // %PDF-1.4 + binary marker
    obj(1, () => add('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
    obj(3, () => add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Card 4 0 R >> >> /Contents 5 0 R >>'));
    obj(4, () => {
      add('<< /Type /XObject /Subtype /Image /Width ' + imgW + ' /Height ' + imgH + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>\nstream\n');
      add(jpeg); add('\nendstream');
    });
    obj(5, () => { add('<< /Length ' + content.length + ' >>\nstream\n'); add(content); add('\nendstream'); });
    obj(6, () => add('<< /Title (FierCoin pay-me cards) /Producer (FierCoin wallet) >>'));
    const xref = len;
    let x = 'xref\n0 7\n0000000000 65535 f \n';
    for (let i = 1; i <= 6; i++) x += String(at[i]).padStart(10, '0') + ' 00000 n \n';
    add(x + 'trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');

    const out = new Uint8Array(len);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  root.FierPay = { CARD_W: W, CARD_H: H, plainAmount, payUri, drawCard, bytesFromDataUrl, sheetPdf };
})(typeof window !== 'undefined' ? window : globalThis);
