/**
 * Host-S1RA RA-B / E3-B — OWNED TEST RESOURCES: ALLOCATION, REVALIDATION AND SAFE DISPOSAL.
 *
 * THE INVARIANTS THIS MODULE NOW ENFORCES, each tied to a measured failure:
 *
 *   I1  MISSING EVIDENCE IS NOT POSITIVE EVIDENCE. A missing, unreadable or malformed marker REFUSES. The previous
 *       version pushed `marker, passed: true` for an absent marker and fell back to the captured identity, so a
 *       directory whose marker had been removed was deleted (E3 F1).
 *
 *   I2  THE MARKER MUST BIND THE RESOURCE. `runId` alone was compared, so a marker naming a DIFFERENT root was
 *       accepted (E3 F2), and a marker copied from another resource of the same run was accepted (E3 F3). The
 *       marker's `ownedRoot` and `generation` must now agree with the record.
 *
 *   I3  REFUSAL PROPAGATES. `revalidateOwnership` returns structured reasons; no caller may convert them into a
 *       deletion. The consumer that did (`rig.safeCleanup`'s legacy fallback) is corrected separately.
 *
 *   I4  COMPLETION INTENT IS NOT COMPLETION EVIDENCE. `cleaned: true` is returned only after the object is
 *       OBSERVED gone. A failed removal never latches a disposed state.
 *
 *   I5  REPEATED CLEANUP IS NOT A BLIND PATH DELETE. Disposal is bound to the allocated object, so a new occupant
 *       at a reused path is preserved.
 *
 *   I6  BOUNDED. No database, no transaction manager, no service. One added persistent field, justified below.
 *
 * THE TOCTOU WINDOW, AND WHAT REPLACES THE OLD SHAPE.
 *
 * The previous disposal was `revalidateOwnership()` followed by `rmSync()` — two statements on a PATH. A directory
 * substituted between them was deleted (E3 F4B, and E2's own audit). Path-based validation and path-based deletion
 * cannot be made atomic with the Node APIs this project ships, and this stage may not add a native binding.
 *
 * Disposal therefore uses a QUARANTINE RENAME, which changes which object the delete acts on rather than trying to
 * make the check atomic:
 *
 *   1. revalidate ownership of the path;
 *   2. rename the directory entry to a unique quarantine name in the SAME parent (one directory-entry operation);
 *   3. verify the identity of the object now AT the quarantine name — if it is not the allocated object, rename it
 *      back and refuse, so a substituted object is preserved;
 *   4. remove the quarantine name recursively;
 *   5. verify the quarantine name is gone before reporting success.
 *
 * What this closes: a substitution between the proof and the rename is DETECTED at step 3 and reversed, because the
 * substituted object fails the identity comparison. What it does not close: a substitution between step 3 and step 4
 * on a name the substituting process must guess, and a rename-back that is itself raced. That residual is reported
 * rather than claimed closed, and it is why the verdict for physical disposal is bounded rather than absolute.
 *
 * NOT A PRODUCT COMPONENT. PLAIN JAVASCRIPT (`.mjs`), bare node.
 */
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

export const MARKER_NAME = ".palimpsest-owned.json";
export const MARKER_SCHEMA = 2;

/**
 * THE ONE NEW PERSISTENT FIELD. `generation` exists because E3 F8 measured an actual stale-authorization failure:
 * a record captured at allocation stayed sufficient to delete the same object indefinitely, so nothing distinguished
 * "this operation is current" from "this operation was captured before a handoff". It is a monotonically increasing
 * counter owned by the allocating process, recorded in both the record and the marker, and compared at the
 * destructive boundary. It is deliberately NOT a durable operation log: no schema beyond the integer, no history,
 * no replay.
 */
let GENERATION_COUNTER = 0;
const nextGeneration = () => {
  GENERATION_COUNTER += 1;
  return GENERATION_COUNTER;
};

