// palimpsest-host-deployment/runtime — OUTBOUND ALIAS DETECTION: THE HOLE THE FENCE COULD NOT SEE.
//
// MEASURED, AND IT IS THE MOST IMPORTANT FINDING OF THIS STAGE.
//
// The read fence labels a protected root MEDIUM + NO_READ_UP. That label is correct and it works — until
// something else re-labels the same OBJECT. Two shipped mechanisms do exactly that, and both are reachable
// from a worker's execution world:
//
//   · A HARD LINK makes the world's name and the protected file ONE FILE RECORD. The DSH sandbox's
//     workspace write grant then applies its own Low + NO_WRITE_UP inheritable label to the WORLD tree —
//     and because the record is shared, that label lands on the protected file, replacing NO_READ_UP with
//     NO_WRITE_UP. The fence is gone, and the worker reads the bytes. Measured end to end: a protected file
//     at `Medium [NO_READ_UP]` becomes `Low [NO_WRITE_UP]` the moment a worker's tool call spawns a confined
//     child.
//
//   · A JUNCTION (directory reparse point) is WALKED by that same grant, so the grant labels the protected
//     root THROUGH the junction. Same outcome, no shared record needed.
//
// Neither requires the worker to CREATE the link — creating one is refused under the confined token, which
// R1-S measured. The damage is done by a PRE-EXISTING link, which is exactly the question §7 asks: not "can
// the worker make an alias" but "can an EXISTING alias reach protected bytes".
//
// WHY THIS CANNOT BE FIXED BY LABELLING HARDER. The conflict is between two writers of one security
// descriptor: the fence says NO_READ_UP, the sandbox grant says NO_WRITE_UP, and the last writer wins. A
// fence that re-applied itself after every grant would race the grant on every tool call. The honest fix is
// to REFUSE THE WORKER when its world can reach a protected root by alias, because a world that shares a
// file record with protected content cannot be fenced at all.
//
// So this module is a PRE-ADMISSION CHECK, and it fails CLOSED: an outbound alias refuses the worker start,
// with the alias named. A world with no outbound alias — the normal case — is unaffected.
//
// PLAIN JAVASCRIPT. `host/**` is scanned by the architecture checker as JavaScript.

