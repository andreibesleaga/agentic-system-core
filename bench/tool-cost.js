'use strict';
/**
 * bench/tool-cost.js — what the ten tools cost an agent, in bytes and tokens.
 *
 *   node bench/tool-cost.js --bundle <dir> [--bundle <dir> …] [--deps <dir>] [--json]
 *
 * It prints two tables.
 *
 *   1. The tool definitions: for each of the ten tools, the size of the entry that
 *      `tools/list` returns (the manifest with the MCP annotations) and of the entry
 *      the page registers through `document.modelContext` (the same manifest with the
 *      WebMCP annotations).
 *   2. The answers: for each tool, the size of the answer to one typical call on
 *      each Bundle named, as the envelope JSON and as the MCP result that carries it
 *      (the envelope as text, and again as `structuredContent`).
 *
 * Counting. Bytes are UTF-8 bytes of the compact JSON text. Characters are UTF-16
 * code units (`String.length`). Tokens are counted in the `o200k_base` vocabulary
 * when `--deps <dir>` names a folder whose `node_modules/gpt-tokenizer` is installed
 * (the method of the benchmarks repository, which pins the same package and
 * vocabulary; the package is not a dependency of this repository, so the caller
 * installs it outside). Without it, tokens are characters / 4, rounded up, and the
 * output says so. No count here is Claude's: Anthropic publishes no offline tokenizer.
 *
 * `members` is the number of hits, edges or findings in the answer; for a bounded `search`
 * it is `hits/total`.
 *
 * The typical call on a Bundle: the query is the first word of the first item's
 * title (`--query` overrides it), the item is the one half-way through the sorted
 * list (`--slug` overrides it), and the edge for `explain` is that item's first one.
 * The call list is printed with the table.
 *
 * Deterministic: SOURCE_DATE_EPOCH is fixed, nothing reads the network.
 * Exit 0 measured, 2 usage.
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const EPOCH = '1767225600';

const HELP = `tool-cost --bundle <dir> [--bundle <dir> …] [--deps <dir>] [--query <word>] [--slug <slug>] [--json]

  Prints the size of the ten tool definitions and of one typical answer of each tool.

  --bundle <dir>   a Bundle folder (agsc.config.json inside); repeat for several
  --deps <dir>     a folder holding node_modules/gpt-tokenizer, to count o200k_base
                   tokens; without it tokens are characters / 4
  --query <word>   the search and ask query (default: the first word of the first title)
  --slug <slug>    the item of read, links, compose, propose, brief, explain
  --json           print one JSON object instead of tables
  --help           this text

  Exit 0 measured, 2 usage.
`;

/** The options that take a value. */
const VALUED = ['--bundle', '--deps', '--query', '--slug'];

function parseArgs(argv) {
  const out = { bundles: [], deps: null, json: false, query: null, slug: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help') out.help = true;
    else if (a === '--json') out.json = true;
    else if (VALUED.includes(a)) {
      i += 1;
      if (i >= argv.length) return { error: `${a} needs a value` };
      if (a === '--bundle') out.bundles.push(argv[i]);
      else out[a.slice(2)] = argv[i];
    } else return { error: `unknown argument: ${a}` };
  }
  return out;
}

/** The token counter and the name of its method. */
function tokenizer(deps) {
  if (deps) {
    const { encode } = require(path.join(path.resolve(deps), 'node_modules', 'gpt-tokenizer', 'cjs', 'encoding', 'o200k_base'));
    return { count: (text) => encode(text).length, method: 'o200k_base (gpt-tokenizer)' };
  }
  return { count: (text) => Math.ceil(text.length / 4), method: 'characters / 4, rounded up' };
}

const sizes = (text, count) => ({ bytes: Buffer.byteLength(text, 'utf8'), chars: text.length, tokens: count(text) });

/** The tool definitions, in the two forms the two transports carry. */
function definitionSizes(count) {
  const { manifest } = require(path.join(REPO, 'src', 'distribution', 'mcp-tools.js'));
  const { MCP_ANNOTATIONS } = require(path.join(REPO, 'src', 'boundary', 'surfaces.js'));
  const webmcp = require(path.join(REPO, 'src', 'distribution', 'webmcp.js'));
  const list = manifest().tools;
  const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const rows = [...list].sort(byName).map((tool) => ({
    mcp: sizes(JSON.stringify({ ...tool, annotations: MCP_ANNOTATIONS[tool.name] }), count),
    page: sizes(JSON.stringify(tool), count),
    tool: tool.name,
  }));
  const total = (key) => rows.reduce((t, r) => ({
    bytes: t.bytes + r[key].bytes, chars: t.chars + r[key].chars, tokens: t.tokens + r[key].tokens,
  }), { bytes: 0, chars: 0, tokens: 0 });
  return { rows, script: sizes(webmcp.script(), count), total: { mcp: total('mcp'), page: total('page') } };
}

