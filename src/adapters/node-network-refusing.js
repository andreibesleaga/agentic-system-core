'use strict';
// ADAPTER — Network that refuses every call (AGSC-04-03).
// A build MUST NOT resolve the network. This is the implementation the engine wires
// in at 1.0, so that no test and no verb can reach the network by accident; the
// refusal carries AGSC-E905, the registered transport-refusal code.

class NetworkRefusedError extends Error {
  constructor(url) {
    super(`network access is refused by this node: ${url} (AGSC-04-03)`);
    this.name = 'NetworkRefusedError';
    this.code = 'AGSC-E905';
  }
}

/**
 * @returns {{fetch: (url: string) => Promise<never>}} a Network port that always rejects.
 */
function createNetwork() {
  return {
    fetch(url) {
      return Promise.reject(new NetworkRefusedError(String(url)));
    },
  };
}

module.exports = { createNetwork, NetworkRefusedError };
