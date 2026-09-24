'use strict';
// src/knowledge/diagrams.js — CONTEXT Knowledge.
//
// The deterministic diagram compiler: one `.diagram` DSL source (AGSC-01-07) in,
// one SVG out (AGSC-02-13), inside the AGSC-02-98 element/attribute allow-list by
// construction. It is the engine's port of the owner's own compiler
// (`OldAgenticSystemPatterns.com/diagrams/compile.js`, Node stdlib, the owner's
// code) with three changes the specification requires:
//
//   1. it is a PURE TOTAL function — `compile(dslText) -> {svg, findings}` — so a
//      malformed source is a Finding, never a thrown string (AGSC-09-11);
//   2. the SVG carries `<title>` and `<desc>` beside `role="img"`, so a screen
//      reader reaches the same two sentences a sighted reader does (AGSC-06-20);
//   3. nothing is coloured. The old output leaned on the page's `.acc` CSS rule,
//      and AGSC-02-98 forbids a `style` element and a `style` attribute, so an
//      attachment cannot be styled from outside. Every stroke and every glyph is
//      `currentColor`, and the accent element carries the `agsc-accent` class AND
//      a presentation attribute (`stroke-width`) that is visible with no CSS at
//      all. The picture therefore reads in both colour schemes, because it has no
//      colour of its own (AGSC-06-05 forbids a third-party origin; a `<style>`
//      element would also be AGSC-E412).
//
// Rules implemented: AGSC-01-07 (the source's home), AGSC-02-13 (`<slug>.svg`
// compiled from `content/diagrams/<slug>.diagram`), AGSC-02-98 (the allow-list,
// PRD-059), AGSC-04-01/04-02 (byte-deterministic — no clock, no randomness,
// no locale, fixed decimal rendering), AGSC-06-20 (the accessible names).
//
// PURE: no fs, no process, no clock, no network, no cross-context require.
//
// CODE. §9.4 registers no code for "a diagram source that does not compile".
// `AGSC-E412` is the one registered code whose rules (AGSC-02-13/02-98) own the
// diagram artefact, and a source that cannot produce a conforming SVG is exactly
// the absence of that artefact, so every finding here carries it. The gap is
// reported for 1.0.0 rather than closed with an invented code.

const { finding } = require('./validate.js');

/** AGSC-04-01: the canvas defaults, fixed, never read from anywhere. */
const DEFAULT_WIDTH = 460;
const DEFAULT_HEIGHT = 260;

/** AGSC-02-98: the accent is a class plus a presentation attribute, never CSS. */
const ACCENT_CLASS = 'agsc-accent';
const ACCENT_STROKE_WIDTH = '2.2';

/** px of canvas that must stay clear either side of the centred footer note. */
const NOTE_MARGIN = 16;
/** px of canvas that must stay clear either side of a free `text` label. */
const TEXT_MARGIN = 4;

/** AGSC-01-16's cap, applied to the DSL source in code points. */
const MAX_SOURCE_LENGTH = 1048576;

/**
 * Noto Sans advance widths at font-size 1 — the widest of the mainstream
 * `system-ui` faces, so the estimate errs conservatively. SVG text is painted,
 * never wrapped: a string wider than the canvas is silently clipped at both
 * edges instead of failing, which is why the widths are here at all.
 */
