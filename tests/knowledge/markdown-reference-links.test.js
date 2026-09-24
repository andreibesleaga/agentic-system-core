'use strict';
// A link whose whole text is a rule, chapter or error-code id carries class="ref",
// so the stylesheet shows it as a small, muted reference rather than body text.

const test = require('node:test');
const assert = require('node:assert');
const { render } = require('../../src/knowledge/markdown.js');

test('a link whose whole text is an id is a reference; any other link is not', () => {
  const html = render('[AGSC-10-05](/a) [`AGSC-E203`](/b) [AGSC-06](/c) [a guide](/d) [AGSC-10-05 and more](/e)').html;
  assert.match(html, /<a href="\/a" class="ref">AGSC-10-05<\/a>/u);
  assert.match(html, /<a href="\/b" class="ref"><code>AGSC-E203<\/code><\/a>/u);
  assert.match(html, /<a href="\/c" class="ref">AGSC-06<\/a>/u);
  assert.match(html, /<a href="\/d">a guide<\/a>/u);
  assert.match(html, /<a href="\/e">AGSC-10-05 and more<\/a>/u);
});

test('the class is added once, and the target and text stay the author\'s', () => {
  const html = render('[AGSC-02-12](/specs/02-item/#AGSC-02-12)').html;
  assert.strictEqual((html.match(/class="ref"/gu) || []).length, 1);
  assert.match(html, /href="\/specs\/02-item\/#AGSC-02-12"/u);
});
