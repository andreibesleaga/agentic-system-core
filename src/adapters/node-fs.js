'use strict';
// ADAPTER — FileSystem over `node:fs`, plus the schema loader.
// Implements AGSC-01-15 (code-point discovery order, `/` everywhere), AGSC-01-16
// (size caps, archives refused, no path escaping the root) and AGSC-01-14 (UTF-8).
// Only the application layer and bin/ may require an adapter.

const fs = require('node:fs');
const path = require('node:path');
// the ordering comes from the SHARED KERNEL, never from a bounded context.
const { compareCodePoint } = require('../shared/ordering.js');

const MAX_INPUT_BYTES = 1024 * 1024; // AGSC-01-16
const ARCHIVE_EXTENSIONS = Object.freeze(['.zip', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar']);

/** A strict decoder: invalid UTF-8 throws instead of becoming U+FFFD (AGSC-01-14). */
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

class FsError extends Error {
  /** @param {string} code a code REGISTERED in spec/09 §9.4, so the CLI can
   * turn this throw into a Finding rather than an internal error.
   * @param {string} message @param {string} [file] the Bundle-relative path. */
  constructor(code, message, file) {
    super(message);
    this.name = 'FsError';
    this.code = code;
    this.file = typeof file === 'string' ? file : '';
  }
}

/** Normalise to a repository-relative POSIX path and refuse anything escaping root. */
function safeJoin(root, relative) {
  const rel = String(relative).split('\\').join('/');
  if (path.posix.isAbsolute(rel) || /^[A-Za-z]:/u.test(rel)) {
    throw new FsError('AGSC-E902', `absolute paths are refused: ${rel} (AGSC-01-35)`, rel);
  }
  const absolute = path.resolve(root, rel);
  const prefix = path.resolve(root) + path.sep;
  if (absolute !== path.resolve(root) && !absolute.startsWith(prefix)) {
    throw new FsError('AGSC-E902', `path escapes the Bundle root: ${rel} (AGSC-01-16)`, rel);
  }
  return absolute;
}

/** The real path of `p` if it exists, else of its nearest existing ancestor. */
function nearestReal(p) {
  let probe = p;
  for (;;) {
    try {
      return fs.realpathSync(probe);
    } catch {
      const parent = path.dirname(probe);
      if (parent === probe) return probe; // nothing on this branch exists
      probe = parent;
    }
  }
}

/**
 * AGSC-01-16 and AGSC-01-35: a symlink is the second way out of the Bundle root and
 * `path.resolve` cannot see it, so every method that resolves a path re-checks the
 * real path — not only `readFile`. A file that does not exist yet is judged
 * by its nearest existing ancestor, so a first `writeFile` still passes while a
 * planted directory symlink does not.
 * @throws {FsError} AGSC-E902 when the real path lies outside the root.
 */
function checkReal(root, absolute, display) {
  const rootReal = nearestReal(path.resolve(root));
  const real = nearestReal(absolute);
  if (real !== rootReal && !real.startsWith(rootReal + path.sep)) {
    throw new FsError('AGSC-E902', `path escapes the Bundle root through a link: ${display} (AGSC-01-16)`, String(display));
  }
  return absolute;
}

/**
 * Build a FileSystem port rooted at `root` (see src/ports/filesystem.js).
 * @param {string} root the Bundle root directory.
 * @param {{maxBytes?: number}} [options]
 */
function createFileSystem(root, options = {}) {
  const maxBytes = options.maxBytes == null ? MAX_INPUT_BYTES : options.maxBytes;
  const abs = (p) => checkReal(root, safeJoin(root, p), p);

  return {
    root,
    readFile(p, encoding = 'utf8') {
      const target = abs(p);
      if (ARCHIVE_EXTENSIONS.includes(path.extname(target).toLowerCase())) {
        throw new FsError('AGSC-E903', `archives are refused: ${p} (AGSC-01-16)`, String(p));
      }
      // The symlink re-check now lives in `abs()` above, so every method has it.
      const size = fs.statSync(target).size;
      if (size > maxBytes) {
        throw new FsError('AGSC-E904', `${p} is ${size} bytes, above the ${maxBytes}-byte cap (AGSC-01-16)`, String(p));
      }
      if (encoding === null) return fs.readFileSync(target);
      if (String(encoding).toLowerCase().replace('-', '') !== 'utf8') return fs.readFileSync(target, encoding);
      // AGSC-01-14: text is UTF-8, and a file that is not is
      // AGSC-E108 — never silently decoded with U+FFFD. The byte-order mark is KEPT
      // (`ignoreBOM`), so the lint that reports a BOM still sees it.
      try {
        return UTF8.decode(fs.readFileSync(target));
      } catch (e) {
        throw new FsError('AGSC-E108', `${p} is not valid UTF-8 (AGSC-01-14)`, String(p));
      }
    },
    writeFile(p, data) {
      const target = abs(p);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
    },
    /** AGSC-01-15: entries in code-point order, never the filesystem's order. */
    readdir(p) {
      return fs.readdirSync(abs(p)).sort(compareCodePoint);
    },
    stat(p) {
      return fs.statSync(abs(p));
    },
    exists(p) {
      try {
        return fs.existsSync(abs(p));
      } catch {
        return false;
      }
    },
    mkdirp(p) {
      fs.mkdirSync(abs(p), { recursive: true });
    },
    remove(p) {
      fs.rmSync(abs(p), { recursive: true, force: true });
    },
    /** Every `.md` under `p`, repository-relative, in AGSC-01-15 discovery order. */
    walk(p) {
      const out = [];
      const visit = (rel) => {
        for (const entry of fs.readdirSync(abs(rel), { withFileTypes: true })) {
          const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
          if (entry.isDirectory()) visit(child);
          else out.push(child);
        }
      };
      if (fs.existsSync(abs(p))) visit(String(p).split('\\').join('/'));
      return out.sort(compareCodePoint);
    },
  };
}

/**
 * Load the three schema documents. `knowledge/` never reads files (AGSC-04-03 and
 * the context-boundary test), so this is where they enter the system.
 * @param {string} [engineRoot] the directory that holds `schema/`.
 * @returns {{item: object, config: object, bundle: object}}
 */
function readSchemas(engineRoot = path.resolve(__dirname, '..', '..')) {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(engineRoot, 'schema', name), 'utf8'));
  return {
    item: read('item.schema.json'),
    config: read('config.schema.json'),
    bundle: read('bundle.schema.json'),
  };
}

/**
 * Load the vocabulary document. `knowledge/` never reads files, so this is the one
 * place `ontology/agsc.ttl` enters the system — and the context file of AGSC-06-32
 * and the persistent context URL of AGSC-05-09 are both derived from it, never
 * typed. The Bundle-rooted FileSystem port cannot reach it: like `schema/`, the
 * vocabulary is the ENGINE's and lives outside any Bundle (AGSC-E902).
 * @param {string} [engineRoot] the directory that holds `ontology/`.
 * @returns {string} the Turtle text of `ontology/agsc.ttl`.
 */
function readOntology(engineRoot = path.resolve(__dirname, '..', '..')) {
  return fs.readFileSync(path.join(engineRoot, 'ontology', 'agsc.ttl'), 'utf8');
}

module.exports = {
  createFileSystem, readOntology, readSchemas, safeJoin, checkReal, FsError, MAX_INPUT_BYTES, ARCHIVE_EXTENSIONS,
};
