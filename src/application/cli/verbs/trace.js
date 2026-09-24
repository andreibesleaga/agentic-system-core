'use strict';
/**
 * src/application/cli/verbs/trace.js — `trace <file.json>` (AGSC-09-07,
 * AGSC-09-94). OPT-IN: `main.js` refuses it with `AGSC-E001` and exit 2 while
 * `run.enabled` is false, exactly as AGSC-09-94 requires.
 *
 * The mapping is `interchange/trace.js`'s and is pure; this module reads the file
 * through the FileSystem port, writes the Episode through the same port and
 * executes no process, which is the rule's own word for what this verb is.
 *
 * The written bytes go through `governance/fix.js`'s writer, so a trace imported
 * twice from the same record produces the same file (AGSC-01-23) and the Episode is
 * already lint-normalized (AGSC-04-19).
 *
 *
 */

const traceModule = require('../../../interchange/trace.js');
const fix = require('../../../governance/fix.js');
const { serialize } = require('../../../knowledge/adopt.js');
const { finding } = require('../../../knowledge/validate.js');
const { readSchemas } = require('../../../adapters/node-fs.js');
const helpers = require('./_helpers.js');

function run(ctx) {
  const file = (ctx.argv || [])[0];
  if (file === undefined) {
    return {
      status: 'fail',
      findings: [finding('AGSC-E003',
        'trace needs the captured record as its one argument: trace <file.json> (AGSC-09-94)',
        { file: '', severity: 'error' })],
    };
  }
  let record;
  try {
    record = JSON.parse(String(ctx.ports.fs.readFile(String(file), 'utf8')));
  } catch (e) {
    return {
      status: 'fail',
      findings: [finding('AGSC-E201',
        `${file} could not be read as JSON: ${(e && e.message) || 'parse error'} (AGSC-09-94)`,
        { file: String(file), severity: 'error' })],
    };
  }

  const bundle = helpers.bundleOf(ctx);
  const mapped = traceModule.toEpisode(record, {
    file: String(file),
    operator: ((bundle.config || {}).bundle || {}).operator,
    taken: new Set([...bundle.byslug.keys()]),
  });
  if (mapped.path === null) return { findings: mapped.findings, status: 'fail' };

  const itemSchema = readSchemas(helpers.ENGINE_ROOT).item;
  const ordered = fix.orderKeys(mapped.frontmatter,
    fix.declaredOrder(itemSchema, 'episode'), itemSchema, 'episode', null);
  const text = fix.normaliseText(`${serialize(fix.quoteTemporal(ordered))}${mapped.body}`);
  ctx.ports.fs.mkdirp('content/episodes');
  ctx.ports.fs.writeFile(mapped.path, text);
  helpers.note(ctx, `trace: wrote ${mapped.path} (an Episode, through the AGSC-01-22/AGSC-02-14`
    + ' import path; no process was executed)');
  return { findings: mapped.findings };
}

module.exports = { name: 'trace', run };