import { lstatSync, readdirSync, readlinkSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { isAncestorOf } from './read_fence.js';

/**
 * @typedef {{ readonly path: string, readonly kind: 'hard-link' | 'reparse-point' | 'unreadable',
 *   readonly target?: string, readonly why: string }} OutboundAlias
 * @typedef {{ readonly world: string, readonly aliases: readonly OutboundAlias[],
 *   readonly hardLinkedProtectedFiles: readonly string[], readonly examined: number, readonly clean: boolean }} AliasScan
 */

/** How deep the world walk goes, and how many entries it examines before it stops. */
const MAX_DEPTH = 12;
const MAX_ENTRIES = 50_000;

/**
 * True when a directory entry is a reparse point (a junction or a symlink).
 *
 * `lstatSync` is used deliberately: `statSync` FOLLOWS the link and would report the target's type, which is
 * precisely the information this check must not confuse with the entry's own nature.
 *
 * @param {string} path
 * @returns {boolean}
 */
function isReparsePoint(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Read one entry's file identity and link count, or `undefined` when it cannot be read.
 *
 * @param {string} path
 * @returns {{ readonly dev: number | bigint, readonly ino: number | bigint, readonly nlink: number } | undefined}
 */
function identityOf(path) {
  try {
    const stats = statSync(path, { bigint: true });
    return { dev: stats.dev, ino: stats.ino, nlink: Number(stats.nlink) };
  } catch {
    return undefined;
  }
}

/**
 * Collect every file under `root` that has more than one hard link, keyed by device+inode.
 *
 * A protected file with `nlink > 1` is the signal that SOMETHING ELSE names it. That something is usually the
 * worker's world, and the shared record is what lets the sandbox grant overwrite the fence.
 *
 * @param {string} root
 * @param {{ maxDepth?: number, maxEntries?: number }} [limits]
 * @returns {Map<string, string>} device:inode -> path
 */
export function collectHardLinkedFiles(root, limits = {}) {
  const maxDepth = limits.maxDepth ?? MAX_DEPTH;
  const maxEntries = limits.maxEntries ?? MAX_ENTRIES;
  /** @type {Map<string, string>} */
  const found = new Map();
  let examined = 0;

  /** @param {string} path @param {number} depth */
  const visit = (path, depth) => {
    if (examined >= maxEntries || depth > maxDepth) return;
    let entries;
    try {
      const stats = lstatSync(path);
      examined += 1;
      if (!stats.isDirectory()) {
        if (stats.nlink > 1) {
          const identity = identityOf(path);
          if (identity !== undefined) found.set(`${String(identity.dev)}:${String(identity.ino)}`, path);
        }
        return;
      }
      entries = readdirSync(path);
    } catch {
      return;
    }
    for (const entry of entries) visit(resolve(path, entry), depth + 1);
  };

  visit(resolve(root), 0);
  return found;
}

/**
 * Scan a worker's execution world for aliases that reach OUTSIDE it.
 *
 * Two kinds are reported, and they are different mechanisms with the same consequence:
 *   · `hard-link` — a file in the world whose record is shared with a file under a protected root, so the
 *     sandbox grant's label lands on the protected record;
 *   · `reparse-point` — a junction or symlink in the world whose target is outside the world, so the grant
 *     walks through it into a protected root.
 *
 * A reparse point that resolves INSIDE the world is not an alias and is not reported: the grant may label it
 * freely, because it names only world content.
 *
 * @param {{ world: string, protectedRoots: readonly string[], maxDepth?: number, maxEntries?: number }} input
 * @returns {AliasScan}
 */
export function scanWorldForOutboundAliases(input) {
  const world = resolve(input.world);
  const roots = input.protectedRoots.map((root) => resolve(root));
  const maxDepth = input.maxDepth ?? MAX_DEPTH;
  const maxEntries = input.maxEntries ?? MAX_ENTRIES;
  /** @type {OutboundAlias[]} */
  const aliases = [];
  let examined = 0;

  /**
   * The protected files that share a record with something, keyed by identity. Collected FIRST, so the world
   * walk is one pass over the smaller tree and a lookup rather than a nested scan.
   */
  /** @type {Map<string, string>} */
  const protectedLinked = new Map();
  for (const root of roots) {
    for (const [identity, path] of collectHardLinkedFiles(root, { maxDepth, maxEntries })) protectedLinked.set(identity, path);
  }

  /** @param {string} path @param {number} depth */
  const visit = (path, depth) => {
    if (examined >= maxEntries || depth > maxDepth) return;
    examined += 1;
    if (isReparsePoint(path)) {
      const rawTarget = readlinkSafe(path);
      const target = rawTarget === undefined ? undefined : resolve(path, '..', rawTarget);
      // A reparse point whose target cannot be resolved is reported as an alias: it is unknown, and unknown
      // is not safe. The same rule the capability classification applies to an unclassified tool.
      if (target === undefined || !isAncestorOf(world, target)) {
        aliases.push({
          path,
          kind: 'reparse-point',
          ...(target === undefined ? {} : { target }),
          why: target === undefined
            ? 'a reparse point whose target could not be resolved: unknown is not assumed safe'
            : `a reparse point resolving to ${target}, which is outside the execution world; the sandbox write grant walks through it and re-labels the target tree`,
        });
      }
      return;
    }
    const identity = identityOf(path);
    if (identity !== undefined && identity.nlink > 1) {
      const protectedPath = protectedLinked.get(`${String(identity.dev)}:${String(identity.ino)}`);
      if (protectedPath !== undefined) {
        aliases.push({
          path,
          kind: 'hard-link',
          target: protectedPath,
          why: `shares one file record with the protected file ${protectedPath}; the sandbox write grant labels the record Low + NO_WRITE_UP, replacing the protected file's NO_READ_UP and destroying the read fence`,
        });
      }
    }
    let entries;
    try {
      if (!lstatSync(path).isDirectory()) return;
      entries = readdirSync(path);
    } catch {
      return;
    }
    for (const entry of entries) visit(resolve(path, entry), depth + 1);
  };

  visit(world, 0);
  return {
    world,
    aliases,
    hardLinkedProtectedFiles: [...protectedLinked.values()],
    examined,
    clean: aliases.length === 0,
  };
}

/** Resolve one reparse point's target, or `undefined` when it cannot be read. */
function readlinkSafe(/** @type {string} */ path) {
  try {
    return readlinkSync(path);
  } catch {
    return undefined;
  }
}

/**
 * The admission verdict a host asks for before running a worker.
 *
 * Fail closed: an outbound alias means the world cannot be fenced, so the worker must not start. The reason
 * names the alias and its target, so an operator can remove the link rather than guess.
 *
 * @param {{ world: string, protectedRoots: readonly string[] }} input
 * @returns {{ allowed: boolean, reason?: string, scan: AliasScan }}
 */
export function admitWorldForFencing(input) {
  const scan = scanWorldForOutboundAliases(input);
  if (scan.clean) return { allowed: true, scan };
  const named = scan.aliases.slice(0, 3).map((alias) => `${alias.kind} at ${alias.path}${alias.target === undefined ? '' : ` -> ${alias.target}`}`).join('; ');
  return {
    allowed: false,
    scan,
    reason: `the execution world can reach protected content by alias, so it cannot be fenced: ${named}${scan.aliases.length > 3 ? ` (and ${String(scan.aliases.length - 3)} more)` : ''}. Remove the link, or run the worker in a world that shares no file record with protected content.`,
  };
}
