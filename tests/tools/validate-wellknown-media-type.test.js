'use strict';
// tests/tools/validate-wellknown-media-type.test.js — AGSC-06-07 and AGSC-09-93: the
// discovery document is served as `application/linkset+json` in every case, and the
// profile URI rides either on its `profile` parameter or on a `Link: …; rel="profile"`
// header. The header replaces only the parameter, never the media type, so a document
// served as `application/json` with the profile header fails.
//
// The checker reports one `AGSC-E201` finding per document for the media type, and
// says which half is missing: the media type, the profile, or both.
//
// Two halves: the media-type test of the checker's module, called in process, and
// the shipped command run as a real process over real HTTP on a loopback server this
// test starts (the checker's `--dev` admits plain http to loopback only). No outside
// network.

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { after, before, describe, it } = require('node:test');

const { REPO } = require('./helpers');

const TOOL = path.join(REPO, 'tools', 'validate-wellknown');
const PROFILE = 'https://w3id.org/agentic-system-core/profile/agentic-knowledge';
const LINKSET = 'application/linkset+json';
const PROFILE_LINK = `<${PROFILE}>; rel="profile"`;

/** The served header sets, by route: [Content-Type, Link]. */
const SERVED = {
  '/both/': [`${LINKSET}; profile="${PROFILE}"`, undefined],
  '/link/': [LINKSET, PROFILE_LINK],
  '/json-link/': ['application/json', PROFILE_LINK],
  '/json-param/': [`application/json; profile="${PROFILE}"`, undefined],
  '/json/': ['application/json', undefined],
  '/bare/': [LINKSET, undefined],
};

let server;
let origin;

before(async () => {
  server = http.createServer((req, res) => {
    const base = Object.keys(SERVED).find((b) => req.url === `${b}.well-known/knowledge-linkset`);
    if (!base) {
      res.writeHead(404);
      res.end();
      return;
    }
    const [type, link] = SERVED[base];
    const headers = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Link, ETag, Content-Type',
      'cache-control': 'no-cache', 'content-type': type, etag: '"e"' };
    if (link) headers.link = link;
    res.writeHead(200, headers);
    res.end(`${JSON.stringify({ linkset: [{ alternate: [{ href: `${origin}${base}llms.txt`, type: 'text/plain' }], anchor: `${origin}${base}` }] })}\n`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

/** The shipped command, as a real process, on one served route. */
function check(base, level = '0') {
  return new Promise((resolve) => {
    execFile(process.execPath, [TOOL, `${origin}${base}.well-known/knowledge-linkset`, '--level', level, '--dev', '--json'],
      { encoding: 'utf8', timeout: 30000 }, (error, stdout) => resolve({ code: error ? error.code : 0, envelope: JSON.parse(stdout) }));
  });
}

/** The findings about the media type: every one names AGSC-06-07. */
const aboutMediaType = (envelope) => envelope.findings.filter((f) => f.message.includes('(AGSC-06-07)'));

describe('the media-type test of the checker module', () => {
  const { mediaTypeOk } = require(TOOL);

  it('accepts the media type with the profile parameter, or with the profile Link header', () => {
    assert.equal(mediaTypeOk({ 'content-type': `${LINKSET}; profile="${PROFILE}"` }).ok, true);
    assert.equal(mediaTypeOk({ 'content-type': `${LINKSET};profile="https://other.example/p ${PROFILE}"` }).ok, true);
    assert.equal(mediaTypeOk({ 'content-type': LINKSET, link: PROFILE_LINK }).ok, true);
    assert.equal(mediaTypeOk({ 'content-type': 'Application/LinkSet+JSON', link: [`<https://other.example/>; rel="next"`, PROFILE_LINK] }).ok, true);
  });

  it('refuses application/json even when the profile Link header is sent', () => {
    const state = mediaTypeOk({ 'content-type': 'application/json', link: PROFILE_LINK });
    assert.equal(state.ok, false);
    assert.equal(state.essence, 'application/json');
    assert.equal(state.byLink, true);
  });

  it('refuses a profile parameter on another media type, and the media type with no profile', () => {
    assert.equal(mediaTypeOk({ 'content-type': `application/json; profile="${PROFILE}"` }).ok, false);
    assert.equal(mediaTypeOk({ 'content-type': LINKSET }).ok, false);
    assert.equal(mediaTypeOk({ 'content-type': LINKSET, link: `<${PROFILE}>; rel="describedby"` }).ok, false);
    assert.equal(mediaTypeOk({}).ok, false);
  });

  it('does not judge a file, which has no response headers', () => {
    assert.deepEqual(mediaTypeOk(null), { checked: false });
  });
});

describe('the shipped command on a served document', () => {
  for (const base of ['/both/', '/link/']) {
    it(`passes the media type served as ${base === '/both/' ? 'the parameter' : 'the Link header'} carries the profile`, async () => {
      const { envelope } = await check(base, '2');
      assert.deepEqual(aboutMediaType(envelope), [], JSON.stringify(envelope.findings));
    });
  }

  it('fails application/json with the profile Link header at Level 2, with one finding that says why', async () => {
    const { code, envelope } = await check('/json-link/', '2');
    assert.equal(code, 1);
    const found = aboutMediaType(envelope);
    assert.equal(found.length, 1, JSON.stringify(envelope.findings));
    assert.equal(found[0].code, 'AGSC-E201');
    assert.equal(found[0].severity, 'error');
    assert.match(found[0].message, /^media type "application\/json" is not application\/linkset\+json; /u);
    assert.match(found[0].message, /the profile Link header replaces only the profile parameter, never the media type/u);
  });

  it('fails application/json at every Level, naming the media type and the missing profile at once', async () => {
    for (const base of ['/json/', '/json-param/']) {
      for (const level of ['0', '2']) {
        const { code, envelope } = await check(base, level);
        assert.equal(code, 1);
        const found = aboutMediaType(envelope);
        assert.equal(found.length, 1, JSON.stringify(envelope.findings));
        assert.equal(found[0].code, 'AGSC-E201');
        assert.match(found[0].message, /^media type "application\/json" is not application\/linkset\+json and no profile is carried: /u);
        assert.ok(found[0].message.includes(`profile="${PROFILE}"`), found[0].message);
      }
    }
  });

  it('fails the media type with no profile, naming only the profile', async () => {
    const { code, envelope } = await check('/bare/');
    assert.equal(code, 1);
    const found = aboutMediaType(envelope);
    assert.equal(found.length, 1, JSON.stringify(envelope.findings));
    assert.equal(found[0].code, 'AGSC-E201');
    assert.match(found[0].message, /^media type application\/linkset\+json carries no profile: /u);
    assert.match(found[0].message, /or a Link header with rel="profile" \(AGSC-06-07\)$/u);
  });
});
