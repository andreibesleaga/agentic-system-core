'use strict';
// PORT (hexagonal boundary) — Network.
// JSDoc interface only. A build MUST NOT resolve the network (AGSC-04-03), so the
// 1.0 adapter REFUSES every call: `adapters/node-network-refusing.js`. The only
// caller that may ever be handed a fetching implementation is the federation walk of
// AGSC-11-06…13, and even there the transport rules (AGSC-E905, AGSC-E906,
// AGSC-E907) are the Boundary context's, not this port's.

/**
 * @typedef {object} Network
 * @property {(url: string, options?: object) => Promise<{status: number, headers: object, body: string}>} fetch
 */

module.exports = {};
