'use strict';
// The md-writer Store trailer as a timeline. record.js calls stage.frame(t) once per video
// frame. Every change in the app windows is the real page (index.html, running in host mode
// against a mocked Windows host) doing what it does when a person types and clicks; the
// pointer, callouts and keycaps are drawn on top.

const $ = s => document.querySelector(s);
const clamp01 = x => Math.max(0, Math.min(1, x));
const ramp = (t, a, b) => clamp01((t - a) / (b - a));
const easeInOut = u => (u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const easeOut = u => 1 - Math.pow(1 - u, 3);
const lerp = (a, b, u) => a + (b - a) * u;
const fade = (t, t0, t1, fin = .35, fout = .3) => Math.min(easeOut(ramp(t, t0, t0 + fin)), 1 - ramp(t, t1 - fout, t1));

let seed = 11;
const rnd = () => {
  seed = seed + 0x6D2B79F5 | 0;
  let x = Math.imul(seed ^ seed >>> 15, 1 | seed);
  x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x;
  return ((x ^ x >>> 14) >>> 0) / 4294967296;
};

const events = [];    // one-shot actions: { t, run }
const sounds = [];    // for the audio track: { t, type }
const at = (t, run) => events.push({ t, run });
let now = 0;

/* ---------- app windows ---------- */

// Windows are laid out in stage pixels; the page inside renders at ZOOM, as on a high-DPI screen.
const ZOOM = 1.35;
const wins = {
  w1: { id: 'w1', el: $('#w1'), x: 260, y: 74, w: 1400, h: 900 },
  w2: { id: 'w2', el: $('#w2'), x: 700, y: 262, w: 1110, h: 700 },
};
for (const w of Object.values(wins)) {
  Object.assign(w.el.style, { left: w.x + 'px', top: w.y + 'px', width: w.w + 'px', height: w.h + 'px' });
  Object.assign(w.el.querySelector('iframe').style, {
    width: w.w / ZOOM + 'px', height: w.h / ZOOM + 'px', transform: `scale(${ZOOM})`, transformOrigin: '0 0',
  });
  Object.assign(w.el.querySelector('.caption').style, { transform: `scale(${ZOOM})`, transformOrigin: '100% 0' });
}
const { w1, w2 } = wins;

function app(w) {
  const win = w.el.querySelector('iframe').contentWindow;
  return { win, doc: win.document, editor: win.document.getElementById('editor') };
}
const textOf = w => app(w).win.getText();

// A rect in a window's page, in stage coordinates.
function toStage(w, r) {
  const x = w.x + r.left * ZOOM, y = w.y + r.top * ZOOM, wd = r.width * ZOOM, h = r.height * ZOOM;
  return { x, y, w: wd, h, cx: x + wd / 2, cy: y + h / 2 };
}
const ctr = b => ({ x: b.cx, y: b.cy });

// A text offset, counted the way the page counts (lines joined by \n), as a DOM point.
function pointAt(w, offset) {
  const { doc, editor } = app(w);
  let remaining = offset;
  for (const line of editor.children) {
    const len = line.textContent.length;
    if (remaining <= len) {
      const walker = doc.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (remaining <= node.textContent.length) return { node, offset: remaining };
        remaining -= node.textContent.length;
      }
      return { node: line, offset: 0 };
    }
    remaining -= len + 1;
  }
  const last = editor.lastElementChild;
  return { node: last, offset: last.childNodes.length };
}

// Where the caret sits at a text offset.
function caretBox(w, offset) {
  const { doc } = app(w);
  const p = pointAt(w, offset);
  const range = doc.createRange();
  range.setStart(p.node, p.offset);
  range.collapse(true);
  const r = range.getClientRects()[0];
  if (r && r.height) return toStage(w, r);
  const line = (p.node.nodeType === 1 ? p.node : p.node.parentElement).closest('.line');
  const b = line.getBoundingClientRect();
  const fs = parseFloat(doc.defaultView.getComputedStyle(line).fontSize);
  return toStage(w, { left: b.left, top: b.top + (b.height - fs * 1.2) / 2, width: 0, height: fs * 1.2 });
}

