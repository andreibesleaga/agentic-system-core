'use strict';
// verifies AGSC-06-40, AGSC-06-41
// Steps of features/persona-n-researcher.feature for a dataset harvester: it reads the `Link`
// header of a node's home page over loopback, as the local host serves the built `_headers`, and
// finds the FAIR Signposting links (AGSC-06-40) with an independent RFC 8288 parser; it reads the
// Dataset block of the home page (AGSC-06-41) and finds the licence, the creator with the ORCID
// iD and one download per machine file; and no other file of the build names a PROV-O term.

const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const LinkHeader = require('http-link-header');

/** The PROV-O terms of AGSC-06-41, as a prefixed name or as a full IRI. */
const PROV_TERM = /prov:(?:generatedAtTime|wasAttributedTo)|http:\/\/www\.w3\.org\/ns\/prov#(?:generatedAtTime|wasAttributedTo)/u;

function headersOf(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      res.on('end', () => resolve({ headers: res.headers, status: res.statusCode }));
    });
    req.on('error', reject);
  });
}

/** Every file under `dir`, relative, with forward slashes. */
function walk(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory()
    ? walk(path.join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]));
}

module.exports = [
  {
    pattern: /^the configuration names the creator "([^"]+)" with the ORCID iD "([^"]+)" and the licence "([^"]+)"$/u,
    run(world, name, orcid, licence) {
      const config = JSON.parse(world.read('agsc.config.json'));
      config.bundle = { ...config.bundle, creator: { name, orcid }, license_url: licence };
      world.write('agsc.config.json', `${JSON.stringify(config, null, 2)}\n`);
      world.state.dataset = { licence, name, orcid };
    },
  },
  {
    pattern: 'the harvester reads the Link header of the home page over loopback',
    async run(world) {
      const response = await headersOf(world.state.loopback.base);
      assert.strictEqual(response.status, 200);
      world.state.homeLinks = LinkHeader.parse(String(response.headers.link || '')).refs;
    },
  },
  {
    pattern: 'it finds the FAIR Signposting links cite-as, type, describedby, item, license and linkset of the node',
    run(world) {
      const links = world.state.homeLinks.map((r) => `${r.rel} ${r.uri}`).sort();
      assert.deepStrictEqual(links, [
        `cite-as ${world.state.loopback.base}`, 'describedby /.well-known/knowledge-linkset', 'describedby /graph.jsonld',
        'item /chunks.jsonl', 'item /graph.nq', 'item /graph.ttl', `license ${world.state.dataset.licence}`,
        'linkset /.well-known/knowledge-linkset', 'type https://schema.org/AboutPage', 'type https://schema.org/Dataset']);
    },
  },
  {
    pattern: /^the Dataset block of "([^"]+)" names the licence, the creator with the ORCID iD and one download for each machine file$/u,
    run(world, rel) {
      const block = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/su.exec(world.read(rel))[1]);
      const { licence, name, orcid } = world.state.dataset;
      assert.strictEqual(block['@type'], 'Dataset');
      assert.strictEqual(block.license, licence);
      const person = `https://orcid.org/${orcid}`;
      assert.deepStrictEqual(block.creator, { '@id': person, '@type': 'Person', name, sameAs: person });
      assert.deepStrictEqual(block['prov:wasAttributedTo'], { '@id': person }, 'one Person, named by @id (AGSC-06-41)');
      assert.deepStrictEqual(block.distribution.map((d) => new URL(d.contentUrl).pathname),
        ['/graph.jsonld', '/graph.ttl', '/graph.nq', '/chunks.jsonl', '/.well-known/knowledge-linkset']);
    },
  },
  {
    pattern: /^the PROV-O terms appear in "([^"]+)" and in no other file of the build$/u,
    run(world, rel) {
      const out = path.join(world.dir, 'www');
      const found = walk(out).filter((file) => PROV_TERM.test(fs.readFileSync(path.join(out, file), 'utf8'))).map((f) => `www/${f}`);
      assert.deepStrictEqual(found, [rel]);
    },
  },
];
