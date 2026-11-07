// src-ts/bench/kit.ts — the benchmark kit's checks of the agent-side question set and of the
// results-row contract (docs/BENCHMARKS.md, "The agent-side study"; bench/queries/agent-study/).
//
// What it does, each part a pure function over text or parsed values, plus two readers:
//   * the gold index (`gold-index.tsv`): read and refused row by row (`parseGoldIndex`), written
//     from the chunk export of builds (`goldRows`, `formatGoldIndex`, the `gold-index` command
//     below), and checked against a build (`checkGoldIndex`): a gold row of a node the build
//     publishes must name a chunk of that build, and a row of another node is a fixture id,
//     counted and not checked;
//   * the gold labels (`qrels/test.tsv`): every gold unit is a chunk id of the gold index
//     (`checkQrels`);
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

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Ajv2020 } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

/** The nine columns of the gold index, in order. */
export const GOLD_COLUMNS = Object.freeze([
  'node', 'chunk_id', 'item', 'ordinal', 'kind', 'section', 'title', 'digest16', 'first_140_chars',
] as const);
/** The dialect of the results-row contract. */
export const DIALECT = 'https://json-schema.org/draft/2020-12/schema';
/** The length of the chunk-text excerpt of a gold row, in code points. */
const EXCERPT = 140;

/** One row of the gold index. */
export interface GoldRow {
  readonly node: string;
  readonly chunk_id: string;
  readonly item: string;
  readonly ordinal: number;
  readonly kind: string;
  readonly section: string;
  readonly title: string;
  readonly digest16: string;
  readonly first_140_chars: string;
}

/** One finding, in the AGSC-09-11 shape. */
export interface Finding {
  readonly code: string;
  readonly col: number;
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly severity: 'error' | 'warn';
}

/** The members of a chunk line (AGSC-06-29) the kit reads. */
export interface Chunk {
  readonly digest: string;
  readonly id: string;
  readonly iri?: string;
  readonly item: string;
  readonly kind?: string;
  readonly ordinal: number;
  readonly section?: string;
  readonly text: string;
  readonly title?: string;
}

/** What `checkGoldIndex` counted. */
export interface GoldSummary {
  readonly checked: number;
  readonly digest_changed: number;
  readonly fixture_ids: number;
  readonly found: number;
  readonly rows: number;
}

/** The `kit` member of the dry run's envelope. */
export interface KitReport {
  readonly contract: { readonly examples: number; readonly schema: string };
  readonly gold_index: GoldSummary | null;
}

const finding = (code: string, file: string, line: number, message: string, severity: 'error' | 'warn' = 'error'): Finding =>
  ({ code, col: 1, file, line, message, severity });

/** The cells with a fixed form, by column index: [index, form, what a cell of another form lacks]. */
const CELL_RULES: readonly [number, RegExp, string][] = [
  [0, /^\S+$/u, 'names no node'],
  [1, /^[0-9a-f]{64}$/u, 'carries no chunk id of 64 lower-case hexadecimal digits'],
  [3, /^[0-9]+$/u, 'carries no ordinal (a whole number)'],
  [7, /^[0-9a-f]{16}$/u, 'carries no digest prefix of 16 lower-case hexadecimal digits'],
];

/** One line of the gold index as a row, or the reason it is none. */
function goldRow(line: string): GoldRow | string {
  const cells = line.split('\t');
  if (cells.length !== GOLD_COLUMNS.length) return `has ${cells.length} columns; the gold index has ${GOLD_COLUMNS.length}`;
  for (const [index, form, problem] of CELL_RULES) {
    if (!form.test(cells[index] ?? '')) return problem;
  }
  const [node = '', chunkId = '', item = '', ordinal = '', kind = '', section = '', title = '', digest16 = '', excerptText = ''] = cells;
  return { node, chunk_id: chunkId, item, ordinal: Number(ordinal), kind, section, title, digest16, first_140_chars: excerptText };
}

