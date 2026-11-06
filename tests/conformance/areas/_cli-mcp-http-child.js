'use strict';
// tests/conformance/areas/_cli-mcp-http-child.js — the HTTP exchange of the `cli` cases of
// AGSC-09-18 (cli-0029 to cli-0031), run as ONE child process so that the area handler stays
// synchronous (`_cli-mcp-http.js` calls it with `spawnSync`).
//
// Read from standard input: `{engine, root, groups: [{bind?, requests: [{name, method, path,
// headers, body?}]}]}`. For each group it starts the real `agsc mcp --http 0` (with `--bind`
// when the group names one) in `root`, reads the address the server reports on standard error
// (AGSC-09-09: port 0 lets the system choose, and the server reports the port), sends the
// requests one by one with `node:http` — which, unlike `fetch`, lets a case send its own
// `Host` header — stops the server and writes `[{name, status, headers, body}]` per group to
// standard output. A group whose server never listened answers `{failed: <stderr>}`.
//
// A loopback address other than 127.0.0.1 (F-3's `--bind 127.0.0.2`) exists on Linux and
// Windows but not on a default macOS, whose loopback interface carries 127.0.0.1 alone. There,
// and only there (the server reports EADDRNOTAVAIL), the group runs again with this file
// preloaded into the server (`--require`): the preload moves the socket of that one address to
// 127.0.0.1, so the server is still started with `--bind 127.0.0.2` and judges the `Host`
// header by it, which is what the cases assert.
//
// Deterministic: the fixed build instant, loopback only, no timer drives an assertion (the
// handler's `spawnSync` timeout only stops a hung run).

const ALIASED = '127.0.0.2';

if (require.main !== module) {
  // Preloaded into the server: `listen(port, '127.0.0.2', …)` listens on 127.0.0.1 instead.
  const net = require('node:net');
  const listen = net.Server.prototype.listen;
  net.Server.prototype.listen = function aliased(port, host, ...rest) {
    return listen.call(this, port, host === ALIASED ? '127.0.0.1' : host, ...rest);
  };
} else {
  main();
}

/** Start `agsc mcp --http 0` in `root`; resolves `{child, url}` once it reports its address, or `{failed}`. */
function start(input, bind, preload) {
  const path = require('node:path');
  const { spawn } = require('node:child_process');
  const argv = [...(preload ? ['--require', __filename] : []), path.join(input.engine, 'bin', 'agsc.js'), 'mcp', '--http', '0',
    ...(bind === undefined ? [] : ['--bind', bind])];
  const child = spawn(process.execPath, argv, {
    cwd: input.root,
    env: { NO_COLOR: '1', PATH: process.env.PATH, SOURCE_DATE_EPOCH: '1767225600' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  return new Promise((resolve) => {
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text) => {
      stderr += text;
      const m = /(http:\/\/\S+?)\/mcp\b/u.exec(stderr);
      if (m) resolve({ child, url: new URL(m[1]) });
    });
    child.on('exit', () => resolve({ failed: stderr }));
  });
}

/** One request; resolves `{name, status, headers, body}`. */
function send(url, request) {
  const http = require('node:http');
  const headers = { ...(request.headers || {}) };
  const body = request.body === undefined ? undefined : JSON.stringify(request.body);
  return new Promise((resolve, reject) => {
    const outgoing = http.request({
      headers,
      host: url.hostname.replace(/^\[|\]$/gu, ''),
      method: request.method,
      path: request.path,
      port: url.port,
      // A case that names its own `Host` sends it as written (a rebound name, another address).
      setHost: !Object.keys(headers).some((name) => name.toLowerCase() === 'host'),
    }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolve({ body: text, headers: response.headers, name: request.name, status: response.statusCode }));
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}

/** Run one group against its own server; the answers, or `{failed}`. */
async function group(input, spec, preload = false) {
  const running = await start(input, spec.bind, preload);
  if (running.failed !== undefined) {
    const unavailable = !preload && spec.bind === ALIASED && running.failed.includes('EADDRNOTAVAIL');
    return unavailable ? group(input, spec, true) : { failed: running.failed };
  }
  try {
    const answers = [];
    for (const request of spec.requests) answers.push(await send(running.url, request));
    return answers;
  } finally {
    running.child.kill();
  }
}

async function main() {
  let text = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) text += chunk;
  const input = JSON.parse(text);
  const results = [];
  for (const spec of input.groups) results.push(await group(input, spec));
  process.stdout.write(JSON.stringify(results));
}
