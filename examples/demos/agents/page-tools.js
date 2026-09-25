#!/usr/bin/env node
'use strict';
// examples/demos/agents/page-tools.js — one page-tool call, made the way a browser
// makes it, without a browser.
//
//   node page-tools.js <built node> <tool> '<json arguments>'
//
// Every item page and the `/compose/` page of a built node load three scripts that
// register the same seven tools the tool server offers (AGSC-09-16). This script
// loads those three files from the build directory into a bare JavaScript context
// whose `fetch` reads the node's own files — a page can reach no other origin —
// then calls one tool through `AGSC_TOOLS.call`, the entry the page's WebMCP
// registration dispatches to, and prints the answer as indented JSON. Nothing is
// installed and nothing is written; the answer is the one a browser assistant gets
// through `document.modelContext` on the page. Exit 0 on an answer, 1 on a refusal.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { PAGE_TOOL_SCRIPTS } = require('../../../src/distribution/compose-page.js');

function routesOf(dir) {
  const out = new Map();
  const walk = (at) => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.set(`/${path.relative(dir, full).split(path.sep).join('/')}`, fs.readFileSync(full, 'utf8'));
    }
  };
  walk(dir);
  return out;
}

async function main() {
  const [www, tool, rawArguments] = process.argv.slice(2);
  if (!www || !tool) {
    process.stderr.write("usage: node page-tools.js <built node> <tool> '<json arguments>'\n");
    return 2;
  }
  const files = routesOf(path.resolve(www));
  const sandbox = {
    document: { getElementById: () => null },
    fetch: (route) => {
      const body = files.get(String(route));
      if (body === undefined) return Promise.resolve({ json: () => Promise.reject(new Error('404')), ok: false, text: () => Promise.resolve('') });
      return Promise.resolve({ json: () => Promise.resolve(JSON.parse(body)), ok: true, text: () => Promise.resolve(body) });
    },
    location: { origin: 'http://127.0.0.1:8000', search: '' },
    Promise,
    TextEncoder,
  };
  const context = vm.createContext(sandbox);
  for (const script of PAGE_TOOL_SCRIPTS) {
    const source = files.get(script);
    if (source === undefined) {
      process.stderr.write(`page-tools: ${www} has no ${script}; build the node first (agsc build)\n`);
      return 1;
    }
    vm.runInContext(source, context, { filename: script });
  }
  await vm.runInContext('globalThis.AGSC_PAGE_TOOLS.ready', context);
  const envelope = JSON.parse(JSON.stringify(await sandbox.AGSC_TOOLS.call(tool, rawArguments === undefined ? {} : JSON.parse(rawArguments))));
  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
  return envelope.type === 'error' ? 1 : 0;
}

main().then((code) => { process.exitCode = code; });
