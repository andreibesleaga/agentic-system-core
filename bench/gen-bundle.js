'use strict';
/**
 * bench/gen-bundle.js — the deterministic synthetic-Bundle generator behind the
 * build curves of `docs/MEASUREMENTS.md` (research/39 Layer D).
 *
 * Why it exists. AGSC-06-21 and AGSC-06-31 branch above 500 items — index
 * sharding and index-route pagination — and no released vector crosses that
 * bound, so the only way to exercise those branches is to build a Bundle bigger
 * than any real one. The generator makes such a Bundle from a seed, with no
 * clock, no network and no randomness: item n is a pure function of n, so two
 * runs on two machines produce byte-identical trees and the curve is
 * reproducible by anybody.
 *
 * Where the output goes. NEVER inside this repository. The generator refuses to
 * write into the repository tree (a generated 10,000-item Bundle is 250 MB of
 * derived data, and `tests/vectors/` is the only generated content this project
 * commits). Point it at a scratch directory.
 *
 *   node bench/gen-bundle.js --items 500 --out /tmp/bench/n500
 *
 * Deterministic by construction: the body text is assembled from a fixed word
 * list indexed by arithmetic on the item number.
 */

const fs = require('node:fs');
const path = require('node:path');

const HELP = `gen-bundle --items <n> --out <dir> [--id <bundle-id>] [--help]

  Writes a synthetic, conforming Bundle of <n> concept items plus one cluster
  and one index, for the build-performance curves of docs/MEASUREMENTS.md.
  Output is a pure function of <n>: no clock, no randomness, no network.

  --items <n>   how many concept items to generate (required, 1..1000000)
  --out <dir>   where to write the Bundle (required; must be outside this repository)
  --id <name>   bundle id (default: bench-<n>)
  --help        this text

  Exit 0 written, 2 usage.
`;

/** The word pool the bodies are drawn from; fixed, so the text is reproducible. */
const WORDS = Object.freeze([
  'agent', 'memory', 'bundle', 'item', 'link', 'cluster', 'gate', 'harness',
  'provenance', 'ledger', 'proposal', 'review', 'surface', 'route', 'index',
  'graph', 'chunk', 'skill', 'episode', 'lesson', 'procedure', 'concept',
  'deterministic', 'canonical', 'published', 'governed', 'traceable', 'static',
]);

/** The five headings every generated body carries, so the anchor set is realistic. */
const HEADINGS = Object.freeze([
  'Intent', 'Context & Forces', 'Structure', 'Consequences & Trade-offs', 'See Also',
]);

/**
 * A reproducible paragraph: `count` words taken from WORDS by arithmetic on the
 * item number and the position, never by a random source.
 * @param {number} n item number
 * @param {number} offset paragraph number within the item
 * @param {number} count how many words
 * @returns {string}
 */