function textBox(w, a, b) {
  const { doc } = app(w);
  const pa = pointAt(w, a), pb = pointAt(w, b);
  const range = doc.createRange();
  range.setStart(pa.node, pa.offset);
  range.setEnd(pb.node, pb.offset);
  return toStage(w, range.getBoundingClientRect());
}

function elBox(w, target) {
  const e = typeof target === 'string' ? app(w).doc.querySelector(target) : target;
  return e ? toStage(w, e.getBoundingClientRect()) : null;
}

// The rendered extent of a line's text (lines are blocks as wide as the column).
function lineText(w, line) {
  const range = app(w).doc.createRange();
  range.selectNodeContents(line);
  return toStage(w, range.getBoundingClientRect());
}

function select(w, a, b) {
  const { win } = app(w);
  const pa = pointAt(w, a), pb = pointAt(w, b);
  win.getSelection().setBaseAndExtent(pa.node, pa.offset, pb.node, pb.offset);
  win.updateSelectionCount();
}

function caretTo(w, offset) {
  const { win, editor } = app(w);
  editor.focus({ preventScroll: true });
  win.setCaretOffset(offset);
  win.updateSelectionCount();
}

function keydown(w, key, mods = {}) {
  const { win, editor } = app(w);
  editor.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
}

/* ---------- typing, at a person's pace ---------- */

const lastKey = { w1: -9, w2: -9 };

function typeChar(w, ch) {
  const { doc, editor } = app(w);
  if (doc.activeElement !== editor) editor.focus({ preventScroll: true });
  if (ch === '\n') keydown(w, 'Enter');
  else if (ch === '\b') doc.execCommand('delete');
  else doc.execCommand('insertText', false, ch);
}

function delay(prev, ch) {
  let d = .045 + rnd() * .045;
  if ('#*`[]>-_'.includes(ch)) d += .025;
  if (prev === ' ' && rnd() < .18) d += .05 + rnd() * .08;
  if ('.,:;!?'.includes(prev)) d += .14 + rnd() * .08;
  if (prev === '\n') d += .1 + rnd() * .06;
  if (ch === '\b' || prev === '\b') d = .1 + rnd() * .04;
  return d;
}

// Types text into a window from time t ('\b' is a backspace); returns when it's done.
function type(w, t, text) {
  let prev = '';
  for (const ch of text) {
    t += delay(prev, ch);
    const when = t;
    at(when, () => { typeChar(w, ch); lastKey[w.id] = when; });
    sounds.push({ t, type: ch === '\n' ? 'enter' : ch === ' ' ? 'space' : 'key' });
    prev = ch;
  }
  return t;
}

/* ---------- the pointer ---------- */

const moves = [];     // { t0, t1, to, cursor, follow, final }
const shows = [];     // { t0, t1 }
const clicks = [];    // { t, pos }
const pointerStart = { x: 1560, y: 820 };

function move(t0, t1, to, cursor = 'arrow') { moves.push({ t0, t1, to, cursor }); }
function follow(t0, t1, to, cursor = 'text') { moves.push({ t0, t1, to, cursor, follow: true }); }
function jump(t, to) { moves.push({ t0: t, t1: t, to: () => to, cursor: 'arrow' }); }
function showPointer(t0, t1) { shows.push({ t0, t1 }); }
function click(t, right = false) {
  const c = { t, pos: null };
  clicks.push(c);
  at(t, () => { c.pos = pointerAt(now); });
  sounds.push({ t, type: right ? 'rclick' : 'click' });
}

function pointerAt(t) {
  let pos = pointerStart, cursor = 'arrow';
  for (const m of moves) {
    if (t < m.t0) break;
    if (t >= m.t1 && m.final) { pos = m.final; cursor = m.cursor; continue; }
    const to = m.to();
    if (t >= m.t1) { m.final = to; pos = to; cursor = m.cursor; continue; }
    if (m.follow) { pos = to; cursor = m.cursor; continue; }
    const u = easeInOut(ramp(t, m.t0, m.t1));
    const dx = to.x - pos.x, dy = to.y - pos.y;
    const len = Math.hypot(dx, dy) || 1;
    const bulge = Math.sin(Math.PI * u) * len * .07;
    pos = { x: lerp(pos.x, to.x, u) - dy / len * bulge, y: lerp(pos.y, to.y, u) + dx / len * bulge };
    cursor = u > .6 ? m.cursor : cursor;
    break;
  }
  return { ...pos, cursor };
}
const pointerVisible = t => Math.max(0, ...shows.map(s => fade(t, s.t0, s.t1, .25, .3)));

