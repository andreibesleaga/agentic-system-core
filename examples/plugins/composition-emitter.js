'use strict';
// examples/plugins/composition-emitter.js — a MINIMAL, complete composition emitter (AGSC-00-24).
//
// It is here to be read and copied, and to be proved: `tests/arch/plugin-contract
// .test.js` runs every example in this directory against its row of
// `src/application/plugins.js#KINDS` — it must declare the four members, register
// into its own registry, reach no network, write nothing outside its declared
// outputs and change no canonical byte of a 1.0 surface.
//
// Selector: `compose --emit <target>`, from the closed registry of AGSC-07-18. It
// renders the seven Harness files as one Markdown index, OUTSIDE the Harness
// directory: AGSC-07-12 closes the Harness at seven file kinds, so an emitter that
// wrote inside it would be adding an eighth.

module.exports = {
  agsc_spec_version: '1.0.0',
  kind: 'composition-emitter',
  name: 'example-index',
  plugin_api_version: '1.0.0',

  /**
   * @param {Map<string,string>|Array<Array<string>>} harnessFiles the seven files.
   * @param {string} harnessDir `dist/harness/<name>/`.
   * @returns {{path:string, text:string}}
   */
  emit(harnessFiles, harnessDir) {
    const paths = [...(harnessFiles instanceof Map ? harnessFiles.keys()
      : (harnessFiles || []).map((entry) => entry[0]))].sort();
    const dir = String(harnessDir).replace(/\/+$/u, '');
    return {
      // BESIDE the Harness directory, never inside it (AGSC-07-18).
      path: `${dir}.index.md`,
      text: `# Harness index\n\n${paths.map((p) => `- ${p}`).join('\n')}\n`,
    };
  },
};
