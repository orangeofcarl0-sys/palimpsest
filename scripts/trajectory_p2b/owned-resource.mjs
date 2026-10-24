/**
 * Host-S1RA RA-B — OWNED TEST RESOURCES: ALLOCATION, REVALIDATION, RETRY AND REAPING.
 *
 * FOUR MEASURED DEFECTS MOTIVATE THIS MODULE (RA-0, all reproduced):
 *
 *   F3  A root replaced after allocation was still deleted. `allocateOwnedRoot` computed `contained` and
 *       `isReparse` ONCE and the lifetime helper trusted those cached booleans, so a foreign directory placed at
 *       the same path had its contents removed.
 *   F4  One EPERM marked the root disposed FOREVER. The third call after the Windows handle was released did not
 *       retry, converting a transient lock into a permanent leak.
 *   F5  `dispose()` removed the `exit` listener but left SIGINT and SIGTERM registered: three allocations leaked
 *       three of each.
 *   F6  The reaper selected a directory on name prefix and modification time alone, including one carrying
 *       ANOTHER run's ownership marker.
 *
 * THE MODEL THIS MODULE IMPLEMENTS.
 *
 *   ALLOCATION writes a marker recording the run, the process, the timestamp and the resolved root. The marker is
 *   an aid to diagnosis; it is NEVER sufficient on its own, because a marker file can be copied.
 *
 *   IDENTITY is captured at allocation as the object's `dev`/`ino` pair where the platform supplies them. This is
 *   the part the cached booleans lacked: it answers "is this still the same directory object", not "was the path
 *   once inside the root".
 *
 *   DELETION re-proves, immediately before removing anything: the path is still inside the gate root, it is not a
 *   reparse point NOW, and its `dev`/`ino` still match the recorded identity. Any mismatch PRESERVES the directory
 *   and says why.
 *
 *   RETRY is allowed while ownership still holds, is BOUNDED, and never rewrites the original failure reason.
 *
 * NOT A PRODUCT COMPONENT. PLAIN JAVASCRIPT (`.mjs`), bare node.
 */
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

export const MARKER_NAME = ".palimpsest-owned.json";
export const MARKER_SCHEMA = 1;

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
 * The returned record is what the lifetime helper consumes. It carries the identity captured HERE so a later
 * deletion can compare, and it records whether that identity is strong enough to be decisive.
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

  const marker = {
    schemaVersion: MARKER_SCHEMA,
    runId: RUN_ID,
    pid: process.pid,
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
    /** A root that cannot carry its marker is still owned by THIS process, but a reaper could never prove it. */
    markerWritten = false;
  }

  return { root: resolvedRoot, gateRoot: resolvedGate, contained, isReparse: identity?.isReparsePoint === true, identity, marker, markerWritten, runId: RUN_ID };
}

/**
 * Re-prove ownership immediately before deleting.
 *
 * Returns `{ owned: true }` only when every check passes. The `checks` array is returned in all cases so a receipt
 * can record WHY a directory was preserved instead of a bare boolean.
 */
export function revalidateOwnership(owned) {
  const checks = [];
  const fail = (check, detail) => {
    checks.push({ check, passed: false, detail });
    return { owned: false, checks, reason: detail };
  };

  if (owned === null || typeof owned !== "object") return fail("record", "no ownership record was supplied");
  checks.push({ check: "record", passed: true, detail: `run ${String(owned.runId)}` });

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
     * allowed only because containment and the absence of a reparse point were proved directly. Saying so is the
     * difference between a bounded limitation and a silent assumption.
     */
    checks.push({ check: "identityMatch", passed: true, detail: "WEAK: the platform did not supply a usable inode, so identity is limited to object kind at the same path" });
  } else {
    checks.push({ check: "identityMatch", passed: true, detail: "dev/ino match the allocation" });
  }

  /** 4. A marker, if present, must name THIS run. A foreign marker is a refusal, not a re-allocation. */
  const markerPath = join(owned.root, MARKER_NAME);
  if (existsSync(markerPath)) {
    try {
      const marker = JSON.parse(readFileSync(markerPath, "utf8"));
      if (marker?.runId !== owned.runId) return fail("marker", `the marker names run ${String(marker?.runId)}, not this run`);
      checks.push({ check: "marker", passed: true, detail: `marker names this run` });
    } catch {
      return fail("marker", "the marker is unreadable or malformed");
    }
  } else {
    checks.push({ check: "marker", passed: true, detail: "no marker present; ownership rests on the captured identity" });
  }

  return { owned: true, checks };
}