/* ---------- callouts and keycaps ---------- */

const callouts = [];
const SVGNS = 'http://www.w3.org/2000/svg';

// A label near an anchor point with a thin leader to it. side: where the label sits
// relative to (anchor + dx, dy): 'left' = label starts there, 'right' = label ends there.
function callout(t0, t1, html, anchor, { dx = 0, dy = -60, side = 'center' } = {}) {
  const el = document.createElement('div');
  el.className = 'callout';
  el.innerHTML = '<span class="bar"></span><span>' + html + '</span>';
  $('#callouts').appendChild(el);
  const line = document.createElementNS(SVGNS, 'line');
  const ring = document.createElementNS(SVGNS, 'circle');
  const dot = document.createElementNS(SVGNS, 'circle');
  $('#leaders').append(line, ring, dot);
  callouts.push({ t0, t1, el, anchor, dx, dy, side, line, ring, dot });
}

const keyShows = [];
function keys(t, list, dur = 1.2) {
  keyShows.push({ t, list, dur });
  sounds.push({ t: t + .08, type: 'key' });
}

/* ---------- the script ---------- */

let darkAt = Infinity, lightAgainAt = Infinity;
const pendingSends = [];   // replies from the mocked host: { t, w, msg }
const hostSend = (w, msg) => app(w).win.__send(msg);
let duration = 0, thumbnailAt = 0;
const S = {};

