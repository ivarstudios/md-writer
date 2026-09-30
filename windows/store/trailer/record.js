// Renders the md-writer Store trailer from stage.html, frame by frame, with the real index.html
// inside it. Needs Microsoft Edge and ffmpeg.
//
//   node record.js            full render: ../md-writer-trailer.mp4 and ../md-writer-trailer-thumbnail.png
//   node record.js --preview  every half second as PNGs in out/preview, at 1x, for a quick look
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '../../..');
const OUT = path.join(__dirname, 'out');
const FINAL = path.resolve(__dirname, '..');
const FPS = 30;
const preview = process.argv.includes('--preview');

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => fs.existsSync(p));

function findFfmpeg() {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return 'ffmpeg'; } catch (e) { /* not on PATH */ }
  const base = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  for (const dir of fs.existsSync(base) ? fs.readdirSync(base) : []) {
    if (!/ffmpeg/i.test(dir)) continue;
    const stack = [path.join(base, dir)];
    while (stack.length) {
      const d = stack.pop();
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (e.name.toLowerCase() === 'ffmpeg.exe') return p;
      }
    }
  }
  throw new Error('ffmpeg not found: winget install Gyan.FFmpeg');
}

// The page as the Windows app runs it: a mocked WebView2 host goes in before its own scripts.
function appHtml() {
  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const mock = `<script>
(function () {
  const listeners = [];
  window.__posted = [];
  window.chrome = window.chrome || {};
  window.chrome.webview = {
    postMessage(m) { window.__posted.push(m); if (window.__onPost) window.__onPost(m); },
    postMessageWithAdditionalObjects() {},
    addEventListener(type, fn) { listeners.push(fn); },
  };
  window.__send = m => listeners.forEach(fn => fn({ data: JSON.parse(JSON.stringify(m)) }));
  window.mdHost = { backdrop: 'none', captionInset: 138 };
})();
</script>`;
  const style = `<style>
  .editor { caret-color: transparent !important; }
  #sizer, #sizer.show { transition: none !important; }
  .actions button.fake-hover, #notice button.fake-hover { background: var(--hover); color: var(--fg); }
  html { overflow: hidden; }
  .editor { padding-bottom: 70vh !important; }
</style>`;
  return page.replace('<head>', '<head>' + mock).replace('</head>', style + '</head>');
}

function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    let body;
    if (url === '/app.html') body = appHtml();
    else if (url === '/icon.svg') body = fs.readFileSync(path.join(ROOT, 'docs', 'icon', 'md-writer-icon.svg'));
    else if (['/stage.html', '/stage.js', '/stage.css'].includes(url)) body = fs.readFileSync(path.join(__dirname, url));
    else { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(url)] + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/* ---------- audio: soft key and click sounds at the moments the stage recorded ---------- */

