'use strict';
// A build that exercises as much of the specification as one offline fixture can:
// the acceptance Bundle plus a git history (the ledger and the changelog), the
// Content Use Terms text and a privacy notice (/legal/), a task (the boards)
// and an authored asset a body references (/assets/<path>).
// Built once per process with the REAL command line; deterministic (fixed dates,
// empty git identity, no network).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const AGSC = path.join(ROOT, 'bin', 'agsc.js');
const FIXTURE = path.join(ROOT, 'tests', 'acceptance', 'bundle');

let cached = null;

function env(dir) {
  return {
    GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
    GIT_AUTHOR_EMAIL: 'operator@example.org',
    GIT_AUTHOR_NAME: 'Operator',
    GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
    GIT_COMMITTER_EMAIL: 'operator@example.org',
    GIT_COMMITTER_NAME: 'Operator',
    GIT_CONFIG_GLOBAL: path.join(dir, '.gitconfig-empty'),
    GIT_CONFIG_NOSYSTEM: '1',
    HOME: dir,
    NO_COLOR: '1',
    PATH: process.env.PATH,
    ...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
  };
}

function write(dir, rel, text) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
}

/**
 * @returns {{dir:string, out:string, files:string[], stderr:string, skipped:string[]}}
 */
function richBuild() {
  if (cached) return cached;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-standard-home-'));
  // Removed when the process ends, whether or not the build below succeeds.
  process.on('exit', () => fs.rmSync(home, { force: true, recursive: true }));
  fs.writeFileSync(path.join(home, '.gitconfig-empty'), '');
  const dir = path.join(home, 'bundle');
  fs.cpSync(FIXTURE, dir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'LICENSE-CONTENT'), path.join(dir, 'LICENSE-CONTENT'));
  write(dir, 'PRIVACY.md', '# Privacy\n\nThis node sets no cookie, runs no analytics and keeps no log beyond the host\'s own.\n');
  write(dir, 'content/assets/sketch.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>Sketch</title><rect width="10" height="10"/></svg>\n');
  const mcp = fs.readFileSync(path.join(dir, 'content', 'concepts', 'mcp.md'), 'utf8');
  write(dir, 'content/concepts/mcp.md', `${mcp}\n![A sketch of one protocol](../assets/sketch.svg)\n`);
  write(dir, 'content/concepts/write-the-reason-down.md', [
    '---', 'type: concept', 'title: Write the reason down',
    'description: A task on the board of agent patterns — record the reason with every handoff in the audit trail.',
    'clusters:', '  - agent-patterns', 'date: "2026-01-01"', 'prov:', '  origin: human',
    '  operator: human:andreibesleaga', 'kind: task', 'task_state: TASK_STATE_SUBMITTED', '---', '',
    '## Task', '', 'Record the reason with every handoff.', ''].join('\n'));
  write(dir, 'content/procedures/record-a-handoff.md', [
    '---', 'type: procedure', 'title: Record a handoff',
    'description: The steps that write a handoff down with its reason, so that the audit trail can be closed later.',
    'when: A task moves from one agent to another', 'clusters:', '  - agent-patterns', 'date: "2026-01-01"',
    'prov:', '  origin: human', '  operator: human:andreibesleaga', '---', '',
    '## When', '', 'A task moves from one agent to another.', '',
    '## Steps', '', '1. Write down the task, the receiver and the reason.', '',
    '## Checks', '', 'The reason is present.', ''].join('\n'));
  write(dir, 'content/episodes/a-handoff-without-a-reason.md', [
    '---', 'type: episode', 'title: A handoff without a reason',
    'description: One run where a handoff carried the task but not the reason, and the audit could not be closed.',
    'started: 2025-12-01T10:00:00Z', 'actor: process:ci', 'outcome: partial', 'clusters:', '  - agent-patterns',
    'date: "2026-01-01"', 'prov:', '  origin: human', '  operator: human:andreibesleaga', '---', '',
    '## What happened', '', 'The receiver did not know why it received the task.', '',
    '## Outcome', '', 'The audit stayed open.', '',
    '## Next', '', 'Record the reason with every handoff.', ''].join('\n'));
  write(dir, 'content/gates/publication.md', [
    '---', 'type: gate', 'title: Publication gate',
    'description: The five checks a change passes before it is published, from schema and links to a review.',
    'level: L2', 'checks:', '  - schema', '  - links', '  - provenance', '  - determinism', '  - review',
    'clusters:', '  - agent-patterns', 'date: "2026-01-01"',
    'prov:', '  origin: human', '  operator: human:andreibesleaga', '---', '',
    '## Checks', '', 'Every change passes the five checks before it is published.', ''].join('\n'));
  const git = (argv) => {
    const r = spawnSync('git', argv, { cwd: dir, encoding: 'utf8', env: env(home) });
    if (r.status !== 0) throw new Error(`git ${argv.join(' ')}: ${r.stderr}`);
  };
  git(['init', '-q', '-b', 'main']);
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'Add the standard fixture']);
  const r = spawnSync(process.execPath, [AGSC, 'build'], { cwd: dir, encoding: 'utf8', env: env(home) });
  if (r.status !== 0) throw new Error(`build failed: ${r.stdout}${r.stderr}`);
  const out = path.join(dir, 'www');
  const files = [];
  const walk = (rel) => {
    for (const name of fs.readdirSync(path.join(out, rel)).sort()) {
      const next = rel === '' ? name : `${rel}/${name}`;
      if (fs.statSync(path.join(out, next)).isDirectory()) walk(next);
      else files.push(next);
    }
  };
  walk('');
  const skipped = r.stderr.split('\n').filter((l) => l.startsWith('skipped: ')).map((l) => l.slice(9));
  cached = { dir, files, home, out, skipped, stderr: r.stderr };
  return cached;
}

module.exports = { AGSC, ROOT, richBuild };
