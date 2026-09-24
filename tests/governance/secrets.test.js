'use strict';
// AGSC-08-15 (`no-secrets`) and AGSC-01-37 (a tracked `.env`).
// Every fixture below is a SHAPE, never a live credential.

const test = require('node:test');
const assert = require('node:assert');
const secrets = require('../../src/governance/secrets.js');

const codes = (findings) => findings.map((f) => f.code);

test('a private-key block is AGSC-E403', () => {
  assert.deepStrictEqual(codes(secrets.check({ text: '-----BEGIN RSA PRIVATE KEY-----\nAAAA\n' })),
    ['AGSC-E403']);
  assert.deepStrictEqual(codes(secrets.check({ text: '-----BEGIN OPENSSH PRIVATE KEY-----' })),
    ['AGSC-E403', 'AGSC-E403'], 'the generic and the specific shape both name it');
});

test('provider token prefixes are AGSC-E403', () => {
  const shapes = [
    `sk-${'a'.repeat(24)}`,
    `ghp_${'B'.repeat(24)}`,
    `github_pat_${'c'.repeat(24)}`,
    `glpat-${'d'.repeat(24)}`,
    'xoxb-1234567890-abcdefghij',
    `AKIA${'A'.repeat(16)}`,
    `AIza${'x'.repeat(35)}`,
    `npm_${'e'.repeat(36)}`,
  ];
  for (const text of shapes) {
    assert.ok(codes(secrets.check({ text })).includes('AGSC-E403'), text);
  }
});

test('a credential assignment is AGSC-E403 and the value is never printed', () => {
  const [f] = secrets.check({ text: 'password: hunter2000hunter' });
  assert.strictEqual(f.code, 'AGSC-E403');
  assert.ok(!f.message.includes('hunter2000hunter'), 'a Finding never carries the secret');
});

test('a placeholder is not a secret', () => {
  for (const text of ['api_key: changeme', 'api_key: <value>', 'secret: ${SECRET}',
    'api_key: AGSC_MODEL_API_KEY', 'password: xxxxxxxx', 'token: ...']) {
    assert.deepStrictEqual(secrets.check({ text }), [], text);
  }
  assert.strictEqual(secrets.isPlaceholder('$env:X'), true);
});

test('ordinary prose that mentions a key is not a secret', () => {
  assert.deepStrictEqual(secrets.check({
    text: 'The model credential is environment-only; no Bundle file holds a password.',
  }), []);
  assert.deepStrictEqual(secrets.check({ text: '' }), []);
  assert.deepStrictEqual(secrets.check(), []);
});

test('AGSC-01-37: a tracked .env is AGSC-E403 whatever it holds', () => {
  assert.deepStrictEqual(secrets.checkTracked([]), []);
  assert.deepStrictEqual(secrets.checkTracked(), []);
  assert.deepStrictEqual(secrets.checkTracked(['README.md', '.env.example']), []);
  const [f] = secrets.checkTracked(['README.md', '.env']);
  assert.strictEqual(f.code, secrets.TRACKED_ENV_CODE);
  assert.strictEqual(f.code, 'AGSC-E403');
  assert.strictEqual(f.path, '.env');
  const [nested] = secrets.checkTracked(['sub/.env']);
  assert.strictEqual(nested.path, 'sub/.env');
});
