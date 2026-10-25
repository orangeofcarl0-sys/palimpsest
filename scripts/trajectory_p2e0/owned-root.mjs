/**
 * Trajectory-P2-E0 §7 — THE SAFE, OWNED TEST-RUNTIME LIFECYCLE.
 *
 * WHY THIS EXISTS. During P2-D2 a recursive cleanup followed a `node_modules` junction and damaged the main
 * worktree's dependencies. A clean Git tree does not prove the working environment is safe (§4), so E0 owns
 * ONE reusable lifecycle instead of scattering `rmSync` calls through the gates.
 *
 * WHAT IT GUARANTEES:
 *
 *   · ALLOCATE — a unique per-run root inside the gate root, with a CONTAINMENT proof (canonical paths), a
 *     reparse-point status and an on-disk creation marker;
 *   · INSPECT  — every DESCENDANT reparse point is found WITHOUT following it, before any deletion;
 *   · DISPOSE  — the DSH reader/handles are closed by the caller (the lifecycle awaits the returned promises);
 *   · CLEAN    — descendant reparse points are removed AS LINKS first, then the root is removed; containment
 *     is re-proved immediately before; if containment or no-follow safety cannot be established the root is
 *     PRESERVED and the reason reported rather than risk a dependency target;
 *   · REPORT   — root, canonical path, ownership, marker, containment, reparse status, policy, result.
 *
 * MEASURED HAZARD (§4.3). On this platform `rmSync(recursive)` and `rm -rf <dir>` do NOT traverse a junction
 * — but `rm -rf <dir>/<link>/` (a TRAILING SEPARATOR) DOES, and destroys the external target. Removing the
 * links FIRST, by name, is what makes the recursive step safe regardless of which form a caller would use.
 *
 * NOT a product component. PLAIN JAVASCRIPT (`.mjs`), bare node.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, rmdirSync, statfsSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const GATE_ROOT = (process.env.PALIMPSEST_P2E0_GATE_ROOT ?? join(homedir(), ".palimpsest-gates")).replace(/\\/gu, "/");

/** §4.2: the marker file that proves THIS run created a root, so ownership is not inferred from a name. */
export const OWNERSHIP_MARKER = ".palimpsest-e0-owned.json";

function containedIn(parent, child) {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);
}

/**
 * §4.2/§4.3: find EVERY descendant reparse point WITHOUT following any of them — FAIL-CLOSED (P2-E1 §9.1).
 *
 * The walk uses `lstat` (never `stat`) and NEVER recurses into a link, so a junction cannot lead it outside
 * the root. P2-E1 §9.1 CORRECTION: a scan that could not read a directory or could not `lstat` an entry is
 * INCOMPLETE, not empty. The result is a DISCRIMINATED UNION — `{state:"COMPLETE", links}` or
 * `{state:"INCOMPLETE", errors}` — so an unreadable subtree can never be mistaken for a link-free one and the
 * caller MUST refuse to delete. `links`/`count` remain on the COMPLETE arm for the existing callers.
 */
export function findDescendantReparsePoints(root) {
  const links = [];
  const errors = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch (error) {
      errors.push({ path: dir.replace(/\\/gu, "/"), detail: error?.message ?? String(error) });
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let stat;
      try {
        stat = lstatSync(full);
      } catch (error) {
        errors.push({ path: full.replace(/\\/gu, "/"), detail: error?.message ?? String(error) });
        continue;
      }
      if (stat.isSymbolicLink()) {
        links.push(full);
        continue; // NEVER descend through a link
      }
      if (stat.isDirectory()) walk(full);
    }
  };
  walk(root);
  if (errors.length > 0) return { state: "INCOMPLETE", errors: Object.freeze(errors), links: Object.freeze([]), count: 0 };
  return { state: "COMPLETE", links, count: links.length };
}

