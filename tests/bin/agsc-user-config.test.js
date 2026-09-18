// tests/bin/agsc-user-config.test.js — AGSC-09-09 "user configuration"
// layer (coordinator decision, 2026-09-18): $XDG_CONFIG_HOME/agsc/config.json,
// falling back to ~/.config/agsc/config.json, loaded through a second,
// user-rooted FileSystem adapter. Owner: B. Uses only a real temp directory
// (node:os.tmpdir()) — never the real home directory.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveUserConfigDir, loadUserConfig, buildFileSystemPort } = require('../../bin/agsc.js');

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-user-config-'));
}

test('resolveUserConfigDir prefers $XDG_CONFIG_HOME over the fallback', () => {
  const dir = resolveUserConfigDir({ XDG_CONFIG_HOME: '/xdg' }, '/home/nobody');
  assert.equal(dir, path.join('/xdg', 'agsc'));
});

test('resolveUserConfigDir falls back to ~/.config/agsc when XDG_CONFIG_HOME is unset', () => {
  const dir = resolveUserConfigDir({}, '/home/nobody');
  assert.equal(dir, path.join('/home/nobody', '.config', 'agsc'));
});

test('loadUserConfig reads config.json from a real (temp, non-home) directory', () => {
  const tmp = mkTempDir();
  try {
    fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({ budget: { usd_month: 2 } }));
    const ports = buildFileSystemPort(tmp);
    const userConfig = loadUserConfig(ports);
    assert.deepEqual(userConfig, { budget: { usd_month: 2 } });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadUserConfig returns undefined when config.json is absent', () => {
  const tmp = mkTempDir();
  try {
    const ports = buildFileSystemPort(tmp);
    assert.equal(loadUserConfig(ports), undefined);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadUserConfig returns undefined for malformed JSON (never throws)', () => {
  const tmp = mkTempDir();
  try {
    fs.writeFileSync(path.join(tmp, 'config.json'), '{ not json');
    const ports = buildFileSystemPort(tmp);
    assert.equal(loadUserConfig(ports), undefined);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('end to end: load() applies a loaded user config at "user" precedence, beneath project config', () => {
  const tmp = mkTempDir();
  try {
    fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({ budget: { usd_month: 2 } }));
    const userConfig = loadUserConfig(buildFileSystemPort(tmp));
    const { load } = require('../../src/application/config/load.js');
    const loaded = load({ userConfig, env: {}, argvFlags: {} });
    assert.equal(loaded.config.budget.usd_month, 2);
    assert.equal(loaded.sources['budget.usd_month'], 'user');

    const overridden = load({ userConfig, projectConfig: { budget: { usd_month: 5 } }, env: {}, argvFlags: {} });
    assert.equal(overridden.config.budget.usd_month, 5);
    assert.equal(overridden.sources['budget.usd_month'], 'project');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
