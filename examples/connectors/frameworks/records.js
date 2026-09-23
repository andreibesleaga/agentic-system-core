#!/usr/bin/env node
'use strict';
// examples/connectors/frameworks/records.js — reshape a node's `/chunks.jsonl`
// (AGSC-06-26…31) into the record shape a runtime framework's memory store takes.
// RUN BY THE TEST SUITE; the framework scripts beside it are ILLUSTRATIVE.
//
//   node records.js <chunks.jsonl> <shape>      shape: langgraph | autogen | mem0
//
// One JSON object per output line. Every record keeps what a later citation needs —
// the item IRI, the chunk digest, the licence, the Content Use Terms and the trust
// mark — in the place the framework keeps free metadata, because every one of these
// stores accepts "a string plus metadata" and none carries an integrity digest of
// its own (research/38 §2.5). The trust mark is AGSC-08-18's: chunk text that
// re-enters a model is UNTRUSTED data.
//
// Shapes (the member names each framework documents, research/38 §2.5, read
// 2026-09-23):
//   langgraph  {namespace, key, value}   `BaseStore.put(namespace, key, value)`;
//                                         namespace = [node id, item slug]
//   autogen    {content, mime_type, metadata}   `MemoryContent`
//   mem0       {text, metadata}           one record per chunk for an add call

const fs = require('node:fs');

const SHAPES = Object.freeze(['langgraph', 'autogen', 'mem0']);

/** The citation members every shape carries. */
function citation(chunk) {
  return {
    digest: chunk.digest,
    iri: chunk.iri,
    item: chunk.item,
    license: chunk.license,
    section: chunk.section,
    terms: chunk.terms,
    title: chunk.title,
    trust: chunk.trust,
  };
}

function toRecord(chunk, shape, nodeId) {
  switch (shape) {
    case 'langgraph':
      return { key: chunk.id, namespace: [nodeId, chunk.item], value: { text: chunk.text, ...citation(chunk) } };
    case 'autogen':
      return { content: chunk.text, metadata: citation(chunk), mime_type: 'text/markdown' };
    case 'mem0':
      return { metadata: citation(chunk), text: chunk.text };
    default:
      throw new Error(`unknown shape "${shape}"; one of ${SHAPES.join(', ')}`);
  }
}

/** Every chunk line of a chunks.jsonl, as records of one shape. */
function records(text, shape) {
  const chunks = String(text).split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line));
  const nodeId = chunks.length === 0 ? '' : new URL(chunks[0].iri).host;
  return chunks.map((chunk) => toRecord(chunk, shape, nodeId));
}

if (require.main === module) {
  const [file, shape] = process.argv.slice(2);
  if (file === undefined || !SHAPES.includes(shape)) {
    process.stderr.write(`usage: node records.js <chunks.jsonl> <${SHAPES.join('|')}>\n`);
    process.exit(2);
  }
  for (const record of records(fs.readFileSync(file, 'utf8'), shape)) {
    process.stdout.write(`${JSON.stringify(record)}\n`);
  }
}

module.exports = { SHAPES, citation, records, toRecord };
