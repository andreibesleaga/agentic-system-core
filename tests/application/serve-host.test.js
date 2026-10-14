'use strict';
// tests/application/serve-host.test.js — `agsc-host serve` over loopback answers
// only the names it is reached by, and never a dot-file. A request whose `Host`
// header names another host is `421` (Misdirected Request, RFC 9110 §15.5.20), so a
// web page that points a name of its own at the loopback address cannot read what
// the server serves; a request with no `Host` is `400`. A path with a segment that
// begins with a dot is not served, except `.well-known`, and the host-configuration
// files are not served whatever their case. The sentence of `SECURITY.md` that says
// so is checked against these answers. Loopback only, a throwaway build.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const http = require('node:http');

const hosting = require('../../src/application/hosting.js');
const { buildFixture, cleanup, ROOT } = require('../distribution/hosts/_build.js');

let node = null;
test.before(async () => {
  const root = buildFixture();
  const site = path.join(root, 'www');
  for (const [rel, text] of [['.ssh/x', 'key'], ['.secret', 'secret'], ['sub/.htaccess', 'deny'], ['sub/index.html', 'sub'],
    ['.git/config', 'config'], ['.hidden/index.html', 'hidden'], ['.well-known/.private', 'private']]) {
    fs.mkdirSync(path.dirname(path.join(site, rel)), { recursive: true });
    fs.writeFileSync(path.join(site, rel), `private bytes of ${text}\n`);
  }
  const running = await hosting.serve({ bind: '127.0.0.1', port: 0, site });
  node = { port: running.server.address().port, server: running.server, site };
});
test.after(() => new Promise((resolve) => {
  node.server.close(() => { cleanup(); resolve(); });
}));

/** One GET over loopback with the Host header given (`null` sends none). */
function get(route, host) {
  return new Promise((resolve, reject) => {
    const headers = host === null ? {} : { host: host === undefined ? `127.0.0.1:${node.port}` : host };
    const req = http.request({ headers, host: '127.0.0.1', method: 'GET', path: route, port: node.port, setHost: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8'), status: res.statusCode }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** One raw HTTP/1.0 request with no Host header (HTTP/1.1 makes the header mandatory). */
function raw(text) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(node.port, '127.0.0.1', () => socket.end(text));
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', (c) => { data += c; });
    socket.on('end', () => resolve(Number(/^HTTP\/1\.[01] (\d{3})/u.exec(data)[1])));
    socket.on('error', reject);
  });
}

test('a foreign Host is 421 and gets no byte of the node', async () => {
  for (const host of ['attacker.example', `attacker.example:${node.port}`, 'ATTACKER.example', 'localhost.attacker.example',
    '127.0.0.1.attacker.example', '[::2]', '10.0.0.1', `localhost.:${node.port}`]) {
    const res = await get('/', host);
    assert.strictEqual(res.status, 421, host);
    assert.strictEqual(res.body, '', host);
  }
  const discovery = await get('/.well-known/knowledge-linkset', `attacker.example:${node.port}`);
  assert.strictEqual(discovery.status, 421, 'the discovery document is refused to a foreign Host too');
});

test('a malformed Host, or none at all, is 400', async () => {
  for (const host of ['', 'a b', 'localhost:x', '[::1', 'local\thost']) {
    assert.strictEqual((await get('/', host)).status, 400, JSON.stringify(host));
  }
  assert.strictEqual(await raw('GET / HTTP/1.0\r\n\r\n'), 400);
});

test('localhost, a loopback address and the bound address are answered, with or without the port', async () => {
  for (const host of [`localhost:${node.port}`, 'localhost', 'LOCALHOST', `127.0.0.1:${node.port}`, '127.0.0.1', '127.1.2.3',
    `[::1]:${node.port}`, '[::1]']) {
    assert.strictEqual((await get('/', host)).status, 200, host);
  }
  assert.strictEqual((await get('/.well-known/knowledge-linkset')).status, 200);
});

test('a dot-file or dot-folder is never served, except under .well-known; host files in any case are not either', async () => {
  for (const route of ['/.ssh/x', '/.secret', '/sub/.htaccess', '/.git/config', '/.hidden/', '/.hidden', '/.well-known/.private',
    '/_HEADERS', '/_Redirects', '/.HTACCESS', '/%2essh/x', '/sub/%2Ehtaccess']) {
    const res = await get(route);
    assert.strictEqual(res.status, 404, route);
    assert.ok(!res.body.includes('private bytes'), `${route} leaked its bytes`);
    assert.strictEqual(res.body, fs.readFileSync(path.join(node.site, '404.html'), 'utf8'), `${route} is answered with the 404 page`);
  }
  assert.strictEqual((await get('/sub/')).status, 200, 'a folder with no dot in its name is served');
  assert.strictEqual((await get('/.well-known/security.txt')).status, 200);
});

test('a server bound to another name answers that name, and still not a foreign one', async () => {
  const root = buildFixture();
  const running = await hosting.serve({ bind: 'localhost', port: 0, site: path.join(root, 'www') });
  const { port } = running.server.address();
  try {
    const ask = (host) => new Promise((resolve, reject) => {
      http.request({ headers: { host }, host: running.server.address().address, path: '/', port, setHost: false }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      }).on('error', reject).end();
    });
    assert.strictEqual(await ask(`localhost:${port}`), 200);
    assert.strictEqual(await ask(new URL(running.url).host), 200, 'the address it reports');
    assert.strictEqual(await ask(`attacker.example:${port}`), 421);
  } finally {
    await new Promise((resolve) => running.server.close(resolve));
  }
});

test('SECURITY.md says what the server answers, in the words these tests check', () => {
  const text = fs.readFileSync(path.join(ROOT, 'SECURITY.md'), 'utf8').replace(/`/gu, '').replace(/\s+/gu, ' ');
  assert.ok(text.includes('It answers only a request whose Host header names localhost, a loopback address or the address it is bound to,'
    + ' and refuses any other with 421, so a web page that points a name of its own at the machine cannot read what it serves;'
    + ' it never serves a file or folder whose name begins with a dot, except .well-known.'), 'the Host sentence of SECURITY.md');
});