/** The ten typical calls on one loaded Bundle. */
function callsFor(hosts, options) {
  const slugs = hosts.bundle.items.map((i) => i.slug);
  const slug = options.slug || slugs[Math.floor(slugs.length / 2)];
  const first = hosts.bundle.items[0];
  const word = options.query || String((first.frontmatter || {}).title || first.slug).split(/\s+/u)[0].toLowerCase();
  const edges = hosts.local.call('links', { slug }).body.edges || [];
  // The first edge of the item that `explain` accepts as a key (a computed name such as `mentions` is not one).
  const accepted = (e) => hosts.local.call('explain', { key: e.key, source: e.source, target: e.target }).type !== 'error';
  const edge = edges.find(accepted) || { key: 'related', source: slug, target: slug };
  return [
    ['search', { query: word }],
    ['read', { slug }],
    ['links', { slug }],
    ['compose', { selection: [slug] }],
    ['propose', { slug }],
    ['ask', { question: word }],
    ['remember', { body: 'A note.', kind: 'lesson', operator: 'human:someone', title: 'A Lesson Learned Here' }],
    ['brief', { selection: [slug] }],
    ['explain', { key: edge.key, source: edge.source, target: edge.target }],
    ['check', {}],
  ];
}

function answerSizes(dir, options, count) {
  const { inProcess } = require(path.join(REPO, 'bench', 'parity.js'));
  const hosts = inProcess(path.resolve(dir), {});
  const calls = callsFor(hosts, options);
  const rows = calls.map(([tool, args]) => {
    const envelope = hosts.local.call(tool, args);
    const mcpResult = { content: [{ text: JSON.stringify(envelope), type: 'text' }], isError: envelope.type === 'error', structuredContent: envelope };
    const body = envelope.body || {};
    const members = ['search', 'links', 'check'].includes(tool) ? (body.hits || body.edges || body.findings) : undefined;
    return {
      args: JSON.stringify(args),
      count: Array.isArray(members) ? members.length : null,
      total: typeof body.total === 'number' ? body.total : null,
      envelope: sizes(JSON.stringify(envelope), count),
      mcp_result: sizes(JSON.stringify(mcpResult), count),
      tool,
      type: envelope.type,
    };
  });
  return { bundle: path.basename(path.resolve(dir)), items: hosts.bundle.items.length, rows };
}

const pad = (v, n) => String(v).padStart(n);

function print(result) {
  const out = [];
  out.push(`Token method: ${result.token_method}`);
  out.push('', 'Tool definitions (bytes / characters / tokens)', '');
  out.push(`${'tool'.padEnd(10)}${pad('tools/list', 28)}${pad('page registration', 30)}`);
  for (const r of result.definitions.rows) {
    const f = (s) => `${pad(s.bytes, 7)} /${pad(s.chars, 7)} /${pad(s.tokens, 6)}`;
    out.push(`${r.tool.padEnd(10)}${f(r.mcp).padStart(28)}${f(r.page).padStart(30)}`);
  }
  const t = result.definitions.total;
  const f = (s) => `${pad(s.bytes, 7)} /${pad(s.chars, 7)} /${pad(s.tokens, 6)}`;
  out.push(`${'all ten'.padEnd(10)}${f(t.mcp).padStart(28)}${f(t.page).padStart(30)}`);
  const s = result.definitions.script;
  out.push(`The page script that registers them: ${s.bytes} bytes, ${s.chars} characters, ${s.tokens} tokens.`);
  for (const b of result.answers) {
    out.push('', `Answers on ${b.bundle} (${b.items} items): envelope / MCP result, bytes and tokens`, '');
    out.push(`${'tool'.padEnd(10)}${pad('env bytes', 10)}${pad('env tok', 9)}${pad('result bytes', 14)}${pad('result tok', 12)}${pad('members', 9)}  call`);
    for (const r of b.rows) {
      out.push(`${r.tool.padEnd(10)}${pad(r.envelope.bytes, 10)}${pad(r.envelope.tokens, 9)}${pad(r.mcp_result.bytes, 14)}${pad(r.mcp_result.tokens, 12)}${pad(r.count === null ? '' : r.total === null ? r.count : `${r.count}/${r.total}`, 9)}  ${r.type} ${r.args.slice(0, 70)}`);
    }
  }
  return `${out.join('\n')}\n`;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.error || (!args.help && args.bundles.length === 0)) {
    process.stderr.write(`${args.error || 'at least one --bundle is required'}\n\n${HELP}`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  for (const dir of args.bundles) {
    if (!fs.existsSync(path.join(dir, 'agsc.config.json'))) {
      process.stderr.write(`not a Bundle (no agsc.config.json): ${dir}\n`);
      return 2;
    }
  }
  process.env.SOURCE_DATE_EPOCH = EPOCH;
  const { count, method } = tokenizer(args.deps);
  const result = {
    answers: args.bundles.map((dir) => answerSizes(dir, args, count)),
    definitions: definitionSizes(count),
    token_method: method,
  };
  process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : print(result));
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { answerSizes, definitionSizes, main, tokenizer };