function build() {
  S.winIn = 2.5;

  // A heading.
  let t = type(w1, 3.4, '# Launch notes');
  callout(4.3, 7.4, 'Headings grow, and the <em>#</em> hangs in the margin', () => {
    const b = elBox(w1, '.line.h1 .hang');
    return { x: b.x - 6, y: b.cy };
  }, { dx: -30, dy: 0, side: 'right' });

  // A paragraph, then bold by double-click and Ctrl+B.
  t = type(w1, t + .1, '\n\nEvery prompt, plan and spec we write is markdown now.');
  const mdAt = () => textOf(w1).indexOf('markdown now');
  const tb = t + .25;
  jump(tb - .01, { x: 1560, y: 820 });
  showPointer(tb, tb + 3.7);
  move(tb, tb + .7, () => { const b = textBox(w1, mdAt(), mdAt() + 8); return { x: b.cx, y: b.cy + 2 }; }, 'text');
  click(tb + .82); click(tb + .94);
  at(tb + .95, () => select(w1, mdAt(), mdAt() + 8));
  keys(tb + 1.35, ['Ctrl', 'B']);
  at(tb + 1.45, () => keydown(w1, 'b', { ctrlKey: true }));
  callout(tb + 1.7, tb + 4.5, 'Ctrl+B wraps it in <em>**</em>. The syntax stays, dimmed.', () => {
    const b = elBox(w1, app(w1).doc.querySelector('.line strong').previousElementSibling);
    return { x: b.cx, y: b.y + b.h };
  }, { dx: 0, dy: 80, side: 'center' });
  const paraEnd = () => textOf(w1).indexOf('now.') + 4;
  move(tb + 2.3, tb + 2.85, () => { const c = caretBox(w1, paraEnd()); return { x: c.x + 10, y: c.cy }; }, 'text');
  click(tb + 2.95);
  at(tb + 2.97, () => caretTo(w1, paraEnd()));
  move(tb + 3.1, tb + 3.6, () => ({ x: 1600, y: 760 }));

  // More writing: a list with code, italics and a finished task.
  t = type(w1, tb + 3.15, ' It deserev\b\bves a calm place to live.');
  t = type(w1, t + .1, '\n\n## This week\n\n- Review `AGENTS.md` with the *team*\n- [x] Ship the Windows app');
  callout(t + .2, t + 3.0, 'Lists, <em>code</em> and tasks, styled as you type', () => {
    const b = lineText(w1, app(w1).doc.querySelector('.line.done'));
    return { x: b.x + b.w + 8, y: b.cy };
  }, { dx: 44, dy: 0, side: 'left' });

  // Select a sentence: its word count appears.
  const sA = () => textOf(w1).indexOf('It deserves');
  const sB = () => textOf(w1).indexOf('live.') + 5;
  const ts = t + .7;
  showPointer(ts - .4, ts + 4.4);
  move(ts - .4, ts + .3, () => { const c = caretBox(w1, sA()); return { x: c.x - 2, y: c.cy }; }, 'text');
  click(ts + .38);
  at(ts + .4, () => caretTo(w1, sA()));
  const dragEnd = ts + 1.5;
  const dragFocus = t2 => Math.round(lerp(sA(), sB(), easeInOut(ramp(t2, ts + .45, dragEnd))));
  for (let tt = ts + .45; tt <= dragEnd + .001; tt += 1 / 30) at(tt, () => select(w1, sA(), dragFocus(now)));
  follow(ts + .45, dragEnd, () => { const c = caretBox(w1, dragFocus(now)); return { x: c.x, y: c.cy }; });
  callout(ts + 1.6, ts + 4.2, 'The word count, and a live count of your selection', () => {
    const b = elBox(w1, '#selcount');
    return { x: b.cx, y: b.y - 4 };
  }, { dx: -40, dy: -64, side: 'right' });
  thumbnailAt = ts + 3.0;
  move(ts + 3.8, ts + 4.2, () => ({ x: 1440, y: 880 }));
  click(ts + 4.25);
  at(ts + 4.27, () => caretTo(w1, textOf(w1).length));

  // Save.
  const tv = ts + 4.6;
  keys(tv, ['Ctrl', 'S']);
  at(tv + .1, () => keydown(w1, 's', { ctrlKey: true }));
  callout(tv + .35, tv + 2.7, 'Ctrl+S saves in place, byte for byte', () => {
    const b = elBox(w1, '#filename');
    return { x: b.x + b.w + 6, y: b.cy };
  }, { dx: 40, dy: 0, side: 'left' });

  // Serif or mono, at any size.
  const tf = tv + 2.9;
  showPointer(tf - .5, tf + 4.3);
  move(tf - .5, tf + .25, () => ctr(elBox(w1, '#btn-font')));
  const font = () => app(w1).doc.getElementById('btn-font').click();
  click(tf + .38);
  at(tf + .4, font);
  const range = () => app(w1).doc.getElementById('size-range');
  const thumb = () => {
    const b = elBox(w1, range());
    const u = (parseFloat(range().value) - .7) / .9;
    return { x: b.x + 6 * ZOOM + u * (b.w - 12 * ZOOM), y: b.cy };
  };
  move(tf + .65, tf + 1.1, thumb);
  const sizeAt = t2 => {
    if (t2 < tf + 1.2) return 1;
    if (t2 < tf + 1.9) return lerp(1, 1.3, easeInOut(ramp(t2, tf + 1.2, tf + 1.9)));
    if (t2 < tf + 2.2) return 1.3;
    return lerp(1.3, 1, easeInOut(ramp(t2, tf + 2.2, tf + 2.85)));
  };
  for (let tt = tf + 1.2; tt <= tf + 2.86; tt += 1 / 30) at(tt, () => {
    const r = range();
    r.value = (Math.round(sizeAt(now) * 20) / 20).toFixed(2);
    r.dispatchEvent(new (app(w1).win.Event)('input'));
  });
  follow(tf + 1.15, tf + 2.9, thumb, 'arrow');
  sounds.push({ t: tf + 1.17, type: 'click' }, { t: tf + 2.9, type: 'click' });
  S.sizerFrom = tf + .4; S.sizerTo = tf + 3.6;
  callout(tf + .75, tf + 3.5, 'Serif or mono, at any size', () => {
    const b = elBox(w1, '#sizer');
    return { x: b.x, y: b.cy };
  }, { dx: -40, dy: 0, side: 'right' });
  move(tf + 3.0, tf + 3.4, () => ctr(elBox(w1, '#btn-font')));
  click(tf + 3.5);
  at(tf + 3.52, font);

  // Light and dark.
  const th = tf + 3.95;
  move(th - .35, th + .05, () => ctr(elBox(w1, '#btn-theme')));
  click(th + .15);
  at(th + .17, () => app(w1).doc.getElementById('btn-theme').click());
  darkAt = th + .17;
  callout(th + .45, th + 2.6, 'Light and dark, following Windows', () => {
    const b = elBox(w1, '#btn-theme');
    return { x: b.cx, y: b.y + b.h + 4 };
  }, { dx: -120, dy: 70, side: 'center' });
  move(th + .6, th + 1.1, () => ({ x: 1610, y: 620 }));

  // An agent writes to the file: it reloads live.
  const tg = th + 2.7;
  S.agentFrom = tg; S.agentTo = tg + 3.9;
  const agentText = '\n\n## From the agent\n\n- Drafted the pricing page copy\n- Fixed two broken links in `README.md`';
  let disk = '';
  at(tg, () => { disk = textOf(w1); });
  let k = 0, tt = tg + .55;
  while (k < agentText.length) {
    k = Math.min(agentText.length, k + 2 + Math.floor(rnd() * 5));
    const upto = k;
    at(tt, () => hostSend(w1, { type: 'changed', text: disk + agentText.slice(0, upto) }));
    tt += .05 + rnd() * .05;
  }
  callout(tg + 1.1, tg + 3.9, 'Live reload: an agent’s edits appear as they land', () => {
    const h2s = app(w1).doc.querySelectorAll('.line.h2');
    const b = lineText(w1, h2s[h2s.length - 1]);
    return { x: b.x + b.w + 8, y: b.cy };
  }, { dx: 44, dy: 0, side: 'left' });

  // ...and never over unsaved work.
  const tc = tg + 4.1;
  showPointer(tc - .3, tc + 4.1);
  move(tc - .3, tc + .25, () => { const c = caretBox(w1, textOf(w1).length); return { x: c.x + 12, y: c.cy }; }, 'text');
  click(tc + .33);
  at(tc + .35, () => caretTo(w1, textOf(w1).length));
  move(tc + .55, tc + .95, () => ({ x: 1560, y: 800 }));
  t = type(w1, tc + .45, '\n- Book the launch call');
  at(t + .35, () => hostSend(w1, { type: 'changed', text: disk + agentText + '\n- Updated the changelog' }));
  callout(t + .6, t + 3.1, 'Unsaved edits are never overwritten', () => {
    const b = elBox(w1, '#notice');
    return { x: b.cx, y: b.y + b.h + 4 };
  }, { dx: 0, dy: 64, side: 'center' });
  move(t + 1.7, t + 2.3, () => ctr(elBox(w1, '#notice-no')));
  click(t + 2.45);
  at(t + 2.47, () => app(w1).doc.getElementById('notice-no').click());

  // Open with, from the desktop: a second window, plain text.
  const to = t + 3.3;
  S.fileFrom = to - .3; S.fileTo = to + 2.55;
  showPointer(to - .2, to + 8.0);
  const fileBox = () => { const r = $('#file').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 44 }; };
  const itemBox = (menu, id) => { const r = $(`${menu} [data-id="${id}"]`).getBoundingClientRect(); return { x: r.left + r.width * .45, y: r.top + r.height / 2 }; };
  move(to - .2, to + .45, fileBox);
  click(to + .58, true);
  S.menuAt = to + .62;
  move(to + .85, to + 1.25, () => itemBox('#menu', 'openwith'));
  S.subAt = to + 1.35;
  move(to + 1.55, to + 2.0, () => itemBox('#submenu', 'mdwriter'));
  click(to + 2.12);
  S.menuTo = to + 2.18;
  S.w2In = to + 2.25;
  callout(to + 2.8, to + 5.3, 'Right-click, Open with. Every file gets its own window.', () => {
    const b = elBox(w2, '#filename');
    return { x: b.x + b.w + 6, y: b.cy };
  }, { dx: 40, dy: 0, side: 'left' });
  move(to + 4.8, to + 5.4, () => ctr(elBox(w2, '#btn-md')));
  click(to + 5.55);
  at(to + 5.57, () => app(w2).doc.getElementById('btn-md').click());
  callout(to + 5.8, to + 8.3, 'Plain text stays plain. Markdown styling is a click away.', () => {
    const b = elBox(w2, '#btn-md');
    return { x: b.cx, y: b.y + b.h + 4 };
  }, { dx: -140, dy: 70, side: 'center' });
  move(to + 6.3, to + 6.9, () => ({ x: 1720, y: 900 }));

  // End card.
  S.end = to + 8.5;
  lightAgainAt = S.end;
  duration = S.end + 4.2;
  events.sort((a, b) => a.t - b.t);
  moves.sort((a, b) => a.t0 - b.t0);
}