function paragraph(n, offset, count) {
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(WORDS[(n * 7 + offset * 13 + i * 3) % WORDS.length]);
  const text = out.join(' ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** The Markdown of item `n` of a Bundle of `total` items. Pure. */
function item(n, total) {
  const related = [`bench-item-${((n + 1) % total) + 1}`, `bench-item-${((n + 7) % total) + 1}`];
  const front = [
    '---',
    'type: concept',
    `title: Bench Item ${n + 1}`,
    `description: ${paragraph(n, 0, 12)}`,
    'tags:',
    '  - agents',
    '  - patterns',
    'clusters:',
    '  - bench-cluster',
    'related:',
    `  - ${related[0]}`,
    `  - ${related[1]}`,
    'date: "2026-01-01"',
    'prov:',
    '  origin: human',
    '  operator: human:andreibesleaga',
    'kind: pattern',
    '---',
    '',
  ];
  const body = [`# Bench Item ${n + 1}`, ''];
  HEADINGS.forEach((heading, h) => {
    body.push(`## ${heading}`, '');
    body.push(paragraph(n, h + 1, 40), '');
    body.push(paragraph(n, h + 20, 40), '');
  });
  body.push(`See [Bench Item ${((n + 1) % total) + 1}](../${related[0]}/).`, '');
  return front.join('\n') + body.join('\n');
}

/** The whole tree as `{ relativePath: contents }`. Pure; the caller writes it. */
function bundle(items, id) {
  const files = Object.create(null);
  files['agsc.config.json'] = `${JSON.stringify({
    build: { out: 'www' },
    bundle: {
      id,
      license_prose: 'LicenseRef-AgenticSystemCore-Content-Use-1.0',
      license_schema: 'CC0-1.0',
      operator: 'human:andreibesleaga',
    },
    site: {
      base: 'https://bench.example/',
      tagline: 'A generated Bundle used only to measure build cost.',
      tdm_crawlers: ['Applebot-Extended', 'CCBot', 'ClaudeBot', 'GPTBot', 'Google-Extended', 'meta-externalagent'],
      title: `Bench Bundle (${items} items)`,
    },
    spec_version: '1.0.0-rc.5',
    tags: { allowed: ['agents', 'patterns'] },
  }, null, 2)}\n`;
  files[path.join('content', 'index.md')] = [
    '---',
    'spec_version: 1.0.0-rc.5',
    'okf_version: "0.2"',
    `title: Bench Bundle (${items} items)`,
    'description: A generated Bundle used only to measure build cost; no prose here is meant to be read.',
    'base: https://bench.example/',
    'lang: en',
    'license: LicenseRef-AgenticSystemCore-Content-Use-1.0',
    'prov:',
    '  origin: human',
    '  operator: human:andreibesleaga',
    '---',
    '',
    `# Bench Bundle (${items} items)`,
    '',
    'Generated by `bench/gen-bundle.js`. Every byte is a function of the item count.',
    '',
  ].join('\n');
  // AGSC-06-01/PRD-047: a Bundle without an RFC 9116 contact fails the build with
  // AGSC-E901, so the generated Bundle carries one; the address is the RFC 2606
  // example domain and reaches nobody.
  files[path.join('.well-known', 'security.txt')] = 'Contact: https://example.org/security-contact\nPreferred-Languages: en\n';
  files[path.join('content', 'clusters', 'bench-cluster.md')] = [
    '---',
    'type: cluster',
    'title: Bench Cluster',
    'description: The single cluster every generated item belongs to.',
    'date: "2026-01-01"',
    'prov:',
    '  origin: human',
    '  operator: human:andreibesleaga',
    '---',
    '',
    '# Bench Cluster',
    '',
    'Holds every generated item.',
    '',
  ].join('\n');
  for (let n = 0; n < items; n += 1) {
    files[path.join('content', 'concepts', `bench-item-${n + 1}.md`)] = item(n, items);
  }
  return files;
}

/** True when `dir` lies inside this repository, which the generator refuses. */
function insideRepository(dir) {
  const repo = path.resolve(__dirname, '..');
  const rel = path.relative(repo, path.resolve(dir));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * @param {string[]} argv
 * @param {{out:(s:string)=>void, err:(s:string)=>void}} [io]
 * @returns {number} 0 written, 2 usage
 */
function run(argv, io) {
  const out = (io && io.out) || ((s) => process.stdout.write(s));
  const err = (io && io.err) || ((s) => process.stderr.write(s));
  const usage = (message) => { err(`gen-bundle: ${message}\n${HELP}`); return 2; };

  let items = null;
  let target = null;
  let id = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { out(HELP); return 0; }
    else if (arg === '--items') { i += 1; items = Number(argv[i]); }
    else if (arg === '--out') { i += 1; target = argv[i]; }
    else if (arg === '--id') { i += 1; id = argv[i]; }
    else return usage(`unknown argument ${arg}`);
  }
  if (!Number.isInteger(items) || items < 1 || items > 1000000) return usage('--items <n> must be an integer 1..1000000');
  if (typeof target !== 'string' || target === '') return usage('--out <dir> is required');
  if (insideRepository(target)) return usage(`refusing to generate inside the repository: ${target}`);

  const files = bundle(items, id || `bench-${items}`);
  for (const rel of Object.keys(files).sort()) {
    const where = path.join(target, rel);
    fs.mkdirSync(path.dirname(where), { recursive: true });
    fs.writeFileSync(where, files[rel]);
  }
  out(`gen-bundle: ${Object.keys(files).length} files, ${items} items, ${target}\n`);
  return 0;
}

/* c8 ignore next */
if (require.main === module) process.exit(run(process.argv.slice(2)));

module.exports = { HEADINGS, HELP, WORDS, bundle, insideRepository, item, paragraph, run };
