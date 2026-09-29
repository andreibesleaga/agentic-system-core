'use strict';
// PORT (hexagonal boundary) — FileSystem.
// JSDoc interface only: no logic, no require, nothing to execute. The Knowledge,
// Governance and Composition contexts NEVER touch a file; Distribution reaches the
// disk only through an injected implementation of this port (AGSC-04-03).
//
// Paths are repository-relative and always use `/` as the separator, on every
// platform, so that AGSC-01-15's discovery order is identical everywhere. An
// implementation MUST refuse a path that escapes the Bundle root (`AGSC-E902`,
// AGSC-01-16/AGSC-01-35) and MUST refuse a file above the applicable size cap
// (`AGSC-E904`).

/**
 * @typedef {object} FileSystem
 * @property {(path: string, encoding?: string) => (Buffer|string)} readFile
 * @property {(path: string, data: (Buffer|string)) => void} writeFile
 * @property {(path: string) => string[]} readdir   entries, code-point sorted (AGSC-01-15)
 * @property {(path: string) => ({size: number, isDirectory: () => boolean, isFile: () => boolean})} stat
 * @property {(path: string) => boolean} exists
 * @property {(path: string) => void} mkdirp
 * @property {(path: string) => void} remove
 * @property {(path: string) => string[]} walk    every FILE under `path`, repository-relative,
 *   recursive, code-point sorted (AGSC-01-15); `[]` when `path` does not exist. Declared here
 *   because application modules require it of every implementation,
 *   and `loadBundle` needs it for the `content/assets/**` set AGSC-03-11 resolves against.
 */

module.exports = {};