/* ---------- rendering a frame ---------- */

let nextEvent = 0;

function frame(t) {
  while (nextEvent < events.length && events[nextEvent].t <= t) {
    const e = events[nextEvent++];
    now = e.t;
    e.run();
  }
  now = t;
  for (const p of pendingSends) if (!p.done && p.t <= t) { p.done = true; hostSend(p.w, p.msg); }
  render(t);
}

function render(t) {
  const dark = t >= darkAt && t < lightAgainAt;
  const darkMix = t < lightAgainAt ? easeInOut(ramp(t, darkAt, darkAt + .7)) : 1 - easeInOut(ramp(t, lightAgainAt, lightAgainAt + .9));
  $('#bg-dark').style.opacity = darkMix;

  // Title cards.
  const rise = (el, a) => { const u = easeOut(ramp(t, a, a + .7)); el.style.opacity = u; el.style.transform = `translateY(${(1 - u) * 14}px)`; };
  const intro = $('#intro');
  intro.style.opacity = 1 - ramp(t, 2.2, 2.7);
  rise(intro.children[0], .1); rise(intro.children[1], .4); rise(intro.children[2], .75);
  const end = $('#end');
  end.style.opacity = t >= S.end ? 1 : 0;
  [...end.children].forEach((el, i) => rise(el, S.end + .5 + i * .3));

  // Windows.
  const out = easeInOut(ramp(t, S.end - .2, S.end + .5));
  const in1 = easeOut(ramp(t, S.winIn, S.winIn + .8));
  w1.el.style.opacity = in1 * (1 - out);
  w1.el.style.transform = `translateY(${(1 - in1) * 40}px) scale(${1 - out * .03})`;
  w1.el.classList.toggle('dark', t >= darkAt);
  const in2 = easeOut(ramp(t, S.w2In, S.w2In + .45));
  w2.el.style.opacity = in2 * (1 - out);
  w2.el.style.transform = `scale(${lerp(.965, 1, in2) - out * .03})`;
  w2.el.classList.add('dark');

  // The size popover stays up while it's in use (the page would hide it on a timer).
  if (t >= S.sizerFrom && t < S.sizerTo) app(w1).win.showSizer();
  else if (t >= S.sizerTo && t < S.sizerTo + .2) app(w1).win.hideSizer();

  // The desktop file and its context menu.
  const file = $('#file');
  Object.assign(file.style, { left: '1726px', top: '600px', opacity: fade(t, S.fileFrom, S.fileTo) });
  file.classList.toggle('selected', t >= S.menuAt && t < S.menuTo + .5);
  const menu = $('#menu'), sub = $('#submenu');
  const fr = file.getBoundingClientRect();
  menu.style.left = (fr.left + fr.width / 2 - 262) + 'px';
  menu.style.top = (fr.top + 50) + 'px';
  menu.style.opacity = t >= S.menuAt && t < S.menuTo ? easeOut(ramp(t, S.menuAt, S.menuAt + .15)) : 0;
  const ow = menu.querySelector('[data-id="openwith"]').getBoundingClientRect();
  sub.style.left = (ow.left - 244) + 'px';
  sub.style.top = (ow.top - 6) + 'px';
  sub.style.opacity = t >= S.subAt && t < S.menuTo ? easeOut(ramp(t, S.subAt, S.subAt + .15)) : 0;

  // The agent at work.
  const ag = $('#agent');
  ag.style.opacity = fade(t, S.agentFrom, S.agentTo);
  ag.style.left = (960 - ag.offsetWidth / 2) + 'px';
  ag.style.top = '12px';
  [...ag.querySelectorAll('.dots span')].forEach((d, i) => { d.style.opacity = .3 + .7 * Math.max(0, Math.sin(t * 5 - i * .9)); });

  renderPointer(t);
  renderCallouts(t, dark);
  renderKeys(t, dark);
  renderCaret(t, dark);
  hoverStates(t);
}

