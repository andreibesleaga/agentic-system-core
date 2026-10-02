'use strict';
// AGSC-11-16: the engine's discovery checker (`distribution/discovery.js#check`) makes the
// same structural checks of a `rel#surface` link as `tools/validate-wellknown`. Until
// 2026-10-02 it made none, so an `llms-txt` link carrying `agsc-surface-version` passed the
// engine and failed the independent validator and the Python checker.
//
// Deterministic: in-memory documents only.

const test = require('node:test');
const assert = require('node:assert/strict');

const discovery = require('../../src/distribution/discovery.js');

const REL = discovery.REL;

/** A Level-0 document whose only link besides the two required ones is `surface`. */
function withSurface(surface) {
  return {
    linkset: [{
      alternate: [{ href: 'https://a.example/llms.txt', type: 'text/plain' }],
      anchor: 'https://a.example/',
      describedby: [{ href: 'https://a.example/graph.jsonld', type: 'application/ld+json' }],
      [`${REL}surface`]: [surface],
    }],
  };
}

const codes = (doc) => discovery.check(doc, { level: 0 }).map((f) => `${f.code}/${f.severity}`);

test('AGSC-11-16: well-formed surface links raise nothing', () => {
  assert.deepEqual(codes(withSurface({ 'agsc-access': ['none'], 'agsc-surface': ['llms-txt'], href: 'https://a.example/llms.txt' })), []);
  assert.deepEqual(codes(withSurface({
    'agsc-access': ['consent'], 'agsc-surface': ['mcp'], 'agsc-surface-version': ['2025-11-25'], href: 'https://a.example/specs/mcp/',
  })), []);
});

test('AGSC-11-16: a version on llms-txt or chunks, or none on mcp, is AGSC-E210', () => {
  assert.deepEqual(codes(withSurface({
    'agsc-access': ['none'], 'agsc-surface': ['llms-txt'], 'agsc-surface-version': ['2'], href: 'https://a.example/llms.txt',
  })), ['AGSC-E210/error']);
  assert.deepEqual(codes(withSurface({
    'agsc-access': ['none'], 'agsc-surface': ['chunks'], 'agsc-surface-version': ['1'], href: 'https://a.example/chunks.jsonl',
  })), ['AGSC-E210/error']);
  assert.deepEqual(codes(withSurface({ 'agsc-access': ['consent'], 'agsc-surface': ['mcp'], href: 'https://a.example/specs/mcp/' })),
    ['AGSC-E210/error']);
});

test('AGSC-11-16: llms-txt must target /llms.txt; one surface and one access value', () => {
  assert.deepEqual(codes(withSurface({ 'agsc-access': ['none'], 'agsc-surface': ['llms-txt'], href: 'https://a.example/other.txt' })),
    ['AGSC-E210/error']);
  assert.deepEqual(codes(withSurface({ 'agsc-access': ['none', 'consent'], 'agsc-surface': ['llms-txt'], href: 'https://a.example/llms.txt' })),
    ['AGSC-E210/error']);
  assert.deepEqual(codes(withSurface({ 'agsc-access': ['none'], href: 'https://a.example/llms.txt' })), ['AGSC-E210/error']);
});

test('AGSC-11-02: an unknown surface name or access class is a warning, never an error', () => {
  assert.deepEqual(codes(withSurface({ 'agsc-access': ['none'], 'agsc-surface': ['telepathy'], href: 'https://a.example/t' })),
    ['AGSC-E210/warn']);
  assert.deepEqual(codes(withSurface({ 'agsc-access': ['public'], 'agsc-surface': ['llms-txt'], href: 'https://a.example/llms.txt' })),
    ['AGSC-E210/warn']);
  assert.deepEqual(codes(withSurface({ 'agsc-access': ['none'], 'agsc-surface': ['x-acme-feed'], href: 'https://a.example/f' })), []);
});
