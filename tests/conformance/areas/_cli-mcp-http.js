'use strict';
// tests/conformance/areas/_cli-mcp-http.js — `cli` cases of AGSC-09-18, the Streamable HTTP
// transport of MCP revision 2026-07-28 that `agsc mcp --http <port>` serves on a loopback address.
//
//   cli-0029  the ten tools over HTTP: `server/discover`, `tools/list`, `search`, a loopback `Origin`.
//   cli-0030  the request headers against the body and the revision, the 2025-11-25 refusal,
//             an unknown method, a notification, a session header ignored.
//   cli-0031  what the transport refuses: a foreign `Origin`, a `Host` that names another host
//             (with `--bind 127.0.0.2`, F-3), GET, DELETE, another path, a bind address that is
//             not loopback, `--bind` without `--http`; and `propose` writes nothing.
//
// The requests go to the real CLI through `_cli-mcp-http-child.js`, one synchronous child that
// starts each server and talks to it over `node:http`; the refusals of the flags are one
// synchronous `agsc` run each. Every run uses a scratch copy of the fixture and the fixed build
// instant; nothing reaches a network beyond the loopback address.

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { subset, verdict } = require('./_cli-mcp-primitives.js');

const ENV = { NO_COLOR: '1', SOURCE_DATE_EPOCH: '1767225600' };
/** Stops a hung exchange; never an assertion. */
const TIMEOUT_MS = 120000;

/** A scratch copy of the vector's Bundle, handed to `use(root, engine)` and removed afterwards. */
function withBundle(vector, ctx, use) {
  const engine = path.resolve((ctx && ctx.root) || '.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-mcp-http-'));
  try {
    fs.cpSync(path.join(engine, 'tests', String(vector.input.bundle || 'fixtures/minimal')), root, { recursive: true });
    return use(root, engine);
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
}

/** Run `groups` through the child; one list of answers (or `{failed}`) per group. */
function exchange(engine, root, groups) {
  const run = spawnSync(process.execPath, [path.join(__dirname, '_cli-mcp-http-child.js')], {
    encoding: 'utf8',
    env: { ...ENV, PATH: process.env.PATH },
    input: JSON.stringify({ engine, groups, root }),
    maxBuffer: 16 * 1024 * 1024,
    timeout: TIMEOUT_MS,
  });
  if (run.status !== 0) return groups.map(() => ({ failed: `exchange exit ${run.status}: ${String(run.stderr).slice(0, 400)}` }));
  return JSON.parse(run.stdout);
}

/** The media type of a `Content-Type` value, without its parameters. */
const mediaType = (value) => String(value || '').split(';')[0].trim().toLowerCase();

/** The problems of one answer against its expected entry: status, media type, absent headers, body. */
function answerProblems(want, got) {
  if (got === undefined) return [`${want.name}: no answer`];
  const problems = [];
  if (got.status !== want.status) problems.push(`${want.name}: HTTP ${got.status} != ${want.status} (${got.body.slice(0, 200)})`);
  if (want.content_type !== undefined && mediaType(got.headers['content-type']) !== want.content_type) {
    problems.push(`${want.name}: Content-Type ${got.headers['content-type']}`);
  }
  for (const name of want.headers_absent || []) {
    if (got.headers[name] !== undefined) problems.push(`${want.name}: carries the header ${name}`);
  }
  if (want.no_body === true && got.body !== '') problems.push(`${want.name}: has a body ${got.body.slice(0, 200)}`);
  if (want.body !== undefined) {
    let body;
    try { body = JSON.parse(got.body); } catch (e) { body = undefined; }
    if (!subset(want.body, body)) problems.push(`${want.name}: ${got.body.slice(0, 400)} does not carry ${JSON.stringify(want.body)}`);
  }
  return problems;
}

/** Each expected entry against the answer of the same name; a group that failed is one problem. */
function answersProblems(wants, answers) {
  if (!Array.isArray(answers)) return [`the server did not start: ${String(answers.failed).trim().slice(0, 400)}`];
  const byName = new Map(answers.map((a) => [a.name, a]));
  return wants.flatMap((want) => answerProblems(want, byName.get(want.name)));
}

/** cli-0029, cli-0030: the requests of `input.http` to one server, in order. */
function runHttp(vector, ctx) {
  return withBundle(vector, ctx, (root, engine) => {
    const [answers] = exchange(engine, root, [{ requests: vector.input.http }]);
    const problems = answersProblems(vector.expected.http, answers);
    if (vector.input.http.length !== vector.expected.http.length) problems.push('the expected and input request lists differ');
    return verdict(problems);
  });
}

/** Every file under `dir` with its digest: what "nothing written" compares. */
function tree(dir, prefix = '') {
  return fs.readdirSync(path.join(dir, prefix), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(prefix, entry.name);
    if (entry.isDirectory()) return tree(dir, rel);
    return [`${rel} ${createHash('sha256').update(fs.readFileSync(path.join(dir, rel))).digest('hex')}`];
  }).sort();
}

/** A refusal of the flags: the exit code and the code on standard error. */
function argvProblems(want, input, engine, root) {
  const run = spawnSync(process.execPath, [path.join(engine, 'bin', 'agsc.js'), ...input.argv], {
    cwd: root, encoding: 'utf8', env: { ...ENV, PATH: process.env.PATH }, input: '', timeout: TIMEOUT_MS,
  });
  const problems = [];
  if (run.status !== want.exit) problems.push(`${want.name}: exit ${run.status} != ${want.exit} (${String(run.stderr).trim()})`);
  if (!String(run.stderr).includes(want.error)) problems.push(`${want.name}: standard error does not name ${want.error}`);
  return problems;
}

/**
 * cli-0031: the HTTP cases go to one server per `bind` value (none, or F-3's address); the
 * argv cases are runs of their own; `nothing_written` compares the Bundle before and after.
 */
function runCli0031(vector, ctx) {
  return withBundle(vector, ctx, (root, engine) => {
    const before = tree(root);
    const wanted = new Map(vector.expected.cases.map((c) => [c.name, c]));
    const binds = [...new Set(vector.input.cases.filter((c) => c.http).map((c) => c.bind))];
    const groups = binds.map((bind) => ({
      ...(bind === undefined ? {} : { bind }),
      requests: vector.input.cases.filter((c) => c.http && c.bind === bind).map((c) => c.http),
    }));
    const answered = exchange(engine, root, groups);
    const problems = [];
    binds.forEach((bind, i) => {
      const names = groups[i].requests.map((r) => r.name);
      problems.push(...answersProblems(names.map((name) => wanted.get(name) || { name, status: -1 }), answered[i]));
    });
    for (const input of vector.input.cases.filter((c) => c.argv)) problems.push(...argvProblems(wanted.get(input.name), input, engine, root));
    const after = tree(root);
    for (const want of vector.expected.cases.filter((c) => c.nothing_written === true)) {
      if (JSON.stringify(after) !== JSON.stringify(before)) problems.push(`${want.name}: the Bundle changed`);
      if (fs.existsSync(path.join(root, 'dist', 'proposal'))) problems.push(`${want.name}: dist/proposal/ was written`);
    }
    if (wanted.size !== vector.input.cases.length) problems.push('the expected and input case lists differ');
    return verdict(problems);
  });
}

module.exports = { runCli0031, runHttp };