function renderPointer(t) {
  const p = pointerAt(t);
  const vis = pointerVisible(t);
  const el = $('#pointer');
  const beam = p.cursor === 'text';
  el.querySelector('.arrow').style.display = beam ? 'none' : '';
  el.querySelector('.beam').style.display = beam ? '' : 'none';
  el.style.opacity = vis;
  el.style.transform = beam ? `translate(${p.x - 15}px, ${p.y - 22}px)` : `translate(${p.x - 2.5}px, ${p.y - 2.5}px)`;
  const ripples = $('#ripples');
  ripples.textContent = '';
  for (const c of clicks) {
    const u = ramp(t, c.t, c.t + .45);
    if (u <= 0 || u >= 1 || vis <= 0 || !c.pos) continue;
    const r = document.createElement('div');
    r.className = 'ripple';
    const size = 10 + easeOut(u) * 40;
    Object.assign(r.style, { left: c.pos.x - size / 2 + 'px', top: c.pos.y - size / 2 + 'px', width: size + 'px', height: size + 'px', opacity: (1 - u) * .85 });
    ripples.appendChild(r);
  }
}

function renderCallouts(t, dark) {
  for (const c of callouts) {
    const vis = fade(t, c.t0, c.t1, .4, .3);
    let p = null;
    if (vis > 0) try { p = c.anchor(); } catch (e) { p = null; }
    if (!p) {
      c.el.style.opacity = 0;
      for (const n of [c.line, c.ring, c.dot]) n.setAttribute('opacity', 0);
      continue;
    }
    c.el.classList.toggle('on-dark', dark);
    const w = c.el.offsetWidth, h = c.el.offsetHeight;
    const ax = p.x + c.dx, ay = p.y + c.dy;
    let x = c.side === 'left' ? ax : c.side === 'right' ? ax - w : ax - w / 2;
    x = Math.max(24, Math.min(1920 - 24 - w, x));
    const lift = (1 - vis) * 10;
    const y = ay - h / 2 + lift;
    c.el.style.opacity = vis;
    c.el.style.transform = `translate(${x}px, ${y}px)`;
    // Leader from the label's nearest edge to the anchor.
    const ex = p.x < x ? x : p.x > x + w ? x + w : Math.max(x + 16, Math.min(x + w - 16, p.x));
    const ey = p.y < y ? y : p.y > y + h ? y + h : y + h / 2;
    const lineVis = easeOut(ramp(t, c.t0 + .15, c.t0 + .5)) * vis;
    const accent = dark ? '#7ea6f0' : '#3a6fc0';
    const attrs = (n, a) => Object.entries(a).forEach(([k, v]) => n.setAttribute(k, v));
    attrs(c.line, { x1: ex, y1: ey, x2: lerp(ex, p.x, lineVis), y2: lerp(ey, p.y, lineVis), stroke: dark ? 'rgba(250,249,247,.75)' : 'rgba(28,27,25,.6)', 'stroke-width': 1.5, opacity: vis });
    attrs(c.ring, { cx: p.x, cy: p.y, r: 9 * (1 + .35 * Math.max(0, Math.sin((t - c.t0) * 4))), fill: accent, opacity: .2 * lineVis });
    attrs(c.dot, { cx: p.x, cy: p.y, r: 4.5, fill: accent, stroke: dark ? '#17181a' : '#fff', 'stroke-width': 2, opacity: lineVis });
  }
}

