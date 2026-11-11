'use strict';
// SHARED KERNEL — the version of the specification this engine implements (AGSC-00-14;
// the `spec_version` member of AGSC-09-11), stated once so that a release moves one line.
// The command line, the discovery reader and the built-in deployment profiles read it;
// `spec/00-overview.md` declares the same value, and tests/tools/version-declaration.test.js
// holds the two equal.
//
// PURE: no require, no I/O.

/** The full version, `MAJOR.MINOR.PATCH`. */
const SPEC_VERSION = '1.1.0';

module.exports = { SPEC_VERSION };