const GLYPH = Object.freeze({
  ' ': 0.26, '!': 0.269, '"': 0.408, '#': 0.646, $: 0.572, '%': 0.831, '&': 0.732, "'": 0.225,
  '(': 0.3, ')': 0.3, '*': 0.551, '+': 0.572, ',': 0.268, '-': 0.322, '.': 0.268, '/': 0.372,
  0: 0.572, 1: 0.572, 2: 0.572, 3: 0.572, 4: 0.572, 5: 0.572, 6: 0.572, 7: 0.572, 8: 0.572,
  9: 0.572, ':': 0.268, ';': 0.268, '<': 0.572, '=': 0.572, '>': 0.572, '?': 0.434, '@': 0.899,
  A: 0.639, B: 0.65, C: 0.632, D: 0.73, E: 0.556, F: 0.519, G: 0.728, H: 0.741, I: 0.339,
  J: 0.273, K: 0.619, L: 0.524, M: 0.907, N: 0.76, O: 0.781, P: 0.605, Q: 0.781, R: 0.622,
  S: 0.549, T: 0.556, U: 0.731, V: 0.6, W: 0.93, X: 0.586, Y: 0.566, Z: 0.572, '[': 0.329,
  '\\': 0.372, ']': 0.329, '^': 0.572, _: 0.444, '`': 0.281, a: 0.561, b: 0.615, c: 0.48,
  d: 0.615, e: 0.564, f: 0.344, g: 0.615, h: 0.618, i: 0.258, j: 0.258, k: 0.534, l: 0.258,
  m: 0.935, n: 0.618, o: 0.605, p: 0.615, q: 0.615, r: 0.413, s: 0.479, t: 0.361, u: 0.618,
  v: 0.508, w: 0.786, x: 0.529, y: 0.51, z: 0.47, '{': 0.38, '|': 0.551, '}': 0.38, '~': 0.572,
  '·': 0.268, '×': 0.572, '–': 0.5, '—': 1.0, '‘': 0.175, '’': 0.175, '“': 0.359, '”': 0.359,
  '…': 0.791, '→': 0.6, '≥': 0.6,
});
const GLYPH_FALLBACK = 0.62;

/** The arrowhead marker; `currentColor` so it follows the reader's scheme. */
const MARKER = '<defs><marker id="ar2" viewBox="0 0 10 10" refX="9" refY="5"'
  + ' markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
  + '<path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker></defs>';

/** The five XML entities, and nothing else — no entity declaration (AGSC-02-98). */
function esc(value) {
  return String(value)
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;');
}

/** Painted width of a string at a font size, in px (see GLYPH). */
function textWidth(text, size) {
  let width = 0;
  for (const ch of String(text)) {
    const advance = GLYPH[ch] === undefined ? GLYPH_FALLBACK : GLYPH[ch];
    width += advance * size;
  }
  return width;
}

/**
 * AGSC-04-01: one decimal place, `.0` dropped, so the bytes never depend on the
 * platform's float printing. `-0` is written `0`.
 */
function fixed(n) {
  const rounded = Math.round(n * 10) / 10;
  const value = rounded === 0 ? 0 : rounded;
  const text = value.toFixed(1);
  return text.endsWith('.0') ? text.slice(0, -2) : text;
}

/** Split a DSL line on spaces, keeping "quoted strings" intact. */
function tokens(line) {
  const out = [];
  let current = '';
  let quoted = false;
  for (const ch of String(line)) {
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === ' ' && !quoted) {
      if (current !== '') out.push(current);
      current = '';
    } else current += ch;
  }
  if (current !== '') out.push(current);
  return out;
}

/** The statements the DSL knows. A line starting with anything else is a fault. */
const STATEMENTS = Object.freeze(['canvas', 'label', 'box', 'circle', 'region', 'arrow',
  'line', 'path', 'text', 'cross', 'note', 'bar']);

/**
 * Strip comments and blank lines, keeping each surviving line's 1-based number so
 * that a finding points at the source line a human can see.
 *
 * @param {string} source
 * @returns {Array<{line:number, text:string}>}
 */
function statements(source) {
  const out = [];
  const lines = String(source).split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const hash = lines[i].indexOf('#');
    const text = (hash < 0 ? lines[i] : lines[i].slice(0, hash)).trim();
    if (text !== '') out.push({ line: i + 1, text });
  }
  return out;
}

/** Clip a centre-to-centre segment to a box's border. */
function clip(box, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const halfWidth = box.w / 2;
  const halfHeight = box.h / 2;
  const scale = Math.min(
    dx !== 0 ? halfWidth / Math.abs(dx) : Infinity,
    dy !== 0 ? halfHeight / Math.abs(dy) : Infinity,
  );
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}

