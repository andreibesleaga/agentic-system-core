'use strict';
// examples/plugins/memory-adapter.js — a MINIMAL, complete memory adapter (AGSC-00-24).
//
// It is here to be read and copied, and to be proved: `tests/arch/plugin-contract
// .test.js` runs every example in this directory against its row of
// `src/application/plugins.js#KINDS` — it must declare the four members, register
// into its own registry, reach no network, write nothing outside its declared
// outputs and change no canonical byte of a 1.0 surface.
//
// Selector: `export --to ./plugins/memory-adapter.js` / `import --from <the same
// path>` (a local path or an installed package name; docs/PLUGINS.md §4). It turns
// the published projection into one tab-separated line per item, and reads one
// back. Lossy by design and honest about it: an adapter that cannot preserve a
// member refuses the operation rather than dropping it (AGSC-00-22), so `toLines`
// refuses an item whose title carries a tab.
//
// The two hooks the engine calls: `exportFiles(items, context)` answers the files
// to write under `dist/export/tsv/`; `importFiles(files, context)` answers Markdown
// documents, which the engine maps exactly as it maps an OKF bundle.

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

  /** The export hook: one file, `items.tsv`, or a refusal naming the item. */
  exportFiles(items) {
    const out = this.toLines(items);
    if (out.refused !== null) {
      return { files: [], findings: [{ code: 'AGSC-E003', message: `${out.refused}: a tab or a line break in a cell` }] };
    }
    return { files: [{ path: 'items.tsv', text: `${out.lines.join('\n')}\n` }] };
  },

  /** The import hook: every `.tsv` file's lines, as one Markdown document per item. */
  importFiles(files) {
    const lines = (files || []).filter((f) => String(f.path).endsWith('.tsv'))
      .flatMap((f) => String(f.text).split('\n'));
    return {
      documents: this.fromLines(lines).map((item) => ({
        path: `${item.slug}.md`,
        text: `---\ntype: ${item.type}\ntitle: ${JSON.stringify(String(item.title))}\n---\n\n# ${item.title}\n`,
      })),
    };
  },
};
