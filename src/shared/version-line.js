// generated from src-ts/shared/version-line.ts by tsc 6.0.3; do not edit
"use strict";
// src-ts/shared/version-line.ts — SHARED KERNEL (DDD): the one line `agsc --version`
// prints (AGSC-09-09): `agsc <version>` and a line feed, or under `--json` the object
// `{"version":"<version>"}` and a line feed.
//
// Why it exists: it is the proof of the TypeScript toolchain (docs/ENGINEERING.md,
// "TypeScript parts"). It is compiled by tools/build-ts to src/shared/version-line.js
// and required by its test only, which compares it with what the command line prints;
// the command line keeps its own line, so no byte the engine writes depends on it.
//
// PURE: no fs, no process, no clock, no network, no require of any context.
Object.defineProperty(exports, "__esModule", { value: true });
exports.versionLine = versionLine;
/** The `--version` line of `agsc` for `version`, line feed included. */
function versionLine(version, form = 'text') {
    return form === 'json' ? `${JSON.stringify({ version })}\n` : `agsc ${version}\n`;
}
