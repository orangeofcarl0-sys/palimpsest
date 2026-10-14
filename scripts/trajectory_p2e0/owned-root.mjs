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
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, rmdirSync, statfsSync, unlinkSync, writeFileSync } from "node:fs";
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
 */
export function allocateOwnedRoot(prefix, runIdentity) {
  if (!existsSync(GATE_ROOT)) mkdirSync(GATE_ROOT, { recursive: true });
  const created = mkdtempSync(join(GATE_ROOT, prefix));
  const root = realpathSync(created);
  const gate = realpathSync(GATE_ROOT);
  const marker = join(root, OWNERSHIP_MARKER);
  const record = {
    schemaVersion: 1,
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
    rootIsReparsePoint: lstatSync(created).isSymbolicLink(),
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
 */
export function verifyOwnership(owned) {
  if (owned === undefined || owned === null || typeof owned.root !== "string") return false;
  let read;
  try {
    read = JSON.parse(readFileSync(join(owned.root, OWNERSHIP_MARKER), "utf8"));
  } catch {
    return false;
  }
  return read?.kind === "PALIMPSEST_E0_OWNED_ROOT" && read.runIdentity === owned.runIdentity && read.root === owned.root;
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
    return { cleaned: true, reason: "the owned root was already gone" };
  }
  if (!containedIn(realpathSync(GATE_ROOT), canonicalNow)) {
    return { cleaned: false, reason: "the owned root no longer resolves inside the gate root; preserving it" };
  }

  const scan = findDescendantReparsePoints(owned.root);
  /** §9.1: an INCOMPLETE scan must NOT be read as "no links". Preserve and report the scan errors. */
  if (scan.state === "INCOMPLETE") {
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
    return { cleaned: false, reason: `could not remove ${failedLinks.length} descendant reparse point(s) by name; preserving the root`, removedLinks, failedLinks, preserved: true };
  }

  let lastReason = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      rmSync(owned.root, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      return { cleaned: true, removedLinks, descendantReparsePointsFound: descendants.count, scanState: "COMPLETE", attempts: attempt + 1 };
    } catch (error) {
      lastReason = error?.message ?? String(error);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
  }
  return { cleaned: false, reason: `preserved after retries: ${lastReason}`, removedLinks, descendantReparsePointsFound: descendants.count, preserved: true };
}

/** §7.6: is a leaked root demonstrably OURS (carries this stage's marker), so a sweep is never a blind delete? */
export function isOwnedByThisStage(path) {
  try {
    const read = JSON.parse(readFileSync(join(path, OWNERSHIP_MARKER), "utf8"));
    return read?.kind === "PALIMPSEST_E0_OWNED_ROOT";
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
export async function withOwnedRoot(prefix, runIdentity, body) {
  const owned = allocateOwnedRoot(prefix, runIdentity);
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