let shownKeys = null;
function renderKeys(t, dark) {
  const el = $('#keys');
  const k = keyShows.find(s => t >= s.t - .1 && t < s.t + s.dur);
  if (!k) { el.style.opacity = 0; return; }
  if (shownKeys !== k) {
    shownKeys = k;
    el.innerHTML = k.list.map(n => `<div class="key">${n}</div>`).join('<div class="key plus">+</div>');
  }
  el.classList.toggle('keys-light', !dark);
  const u = fade(t, k.t - .1, k.t + k.dur, .15, .35);
  const press = Math.max(0, 1 - Math.abs(t - k.t - .1) / .12);
  el.style.opacity = u;
  el.style.transform = `translateY(${(1 - u) * 10 + press * 3}px)`;
}

function renderCaret(t, dark) {
  const el = $('#caret1');
  $('#caret2').style.opacity = 0;
  let show = false;
  if (t >= S.winIn + .8 && t < S.w2In) {
    const { win, doc, editor } = app(w1);
    const offs = win.selectionOffsets();
    if (offs && offs[0] === offs[1] && doc.activeElement === editor && doc.getElementById('notice').hidden) {
      const c = caretBox(w1, offs[0]);
      const since = t - lastKey.w1;
      show = since < .55 || ((since - .55) % 1.06) < .53;
      Object.assign(el.style, { left: c.x - 1 + 'px', top: c.y + 'px', height: c.h + 'px', width: 2.2 + 'px' });
    }
  }
  el.classList.toggle('dark', dark);
  el.style.opacity = show ? parseFloat(w1.el.style.opacity || 1) : 0;
}

