'use strict';
// ADAPTER — a read-only HTTP server over a build directory (`agsc-host serve`).
//
// The server owns the socket and the file reads; WHAT to answer is not decided
// here. Every request is handed, with a fresh view of the directory, to the
// `answer(question, view)` function the application layer wires in (the `local`
// hosting profile), which returns `{status, headers, file}`. A link is never
// followed out of the directory, and a failure is a 500, never a thrown error on
// the socket.

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createHash } = require('node:crypto');

/** Is `full` inside `root` once every link on the way is resolved? */
function inside(root, full) {
  try {
    const real = fs.realpathSync(full);
    const base = fs.realpathSync(root);
    return real === base || real.startsWith(base + path.sep);
  } catch (e) {
    return false;
  }
}

/**
 * A view of the build directory, read at request time: `read` gives bytes,
 * `readText` UTF-8 text or null, and a link or a path outside `dir` is absent.
 */
function siteView(dir) {
  const full = (rel) => path.join(dir, ...rel.split('/'));
  const stat = (rel) => {
    try {
      const target = full(rel);
      const st = fs.lstatSync(target);
      return st.isSymbolicLink() || !inside(dir, target) ? null : st;
    } catch (e) {
      return null;
    }
  };
  return {
    isDirectory: (rel) => { const st = stat(rel); return st !== null && st.isDirectory(); },
    isFile: (rel) => { const st = stat(rel); return st !== null && st.isFile(); },
    read: (rel) => fs.readFileSync(full(rel)),
    readText: (rel) => { const st = stat(rel); return st !== null && st.isFile() ? fs.readFileSync(full(rel), 'utf8') : null; },
    sha256: (rel) => createHash('sha256').update(fs.readFileSync(full(rel))).digest('hex'),
  };
}

/** Answer one HTTP request from the build directory; never throws to the socket. */
function handle(dir, answer, req, res) {
  let plan;
  let body = null;
  try {
    const view = siteView(dir);
    const question = String(req.url || '/').split('?')[0];
    plan = answer({ ifNoneMatch: req.headers['if-none-match'], method: req.method, path: question }, view);
    if (plan.file !== null) body = view.read(plan.file);
  } catch (e) {
    plan = { file: null, headers: [], status: 500 };
  }
  res.sendDate = false;
  for (const [name, value] of plan.headers) res.setHeader(name, value);
  if (body !== null) res.setHeader('Content-Length', String(body.length));
  res.writeHead(plan.status);
  res.end(req.method === 'HEAD' || body === null ? undefined : body);
}

/**
 * Serve a build directory, read-only. Resolves once listening.
 * @param {{site:string, answer:Function, port?:number, bind?:string}} options
 * @returns {Promise<{server:http.Server, url:string}>}
 */
function listen(options) {
  const dir = path.resolve(options.site);
  const server = http.createServer((req, res) => handle(dir, options.answer, req, res));
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port === undefined ? 8080 : options.port, options.bind || 'localhost', () => {
      const address = server.address();
      const host = address.family === 'IPv6' ? `[${address.address}]` : address.address;
      resolve({ server, url: `http://${host}:${address.port}/` });
    });
  });
}

module.exports = { inside, listen };
