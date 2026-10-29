'use strict';
// AGSC-01-14 (1.1): the byte-order-mark and NFC requirements reach the four text files that carry none of
// the four suffixes (`.env`, the authored `security.txt`, `LICENSE-CONTENT`, an SVG attachment) as the
// warning AGSC-E108. Their line endings and final line feed follow their own format and are not checked,
// and no file is refused.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const textFiles = require('../../src/governance/text-files.js');
const lintVerb = require('../../src/application/cli/verbs/lint.js');
const { createFileSystem } = require('../../src/adapters/node-fs.js');

test('a byte-order mark, or text that is not NFC, is one warning each; CRLF and a missing final LF are not', () => {
  const codes = (text) => textFiles.check('LICENSE-CONTENT', text).map((f) => [f.code, f.severity, f.file]);
  assert.deepEqual(codes('plain\n'), []);
  assert.deepEqual(codes('﻿plain\n'), [['AGSC-E108', 'warn', 'LICENSE-CONTENT']]);
  assert.deepEqual(codes('café\n'), [['AGSC-E108', 'warn', 'LICENSE-CONTENT']]);
  assert.equal(codes('﻿café\n').length, 2, 'both faults are reported');
  assert.deepEqual(codes('Contact: x\r\nExpires: y'), [], 'RFC 9116 admits CRLF; the final line feed is not checked');
  assert.deepEqual(codes(''), []);
});

test('the lint lane reads the four files and refuses none', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-textfiles-'));
  try {
    const put = (file, text) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), text);
    };
    put('.env', '﻿AGSC_X=1\n');
    put('.well-known/security.txt', 'Contact: mailto:a@example.org\r\nExpires: 2027-01-01T00:00:00Z\r\n');
    put('LICENSE-CONTENT', 'café\n');
    put('content/attachments/a/figure.svg', '﻿<svg xmlns="http://www.w3.org/2000/svg"/>\n');
    put('content/attachments/a/data.csv', '﻿not one of the four\n');
    const findings = lintVerb.textFileFindings(createFileSystem(root));
    assert.deepEqual(findings.map((f) => [f.code, f.severity, f.file]), [
      ['AGSC-E108', 'warn', '.env'], ['AGSC-E108', 'warn', 'LICENSE-CONTENT'],
      ['AGSC-E108', 'warn', 'content/attachments/a/figure.svg']]);
    assert.deepEqual(lintVerb.textFileFindings(createFileSystem(fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-empty-')))), []);
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
});