/** The gold index read from its text: the rows, and a finding for each line that is no row. */
export function parseGoldIndex(text: string, file: string): { findings: Finding[]; rows: GoldRow[] } {
  const lines = text.split('\n');
  if (lines[0] !== GOLD_COLUMNS.join('\t')) {
    return { findings: [finding('AGSC-E201', file, 1, `the header is not the nine columns ${GOLD_COLUMNS.join(', ')}`)], rows: [] };
  }
  const findings: Finding[] = [];
  const rows: GoldRow[] = [];
  const seen = new Map<string, number>();
  lines.slice(1).forEach((line, i) => {
    const number = i + 2;
    if (line.trim() === '') return;
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
function excerpt(text: string): string {
  return [...text.split(/\s+/u).filter((word) => word !== '').join(' ')].slice(0, EXCERPT).join('');
}

/** The gold rows of one node's chunks, in their order; without excerpts the last column is empty. */
export function goldRows(node: string, chunks: readonly Chunk[], options: { readonly excerpts: boolean }): GoldRow[] {
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
export function formatGoldIndex(rows: readonly GoldRow[]): string {
  const cell = (value: string | number): string => String(value).replace(/[\t\n\r]/gu, ' ');
  return [GOLD_COLUMNS.join('\t'), ...rows.map((row) => GOLD_COLUMNS.map((column) => cell(row[column])).join('\t'))]
    .map((line) => `${line}\n`).join('');
}

/** `chunks.jsonl` and its shards (`chunks-01.jsonl` …) of a build, in code-unit order of their names. */
function chunkFiles(nodeDir: string): string[] {
  if (!fs.existsSync(nodeDir)) return [];
  return fs.readdirSync(nodeDir).filter((name) => /^chunks(?:-[0-9]+)?\.jsonl$/u.test(name)).sort().map((name) => path.join(nodeDir, name));
}

/** Every chunk a build publishes, or a finding when it publishes no chunk export. */
export function readChunks(nodeDir: string): { chunks: Chunk[]; findings: Finding[] } {
  const files = chunkFiles(nodeDir);
  if (files.length === 0) {
    return { chunks: [], findings: [finding('AGSC-E901', path.join(nodeDir, 'chunks.jsonl'), 1, 'the build publishes no chunk export, so no gold unit can be checked')] };
  }
  const chunks = files.flatMap((file) => fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Chunk));
  return { chunks, findings: [] };
}

/** The node of a chunk: the host of its IRI. */
function hostOf(chunk: Chunk): string {
  try {
    return new URL(String(chunk.iri)).host;
  } catch {
    return '';
  }
}

/** The gold index against a build: each row of a node the build publishes names one of its chunks. */
export function checkGoldIndex(rows: readonly GoldRow[], chunks: readonly Chunk[], file: string): { findings: Finding[]; summary: GoldSummary } {
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const hosts = new Set(chunks.map(hostOf));
  const findings: Finding[] = [];
  let checked = 0;
  let found = 0;
  let changed = 0;
  rows.forEach((row, i) => {
    if (!hosts.has(row.node)) return;
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

/** Every gold unit of the labels that the gold index does not name, as a finding. */
export function checkQrels(qrels: ReadonlyMap<string, ReadonlySet<string>>, rows: readonly GoldRow[], file: string): Finding[] {
  const ids = new Set(rows.map((row) => row.chunk_id));
  const findings: Finding[] = [];
  for (const query of [...qrels.keys()].sort()) {
    for (const unit of [...(qrels.get(query) ?? [])].sort()) {
      if (!ids.has(unit)) findings.push(finding('AGSC-E301', file, 1, `query ${query} names gold unit ${unit}, which the gold index does not list`));
    }
  }
  return findings;
}

/** A validator of results files against the contract (Ajv, strict, with the formats `date` needs). */
export function contractValidator(schema: object): (document: unknown) => boolean {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv, ['date']);
  const validate = ajv.compile(schema);
  return (document) => validate(document);
}

/** Every example of the contract that the contract refuses, as findings, and the number of examples. */
function examplesOf(file: string, schema: { readonly examples?: unknown }): { examples: number; findings: Finding[] } {
  const examples = Array.isArray(schema.examples) ? (schema.examples as unknown[]) : [];
  if (examples.length === 0) return { examples: 0, findings: [finding('AGSC-E202', file, 1, 'the contract carries no example to validate')] };
  const accepts = contractValidator(schema);
  const findings = examples.flatMap((example, i) => (accepts(example) ? [] : [finding('AGSC-E201', file, 1, `the contract refuses its own example ${i}`)]));
  return { examples: examples.length, findings };
}

/** The results-row contract: a JSON Schema of draft 2020-12 that accepts each of its own examples. */
export function checkContract(file: string): { findings: Finding[]; summary: { examples: number } } {
  let schema: { readonly $schema?: unknown; readonly examples?: unknown };
  try {
    schema = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof schema;
  } catch (e) {
    const unreadable = (e as NodeJS.ErrnoException).code !== undefined;
    return { findings: [finding(unreadable ? 'AGSC-E901' : 'AGSC-E201', file, 1, unreadable ? 'cannot be read' : `is not JSON: ${(e as Error).message}`)], summary: { examples: 0 } };
  }
  if (schema.$schema !== DIALECT) {
    return { findings: [finding('AGSC-E201', file, 1, `names the dialect ${String(schema.$schema)}; the contract is a JSON Schema of ${DIALECT}`)], summary: { examples: 0 } };
  }
  try {
    const { examples, findings } = examplesOf(file, schema);
    return { findings, summary: { examples } };
  } catch (e) {
    return { findings: [finding('AGSC-E201', file, 1, `is not a valid JSON Schema: ${(e as Error).message}`)], summary: { examples: 0 } };
  }
}

/** What the dry run of `tools/bench` checks with the kit, for one set and, when given, one build. */
export interface SetInput {
  readonly contract: string;
  readonly node: string | null;
  readonly qrels: ReadonlyMap<string, ReadonlySet<string>>;
  readonly set: string;
}

/** The kit's checks of a set: the contract always; the gold index and the labels when the set carries one. */
export function checkSet(input: SetInput): { findings: Finding[]; kit: KitReport } {
  const contract = checkContract(input.contract);
  const report = { examples: contract.summary.examples, schema: path.basename(input.contract) };
  const indexFile = path.join(input.set, 'gold-index.tsv');
  if (!fs.existsSync(indexFile)) return { findings: contract.findings, kit: { contract: report, gold_index: null } };
  const index = parseGoldIndex(fs.readFileSync(indexFile, 'utf8'), indexFile);
  const findings = [...contract.findings, ...index.findings, ...checkQrels(input.qrels, index.rows, path.join(input.set, 'qrels', 'test.tsv'))];
  if (input.node === null) return { findings, kit: { contract: report, gold_index: null } };
  const build = readChunks(input.node);
  const against = checkGoldIndex(index.rows, build.chunks, indexFile);
  const summary = build.findings.length === 0 ? against.summary : null;
  return { findings: [...findings, ...build.findings, ...(summary === null ? [] : against.findings)], kit: { contract: report, gold_index: summary } };
}

export const HELP = `kit gold-index [--without-excerpts] <node>=<built output>... [--help]

  Writes the gold index of the agent-side question set (bench/queries/agent-study/) to
  standard output: one row for every chunk of each build, in the order given, the node
  named as given (a host name such as patterns.agenticsystemcore.com).

  --without-excerpts  leave the last column (the first 140 characters) empty, as the
                      repository copy is
  --help              this text

  Exit 0 written, 1 a build publishes no chunk export, 2 usage.
`;

/** The command line: `gold-index`, the one command; the exit code. */
export function run(argv: readonly string[], io: { readonly err?: (s: string) => void; readonly out?: (s: string) => void } = {}): number {
  const out = io.out ?? ((s: string): void => { process.stdout.write(s); });
  const err = io.err ?? ((s: string): void => { process.stderr.write(s); });
  if (argv.includes('--help') || argv.includes('-h')) { out(HELP); return 0; }
  const [command, ...rest] = argv;
  const excerpts = !rest.includes('--without-excerpts');
  const nodes = rest.filter((arg) => arg !== '--without-excerpts');
  const malformed = nodes.find((arg) => arg.startsWith('-') || !/^[^=]+=.+$/u.test(arg));
  if (command !== 'gold-index' || nodes.length === 0 || malformed !== undefined) {
    err(`kit: ${malformed === undefined ? 'name the command gold-index and at least one <node>=<built output>' : `cannot read ${malformed}`}\n${HELP}`);
    return 2;
  }
  const rows: GoldRow[] = [];
  for (const arg of nodes) {
    const at = arg.indexOf('=');
    const build = readChunks(arg.slice(at + 1));
    for (const f of build.findings) err(`kit: ${f.file}: ${f.code} ${f.message}\n`);
    if (build.findings.length > 0) return 1;
    rows.push(...goldRows(arg.slice(0, at), build.chunks, { excerpts }));
  }
  out(formatGoldIndex(rows));
  return 0;
}

/* c8 ignore next */
if (require.main === module) process.exit(run(process.argv.slice(2)));
