'use strict';
// examples/plugins/forge-shim.js — a MINIMAL, complete forge shim (AGSC-00-24).
//
// It is here to be read and copied, and to be proved: `tests/arch/plugin-contract
// .test.js` runs every example in this directory against its row of
// `src/application/plugins.js#KINDS` — it must declare the four members, register
// into its own registry, reach no network, write nothing outside its declared
// outputs and change no canonical byte of a 1.0 surface.
//
// Selector: a `gate` item's `enforce[]`. It renders the one workflow file a forge
// needs to run `agsc ci`, and nothing else: a shim that wrote a second file would
// be emitting something the Gate did not ask for.

module.exports = {
  agsc_spec_version: '1.0.0',
  kind: 'forge-shim',
  name: 'example-forge',
  plugin_api_version: '1.0.0',

  /** The ONE file this shim emits, and the path it takes. */
  workflow(gate) {
    const level = Number((gate || {}).level) || 2;
    return {
      path: '.example-forge/agsc.yml',
      text: `# Generated from a gate item by the example-forge shim (AGSC-08-12).\n`
        + `steps:\n  - run: npx -y agsc-cli ci --level ${level}\n`,
    };
  },
};