/**
 * A run-owned root that reclaims itself on every exit path, with revalidated deletion and bounded retry.
 *
 * DIFFERENCES FROM THE SUPERSEDED HELPER, each tied to a measured defect:
 *
 *   · `disposed` no longer latches on failure (F4). A failed attempt leaves the record RETRYABLE while ownership
 *     still holds, up to `maxAttempts`, and the FIRST failure reason is preserved.
 *   · every listener installed is removed by `dispose()`, including SIGINT and SIGTERM (F5).
 *   · deletion revalidates identity rather than trusting cached booleans (F3).
 *
 * Signal handling is a best-effort reclamation on this process's own exit. It cannot run after SIGKILL, and this
 * comment is the honest statement of that limit rather than a claim of guaranteed cleanup.
 */
export function ownedRootLifetime(owned, options = {}) {
  const maxAttempts = options.maxAttempts ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 0;
  const preserveOnFailure = options.preserveOnFailure ?? true;

  let attempts = 0;
  let outcome = null;
  let firstFailureReason = null;
  let listenersInstalled = [];

  const attemptReclaim = () => {
    if (outcome?.cleaned === true) return outcome;
    if (attempts >= maxAttempts) {
      outcome = { cleaned: false, attempts, reason: firstFailureReason ?? "attempt budget exhausted", preserved: preserveOnFailure };
      return outcome;
    }
    attempts += 1;

    const proof = revalidateOwnership(owned);
    if (proof.owned !== true) {
      /** A refused deletion is FINAL: ownership cannot be re-established by retrying. */
      outcome = { cleaned: false, attempts, reason: proof.reason, checks: proof.checks, preserved: true, refused: true };
      return outcome;
    }

    try {
      rmSync(owned.root, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      outcome = { cleaned: true, attempts, checks: proof.checks };
      return outcome;
    } catch (error) {
      const reason = String(error?.message ?? error).slice(0, 300);
      if (firstFailureReason === null) firstFailureReason = reason;
      /**
       * RETRYABLE, NOT DISPOSED. The record is left in a state a later call can retry, which is what F4 measured
       * as missing. `outcome` still reports failure so no caller can mistake this for success.
       */
      outcome = { cleaned: false, attempts, reason: firstFailureReason, lastError: reason, retryable: attempts < maxAttempts, preserved: true };
      return outcome;
    }
  };

  const onExit = () => {
    attemptReclaim();
  };
  const onSignal = (signal) => {
    attemptReclaim();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };

  /** `process.on` (not `once`) so `dispose()` can remove them by reference; removal is what F5 required. */
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
    /**
     * Reclaim now and REMOVE EVERY LISTENER INSTALLED. Idempotent: a second call returns the recorded outcome
     * without deleting twice, but a FAILED first attempt can still be retried by calling again.
     */
    dispose: () => {
      const result = attemptReclaim();
      for (const [event, handler] of listenersInstalled) process.removeListener(event, handler);
      listenersInstalled = [];
      if (retryDelayMs > 0 && result.cleaned !== true && result.retryable === true) {
        /** Synchronous disposal cannot await; the delay is a spin, bounded by `maxAttempts`. */
        const until = Date.now() + retryDelayMs;
        while (Date.now() < until) {
          /* bounded spin, deliberately */
        }
      }
      return result;
    },
    /** Retry explicitly, for a caller that has released whatever held the handle. */
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
 *   · it is older than `minAgeMs` (a concurrent run must not be pulled out from under itself);
 *   · AND it carries a marker whose schema is recognised and whose `runId` is not a live process.
 *
 * The last condition is what F6 measured as absent: prefix plus age selected a directory carrying ANOTHER run's
 * marker. A directory with NO marker is now PRESERVED, because there is no ownership record to verify.
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

    /**
     * OWNERSHIP. This is the precondition F6 lacked. No marker means no verifiable ownership, so the candidate is
     * PRESERVED — being old and correctly named is not evidence that this project created it.
     */
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
    /** A marker written by a process that is still alive belongs to a live run. */
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
      removed.push({ name, bytes, marker: { runId: marker.runId, createdAt: marker.createdAt } });
      reclaimedBytes += bytes;
      continue;
    }
    try {
      rmSync(child, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      removed.push({ name, bytes, marker: { runId: marker.runId, createdAt: marker.createdAt } });
      reclaimedBytes += bytes;
    } catch (error) {
      kept.push({ name, reason: `removal failed: ${String(error?.message ?? error).slice(0, 160)}` });
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
 * BOTH SIDES ARE RESOLVED BEFORE COMPARING, which is the part that was wrong: `allocateOwnedRoot` records
 * `realpathSync(root)`, so a lexical comparison against the unresolved child fails even when they name the same
 * directory — and a `mkdtemp` name under a redirected gate root is exactly such a case. Separators and case are
 * normalised as well.
 *
 * A path that cannot be resolved falls back to its lexical form. Resolution failure never becomes a MATCH.
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

/** The marker a reaper reads, exposed so a caller can write one deliberately rather than by accident. */
export function writeOwnershipMarker(owned, extra = {}) {
  const marker = {
    schemaVersion: MARKER_SCHEMA,
    runId: owned.runId ?? RUN_ID,
    pid: process.pid,
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
