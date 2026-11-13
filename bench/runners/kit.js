// generated from src-ts/bench/kit.ts by tsc 6.0.3; do not edit
"use strict";
// src-ts/bench/kit.ts — the benchmark kit's checks of the agent-side question set and of the
// results-row contract (docs/BENCHMARKS.md, "The agent-side study"; bench/queries/agent-study/).
//
// What it does, each part a pure function over text or parsed values, plus two readers:
//   * the gold index (`gold-index.tsv`): read and refused row by row (`parseGoldIndex`), written
//     from the chunk export of builds (`goldRows`, `formatGoldIndex`, the `gold-index` command
//     below), and checked against a build (`checkGoldIndex`): a gold row of a node the build
//     publishes must name a chunk of that build, and a row of another node is a fixture id,
//     counted and not checked (a warning when no row names a node of the build, since then
//     nothing was checked); the chunk export is read line by line, a sharded one through its
//     manifest (AGSC-06-31), and a line that is no chunk record is a finding with its line;
//   * the gold labels (`qrels/test.tsv`): every gold unit is a chunk id of the gold index
//     (`checkQrels`, each finding at its line of the labels file);
//   * the results-row contract (`bench/queries/results-row.schema.json`): a JSON Schema of draft
//     2020-12 that accepts each of its own examples (`checkContract`), validated by Ajv, the
//     JSON Schema validator the engine already pins (the official libraries rule of 1.1).
// `checkSet` runs the three for `tools/bench --dry-run`.
//
// Why a runner of its own: like `tools/bench`, it measures what a consumer of the PUBLISHED
// files gets, so it requires nothing of the engine under src/ (the independence of AGSC-09-90;
// `.dependency-cruiser.js` rule `bench-runners-standalone`, `tests/arch/bench-runners.test.js`).
// The gold index is tab-separated text with no quoting (IANA text/tab-separated-values: a field
// holds no tab and no line break), so it is read by splitting, as `tools/bench` reads `qrels`.
//
// Deterministic: no clock, no network; files are read in code-unit order of their names, rows
// keep their order, and the findings follow the rows. Findings carry the AGSC-09-11 shape.
// Requirements: PRD-066.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HELP = exports.DIALECT = exports.GOLD_COLUMNS = void 0;
exports.parseGoldIndex = parseGoldIndex;
exports.goldRows = goldRows;
exports.formatGoldIndex = formatGoldIndex;
exports.readChunks = readChunks;
exports.checkGoldIndex = checkGoldIndex;
exports.qrelsLines = qrelsLines;
exports.checkQrels = checkQrels;
exports.contractValidator = contractValidator;
exports.checkContract = checkContract;
exports.checkSet = checkSet;
exports.run = run;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const _2020_1 = require("ajv/dist/2020");
const ajv_formats_1 = __importDefault(require("ajv-formats"));
/** The nine columns of the gold index, in order. */
exports.GOLD_COLUMNS = Object.freeze([
    'node', 'chunk_id', 'item', 'ordinal', 'kind', 'section', 'title', 'digest16', 'first_140_chars',
]);
/** The dialect of the results-row contract. */
exports.DIALECT = 'https://json-schema.org/draft/2020-12/schema';
/** The length of the chunk-text excerpt of a gold row, in code points. */
const EXCERPT = 140;
const finding = (code, file, line, message, severity = 'error') => ({ code, col: 1, file, line, message, severity });
/** The cells with a fixed form, by column index: [index, form, what a cell of another form lacks]. */
const CELL_RULES = [
    [0, /^\S+$/u, 'names no node'],
    [1, /^[0-9a-f]{64}$/u, 'carries no chunk id of 64 lower-case hexadecimal digits'],
    [3, /^[0-9]+$/u, 'carries no ordinal (a whole number)'],
    [7, /^[0-9a-f]{16}$/u, 'carries no digest prefix of 16 lower-case hexadecimal digits'],
];
/** One line of the gold index as a row, or the reason it is none. */
function goldRow(line) {
    const cells = line.split('\t');
    if (cells.length !== exports.GOLD_COLUMNS.length)
        return `has ${cells.length} columns; the gold index has ${exports.GOLD_COLUMNS.length}`;
    for (const [index, form, problem] of CELL_RULES) {
        if (!form.test(cells[index] ?? ''))
            return problem;
    }
    const [node = '', chunkId = '', item = '', ordinal = '', kind = '', section = '', title = '', digest16 = '', excerptText = ''] = cells;
    return { node, chunk_id: chunkId, item, ordinal: Number(ordinal), kind, section, title, digest16, first_140_chars: excerptText };
}
/** The gold index read from its text: the rows, and a finding for each line that is no row. */
function parseGoldIndex(text, file) {
    const lines = text.split('\n');
    if (lines[0] !== exports.GOLD_COLUMNS.join('\t')) {
        return { findings: [finding('AGSC-E201', file, 1, `the header is not the nine columns ${exports.GOLD_COLUMNS.join(', ')}`)], rows: [] };
    }
    const findings = [];
    const rows = [];
    const seen = new Map();
    lines.slice(1).forEach((line, i) => {
        const number = i + 2;
        if (line.trim() === '')
            return;
        const row = goldRow(line);
        if (typeof row === 'string') {
            findings.push(finding('AGSC-E201', file, number, `this row ${row}`));
            return;
        }
        const before = seen.get(row.chunk_id);
        if (before !== undefined) {
            findings.push(finding('AGSC-E201', file, number, `chunk id ${row.chunk_id} is named again (line ${before})`));
            return;
        }
        seen.set(row.chunk_id, number);
        rows.push(row);
    });
    return { findings, rows };
}
/** The first 140 code points of a text, its white space runs folded to one space. */
function excerpt(text) {
    return [...text.split(/\s+/u).filter((word) => word !== '').join(' ')].slice(0, EXCERPT).join('');
}
/** The gold rows of one node's chunks, in their order; without excerpts the last column is empty. */
function goldRows(node, chunks, options) {
    return chunks.map((chunk) => ({
        node,
        chunk_id: chunk.id,
        item: chunk.item,
        ordinal: chunk.ordinal,
        kind: chunk.kind ?? '',
        section: chunk.section ?? '',
        title: chunk.title ?? '',
        digest16: chunk.digest.slice(0, 16),
        first_140_chars: options.excerpts ? excerpt(chunk.text) : '',
    }));
}
/** The text of a gold index: the header and one line per row, every cell free of tabs and line breaks. */
function formatGoldIndex(rows) {
    const cell = (value) => String(value).replace(/[\t\n\r]/gu, ' ');
    return [exports.GOLD_COLUMNS.join('\t'), ...rows.map((row) => exports.GOLD_COLUMNS.map((column) => cell(row[column])).join('\t'))]
        .map((line) => `${line}\n`).join('');
}
/** The members of a chunk record the kit reads, each with the type it must have. */
const CHUNK_MEMBERS = [
    ['digest', 'string'], ['id', 'string'], ['iri', 'string'], ['item', 'string'], ['ordinal', 'number'], ['text', 'string'],
];
/** A shard path of the manifest (AGSC-06-31): a file of the chunk export at the root of the build. */
const SHARD = /^\/chunks-[0-9]+\.jsonl$/u;
/** One line of a chunk file parsed, or the parser's message when it is not JSON. */
function parseLine(line) {
    try {
        return { value: JSON.parse(line) };
    }
    catch (e) {
        return { error: e.message };
    }
}
/** Why a parsed line is no chunk record the kit can read (a member missing or of another type), or null. */
function chunkProblem(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return 'is not a JSON object';
    const record = value;
    const bad = CHUNK_MEMBERS.find(([member, type]) => typeof record[member] !== type);
    return bad === undefined ? null : `is no chunk record: its ${bad[0]} is not a ${bad[1]}`;
}
/** The chunks of one file of the export, and a finding for each line that is no chunk record. */
function readChunkFile(file) {
    const chunks = [];
    const findings = [];
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (line.trim() === '')
            return;
        const parsed = parseLine(line);
        const problem = 'error' in parsed ? `is not JSON: ${parsed.error}` : chunkProblem(parsed.value);
        if (problem !== null)
            findings.push(finding('AGSC-E201', file, i + 1, `line ${i + 1} ${problem}`));
        else if ('value' in parsed)
            chunks.push(parsed.value);
    });
    return { chunks, findings };
}
/** The shard files a `chunks.jsonl` manifest names (AGSC-06-31), null when the file holds chunk lines. */
function manifestShards(file, nodeDir) {
    const parsed = parseLine(fs.readFileSync(file, 'utf8').split('\n')[0] ?? '');
    const value = 'value' in parsed ? parsed.value : null;
    if (value === null || typeof value !== 'object' || !Array.isArray(value.shards))
        return null;
    const shards = value.shards;
    const outside = shards.find((shard) => typeof shard !== 'string' || !SHARD.test(shard));
    if (outside !== undefined)
        return finding('AGSC-E201', file, 1, `the manifest names ${JSON.stringify(outside)}, which is no shard of the chunk export (/chunks-<nn>.jsonl)`);
    return shards.map((shard) => path.join(nodeDir, shard.slice(1)));
}
/** Every chunk a build publishes, a sharded export through its manifest, or a finding when it publishes no chunk export. */
function readChunks(nodeDir) {
    const main = path.join(nodeDir, 'chunks.jsonl');
    if (!fs.existsSync(main)) {
        return { chunks: [], findings: [finding('AGSC-E901', main, 1, 'the build publishes no chunk export, so no gold unit can be checked')] };
    }
    const shards = manifestShards(main, nodeDir);
    if (shards !== null && !Array.isArray(shards))
        return { chunks: [], findings: [shards] };
    const missing = (shards ?? []).find((file) => !fs.existsSync(file));
    if (missing !== undefined)
        return { chunks: [], findings: [finding('AGSC-E901', missing, 1, 'a shard the manifest names is not in the build')] };
    const read = (shards ?? [main]).map(readChunkFile);
    return { chunks: read.flatMap((r) => r.chunks), findings: read.flatMap((r) => r.findings) };
}
/** The node of a chunk: the host of its IRI. */
function hostOf(chunk) {
    try {
        return new URL(String(chunk.iri)).host;
    }
    catch {
        return '';
    }
}
/** The gold index against a build: each row of a node the build publishes names one of its chunks. */
function checkGoldIndex(rows, chunks, file) {
    const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
    const hosts = new Set(chunks.map(hostOf));
    const findings = [];
    let checked = 0;
    let found = 0;
    let changed = 0;
    rows.forEach((row, i) => {
        if (!hosts.has(row.node))
            return;
        checked += 1;
        const chunk = byId.get(row.chunk_id);
        if (chunk === undefined || hostOf(chunk) !== row.node) {
            findings.push(finding('AGSC-E301', file, i + 2, `gold chunk ${row.chunk_id} (${row.item}, ordinal ${row.ordinal}) is not a chunk of the ${row.node} build`));
            return;
        }
        found += 1;
        if (chunk.digest.slice(0, 16) !== row.digest16) {
            changed += 1;
            findings.push(finding('AGSC-E210', file, i + 2, `gold chunk ${row.chunk_id} changed since the index was written (digest ${chunk.digest.slice(0, 16)}, index ${row.digest16}); re-read its question`, 'warn'));
        }
    });
    return { findings, summary: { checked, digest_changed: changed, fixture_ids: rows.length - checked, found, rows: rows.length } };
}
/** The line of each (query, gold unit) pair of a labels file, the first one when a pair is repeated. */
function qrelsLines(text) {
    const lines = new Map();
    text.split('\n').forEach((line, i) => {
        const [query = '', unit = ''] = line.split('\t');
        const key = `${query}\t${unit}`;
        if (!lines.has(key))
            lines.set(key, i + 1);
    });
    return lines;
}
/** Every gold unit of the labels that the gold index does not name, as a finding at its line of `file` (`lines`, from `qrelsLines`). */
function checkQrels(qrels, rows, file, lines = new Map()) {
    const ids = new Set(rows.map((row) => row.chunk_id));
    const findings = [];
    for (const query of [...qrels.keys()].sort()) {
        for (const unit of [...(qrels.get(query) ?? [])].sort()) {
            const line = lines.get(`${query}\t${unit}`) ?? 1;
            if (!ids.has(unit))
                findings.push(finding('AGSC-E301', file, line, `query ${query} names gold unit ${unit}, which the gold index does not list`));
        }
    }
    return findings;
}
/** The warning of a build whose node no gold row names: every row is a fixture id, so nothing was checked. */
function noneChecked(summary, chunks, file) {
    if (summary.rows === 0 || summary.checked > 0)
        return [];
    const hosts = [...new Set(chunks.map(hostOf))].filter((host) => host !== '').sort();
    return [finding('AGSC-E210', file, 1, `no gold row names a node this build publishes (${hosts.join(', ') || 'no host'}); every row is a fixture id, so nothing was checked against the build`, 'warn')];
}
/** A validator of results files against the contract (Ajv, strict, with the formats `date` needs). */
function contractValidator(schema) {
    const ajv = new _2020_1.Ajv2020({ allErrors: true, strict: true });
    (0, ajv_formats_1.default)(ajv, ['date']);
    const validate = ajv.compile(schema);
    return (document) => validate(document);
}
/** Every example of the contract that the contract refuses, as findings, and the number of examples. */
function examplesOf(file, schema) {
    const examples = Array.isArray(schema.examples) ? schema.examples : [];
    if (examples.length === 0)
        return { examples: 0, findings: [finding('AGSC-E202', file, 1, 'the contract carries no example to validate')] };
    const accepts = contractValidator(schema);
    const findings = examples.flatMap((example, i) => (accepts(example) ? [] : [finding('AGSC-E201', file, 1, `the contract refuses its own example ${i}`)]));
    return { examples: examples.length, findings };
}
/** The results-row contract: a JSON Schema of draft 2020-12 that accepts each of its own examples. */
function checkContract(file) {
    let schema;
    try {
        schema = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    catch (e) {
        const unreadable = e.code !== undefined;
        return { findings: [finding(unreadable ? 'AGSC-E901' : 'AGSC-E201', file, 1, unreadable ? 'cannot be read' : `is not JSON: ${e.message}`)], summary: { examples: 0 } };
    }
    if (schema.$schema !== exports.DIALECT) {
        return { findings: [finding('AGSC-E201', file, 1, `names the dialect ${String(schema.$schema)}; the contract is a JSON Schema of ${exports.DIALECT}`)], summary: { examples: 0 } };
    }
    try {
        const { examples, findings } = examplesOf(file, schema);
        return { findings, summary: { examples } };
    }
    catch (e) {
        return { findings: [finding('AGSC-E201', file, 1, `is not a valid JSON Schema: ${e.message}`)], summary: { examples: 0 } };
    }
}
/** The kit's checks of a set: the contract always; the gold index and the labels when the set carries one. */
function checkSet(input) {
    const contract = checkContract(input.contract);
    const report = { examples: contract.summary.examples, schema: path.basename(input.contract) };
    const indexFile = path.join(input.set, 'gold-index.tsv');
    if (!fs.existsSync(indexFile))
        return { findings: contract.findings, kit: { contract: report, gold_index: null, index: null } };
    const index = parseGoldIndex(fs.readFileSync(indexFile, 'utf8'), indexFile);
    const qrelsFile = path.join(input.set, 'qrels', 'test.tsv');
    const lines = fs.existsSync(qrelsFile) ? qrelsLines(fs.readFileSync(qrelsFile, 'utf8')) : new Map();
    const labels = [...input.qrels.values()].reduce((n, units) => n + units.size, 0);
    const findings = [...contract.findings, ...index.findings, ...checkQrels(input.qrels, index.rows, qrelsFile, lines)];
    const kit = { contract: report, index: { labels, rows: index.rows.length } };
    if (input.node === null)
        return { findings, kit: { ...kit, gold_index: null } };
    const build = readChunks(input.node);
    if (build.findings.length > 0)
        return { findings: [...findings, ...build.findings], kit: { ...kit, gold_index: null } };
    const against = checkGoldIndex(index.rows, build.chunks, indexFile);
    const warned = noneChecked(against.summary, build.chunks, indexFile);
    return { findings: [...findings, ...against.findings, ...warned], kit: { ...kit, gold_index: against.summary } };
}
exports.HELP = `kit gold-index [--without-excerpts] <node>=<built output>... [--help]

  Writes the gold index of the agent-side question set (bench/queries/agent-study/) to
  standard output: one row for every chunk of each build, in the order given, the node
  named as given (a host name such as patterns.agenticsystemcore.com).

  --without-excerpts  leave the last column (the first 140 characters) empty, as the
                      repository copy is
  --help              this text

  Exit 0 written, 1 a build publishes no chunk export, 2 usage.
`;
/** The command line: `gold-index`, the one command; the exit code. */
function run(argv, io = {}) {
    const out = io.out ?? ((s) => { process.stdout.write(s); });
    const err = io.err ?? ((s) => { process.stderr.write(s); });
    if (argv.includes('--help') || argv.includes('-h')) {
        out(exports.HELP);
        return 0;
    }
    const [command, ...rest] = argv;
    const excerpts = !rest.includes('--without-excerpts');
    const nodes = rest.filter((arg) => arg !== '--without-excerpts');
    const malformed = nodes.find((arg) => arg.startsWith('-') || !/^[^=]+=.+$/u.test(arg));
    if (command !== 'gold-index' || nodes.length === 0 || malformed !== undefined) {
        err(`kit: ${malformed === undefined ? 'name the command gold-index and at least one <node>=<built output>' : `cannot read ${malformed}`}\n${exports.HELP}`);
        return 2;
    }
    const rows = [];
    for (const arg of nodes) {
        const at = arg.indexOf('=');
        const build = readChunks(arg.slice(at + 1));
        for (const f of build.findings)
            err(`kit: ${f.file}: ${f.code} ${f.message}\n`);
        if (build.findings.length > 0)
            return 1;
        rows.push(...goldRows(arg.slice(0, at), build.chunks, { excerpts }));
    }
    out(formatGoldIndex(rows));
    return 0;
}
/* c8 ignore next */
if (require.main === module)
    process.exit(run(process.argv.slice(2)));
