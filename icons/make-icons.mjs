// Regenerate the icons after editing logo.svg:  node icons/make-icons.mjs
// Renders the SVG crisply at each size with headless Microsoft Edge (Windows), then packs DogEar.ico.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const svg = fs.readFileSync(path.join(here, 'logo.svg'), 'utf8');
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const PNGS = { 'apple-touch-icon.png': 180, 'logo-512.png': 512 };

const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
if (!edge) throw new Error('Microsoft Edge not found');
const port = 9444, profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dogear-icons-'));
const browser = spawn(edge, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));

try {
  let page;
  for (let i = 0; i < 40 && !page; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(p => p.type === 'page'); } catch {}
    if (!page) await wait(250);
  }
  if (!page) throw new Error('Edge did not start');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const sizes = [...new Set([...ICO_SIZES, ...Object.values(PNGS)])];
  const expr = `(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}';
    await img.decode();
    return JSON.stringify(Object.fromEntries(${JSON.stringify(sizes)}.map(s => {
      const c = document.createElement('canvas'); c.width = c.height = s;
      c.getContext('2d').drawImage(img, 0, 0, s, s); // SVG is re-rasterized at s px, not scaled down
      return [s, c.toDataURL('image/png').split(',')[1]];
    })));
  })()`;
  const result = await new Promise((res, rej) => {
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id !== 1) return;
      m.result?.result?.value ? res(JSON.parse(m.result.result.value)) : rej(new Error(JSON.stringify(m.result?.exceptionDetails || m.error)));
    };
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
  });
  ws.close();
  const png = s => Buffer.from(result[s], 'base64');

  for (const [name, s] of Object.entries(PNGS)) fs.writeFileSync(path.join(here, name), png(s));

  // .ico = 6-byte header + 16-byte entry per image + PNG data (PNG-in-ICO works on Windows Vista and later)
  const imgs = ICO_SIZES.map(png), head = Buffer.alloc(6 + 16 * imgs.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
  let offset = head.length;
  imgs.forEach((data, i) => {
    const e = 6 + 16 * i, s = ICO_SIZES[i];
    head.writeUInt8(s >= 256 ? 0 : s, e); head.writeUInt8(s >= 256 ? 0 : s, e + 1); // 0 means 256
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  fs.writeFileSync(path.join(here, 'DogEar.ico'), Buffer.concat([head, ...imgs]));
  console.log('wrote', Object.keys(PNGS).join(', '), `and DogEar.ico (${ICO_SIZES.join('/')} px)`);
} finally {
  const exited = new Promise(r => browser.once('exit', r));
  browser.kill();
  await Promise.race([exited, wait(3000)]);
  // Edge's helper processes can hold the temp profile a moment longer; it's in %TEMP%, so a leftover is harmless
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch {}
}
