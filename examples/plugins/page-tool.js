'use strict';
// examples/plugins/page-tool.js — a MINIMAL, complete page tool (AGSC-00-24).
//
// It is here to be read and copied, and to be proved: `tests/arch/plugin-contract
// .test.js` runs every example in this directory against its row of
// `src/application/plugins.js#KINDS` — it must declare the four members, register
// into its own registry, reach no network, write nothing outside its declared
// outputs and change no canonical byte of a 1.0 surface.
//
// Selector: `registerTool()` in the page. It answers from the projection the page
// already holds and from nothing else: AGSC-09-16 gives a page tool the PUBLISHED
// projection, so a tool that fetched anything would be able to see what the node
// does not publish.

module.exports = {
  agsc_spec_version: '1.0.0',
  kind: 'page-tool',
  name: 'agsc.example.count_by_type',
  plugin_api_version: '1.0.0',

  /** @param {{items:Array<object>}} projection @returns {object} */
  call(projection, input) {
    const wanted = input === undefined || input === null ? undefined : String(input.type);
    const counts = {};
    for (const item of (projection || {}).items || []) {
      const type = String(item.type);
      counts[type] = (counts[type] || 0) + 1;
    }
    if (wanted === undefined) return { counts };
    return { count: counts[wanted] || 0, type: wanted };
  },
};
