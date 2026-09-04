// index.js
// Well-known suffix (D60, 2026-09-04): the discovery document moves from
// /.well-known/agentic-knowledge to /.well-known/knowledge-linkset. The link
// relation and Profile URI stay `agentic-knowledge` (unchanged by D60).
const WELLKNOWN_SUFFIX = 'knowledge-linkset';
// deprecated since 0.1.0; the published 0.0.1 stub carried 'agentic-knowledge';
// `_redirects` aliases the old path (AGSC-06-17).
const AGENTIC_KNOWLEDGE_URI = WELLKNOWN_SUFFIX;

module.exports = {
    WELLKNOWN_SUFFIX,
    AGENTIC_KNOWLEDGE_URI,
    version: '0.0.1',
    info: 'Reference runtime for the Agentic Knowledge Web'
};