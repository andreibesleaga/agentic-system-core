'use strict';
// examples/plugins/memory-adapter.js — a MINIMAL, complete memory adapter (AGSC-00-24).
//
// It is here to be read and copied, and to be proved: `tests/arch/plugin-contract
// .test.js` runs every example in this directory against its row of
// `src/application/plugins.js#KINDS` — it must declare the four members, register
// into its own registry, reach no network, write nothing outside its declared
// outputs and change no canonical byte of a 1.0 surface.
//
// Selector: `export --to tsv` / `import --from tsv`. It turns the published
// projection into one tab-separated line per item, and reads one back. Lossy by
// design and honest about it: an adapter that cannot preserve a member refuses
// the operation rather than dropping it (AGSC-00-22), so `toLines` refuses an
// item whose title carries a tab.

module.exports = {
  agsc_spec_version: '1.0.0',
  kind: 'memory-adapter',
  name: 'tsv',
  plugin_api_version: '1.0.0',

  /** `export --to tsv`: slug, type and title, one line per published item. */
  toLines(items) {
    const out = [];
    for (const item of items || []) {
      const cells = [String(item.slug), String(item.type), String(item.title)];
      if (cells.some((cell) => cell.includes('\t') || cell.includes('\n'))) {
        return { lines: [], refused: String(item.slug) };
      }
      out.push(cells.join('\t'));
    }
    return { lines: out, refused: null };
  },

  /** `import --from tsv`: the inverse, total over what `toLines` produced. */
  fromLines(lines) {
    return (lines || []).filter((line) => String(line) !== '').map((line) => {
      const [slug, type, title] = String(line).split('\t');
      return { slug, title, type };
    });
  },
};