/**
 * The resolved geometry of an arrow, with waypoints that do not bend the path
 * dropped, so that a `via` placed on the straight line is not a distinction.
 */
function geometryKey(poly) {
  const kept = poly.filter((point, i, all) => {
    if (i === 0 || i === all.length - 1) return true;
    const a = all[i - 1];
    const b = all[i + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const cross = Math.abs((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x));
    return cross / length > 0.5;
  }).map((p) => `${fixed(p.x)},${fixed(p.y)}`);
  const forward = kept.join(' ');
  const reverse = kept.slice().reverse().join(' ');
  return forward < reverse ? forward : reverse;
}

/**
 * Compile one diagram DSL source into one SVG (AGSC-02-13).
 *
 * TOTAL: it never throws. When `findings` is non-empty `svg` is `null` — a
 * half-compiled picture would be worse than none, because AGSC-04-02 compares
 * bytes and a partial emission is not reproducible from the source.
 *
 * @param {string} dslText the `.diagram` source, LF-separated (AGSC-01-14).
 * @param {{file?:string, slug?:string, label?:string, accessibleName?:string}} [options]
 *   `file` and `slug` are carried onto every Finding; `label` is the accessible name
 *   used when the source has no `label` statement (default `"<slug> diagram"`);
 *   `accessibleName`, when given, IS the accessible name and a `label` statement in
 *   the source cannot override it — AGSC-02-13 makes the inlined
 *   element's accessible name `diagram.alt` (AGSC-06-20), which is authored in the
 *   item's frontmatter and not in the picture. The returned `label` is still the
 *   source's own, so `altFrom()` and `check()` are unaffected.
 * @returns {{svg:(string|null), findings:Array<object>, label:string, note:(string|null)}}
 */
function compile(dslText, options = {}) {
  const file = options.file;
  const slug = options.slug === undefined ? 'diagram' : String(options.slug);
  const findings = [];
  const fail = (message, line) => {
    findings.push(finding('AGSC-E412', `${message} (AGSC-02-13, AGSC-02-98)`,
      { file, slug, line }));
  };

  const source = typeof dslText === 'string' ? dslText : '';
  if ([...source].length > MAX_SOURCE_LENGTH) {
    findings.push(finding('AGSC-E904',
      `diagram source is over the ${MAX_SOURCE_LENGTH}-code-point cap (AGSC-01-16)`,
      { file, slug, line: 1 }));
    return { svg: null, findings, label: '', note: null };
  }

  let width = DEFAULT_WIDTH;
  let height = DEFAULT_HEIGHT;
  let label = options.label === undefined ? `${slug} diagram` : String(options.label);
  let note = null;
  const shapes = new Map();
  const draw = [];
  const texts = [];
  const arrowGeometry = new Map();
  let accentCount = 0;

  const flag = (t, name) => t.includes(name);
  const num = (value, what, line) => {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      fail(`bad number ${JSON.stringify(String(value))} in ${what}`, line);
      return null;
    }
    return n;
  };
  const inCanvas = (x, y, what, line) => {
    if (x < 0 || y < 0 || x > width || y > height) {
      fail(`${what} sits outside the canvas at (${fixed(x)},${fixed(y)})`, line);
      return false;
    }
    return true;
  };
  /** The accent: a class AND a presentation attribute, so no CSS is needed. */
  const accentAttrs = (t) => {
    if (!flag(t, 'acc')) return '';
    accentCount += 1;
    return ` class="${ACCENT_CLASS}" stroke-width="${ACCENT_STROKE_WIDTH}"`;
  };
  const dashAttr = (t, pattern) => (flag(t, 'dashed') ? ` stroke-dasharray="${pattern}"` : '');
  const pushTextLines = (x, y, value, size) => {
    const lines = String(value).split('|');
    const lineHeight = size + 4;
    const first = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((text, i) => {
      texts.push(`<text x="${fixed(x)}" y="${fixed(first + i * lineHeight)}" font-size="${size}">${esc(text)}</text>`);
    });
  };

  for (const statement of statements(source)) {
    const t = tokens(statement.text);
    const line = statement.line;
    const command = t[0];
    if (!STATEMENTS.includes(command)) {
      fail(`unknown statement ${JSON.stringify(String(command))}`, line);
      continue;
    }
    if (command === 'canvas') {
      const w = num(t[1], 'canvas', line);
      const h = num(t[2], 'canvas', line);
      if (w === null || h === null) continue;
      if (w <= 0 || h <= 0) {
        fail(`canvas must be positive, got ${fixed(w)}x${fixed(h)}`, line);
        continue;
      }
      width = w;
      height = h;
      continue;
    }
    if (command === 'label') {
      if (t[1] === undefined || String(t[1]).trim() === '') {
        fail('label needs a non-empty text', line);
        continue;
      }
      label = String(t[1]);
      continue;
    }
    if (command === 'box') {
      const id = t[1];
      if (id === undefined) {
        fail('box needs an id', line);
        continue;
      }
      if (shapes.has(id)) {
        fail(`duplicate id ${JSON.stringify(id)}`, line);
        continue;
      }
      const x = num(t[2], id, line);
      const y = num(t[3], id, line);
      const w = num(t[4], id, line);
      const h = num(t[5], id, line);
      if (x === null || y === null || w === null || h === null) continue;
      const box = { x, y, w, h, region: false };
      shapes.set(id, box);
      if (!inCanvas(x, y, `box ${id}`, line) || !inCanvas(x + w, y + h, `box ${id}`, line)) continue;
      // The accented box keeps the arrow dash pattern, a plain box the wider one:
      // the owner's compiler encodes this as a `.replace` on the emitted string.
      const accent = accentAttrs(t);
      const dash = flag(t, 'dashed') ? ` stroke-dasharray="${accent === '' ? '5 3' : '4 3'}"` : '';
      draw.push(`<rect x="${fixed(x)}" y="${fixed(y)}" width="${fixed(w)}" height="${fixed(h)}" rx="6"${accent}${dash}/>`);
      const text = t[6];
      if (text !== undefined && text !== '') {
        const size = text.length > 22 && !text.includes('|') ? 11 : 12;
        pushTextLines(x + w / 2, y + h / 2 + 4, text, size);
      }
      continue;
    }
    if (command === 'circle') {
      const id = t[1];
      if (id === undefined) {
        fail('circle needs an id', line);
        continue;
      }
      if (shapes.has(id)) {
        fail(`duplicate id ${JSON.stringify(id)}`, line);
        continue;
      }
      const cx = num(t[2], id, line);
      const cy = num(t[3], id, line);
      const r = num(t[4], id, line);
      if (cx === null || cy === null || r === null) continue;
      shapes.set(id, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, region: false });
      draw.push(`<circle cx="${fixed(cx)}" cy="${fixed(cy)}" r="${fixed(r)}"${accentAttrs(t)}${dashAttr(t, '4 3')}/>`);
      if (t[5] !== undefined && t[5] !== '') pushTextLines(cx, cy + 4, t[5], 11);
      continue;
    }
    if (command === 'region') {
      const id = t[1];
      if (id === undefined) {
        fail('region needs an id', line);
        continue;
      }
      if (shapes.has(id)) {
        fail(`duplicate id ${JSON.stringify(id)}`, line);
        continue;
      }
      const x = num(t[2], id, line);
      const y = num(t[3], id, line);
      const w = num(t[4], id, line);
      const h = num(t[5], id, line);
      if (x === null || y === null || w === null || h === null) continue;
      shapes.set(id, { x, y, w, h, region: true });
      draw.push(`<rect x="${fixed(x)}" y="${fixed(y)}" width="${fixed(w)}" height="${fixed(h)}" rx="8" stroke-dasharray="6 4"/>`);
      // A caption is the house style (every trust boundary is named), not a
      // compiler rule: the owner's compiler emits none when none is given, and a
      // fault here would refuse sources that compile today.
      const caption = t[6];
      if (caption !== undefined && caption !== '') {
        texts.push(`<text x="${fixed(x + w / 2)}" y="${fixed(y - 8)}" font-size="11">${esc(caption)}</text>`);
      }
      continue;
    }
    if (command === 'arrow') {
      const from = shapes.get(t[1]);
      const to = shapes.get(t[2]);
      if (from === undefined || to === undefined) {
        fail(`arrow references an unknown id (${String(t[1])} -> ${String(t[2])})`, line);
        continue;
      }
      const via = t.find((token) => token.startsWith('via='));
      const centreFrom = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
      const centreTo = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
      let d;
      let poly;
      if (via !== undefined) {
        const points = [];
        let malformed = false;
        for (const pair of via.slice(4).split(';')) {
          const coordinates = pair.split(',');
          const x = num(coordinates[0], 'via', line);
          const y = num(coordinates[1], 'via', line);
          if (x === null || y === null) {
            malformed = true;
            break;
          }
          points.push({ x, y });
        }
        // `"a;b".split(';')` never yields an empty list, so a `via=` with no
        // usable pair is always a bad-number fault already reported by `num`.
        if (malformed) continue;
        const p1 = clip(from, centreFrom, points[0]);
        const p2 = clip(to, centreTo, points[points.length - 1]);
        d = `M${fixed(p1.x)} ${fixed(p1.y)} `
          + points.map((p) => `L${fixed(p.x)} ${fixed(p.y)}`).join(' ')
          + ` L${fixed(p2.x)} ${fixed(p2.y)}`;
        poly = [p1, ...points, p2];
      } else {
        const border1 = clip(from, centreFrom, centreTo);
        const border2 = clip(to, centreTo, centreFrom);
        poly = [border1, border2];
        const dx = border2.x - border1.x;
        const dy = border2.y - border1.y;
        const length = Math.hypot(dx, dy) || 1;
        const p1 = { x: border1.x + (dx / length) * 4, y: border1.y + (dy / length) * 4 };
        const p2 = { x: border2.x - (dx / length) * 4, y: border2.y - (dy / length) * 4 };
        d = `M${fixed(p1.x)} ${fixed(p1.y)} L${fixed(p2.x)} ${fixed(p2.y)}`;
      }
      const key = geometryKey(poly);
      const twin = arrowGeometry.get(key);
      if (twin !== undefined) {
        fail(`arrows "${twin}" and "${String(t[1])} -> ${String(t[2])}" resolve to the same path`
          + ` (${key}); separate them with a via= waypoint, or draw one arrow with "both"`, line);
        continue;
      }
      arrowGeometry.set(key, `${String(t[1])} -> ${String(t[2])}`);
      const start = flag(t, 'both') ? ' marker-start="url(#ar2)"' : '';
      draw.push(`<path d="${d}" marker-end="url(#ar2)"${start}${dashAttr(t, '4 3')}${accentAttrs(t)}/>`);
      continue;
    }
    if (command === 'line') {
      const x1 = num(t[1], 'line', line);
      const y1 = num(t[2], 'line', line);
      const x2 = num(t[3], 'line', line);
      const y2 = num(t[4], 'line', line);
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
      const thick = flag(t, 'thick') ? ' stroke-width="5"' : '';
      draw.push(`<path d="M${fixed(x1)} ${fixed(y1)} L${fixed(x2)} ${fixed(y2)}"${accentAttrs(t)}${dashAttr(t, '6 5')}${thick}/>`);
      continue;
    }
    if (command === 'path') {
      const d = t[1];
      if (d === undefined || d === '') {
        fail('path needs a `d` value', line);
        continue;
      }
      const arrow = flag(t, 'arrow') ? ' marker-end="url(#ar2)"' : '';
      draw.push(`<path d="${esc(d)}"${arrow}${accentAttrs(t)}${dashAttr(t, '4 3')}/>`);
      continue;
    }
    if (command === 'text') {
      const value = t[3];
      if (value === undefined) {
        fail('text needs x, y and a string', line);
        continue;
      }
      const sizeToken = t.find((token) => token.startsWith('size=')) || 'size=11';
      const size = num(sizeToken.slice(5), 'text size', line);
      const x = num(t[1], 'text', line);
      const y = num(t[2], 'text', line);
      if (size === null || x === null || y === null) continue;
      const anchor = flag(t, 'left') ? ' text-anchor="start"' : (flag(t, 'right') ? ' text-anchor="end"' : '');
      const w = textWidth(value, size);
      const x0 = flag(t, 'left') ? x : (flag(t, 'right') ? x - w : x - w / 2);
      const x1 = x0 + w;
      if (x0 < TEXT_MARGIN || x1 > width - TEXT_MARGIN) {
        const over = x0 < TEXT_MARGIN
          ? `${fixed(TEXT_MARGIN - x0)}px past the left edge`
          : `${fixed(x1 - (width - TEXT_MARGIN))}px past the right edge`;
        fail(`text ${JSON.stringify(value)} renders ~${fixed(w)}px wide at size ${size} — ${over}`, line);
        continue;
      }
      texts.push(`<text x="${fixed(x)}" y="${fixed(y)}" font-size="${size}"${anchor}>${esc(value)}</text>`);
      continue;
    }
    if (command === 'cross') {
      const cx = num(t[1], 'cross', line);
      const cy = num(t[2], 'cross', line);
      if (cx === null || cy === null) continue;
      draw.push(`<path d="M${fixed(cx - 8)} ${fixed(cy - 8)} L${fixed(cx + 8)} ${fixed(cy + 8)}`
        + ` M${fixed(cx + 8)} ${fixed(cy - 8)} L${fixed(cx - 8)} ${fixed(cy + 8)}" stroke-width="2"/>`);
      continue;
    }
    if (command === 'note') {
      const value = t[1];
      if (value === undefined || value === '') {
        fail('note needs a text', line);
        continue;
      }
      const w = textWidth(value, 11);
      const max = width - 2 * NOTE_MARGIN;
      if (w > max) {
        fail(`note ${JSON.stringify(value)} renders ~${fixed(w)}px wide at font-size 11 —`
          + ` ${fixed(w - max)}px over the ${fixed(max)}px limit for a ${fixed(width)}px canvas`, line);
        continue;
      }
      note = value;
      texts.push(`<text x="${fixed(width / 2)}" y="${fixed(height - 12)}" font-size="11">${esc(value)}</text>`);
      continue;
    }
    // `bar` — the only statement left.
    const x = num(t[1], 'bar', line);
    const y = num(t[2], 'bar', line);
    const w = num(t[3], 'bar', line);
    if (x === null || y === null || w === null) continue;
    const thick = flag(t, 'thick') ? ' stroke-width="5"' : '';
    draw.push(`<path d="M${fixed(x)} ${fixed(y)} L${fixed(x + w)} ${fixed(y)}"${thick}/>`);
  }

  if (accentCount !== 1) {
    fail(`exactly one element must be marked acc (found ${accentCount})`, 1);
  }

  // Layout sanity: no two non-region shapes overlap, and nothing sits in the
  // footer band a `note` occupies.
  const ids = [...shapes.keys()].filter((id) => !id.startsWith('_'));
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = shapes.get(ids[i]);
      const b = shapes.get(ids[j]);
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      if (overlap && !(a.region || b.region)) {
        fail(`shapes ${JSON.stringify(ids[i])} and ${JSON.stringify(ids[j])} overlap`, 1);
      }
    }
  }
  if (note !== null) {
    for (const id of ids) {
      const shape = shapes.get(id);
      if (!shape.region && shape.y + shape.h > height - 26) {
        fail(`shape ${JSON.stringify(id)} intrudes into the footer note band (y > ${fixed(height - 26)})`, 1);
      }
    }
  }

  if (findings.length > 0) return { svg: null, findings, label, note };
  const accessibleName = options.accessibleName === undefined || String(options.accessibleName) === ''
    ? label : String(options.accessibleName);
  return {
    svg: render({ width, height, label: accessibleName, note, draw, texts, slug }),
    findings,
    label,
    note,
  };
}