/** §4.5: a non-secret identity snapshot of a dependency root, to prove it is unchanged after cleanup. */
export function snapshotDependencyRoot(root) {
  if (!existsSync(root)) return { present: false };
  const entrypoints = ["typescript/bin/tsc", "vitest/vitest.mjs", ".bin/tsc", ".bin/vitest"].filter((entry) => existsSync(join(root, entry)));
  let entries = 0;
  let reparsePoints = 0;
  try {
    for (const entry of readdirSync(root)) {
      entries += 1;
      try {
        if (lstatSync(join(root, entry)).isSymbolicLink()) reparsePoints += 1;
      } catch {
        /* vanished */
      }
    }
  } catch {
    /* unreadable */
  }
  return { present: true, canonical: realpathSync(root).replace(/\\/gu, "/"), entries, reparsePoints, entrypoints };
}

/** §4.6: a real free-space estimate for the filesystem a path lives on, so a heavy gate can be refused. */
export function freeBytesAt(path) {
  let probe = resolve(path);
  while (!existsSync(probe)) {
    const parent = dirname(probe);
    if (parent === probe) return null;
    probe = parent;
  }
  try {
    const stat = statfsSync(probe);
    return Number(stat.bavail) * Number(stat.bsize);
  } catch {
    return null;
  }
}

/**
 * §4.2: allocate a UNIQUE owned root with an explicit lifecycle record.
 *
 * Ownership is established by a WRITTEN MARKER carrying the run identity, not by a path prefix. The
 * containment proof compares CANONICAL paths, so a symlinked gate root cannot smuggle the root elsewhere.
 *
 * E3-B — AN OBJECT IDENTITY IS NOW ALSO CAPTURED. The marker alone is COPYABLE: E3 measured that a marker carrying
 * the same `runIdentity` and `root` was accepted for a directory it did not describe. `dev`/`ino` are recorded here
 * and compared at disposal, so the record binds the OBJECT and not only the marker text.
 *
 * E4-A3 — THE GATE ROOT IS NOW AN EXPLICIT PARAMETER.
 *
 * `GATE_ROOT` was the only possible parent, resolved once at module load from the environment or the user profile.
 * That made every caller share one mutable directory, including callers that only wanted a private fixture root.
 * `test/trajectory_p2e1_resource_safety.test.ts` consequently observed the REAL `~/.palimpsest-gates` entry count
 * while `test/trajectory_p2e0_test_runtime_safety.test.ts` legitimately allocated and disposed inside it, and E4-A2
 * reproduced that interference deterministically (19 -> 20 entries from an external process, assertion fails).
 *
 * A caller may now pass its own `gateRoot`. The default is unchanged, so no existing production consumer changes
 * behaviour: `scripts/trajectory_p2e0/*`, `scripts/trajectory_p2e1/*` and the gates still allocate under the shared
 * root, which is what they are for. Only a caller that wants an isolated fixture passes one — and the record then
 * carries THAT root, so containment is proved against the parent the caller actually chose.
 */