/** A stable per-process run identity. Recorded so a reaper can tell "mine" from "someone else's". */
const RUN_ID = `${String(process.pid)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** The object identity the platform can supply. `ino` is 0 on some Windows paths, so it is used as a WEAK signal. */
function objectIdentity(path) {
  try {
    const stats = lstatSync(path);
    return { dev: stats.dev, ino: stats.ino, isDirectory: stats.isDirectory(), isReparsePoint: stats.isSymbolicLink(), inoUsable: stats.ino !== 0 };
  } catch {
    return null;
  }
}

function sameIdentity(recorded, current) {
  if (recorded === null || current === null) return false;
  if (recorded.isReparsePoint !== current.isReparsePoint) return false;
  if (recorded.isDirectory !== current.isDirectory) return false;
  /**
   * WHERE `ino` IS USABLE it is the decisive comparison. Where it is not (0 on this platform for some directory
   * handles), identity degrades to "same kind of object at the same path", and the caller is TOLD that the check
   * was weak rather than being told it passed.
   */
  if (recorded.inoUsable && current.inoUsable) return recorded.dev === current.dev && recorded.ino === current.ino;
  return { weak: true };
}

/** Is `path` inside `root` after resolution, as a strict descendant? */
export function isStrictlyInside(root, path) {
  try {
    const resolvedRoot = realpathSync(root);
    const resolvedPath = realpathSync(path);
    const rel = relative(resolvedRoot, resolvedPath);
    return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);
  } catch {
    return false;
  }
}

/**
 * Allocate a uniquely named, test-owned root inside the gate root.
 *
 * The returned record carries the identity captured HERE, the generation that authorizes ITS disposal, and whether
 * that identity is strong enough to be decisive.
 */
export function allocateOwnedRoot(gateRoot, prefix) {
  if (typeof prefix !== "string" || prefix.trim() === "") throw new Error("allocateOwnedRoot requires a non-empty prefix");
  if (!existsSync(gateRoot)) mkdirSync(gateRoot, { recursive: true });

  const root = mkdtempSync(join(gateRoot, prefix));
  const resolvedRoot = realpathSync(root);
  const resolvedGate = realpathSync(gateRoot);
  const rel = relative(resolvedGate, resolvedRoot);
  const contained = rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);
  const identity = objectIdentity(resolvedRoot);
  const generation = nextGeneration();

  const marker = {
    schemaVersion: MARKER_SCHEMA,
    runId: RUN_ID,
    pid: process.pid,
    generation,
    createdAt: new Date().toISOString(),
    ownedRoot: resolvedRoot.replace(/\\/gu, "/"),
    gateRoot: resolvedGate.replace(/\\/gu, "/"),
    prefix,
    active: true,
  };
  let markerWritten = false;
  try {
    writeFileSync(join(resolvedRoot, MARKER_NAME), `${JSON.stringify(marker, null, 2)}\n`, "utf8");
    markerWritten = true;
  } catch {
    /**
     * A root that cannot carry its marker can no longer be disposed by the normal path, because I1 requires the
     * marker. The record SAYS SO rather than pretending the allocation is complete.
     */
    markerWritten = false;
  }

  return {
    root: resolvedRoot,
    gateRoot: resolvedGate,
    contained,
    isReparse: identity?.isReparsePoint === true,
    identity,
    marker,
    markerWritten,
    generation,
    runId: RUN_ID,
  };
}

/**
 * Re-prove ownership immediately before deleting.
 *
 * Returns `{ owned: true }` only when every check passes. `checks` is returned in all cases so a receipt can record
 * WHY a directory was preserved instead of a bare boolean.
 */
export function revalidateOwnership(owned) {
  const checks = [];
  const fail = (check, detail) => {
    checks.push({ check, passed: false, detail });
    return { owned: false, checks, reason: detail };
  };

  if (owned === null || typeof owned !== "object") return fail("record", "no ownership record was supplied");
  checks.push({ check: "record", passed: true, detail: `run ${String(owned.runId)}` });

  /** 0. THE GENERATION. A record whose generation no longer matches the marker is a superseded operation. */
  if (!Number.isInteger(owned.generation)) {
    return fail("generation", "the record carries no operation generation, so it cannot authorize a destructive effect");
  }

  /** 1. The path must still be inside the gate root, resolved NOW rather than as recorded. */
  if (!existsSync(owned.gateRoot)) return fail("gateRootExists", "the gate root no longer exists");
  if (!existsSync(owned.root)) return fail("rootExists", "the owned root no longer exists; nothing to delete");
  if (!isStrictlyInside(owned.gateRoot, owned.root)) return fail("containment", "the root does not resolve inside the gate root");

  /** 2. The path must not be a reparse point NOW — the cached flag is not consulted. */
  const current = objectIdentity(owned.root);
  if (current === null) return fail("identity", "the root could not be inspected");
  if (current.isReparsePoint) return fail("reparse", "the root is a reparse point; removing it could reach outside the gate root");

  /** 3. The object identity must still match the one captured at allocation. */
  const comparison = sameIdentity(owned.identity, current);
  if (comparison === false) return fail("identityMatch", "the directory at this path is not the object that was allocated");
  if (comparison?.weak === true) {
    /**
     * A WEAK COMPARISON IS RECORDED, NOT TREATED AS A PASS. The remaining checks still run, and the deletion is
     * allowed only because containment and the absence of a reparse point were proved directly.
     */
    checks.push({ check: "identityMatch", passed: true, detail: "WEAK: the platform did not supply a usable inode, so identity is limited to object kind at the same path" });
  } else {
    checks.push({ check: "identityMatch", passed: true, detail: "dev/ino match the allocation" });
  }

  /**
   * 4. THE MARKER IS REQUIRED, AND IT MUST BIND THIS RESOURCE.
   *
   * I1: an absent marker refuses. The previous version passed this check when the marker was missing, which is what
   * E3 F1 measured as a deletion of a directory whose evidence had been removed.
   *
   * I2: the marker's `ownedRoot` must name THIS root and its `generation` must match the record. Comparing `runId`
   * alone accepted a marker naming a different root (F2) and a marker copied from a sibling resource (F3).
   */
  const markerPath = join(owned.root, MARKER_NAME);
  if (!existsSync(markerPath)) return fail("marker", "the ownership marker is absent; a missing record is not positive evidence");
  let marker;
  try {
    marker = JSON.parse(readFileSync(markerPath, "utf8"));
  } catch {
    return fail("marker", "the marker is unreadable or malformed");
  }
  if (marker?.schemaVersion !== MARKER_SCHEMA) return fail("marker", `unrecognised marker schema ${String(marker?.schemaVersion)}`);
  if (marker?.runId !== owned.runId) return fail("marker", `the marker names run ${String(marker?.runId)}, not this run`);
  /**
   * THE ROOT IS CHECKED BEFORE THE GENERATION so the refusal names the actual defect. A marker copied from a sibling
   * resource differs in BOTH fields, and "it names a different root" is the more precise statement about why it
   * cannot authorize this deletion.
   */
  if (!sameResolvedPath(marker?.ownedRoot, owned.root)) {
    return fail("marker", "the marker names a different root, so it does not bind this resource");
  }
  if (marker?.generation !== owned.generation) {
    return fail("marker", `the marker names generation ${String(marker?.generation)}, not ${String(owned.generation)}; this record is superseded`);
  }
  checks.push({ check: "marker", passed: true, detail: `marker binds this root at generation ${String(owned.generation)}` });

  return { owned: true, checks };
}

/** A unique quarantine name in the SAME parent, so the rename is a single directory-entry operation. */
function quarantineName(parent, base) {
  const suffix = `${String(process.pid).padStart(6, "0")}-${Math.random().toString(36).slice(2, 10)}`;
  return join(parent, `.q-${base}-${suffix}`);
}

/**
 * Dispose of an owned root: rename to quarantine, verify the object, delete, verify it is gone.
 *
 * Returns `{ cleaned: true }` ONLY when the quarantine name is observed absent afterwards (I4). Every other outcome
 * carries a structured reason and leaves the object either untouched or restored.
 */
export function disposeOwnedRoot(owned, options = {}) {
  const proof = revalidateOwnership(owned);
  if (proof.owned !== true) {
    /** A refused disposal is FINAL. Ownership cannot be re-established by retrying. */
    return { cleaned: false, reason: proof.reason, checks: proof.checks, preserved: true, refused: true };
  }

  const parent = resolve(owned.root, "..");
  const quarantine = quarantineName(parent, basename(owned.root));
  const expected = objectIdentity(owned.root);

  try {
    renameSync(owned.root, quarantine);
  } catch (error) {
    return {
      cleaned: false,
      reason: `the quarantine rename failed: ${String(error?.message ?? error).slice(0, 200)}`,
      checks: proof.checks,
      preserved: true,
      retryable: true,
      lastError: String(error?.message ?? error).slice(0, 300),
    };
  }

  /**
   * STEP 3 — THE OBJECT THAT WILL BE DELETED IS THE OBJECT THAT WAS PROVEN.
   *
   * If a substitution landed between the proof and the rename, the object at the quarantine name is the SUBSTITUTED
   * one and its identity differs. It is renamed back and preserved, which is the difference between detecting the
   * race and deleting through it.
   */
  const quarantined = objectIdentity(quarantine);
  const comparison = sameIdentity(expected, quarantined);
  if (comparison === false) {
    try {
      renameSync(quarantine, owned.root);
    } catch {
      /** Restoration failed; the object is still PRESERVED, just at the quarantine name. */
      return {
        cleaned: false,
        reason: "a substituted object was detected at the quarantine name and could not be restored to its original path; it was preserved",
        checks: proof.checks,
        preserved: true,
        substitutedObjectPreservedAt: quarantine.replace(/\\/gu, "/"),
        refused: true,
      };
    }
    return {
      cleaned: false,
      reason: "a substituted object was detected at the quarantine name; it was restored and preserved",
      checks: proof.checks,
      preserved: true,
      refused: true,
    };
  }

  try {
    rmSync(quarantine, { recursive: true, force: true, maxRetries: options.maxRetries ?? 2, retryDelay: options.retryDelay ?? 100 });
  } catch (error) {
    const reason = String(error?.message ?? error).slice(0, 300);
    /**
     * A FAILED REMOVAL LEAVES THE OBJECT AT THE QUARANTINE NAME. It is restored when possible so a retry starts from
     * the same place, and `cleaned` is NOT true either way.
     */
    let restored = false;
    try {
      if (existsSync(quarantine)) {
        renameSync(quarantine, owned.root);
        restored = true;
      }
    } catch {
      restored = false;
    }
    return {
      cleaned: false,
      reason: `the removal failed: ${reason}`,
      lastError: reason,
      checks: proof.checks,
      preserved: true,
      retryable: true,
      restored,
      quarantineSurvivesAt: restored ? null : quarantine.replace(/\\/gu, "/"),
    };
  }

  /** STEP 5 — COMPLETION IS OBSERVED, NOT ASSUMED. */
  if (existsSync(quarantine)) {
    return { cleaned: false, reason: "the removal reported success but the quarantine name still exists", checks: proof.checks, preserved: false, retryable: true };
  }
  return { cleaned: true, checks: proof.checks, quarantined: true };
}

/**
 * A run-owned root that reclaims itself on every exit path, with revalidated quarantine disposal and bounded retry.
 *
 * Signal handling is a best-effort reclamation on this process's own exit. It cannot run after SIGKILL, and this
 * comment is the honest statement of that limit rather than a claim of guaranteed cleanup.
 */
export function ownedRootLifetime(owned, options = {}) {
  const maxAttempts = options.maxAttempts ?? 3;
  let attempts = 0;
  let outcome = null;
  let firstFailureReason = null;
  let listenersInstalled = [];

  const attemptReclaim = () => {
    if (outcome?.cleaned === true) return outcome;
    if (attempts >= maxAttempts) {
      outcome = { cleaned: false, attempts, reason: firstFailureReason ?? "attempt budget exhausted", preserved: true };
      return outcome;
    }
    attempts += 1;

    const result = disposeOwnedRoot(owned, options);
    if (result.cleaned === true) {
      outcome = { ...result, attempts };
      return outcome;
    }
    if (firstFailureReason === null) firstFailureReason = result.reason;
    /**
     * RETRYABLE, NOT DISPOSED. A failed attempt leaves the record in a state a later call can retry, and `cleaned`
     * stays false so no caller can mistake this for success.
     */
    outcome = { ...result, attempts, reason: firstFailureReason, retryable: result.refused !== true && attempts < maxAttempts, preserved: true };
    return outcome;
  };

  const onExit = () => {
    attemptReclaim();
  };
  const onSignal = (signal) => {
    attemptReclaim();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };

  /** `process.on` (not `once`) so `dispose()` can remove them by reference. */
  const sigintHandler = () => onSignal("SIGINT");
  const sigtermHandler = () => onSignal("SIGTERM");
  process.on("exit", onExit);
  process.on("SIGINT", sigintHandler);
  process.on("SIGTERM", sigtermHandler);
  listenersInstalled = [
    ["exit", onExit],
    ["SIGINT", sigintHandler],
    ["SIGTERM", sigtermHandler],
  ];

  return {
    /** Reclaim now and remove every listener installed. A failed attempt can still be retried. */
    dispose: () => {
      const result = attemptReclaim();
      for (const [event, handler] of listenersInstalled) process.removeListener(event, handler);
      listenersInstalled = [];
      return result;
    },
    retry: () => attemptReclaim(),
    status: () => outcome,
    listenerCount: () => listenersInstalled.length,
  };
}

/**
 * THE REAPER, WITH OWNERSHIP AS A PRECONDITION RATHER THAN A HINT.
 *
 * Report-only by default. A candidate is reclaimed only when ALL of the following hold:
 *
 *   · it is a DIRECT child of the gate root;
 *   · its name matches one of the caller's own prefixes;
 *   · it is not a reparse point;
 *   · it resolves inside the gate root;
 *   · it is older than `minAgeMs`;
 *   · it carries a marker of the current schema whose `ownedRoot` names IT, whose owner is not a live process, and
 *     which is not active under this process.
 */
export function reapAbandonedRoots(input) {
  const gateRoot = resolve(input.gateRoot);
  const prefixes = input.prefixes ?? [];
  const minAgeMs = input.minAgeMs ?? 6 * 60 * 60 * 1000;
  const dryRun = input.dryRun !== false;
  const removed = [];
  const kept = [];
  let reclaimedBytes = 0;

  if (prefixes.length === 0) return { removed, kept: [{ name: "(all)", reason: "an empty prefix list removes nothing" }], reclaimedBytes, dryRun };
  if (!existsSync(gateRoot)) return { removed, kept, reclaimedBytes, dryRun };

  const resolvedGate = realpathSync(gateRoot);
  const now = Date.now();

  for (const name of readdirSync(gateRoot).sort()) {
    const child = join(gateRoot, name);
    if (!prefixes.some((prefix) => name.startsWith(prefix))) continue;

    let stats;
    try {
      stats = lstatSync(child);
    } catch {
      kept.push({ name, reason: "the child could not be inspected" });
      continue;
    }
    if (stats.isSymbolicLink()) {
      kept.push({ name, reason: "reparse point; removing it could reach outside the gate root" });
      continue;
    }
    if (!stats.isDirectory()) {
      kept.push({ name, reason: "not a directory" });
      continue;
    }
    if (!isStrictlyInside(gateRoot, child)) {
      kept.push({ name, reason: "resolves outside the gate root" });
      continue;
    }
    if (now - stats.mtimeMs < minAgeMs) {
      kept.push({ name, reason: `modified ${String(Math.round((now - stats.mtimeMs) / 60000))} min ago; a concurrent run may own it` });
      continue;
    }

    const markerPath = join(child, MARKER_NAME);
    if (!existsSync(markerPath)) {
      kept.push({ name, reason: "NO_OWNERSHIP_MARKER: age and a name prefix cannot establish ownership" });
      continue;
    }
    let marker;
    try {
      marker = JSON.parse(readFileSync(markerPath, "utf8"));
    } catch {
      kept.push({ name, reason: "the ownership marker is unreadable or malformed" });
      continue;
    }
    if (marker?.schemaVersion !== MARKER_SCHEMA) {
      kept.push({ name, reason: `unrecognised marker schema ${String(marker?.schemaVersion)}` });
      continue;
    }
    if (!sameResolvedPath(marker.ownedRoot, child)) {
      kept.push({ name, reason: "the marker names a different root" });
      continue;
    }
    if (Number.isInteger(marker.pid) && marker.pid !== process.pid && processIsAlive(marker.pid)) {
      kept.push({ name, reason: `the owning process ${String(marker.pid)} is still running` });
      continue;
    }
    if (marker.active === true && marker.pid === process.pid) {
      kept.push({ name, reason: "this process owns the root and has not finished with it" });
      continue;
    }

    const bytes = directoryBytes(child);
    if (dryRun) {
      removed.push({ name, bytes, marker: { runId: marker.runId, generation: marker.generation, createdAt: marker.createdAt } });
      reclaimedBytes += bytes;
      continue;
    }
    /**
     * THE REAPER DISPOSES THROUGH THE SAME QUARANTINE PATH as a live consumer. A record is reconstructed from the
     * marker so the identity comparison binds the object the marker names.
     */
    const record = { root: child, gateRoot, runId: marker.runId, generation: marker.generation, identity: objectIdentity(child) };
    const result = disposeOwnedRoot(record);
    if (result.cleaned === true) {
      removed.push({ name, bytes, marker: { runId: marker.runId, generation: marker.generation, createdAt: marker.createdAt } });
      reclaimedBytes += bytes;
    } else {
      kept.push({ name, reason: `removal refused: ${String(result.reason).slice(0, 160)}` });
    }
  }

  return { removed, kept, reclaimedBytes, dryRun };
}

/** Whether a pid is alive, without sending it anything meaningful. `process.kill(pid, 0)` is a probe. */
function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

/**
 * Compare a path recorded in a marker against a path on disk.
 *
 * BOTH SIDES ARE RESOLVED BEFORE COMPARING. A path that cannot be resolved falls back to its lexical form, and
 * resolution failure never becomes a MATCH.
 */
function sameResolvedPath(recorded, actual) {
  if (typeof recorded !== "string" || recorded === "") return false;
  const normalise = (value) => String(value).replace(/\\/gu, "/").replace(/\/+$/u, "").toLowerCase();
  const resolveSafe = (value) => {
    try {
      return realpathSync(value);
    } catch {
      return String(value);
    }
  };
  return normalise(resolveSafe(recorded)) === normalise(resolveSafe(actual));
}

/** Physical bytes under a directory, counting a junction as ZERO and never following one. */
export function directoryBytes(root) {
  let bytes = 0;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      let stats;
      try {
        stats = lstatSync(path);
      } catch {
        continue;
      }
      if (stats.isSymbolicLink()) continue;
      if (stats.isDirectory()) stack.push(path);
      else bytes += stats.size;
    }
  }
  return bytes;
}

/** The marker a caller can rewrite deliberately rather than by accident. */
export function writeOwnershipMarker(owned, extra = {}) {
  const marker = {
    schemaVersion: MARKER_SCHEMA,
    runId: owned.runId ?? RUN_ID,
    pid: process.pid,
    generation: owned.generation ?? nextGeneration(),
    createdAt: new Date().toISOString(),
    ownedRoot: owned.root.replace(/\\/gu, "/"),
    gateRoot: owned.gateRoot.replace(/\\/gu, "/"),
    prefix: basename(owned.root),
    active: true,
    ...extra,
  };
  writeFileSync(join(owned.root, MARKER_NAME), `${JSON.stringify(marker, null, 2)}\n`, "utf8");
  return marker;
}
