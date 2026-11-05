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

/** The two forms of the line: the text a person reads, or the JSON object a tool reads. */
export type VersionForm = 'text' | 'json';

/** The `--version` line of `agsc` for `version`, line feed included. */
export function versionLine(version: string, form: VersionForm = 'text'): string {
  return form === 'json' ? `${JSON.stringify({ version })}\n` : `agsc ${version}\n`;
}