/**
 * The SVG bytes: one shape, always, so two runs over one source agree
 * (AGSC-04-01/04-02). Nothing here carries a colour, a `style`, a `script`, an
 * `on*` attribute or a `data:` URI, so the result is inside AGSC-02-98's
 * allow-list by construction — and `tests/knowledge/diagram-svg.test.js` proves
 * it with the lint itself rather than by inspection.
 *
 * @param {{width:number, height:number, label:string, note:(string|null),
 *          draw:string[], texts:string[], slug:string}} parts
 * @returns {string}
 */
function render(parts) {
  const titleId = `${parts.slug}-title`;
  const descId = `${parts.slug}-desc`;
  const description = parts.note === null
    ? `${parts.label}. A line drawing; the highlighted element carries the accent.`
    : parts.note;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fixed(parts.width)} ${fixed(parts.height)}"`
    + ` role="img" aria-labelledby="${esc(titleId)} ${esc(descId)}"`
    + ' font-family="system-ui, sans-serif" font-size="14">\n'
    + `  <title id="${esc(titleId)}">${esc(parts.label)}</title>\n`
    + `  <desc id="${esc(descId)}">${esc(description)}</desc>\n`
    + `  ${MARKER}\n`
    + '  <g fill="none" stroke="currentColor" stroke-width="1.5">\n'
    + `    ${parts.draw.join('\n    ')}\n`
    + '  </g>\n'
    + '  <g fill="currentColor" text-anchor="middle">\n'
    + `    ${parts.texts.join('\n    ')}\n`
    + '  </g>\n'
    + '</svg>\n';
}

