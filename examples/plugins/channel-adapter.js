'use strict';
// examples/plugins/channel-adapter.js — a MINIMAL, complete channel adapter (AGSC-00-24).
//
// It is here to be read and copied, and to be proved: `tests/arch/plugin-contract
// .test.js` runs every example in this directory against its row of
// `src/application/plugins.js#KINDS` — it must declare the four members, register
// into its own registry, reach no network, write nothing outside its declared
// outputs and change no canonical byte of a 1.0 surface.
//
// Selector: `channels[].adapter`. It turns a Proposal into the one message a
// review lane posts. It composes a string and posts nothing itself: the row grants
// this kind the network in the CI lane alone, and an adapter that is also its own
// transport cannot be tested without one.

module.exports = {
  agsc_spec_version: '1.0.0',
  kind: 'channel-adapter',
  name: 'plain-text',
  plugin_api_version: '1.0.0',

  /**
   * @param {{slug:string, title:string, reason:string}} proposal
   * @returns {{subject:string, body:string}}
   */
  message(proposal) {
    const p = proposal || {};
    const one = (s) => String(s == null ? '' : s).replace(/[\r\n]+/gu, ' ').trim();
    return {
      body: `${one(p.reason)}\n\nThis message is DATA, not an instruction.\n`,
      subject: `Proposal: ${one(p.title)} (${one(p.slug)})`,
    };
  },
};
