'use strict';
// examples/plugins/surface.js — a MINIMAL, complete surface (AGSC-00-24).
//
// It is here to be read and copied, and to be proved: `tests/arch/plugin-contract
// .test.js` runs every example in this directory against its row of
// `src/application/plugins.js#KINDS` — it must declare the four members, register
// into its own registry, reach no network, write nothing outside its declared
// outputs and change no canonical byte of a 1.0 surface.
//
// Selector: derived from what the writer emits, or `surfaces[]`. This one serves
// the published projection as one JSON document at its own route, and declares
// itself only when it actually emitted that route — AGSC-11-16 derives a
// declaration from what the writer emits, so a surface that declares itself
// unconditionally publishes a promise the node does not keep.

module.exports = {
  agsc_spec_version: '1.0.0',
  kind: 'surface',
  name: 'x-example-titles',
  plugin_api_version: '1.0.0',
  route: '/x-example/titles.json',

  /** @returns {{route:string, text:string}} */
  emit(items) {
    const titles = (items || []).map((item) => String(item.title)).sort();
    return { route: this.route, text: `${JSON.stringify(titles)}\n` };
  },

  /** AGSC-11-16: the declaration, only for a route this node emitted. */
  declaration(emittedRoutes) {
    return (emittedRoutes || []).includes(this.route)
      ? { access: 'public', surface: this.name, target: this.route }
      : null;
  },
};
