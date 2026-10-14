'use strict';
// Preloaded with `node --require` (and required by `tests/acceptance/loopback.test.js`
// itself): the name `localhost` resolves to `::1` first and `127.0.0.1` second, in
// that order, whatever this machine's hosts file says. That is the order of the
// hosted CI runners, where `localhost` maps to both loopback addresses and the
// IPv6 one comes first. Only `localhost` is answered here; every other name goes to
// the platform resolver unchanged, so the preload changes nothing else.
//
// Not a step definition file: its name starts with `_`.

const dns = require('node:dns');

const ORDER = Object.freeze([
  Object.freeze({ address: '::1', family: 6 }),
  Object.freeze({ address: '127.0.0.1', family: 4 }),
]);

const isLocalhost = (host) => String(host).toLowerCase() === 'localhost';

/** The answer of `dns.lookup` for the options given: the list, or the first entry. */
function answer(options) {
  const o = typeof options === 'number' ? { family: options } : (options || {});
  const family = o.family === 'IPv4' ? 4 : (o.family === 'IPv6' ? 6 : Number(o.family) || 0);
  const list = ORDER.filter((x) => family === 0 || x.family === family).map((x) => ({ ...x }));
  return { all: Boolean(o.all), list };
}

const platformLookup = dns.lookup;
dns.lookup = function lookup(host, options, callback) {
  const cb = typeof options === 'function' ? options : callback;
  if (!isLocalhost(host)) return platformLookup.call(dns, host, options, callback);
  const { all, list } = answer(typeof options === 'function' ? {} : options);
  process.nextTick(() => (all ? cb(null, list) : cb(null, list[0].address, list[0].family)));
  return undefined;
};

const platformPromiseLookup = dns.promises.lookup;
dns.promises.lookup = async function lookup(host, options) {
  if (!isLocalhost(host)) return platformPromiseLookup.call(dns.promises, host, options);
  const { all, list } = answer(options);
  return all ? list : list[0];
};