/**
 * AGSC-04-02 as a check rather than a write: does `expected` equal what this
 * source compiles to? The `--check` mode of the owner's compiler, as a pure
 * function, so that `tests/knowledge/diagram-golden.test.js` and the import both
 * use the same comparison.
 *
 * @param {string} dslText
 * @param {string} expectedSvg
 * @param {object} [options] as `compile`.
 * @returns {{stale:boolean, findings:Array<object>, svg:(string|null)}}
 */
function check(dslText, expectedSvg, options = {}) {
  const compiled = compile(dslText, options);
  if (compiled.svg === null) return { stale: true, findings: compiled.findings, svg: null };
  const stale = compiled.svg !== String(expectedSvg);
  const findings = stale
    ? [finding('AGSC-E602',
      `compiled diagram differs from the recorded SVG (AGSC-04-02)`,
      { file: options.file, slug: options.slug, line: 1 })]
    : [];
  return { stale, findings, svg: compiled.svg };
}

/**
 * The accessible name AGSC-02-13's `diagram.alt` needs, derived from the source
 * when the card has none: the `label` statement, then the `note`. A total
 * function; it never returns the empty string.
 *
 * @param {string} dslText
 * @param {{slug?:string, title?:string}} [options]
 * @returns {string}
 */
function altFrom(dslText, options = {}) {
  const parsed = compile(dslText, { slug: options.slug });
  const label = parsed.label === '' ? `${options.slug || 'diagram'} diagram` : parsed.label;
  const note = parsed.note === null ? '' : ` ${parsed.note}`;
  return `${label}.${note}`.trim();
}

module.exports = {
  ACCENT_CLASS,
  ACCENT_STROKE_WIDTH,
  GLYPH,
  MARKER,
  MAX_SOURCE_LENGTH,
  NOTE_MARGIN,
  STATEMENTS,
  TEXT_MARGIN,
  altFrom,
  check,
  clip,
  compile,
  esc,
  fixed,
  geometryKey,
  render,
  statements,
  textWidth,
  tokens,
};
