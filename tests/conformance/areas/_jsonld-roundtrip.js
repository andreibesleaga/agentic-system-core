'use strict';
// Not a vector area — the JSON-LD round trip of AGSC-06-32, run as a child process.
//
// `jsonld@9.0.0` (the reference JSON-LD processor; a dependency of the package so
// that `agsc conform` runs this area from an installed copy, though nothing under
// `src/` requires it) is asynchronous, and a conformance area handler is called
// synchronously by `tests/conformance/vector-runner.test.js`. Rather than weaken the
// assertion of `graph-0011` to something a synchronous handler can check, the handler
// runs THIS script with `execFileSync` and compares the bytes that come back. The
// child costs about 0.3 s once per run, which buys a real expand/re-compact instead
// of a promise.
//
// Protocol: `{ doc, context, contextUrl }` as JSON on stdin, the re-compacted
// document as JSON on stdout. The document loader serves the one context URL from
// memory and refuses everything else, so no test can reach the network (AGSC-04-03).

const fs = require('node:fs');

async function main() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const jsonld = require('jsonld');
  const loader = async (url) => {
    if (url === input.contextUrl) {
      return { contextUrl: null, document: input.context, documentUrl: url };
    }
    throw new Error(`the round trip resolves no URL but the context: ${url}`);
  };
  const expanded = await jsonld.expand(input.doc, { documentLoader: loader });
  const compacted = await jsonld.compact(expanded, input.contextUrl, { documentLoader: loader });
  process.stdout.write(JSON.stringify(compacted));
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
