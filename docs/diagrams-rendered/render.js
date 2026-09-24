'use strict';
// docs/diagrams-rendered/render.js — render every Mermaid block of docs/diagrams/*.md to
// an SVG in docs/diagrams-rendered/, for readers whose viewer cannot render Mermaid. The Mermaid
// source is the truth; these pictures are a convenience, rendered offline by a
// maintainer and never in CI.
//
// Nothing here is a dependency of the repository. Install the two tools OUTSIDE it
// (a scratch folder), then point this script at them:
//
//   npm i --no-save --prefix <scratch> mermaid@12.0.0 playwright-core@1.62.1
//   NODE_PATH=<scratch>/node_modules CHROME_EXE=<a chromium or chrome-headless-shell> \
//     MERMAID_JS=<scratch>/node_modules/mermaid/dist/mermaid.min.js \
//     node docs/diagrams-rendered/render.js
//
// Output: `<file>-<n>.svg` for the n-th Mermaid block of `<file>.md`. Each picture
// gets a white background (so it reads on a dark page), a <title> naming its source,
// and fixed element ids, so rendering the same source twice gives the same bytes.

const fs = require('node:fs');
const path = require('node:path');

const DIR = path.resolve(__dirname, '..', 'diagrams');
const OUT = __dirname;

function blocks(text) {
  const out = [];
  const re = /^```mermaid\n([\s\S]*?)^```$/gmu;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

async function main() {
  const { chromium } = require('playwright-core');
  const mermaidJs = fs.readFileSync(process.env.MERMAID_JS, 'utf8');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE });
  try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  // A seeded generator in place of Math.random: some shapes are drawn with random
  // jitter, and the same source must give the same bytes.
  await page.addScriptTag({ content: 'var agscSeed = 1; Math.random = () => { agscSeed = (agscSeed * 16807) % 2147483647; return (agscSeed - 1) / 2147483646; };' });
  await page.addScriptTag({ content: mermaidJs });
  await page.evaluate(() => globalThis.mermaid.initialize({
    startOnLoad: false, theme: 'neutral', securityLevel: 'strict', look: 'classic',
    htmlLabels: false, flowchart: { htmlLabels: false }, deterministicIds: true, deterministicIDSeed: 'agsc',
  }));
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.md') && f !== 'README.md').sort();
  let written = 0;
  for (const file of files) {
    const list = blocks(fs.readFileSync(path.join(DIR, file), 'utf8'));
    for (let i = 0; i < list.length; i += 1) {
      const id = `${file.slice(0, -3)}-${i + 1}`;
      await page.evaluate(() => { globalThis.agscSeed = 1; });
      let svg = await page.evaluate(async ([d, src]) => (await globalThis.mermaid.render(d, src)).svg,
        [`m-${id}`, list[i]]);
      svg = svg.replace(/<svg([^>]*)>/u, (all, attrs) => `<svg${attrs.replace(/style="/u, 'style="background-color: #ffffff; ')}>`
        + `<title>${id} — rendered from docs/diagrams/${file}</title>`);
      // Node ids in lower case, and path numbers rounded to two decimals with a space
      // before each: the file stays the same picture, is smaller, and carries no digit
      // run that a public-text sweep would mistake for something else.
      svg = svg.replace(/flowchart-([A-Za-z0-9_]+)-(\d+)/gu, (all, n, d) => `flowchart-${n.toLowerCase()}-${d}`);
      svg = svg.replace(/\b(d|points|transform)="([^"]*)"/gu, (all, name, v) => `${name}="${v
        .replace(/-?(?:\d+\.\d*|\.\d+|\d+)(?:e-?\d+)?/gu, (n) => ` ${String(Math.round(Number(n) * 100) / 100)}`)
        .replace(/\s+/gu, ' ').replace(/^ | $/gu, '').replace(/([A-Za-z(,]) /gu, '$1')}"`);
      fs.writeFileSync(path.join(OUT, `${id}.svg`), `${svg}\n`);
      written += 1;
    }
  }
  process.stdout.write(`render: ${written} SVG file(s) written from ${files.length} Markdown file(s)\n`);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch((e) => { process.stderr.write(`render: ${e && e.stack ? e.stack : e}\n`); process.exitCode = 1; });
}