// The pointer over a header button or menu item shows it hovered.
function hoverStates(t) {
  const p = pointerAt(t);
  const vis = pointerVisible(t);
  for (const w of [w1, w2]) {
    const shown = parseFloat(w.el.style.opacity) > .5;
    for (const b of app(w).doc.querySelectorAll('.actions button, #notice button')) {
      const r = elBox(w, b);
      const inside = vis > .5 && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      b.classList.toggle('fake-hover', inside && shown);
    }
  }
  for (const item of document.querySelectorAll('.menu .item')) {
    const r = item.getBoundingClientRect();
    const open = parseFloat(item.parentElement.style.opacity) > .5;
    const inside = p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
    const keep = item.dataset.id === 'openwith' && t >= S.subAt && t < S.menuTo;
    item.classList.toggle('hover', open && (inside || keep));
  }
}

/* ---------- start-up ---------- */

function loaded(w) {
  const iframe = w.el.querySelector('iframe');
  const ready = () => { try { return iframe.contentWindow.__posted.some(m => m.type === 'ready'); } catch (e) { return false; } };
  return new Promise(r => { const check = () => (ready() ? r() : setTimeout(check, 30)); check(); });
}

async function start() {
  await Promise.all([loaded(w1), loaded(w2)]);
  hostSend(w1, { type: 'load', text: '', name: 'launch-notes.md', styled: true, toggle: false, mono: false });
  hostSend(w2, {
    type: 'load',
    text: 'Design review, 30 September\n\nAttendees: product, design, two engineers\n\nDecisions\n- Ship reading mode behind a setting\n- Keep the header to four icons\n- Revisit the export flow in November\n\nFollow-ups\n* Draft copy for the onboarding page\n* Check contrast of the faint grey in dark mode\n',
    name: 'meeting-notes.txt', styled: false, toggle: true, mono: false,
  });
  app(w2).doc.documentElement.dataset.theme = 'dark';
  app(w1).doc.documentElement.dataset.theme = 'light';
  app(w1).editor.focus();
  // The mocked host answers a save the way the real one does.
  app(w1).win.__onPost = m => { if (m.type === 'save') pendingSends.push({ t: now + .2, w: w1, msg: { type: 'saved', name: 'launch-notes.md' } }); };
  await document.fonts.ready;
  build();
  frame(0);
  window.stage.ready = true;
}

window.stage = {
  ready: false,
  frame,
  get duration() { return duration; },
  get thumbnailAt() { return thumbnailAt; },
  get sounds() { return sounds.slice().sort((a, b) => a.t - b.t); },
};
start();