function synthAudio(sounds, duration, file) {
  const SR = 48000;
  const n = Math.ceil((duration + .5) * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  let s = 12345;
  const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

  function voice(start, gain, pitch, pan, tickTau, bodyTau, release) {
    const len = Math.round(.09 * SR);
    let prev = 0, lp = 0;
    for (let k = 0; k < len && start + k < n; k++) {
      const tt = k / SR;
      const noise = rand() * 2 - 1;
      const hp = noise - prev;
      prev = noise;
      lp += .18 * (noise - lp);
      let v = hp * Math.exp(-tt / tickTau) * .5
        + Math.sin(2 * Math.PI * pitch * tt) * Math.exp(-tt / bodyTau) * .32
        + lp * Math.exp(-tt / .007) * .5;
      if (tt > release) v += hp * Math.exp(-(tt - release) / .0007) * .22;
      v *= gain;
      L[start + k] += v * (1 - pan);
      R[start + k] += v * (1 + pan);
    }
  }

  for (const e of sounds) {
    const i = Math.round(e.t * SR);
    const jitter = .85 + rand() * .3, pan = (rand() - .5) * .25;
    if (e.type === 'key') voice(i, .55 * jitter, 170 + rand() * 60, pan, .0008, .011, .03 + rand() * .01);
    else if (e.type === 'space') voice(i, .7 * jitter, 115 + rand() * 20, pan, .001, .016, .038);
    else if (e.type === 'enter') voice(i, .75 * jitter, 130 + rand() * 20, pan, .001, .015, .036);
    else if (e.type === 'click' || e.type === 'rclick') {
      voice(i, .35, 1800, 0, .0004, .002, .06);
    }
  }

  // Gentle low-pass, then normalise to a quiet peak.
  let a = 0, b = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    a += .45 * (L[i] - a); b += .45 * (R[i] - b);
    L[i] = a; R[i] = b;
    peak = Math.max(peak, Math.abs(a), Math.abs(b));
  }
  const g = peak ? .32 / peak : 1;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('exit', code => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/stage.html`;
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--mute-audio'],
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: preview ? 1 : 2 },
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'md-writer-trailer-')),
  });
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  page.on('pageerror', e => console.error('[page error]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('[console]', m.text()); });
  await page.goto(url);
  await page.waitForFunction('window.stage && window.stage.ready', { timeout: 60000 });
  const duration = await page.evaluate(() => stage.duration);
  const thumbAt = await page.evaluate(() => stage.thumbnailAt);
  const frames = Math.round(duration * FPS);
  console.log(`duration ${duration.toFixed(2)}s, ${frames} frames`);

  if (preview) {
    const dir = path.join(OUT, 'preview');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < frames; i++) {
      const t = i / FPS;
      await page.evaluate(t => stage.frame(t), t);
      if (i % (FPS / 2) === 0) await page.screenshot({ path: path.join(dir, `t${t.toFixed(1).padStart(5, '0')}.png`) });
    }
  } else {
    const ffmpeg = findFfmpeg();
    const video = path.join(OUT, 'video.mp4');
    const enc = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-vf', 'scale=1920:1080:flags=lanczos:in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p',
      '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
      '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '14', '-maxrate', '50M', '-bufsize', '100M',
      '-g', String(FPS / 2), '-keyint_min', String(FPS / 2), '-sc_threshold', '0', '-bf', '2', '-flags', '+cgop', '-coder', '1',
      '-r', String(FPS), '-an', video], { stdio: ['pipe', 'inherit', 'inherit'] });
    const encoded = new Promise((resolve, reject) => enc.on('exit', c => (c === 0 ? resolve() : reject(new Error('ffmpeg ' + c)))));
    const thumbFrame = Math.round(thumbAt * FPS);
    const started = Date.now();
    for (let i = 0; i < frames; i++) {
      await page.evaluate(t => stage.frame(t), i / FPS);
      const jpg = await page.screenshot({ type: 'jpeg', quality: 94 });
      if (!enc.stdin.write(jpg)) await new Promise(r => enc.stdin.once('drain', r));
      if (i === thumbFrame) await page.screenshot({ path: path.join(OUT, 'thumbnail-2x.png') });
      if (i % 150 === 0) console.log(`frame ${i}/${frames}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
    }
    enc.stdin.end();
    await encoded;

    const sounds = await page.evaluate(() => stage.sounds);
    const wav = path.join(OUT, 'audio.wav');
    synthAudio(sounds, duration, wav);
    const final = path.join(FINAL, 'md-writer-trailer.mp4');
    await run(ffmpeg, ['-y', '-loglevel', 'error', '-i', video, '-i', wav, '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '384k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-shortest', final]);
    await run(ffmpeg, ['-y', '-loglevel', 'error', '-i', path.join(OUT, 'thumbnail-2x.png'),
      '-vf', 'scale=1920:1080:flags=lanczos', path.join(FINAL, 'md-writer-trailer-thumbnail.png')]);
    console.log('wrote', final);
  }
  await browser.close();
  server.close();
}

main().catch(e => { console.error(e); process.exit(1); });