export function allocateOwnedRoot(prefix, runIdentity, gateRoot = GATE_ROOT) {
  if (typeof gateRoot !== "string" || gateRoot.trim() === "") throw new Error("allocateOwnedRoot requires a non-empty gate root");
  if (!existsSync(gateRoot)) mkdirSync(gateRoot, { recursive: true });
  const created = mkdtempSync(join(gateRoot, prefix));
  const root = realpathSync(created);
  const gate = realpathSync(gateRoot);
  const marker = join(root, OWNERSHIP_MARKER);
  const stats = lstatSync(created);
  const record = {
    schemaVersion: 2,
    kind: "PALIMPSEST_E0_OWNED_ROOT",
    root: root.replace(/\\/gu, "/"),
    canonicalRoot: root.replace(/\\/gu, "/"),
    gateRoot: gate.replace(/\\/gu, "/"),
    prefix,
    runIdentity: runIdentity ?? `${process.pid}`,
    owningProcessId: process.pid,
    createdAt: new Date().toISOString(),
    markerFile: marker.replace(/\\/gu, "/"),
    containmentProven: containedIn(gate, root),
    rootIsReparsePoint: stats.isSymbolicLink(),
    /** E3-B: the object identity, so a copied marker cannot stand in for the object it describes. */
    objectIdentity: { dev: stats.dev, ino: stats.ino, inoUsable: stats.ino !== 0 },
  };
  writeFileSync(marker, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  const owned = {
    ...record,
    /** §4.2: a convenience check that reads the ON-DISK marker and compares it to this record. */
    ownsSelf() {
      return verifyOwnership(owned);
    },
  };
  return owned;
}

/**
 * §4.2: verify ownership by reading the ON-DISK marker, never by trusting a method on the passed object.
 *
 * A caller that presents a record whose `runIdentity` or `root` disagrees with the marker it points at is
 * refused: the marker is the authority, and a spread/copy of a record cannot forge it.
 *
 * E3-B — THE MARKER IS NO LONGER SUFFICIENT ON ITS OWN. A marker file can be copied into another directory, and a
 * marker carrying the right `runIdentity` and `root` would then verify. The object identity captured at allocation
 * must also match the object at that path, which a copy cannot reproduce.
 */
export function verifyOwnership(owned) {
  if (owned === undefined || owned === null || typeof owned.root !== "string") return false;
  let read;
  try {
    read = JSON.parse(readFileSync(join(owned.root, OWNERSHIP_MARKER), "utf8"));
  } catch {
    return false;
  }
  if (read?.kind !== "PALIMPSEST_E0_OWNED_ROOT" || read.runIdentity !== owned.runIdentity || read.root !== owned.root) return false;
  /**
   * A RECORD FROM SCHEMA 1 HAS NO IDENTITY. It is refused rather than accepted on the marker alone: the whole point
   * of this correction is that the marker text is not proof of the object.
   */
  const expected = owned.objectIdentity ?? read.objectIdentity;
  if (expected === undefined || expected === null) return false;
  let stats;
  try {
    stats = lstatSync(owned.root);
  } catch {
    return false;
  }
  if (expected.inoUsable === true && stats.ino !== 0) return stats.dev === expected.dev && stats.ino === expected.ino;
  /** The platform supplied no usable inode; the marker remains the only available evidence and is reported as such. */
  return read.root === owned.root;
}

/**
 * §4.3/§7.2: clean ONLY the directory this run created, with no-follow safety.
 *
 * ORDER: re-prove containment → find descendant reparse points → remove EACH LINK BY NAME (non-recursively,
 * so its target is untouched) → then remove the root recursively. If containment fails, the marker is
 * missing/mismatched, or the root itself is a reparse point, the directory is PRESERVED and the reason
 * reported — never deleted with a wider sweep.
 *
 * P2-E1 §9.1/§9.2 CORRECTIONS:
 *   · an INCOMPLETE descendant scan BLOCKS deletion (the old code treated an unreadable subtree as link-free);
 *   · the link-removal refusal is NOT bypassable by a routine option. There is no `refuseOnLinkFailure`
 *     escape hatch: a failed link removal always preserves the root. A caller that genuinely needs a
 *     different behaviour must use an independently-owned, no-follow-proven operation, not an option here.
 */
export async function safeCleanup(owned) {
  if (owned === undefined || owned === null) return { cleaned: false, reason: "no owned root was allocated" };
  if (!owned.containmentProven) return { cleaned: false, reason: "containment was not proven at allocation; preserving the directory" };
  if (owned.rootIsReparsePoint) return { cleaned: false, reason: "the owned root is itself a reparse point; preserving the directory" };
  if (!verifyOwnership(owned)) {
    return { cleaned: false, reason: "the on-disk ownership marker does not match this record; preserving the directory (not demonstrably owned)" };
  }
  // §4.2: re-prove containment RIGHT BEFORE deleting, in case the path changed since allocation.
  let canonicalNow;
  try {
    canonicalNow = realpathSync(owned.root);
  } catch {
    /**
     * E3-B — "ALREADY GONE" IS NOW OBSERVED, NOT INFERRED. `realpathSync` failing could mean the path is absent OR
     * that it is unreadable, and the previous version reported `cleaned: true` for both. The path object is
     * inspected without following it, so the answer is a measurement.
     */
    let present = true;
    try {
      lstatSync(owned.root);
    } catch {
      present = false;
    }
    if (present) return { cleaned: false, reason: "the owned root could not be resolved but is still present; preserving it", preserved: true };
    return { cleaned: true, reason: "the owned root was already gone" };
  }
  /**
   * §4.2 / E4-A3: re-prove containment RIGHT BEFORE deleting, against the parent THIS RECORD was allocated under.
   *
   * The previous version compared against the module-level `GATE_ROOT`. That is wrong once a caller may pass its own
   * gate root: a fixture allocated under a private parent would be measured against the shared one and refused, or —
   * worse — a record whose own parent had changed would be checked against an unrelated constant. The record carries
   * `gateRoot`, so that is what containment is proved against.
   */
  const parentRoot = typeof owned.gateRoot === "string" && owned.gateRoot !== "" ? owned.gateRoot : GATE_ROOT;
  if (!containedIn(realpathSync(parentRoot), canonicalNow)) {
    return { cleaned: false, reason: "the owned root no longer resolves inside the gate root it was allocated under; preserving it" };
  }

  /**
   * E3-B — THE DELETE IS ADDRESSED BY A QUARANTINE NAME, NOT BY THE ORIGINAL PATH.
   *
   * `verifyOwnership` and the recursive removal were separate statements on a PATH, so a directory substituted
   * between them was deleted. The rename is one directory-entry operation, and the identity is re-checked at the
   * quarantine name before anything is removed: a substituted object fails that check and is renamed back.
   *
   * The descendant link scan and the link-by-name removal then run against the QUARANTINE name. The link objects
   * move with the directory, their targets do not, so the no-follow property is unchanged.
   */
  const parent = dirname(owned.root);
  const quarantine = join(parent, `.q-${basename(owned.root)}-${String(process.pid).padStart(6, "0")}-${Math.random().toString(36).slice(2, 10)}`);
  try {
    renameSync(owned.root, quarantine);
  } catch (error) {
    return { cleaned: false, reason: `the quarantine rename failed: ${String(error?.message ?? error).slice(0, 200)}`, preserved: true };
  }

  const expected = owned.objectIdentity;
  if (expected !== undefined && expected !== null && expected.inoUsable === true) {
    let actual;
    try {
      actual = lstatSync(quarantine);
    } catch {
      return { cleaned: false, reason: "the quarantined root could not be inspected; preserving it", preserved: true, quarantinePath: quarantine.replace(/\\/gu, "/") };
    }
    if (actual.dev !== expected.dev || actual.ino !== expected.ino) {
      let restored = false;
      try {
        renameSync(quarantine, owned.root);
        restored = true;
      } catch {
        restored = false;
      }
      return {
        cleaned: false,
        reason: "a substituted object was detected at the quarantine name; it was preserved",
        preserved: true,
        restored,
        quarantinePath: restored ? null : quarantine.replace(/\\/gu, "/"),
      };
    }
  }

  const scan = findDescendantReparsePoints(quarantine);
  /** §9.1: an INCOMPLETE scan must NOT be read as "no links". Preserve and report the scan errors. */
  if (scan.state === "INCOMPLETE") {
    renameSyncSafe(quarantine, owned.root);
    return { cleaned: false, reason: `the descendant reparse-point scan was INCOMPLETE (${String(scan.errors.length)} error(s)); preserving the root because a link could exist in an unreadable subtree`, scanErrors: scan.errors, preserved: true };
  }
  const descendants = scan;
  const removedLinks = [];
  const failedLinks = [];
  for (const link of descendants.links) {
    try {
      const stat = lstatSync(link);
      if (stat.isDirectory()) rmdirSync(link); // removes the LINK, not the target
      else unlinkSync(link);
      removedLinks.push(link.replace(/\\/gu, "/"));
    } catch (error) {
      failedLinks.push({ link: link.replace(/\\/gu, "/"), detail: error?.message ?? String(error) });
    }
  }
  /** §9.2: NOT bypassable. A failed link removal always preserves the root. */
  if (failedLinks.length > 0) {
    renameSyncSafe(quarantine, owned.root);
    return { cleaned: false, reason: `could not remove ${String(failedLinks.length)} descendant reparse point(s) by name; preserving the root`, removedLinks, failedLinks, preserved: true };
  }

  let lastReason = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      rmSync(quarantine, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      /** E3-B: completion is OBSERVED. A removal that reported success but left the name behind is a failure. */
      let survives = true;
      try {
        lstatSync(quarantine);
      } catch {
        survives = false;
      }
      if (survives) {
        lastReason = "the removal reported success but the quarantine name still exists";
        break;
      }
      return { cleaned: true, removedLinks, descendantReparsePointsFound: descendants.count, scanState: "COMPLETE", attempts: attempt + 1, quarantined: true };
    } catch (error) {
      lastReason = error?.message ?? String(error);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
  }
  renameSyncSafe(quarantine, owned.root);
  return { cleaned: false, reason: `preserved after retries: ${lastReason}`, removedLinks, descendantReparsePointsFound: descendants.count, preserved: true };
}

/** Restore a quarantine name to the original path, reporting whether it worked rather than throwing. */
function renameSyncSafe(from, to) {
  try {
    renameSync(from, to);
    return true;
  } catch {
    return false;
  }
}

/** §7.6: is a leaked root demonstrably OURS, so a sweep is never a blind delete? */
export function isOwnedByThisStage(path) {
  try {
    const read = JSON.parse(readFileSync(join(path, OWNERSHIP_MARKER), "utf8"));
    if (read?.kind !== "PALIMPSEST_E0_OWNED_ROOT") return false;
    /**
     * E3-B — A MARKER OF THE RIGHT KIND IS NOT ENOUGH. A marker can be copied into any directory. Where the marker
     * records an object identity, the object at this path must match it.
     */
    if (read.objectIdentity === undefined || read.objectIdentity === null) return false;
    if (read.objectIdentity.inoUsable !== true) return true;
    const stats = lstatSync(path);
    return stats.dev === read.objectIdentity.dev && stats.ino === read.objectIdentity.ino;
  } catch {
    return false;
  }
}

/**
 * §7.1: run a body with a guaranteed owned-root lifecycle.
 *
 *   Allocate → Compose → Execute → Read → Dispose → Safe Cleanup → Report
 *
 * The cleanup runs in `finally`, so a throw, a refusal or an early return all release the root. The body
 * receives the owned root; whatever it returns is returned alongside the cleanup report.
 */
export async function withOwnedRoot(prefix, runIdentity, body, gateRoot = GATE_ROOT) {
  const owned = allocateOwnedRoot(prefix, runIdentity, gateRoot);
  let result;
  let error;
  try {
    result = await body(owned);
  } catch (thrown) {
    error = thrown;
  }
  const cleanup = await safeCleanup(owned);
  const report = {
    root: owned.root,
    canonicalRoot: owned.canonicalRoot,
    runIdentity: owned.runIdentity,
    owningProcessId: owned.owningProcessId,
    containmentProven: owned.containmentProven,
    rootIsReparsePoint: owned.rootIsReparsePoint,
    cleanupPolicy: "no-follow: descendant reparse points removed by name before recursive removal; preserved on any doubt",
    cleanup,
  };
  if (error !== undefined) return { ok: false, error, report };
  return { ok: true, value: result, report };
}

export { containedIn };
