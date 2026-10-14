'use strict';
// A guard against a vacuous pass (AGSC-09-02, AGSC-09-06).
//
// A handler that never reads a member of `expected` has asserted nothing about it,
// and a pass it returns says nothing about that member. This wrapper runs a handler
// over a copy of the case whose `expected` records every top-level member the handler
// reads (by name, or by listing the members), and turns a pass into a fail when a
// member was never read, or when nothing was read at all. A fail or a skip is passed
// through unchanged, so the guard can only make a result stricter.

/**
 * @param {(vector:object, ctx:object) => {status:string, detail:string}} handler
 * @returns {(vector:object, ctx:object) => {status:string, detail:string}}
 */
function guarded(handler) {
  return (vector, ctx) => {
    const expected = vector && vector.expected;
    if (expected === null || typeof expected !== 'object') return handler(vector, ctx);
    const read = new Set();
    const note = (key) => { if (typeof key === 'string') read.add(key); };
    const tracked = new Proxy(expected, {
      get(target, key) { note(key); return target[key]; },
      ownKeys(target) { Reflect.ownKeys(target).forEach(note); return Reflect.ownKeys(target); },
    });
    const result = handler({ ...vector, expected: tracked }, ctx);
    if (!result || result.status !== 'pass') return result;
    const members = Object.keys(expected);
    const unread = members.filter((key) => !read.has(key));
    if (members.length > 0 && unread.length === 0) return result;
    const detail = members.length === 0
      ? `${vector.id}: the case states no expected member, so a pass would assert nothing`
      : `${vector.id}: no branch of the handler reads ${unread.map((k) => JSON.stringify(k)).join(', ')}`;
    return { status: 'fail', detail };
  };
}

module.exports = { guarded };
