'use strict';
// examples/plugins/deployment-profile.js — a MINIMAL, complete deployment profile (AGSC-00-24).
//
// It is here to be read and copied, and to be proved: `tests/arch/plugin-contract
// .test.js` runs every example in this directory against its row of
// `src/application/plugins.js#KINDS` — it must declare the four members, register
// into its own registry, reach no network, write nothing outside its declared
// outputs and change no canonical byte of a 1.0 surface.
//
// Selector: the writer's own target, stated in its conformance claim. It maps the
// header sets AGSC-06-17 fixes onto one host's file format. It never adds, removes
// or reorders a header: the header SET is the specification's and the FILE is the
// host's (AGSC-06-01).

module.exports = {
  agsc_spec_version: '1.0.0',
  kind: 'deployment-profile',
  name: 'example-host',
  plugin_api_version: '1.0.0',

  /**
   * @param {Array<{route:string, headers:Array<Array<string>>}>} sets
   * @returns {{path:string, text:string}}
   */
  headerFile(sets) {
    const lines = [];
    for (const set of sets || []) {
      lines.push(`[${set.route}]`);
      for (const [name, value] of set.headers) lines.push(`${name} = ${value}`);
      lines.push('');
    }
    return { path: 'example-host.toml', text: `${lines.join('\n').replace(/\n+$/u, '')}\n` };
  },
};
