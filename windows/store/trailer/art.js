// Renders the Store display art for md-writer into ../art with Microsoft Edge:
//   hero-3840x2160.png   16:9 Super hero art (no text, no app UI, key visuals in the top two thirds)
//   poster-1440x2160.png 2:3 poster art
//   box-2160x2160.png    1:1 box art
//   tile-300.png, tile-150.png, tile-71.png  1:1 app tile icons
'use strict';
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '../../..');
const OUT = path.resolve(__dirname, '..', 'art');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']
  .find(p => fs.existsSync(p));

// The icon's inner drawing (everything inside the root <svg>), reused at any size.
const iconSvg = fs.readFileSync(path.join(ROOT, 'docs', 'icon', 'md-writer-icon.svg'), 'utf8');
const iconInner = iconSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<!--[\s\S]*?-->/g, '');
const icon = (cx, cy, h, extra = '') => {
  const w = h * .866;
  return `<svg x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" viewBox="0 0 173.2 200" ${extra}>${iconInner}</svg>`;
};

let seed = 7;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// An abstract page: the icon's hanging # and a heading bar over lines of text, no words.
function page(cx, cy, w, rot, opacity) {
  const h = w * 1.3;
  const ink = '#333333';
  const hs = w * .085, s = hs * .23, g = (hs - 2 * s) / 3, lean = hs * .1;
  const hx = w * .1, hy = h * .1;
  const hash = [
    `<polygon points="${hx + g + lean},${hy} ${hx + g + s + lean},${hy} ${hx + g + s},${hy + hs} ${hx + g},${hy + hs}"/>`,
    `<polygon points="${hx + 2 * g + s + lean},${hy} ${hx + 2 * g + 2 * s + lean},${hy} ${hx + 2 * g + 2 * s},${hy + hs} ${hx + 2 * g + s},${hy + hs}"/>`,
    `<rect x="${hx}" y="${hy + g}" width="${hs}" height="${s}"/>`,
    `<rect x="${hx}" y="${hy + 2 * g + s}" width="${hs}" height="${s}"/>`,
  ].join('');
  const tx = hx + hs + w * .045;
  let bars = `<rect x="${tx}" y="${hy + hs / 2 - w * .025}" width="${w * (.36 + rnd() * .14)}" height="${w * .05}" rx="${w * .025}"/>`;
  const rows = 7 + Math.floor(rnd() * 4);
  for (let i = 0; i < rows; i++) {
    const y = hy + hs + w * .1 + i * w * .075 + (i > 3 ? w * .06 : 0);
    if (y > h - w * .1) break;
    const last = i === rows - 1 || i === 3;
    const lw = w * (last ? .25 + rnd() * .2 : .55 + rnd() * .15);
    bars += `<rect x="${tx}" y="${y}" width="${lw}" height="${w * .03}" rx="${w * .015}" opacity=".55"/>`;
  }
  return `<g transform="translate(${cx} ${cy}) rotate(${rot}) translate(${-w / 2} ${-h / 2})" opacity="${opacity}">
    <rect width="${w}" height="${h}" rx="${w * .045}" fill="#fbfaf8" filter="url(#shadow)"/>
    <g fill="${ink}" opacity=".8">${hash}${bars}</g>
  </g>`;
}

const defs = w => `<defs>
  <radialGradient id="paper" cx="50%" cy="38%" r="75%">
    <stop offset="0" stop-color="#f4f0e9"/><stop offset=".6" stop-color="#e6e0d5"/><stop offset="1" stop-color="#d7cfc2"/>
  </radialGradient>
  <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="${w * .012}" stdDeviation="${w * .016}" flood-color="#3c301e" flood-opacity=".18"/>
  </filter>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="${w * .014}" stdDeviation="${w * .02}" flood-color="#3c301e" flood-opacity=".28"/>
  </filter>
</defs>`;

function hero() {
  const W = 3840, H = 2160;
  seed = 7;
  const pages = [
    [470, 700, 700, -9, .95], [1080, 1560, 560, 7, .8], [260, 1760, 500, 12, .6],
    [3370, 660, 700, 8, .95], [2780, 1530, 580, -6, .8], [3640, 1820, 520, -11, .6],
    [1250, 170, 520, 5, .65], [2600, 150, 540, -4, .65], [1900, 2050, 600, 3, .5],
  ].map(p => page(...p)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${defs(1200)}<rect width="${W}" height="${H}" fill="url(#paper)"/>
    ${pages}
    <g filter="url(#soft)">${icon(1920, 860, 1000)}</g>
  </svg>`;
}

function titled(W, H, iconY, iconH, wordY, wordSize, tagY, tagSize) {
  seed = 21;
  const pages = W > H - 1 ? [
    [240, 1880, 520, -10, .5], [1920, 1900, 520, 9, .5], [1080, 2060, 480, 3, .35],
  ] : [
    [180, 1900, 460, -10, .5], [1270, 1930, 460, 9, .5],
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${defs(1000)}<rect width="${W}" height="${H}" fill="url(#paper)"/>
    ${pages.map(p => page(...p)).join('')}
    <g filter="url(#soft)">${icon(W / 2, iconY, iconH)}</g>
    <text x="${W / 2}" y="${wordY}" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="${wordSize}" fill="#1c1b19">md-writer</text>
    <text x="${W / 2}" y="${tagY}" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="${tagSize}" fill="#5e5a53">A calm place for your markdown.</text>
  </svg>`;
}

const tile = size => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${icon(size / 2, size / 2, size * .94)}</svg>`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage();
  const shots = [
    ['hero-3840x2160.png', 3840, 2160, hero(), false],
    ['poster-1440x2160.png', 1440, 2160, titled(1440, 2160, 640, 620, 1150, 150, 1250, 54), false],
    ['box-2160x2160.png', 2160, 2160, titled(2160, 2160, 640, 640, 1180, 160, 1290, 58), false],
    ['tile-300.png', 300, 300, tile(300), true],
    ['tile-150.png', 150, 150, tile(150), true],
    ['tile-71.png', 71, 71, tile(71), true],
  ];
  for (const [name, w, h, svg, transparent] of shots) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, name), omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
    console.log('wrote', name);
  }
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
