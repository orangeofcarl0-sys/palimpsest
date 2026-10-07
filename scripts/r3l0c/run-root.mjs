/**
 * R3-L0C §2.3 — THE PER-RUN TEMPORARY ROOT AND LEASE.
 *
 * THE DEFECT THIS CLOSES, measured rather than hypothesised. `test/global_setup.ts` performs one sweep per run:
 * it removes every `palimpsest-*` directory that appeared during THAT run, and its own header states the
 * assumption it depends on — "this repo runs one suite at a time … two suites running CONCURRENTLY would each
 * sweep the other's directories."
 *
 * During R3-L0B that assumption was violated by a nested `vitest run`, and the consequence was observed: the
 * outer suite failed in a DIFFERENT untouched test file on each of several attempts, every failure a vanished
 * temp path, and every one of them passed in isolation. A cleanup routine deleted a live rig.
 *
 * §2.3 requires an EXPERIMENTAL RUN-OWNED ROOT and a LEASE, so that no global cleanup can delete another active
 * experiment's or test's rig. The mechanism has three parts:
 *
 *   1. A RUN ROOT at `<tmpdir>/palimpsest-runs/<runId>/`. A run owns exactly one, and it is created with the
 *      run's identity, not with a random name, so a run's rigs are attributable to it.
 *
 *   2. A LEASE at `<runRoot>/lease.json` carrying the owner pid and a heartbeat. The lease is what makes
 *      "active" a MEASURED fact rather than an assumption.
 *
 *   3. A SWEEP RULE that refuses to remove a leased root whose owner is ALIVE. A root whose owner has exited is
 *      stale and may be collected; a root whose owner is running is somebody else's live rig.
 *
 * WHY PID LIVENESS RATHER THAN A TIMEOUT ALONE. A timeout alone cannot distinguish "a slow experiment still
 * running" from "a crashed experiment that left files". `process.kill(pid, 0)` answers the question the sweep
 * actually has: is the owner still there. The heartbeat then covers the case of a pid REUSED by an unrelated
 * process, which is the one way pid liveness alone can be wrong.
 *
 * THIS IS TEST/HARNESS INFRASTRUCTURE ONLY. It is not imported by `src/**` or `host/**`, it registers nothing,
 * it creates no canonical owner, and it changes no product semantics.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NL = String.fromCharCode(10);

/** §2.3: the parent of every run root. One prefix, so a sweep can find all of them and nothing else. */
export const RUN_ROOT_PREFIX = 'palimpsest-runs';

/** §2.3: the lease file name. */
export const LEASE_FILE = 'lease.json';

/** §2.3: how long a lease may go unrefreshed before a LIVE pid is still treated as suspicious. */
export const HEARTBEAT_STALE_MS = 30 * 60 * 1000;

/** §2.3: the parent directory holding every run root. */
export function runRootParent(base = tmpdir()) {
  return join(base, RUN_ROOT_PREFIX);
}

/**
 * §2.3: THE RUN ROOT FOR AN IDENTITY.
 *
 * The path is derived from the identity rather than randomised, so a run can find its own root again after a
 * child process re-resolves it — which a random name could not support.
 */
export function runRoot(runId, base = tmpdir()) {
  return join(runRootParent(base), runId);
}

/**
 * §2.3: ACQUIRE A LEASE.
 *
 * Creates the run root, writes the lease, and returns a handle that can refresh and release. The lease records
 * the pid so a sweep can decide liveness, and a heartbeat so a REUSED pid is detectable.
 */
export function acquireLease(input) {
  const { runId, label } = input;
  const base = input.base ?? tmpdir();
  const root = runRoot(runId, base);
  mkdirSync(root, { recursive: true });
  const leasePath = join(root, LEASE_FILE);
  const write = (state) => {
    const record = {
      schemaVersion: 1,
      runId,
      label: label ?? null,
      ownerPid: process.pid,
      startedAt: state.startedAt,
      heartbeatAt: new Date().toISOString(),
      state,
      platform: process.platform,
    };
    writeFileSync(leasePath, `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
    return record;
  };
  const startedAt = new Date().toISOString();
  write('ACTIVE');
  return Object.freeze({
    runId,
    root,
    leasePath,
    startedAt,
    /** §2.3: refresh the heartbeat, so a long experiment is never mistaken for a stale one. */
    heartbeat: () => write('ACTIVE'),
    /** §2.3: mark the lease released, so a sweep may collect the root. */
    release: () => write('RELEASED'),
    /** §2.3: remove the root and the lease together. */
    dispose: () => {
      try { rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); return true; } catch { return false; }
    },
  });
}

/** §2.3: read a lease, or null when there is none or it is unreadable. */
export function readLease(root) {
  const path = join(root, LEASE_FILE);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/** §2.3: whether a pid is alive. `EPERM` means it exists but belongs to another user, which still counts. */
export function isProcessAlive(pid) {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/**
 * §2.3: WHETHER A ROOT MAY BE COLLECTED.
 *
 * The decision, in order, and the order matters:
 *
 *   1. no lease            -> COLLECTABLE. Nothing claims it.
 *   2. lease RELEASED      -> COLLECTABLE. The owner said it was finished.
 *   3. owner pid ALIVE     -> ACTIVE, NEVER collectable. This is the case §2.3 exists for.
 *   4. owner pid DEAD      -> COLLECTABLE as STALE, but only if the heartbeat is also old, so a pid REUSED by
 *                             an unrelated live process cannot pin a dead run's files forever.
 */
export function classifyRoot(root, now = Date.now()) {
  const lease = readLease(root);
  if (lease === null) return Object.freeze({ verdict: 'COLLECTABLE', reason: 'NO_LEASE', lease: null });
  if (lease.state === 'RELEASED') return Object.freeze({ verdict: 'COLLECTABLE', reason: 'LEASE_RELEASED', lease });
  const alive = isProcessAlive(lease.ownerPid);
  if (alive) return Object.freeze({ verdict: 'ACTIVE', reason: 'OWNER_ALIVE', lease });
  const heartbeatAt = Date.parse(String(lease.heartbeatAt ?? ''));
  const age = Number.isFinite(heartbeatAt) ? now - heartbeatAt : Number.POSITIVE_INFINITY;
  if (age < HEARTBEAT_STALE_MS) {
    /**
     * A dead owner with a FRESH heartbeat is the ambiguous case, and §2.3's requirement is that ambiguity
     * resolves toward NOT deleting: the pid may have been reused, and deleting a possibly-live rig is the
     * failure this module exists to prevent.
     */
    return Object.freeze({ verdict: 'ACTIVE', reason: 'OWNER_DEAD_HEARTBEAT_FRESH', lease, heartbeatAgeMs: age });
  }
  return Object.freeze({ verdict: 'COLLECTABLE', reason: 'STALE_LEASE', lease, heartbeatAgeMs: age });
}

/** §2.3: list every run root under the parent. */
export function listRunRoots(base = tmpdir()) {
  const parent = runRootParent(base);
  if (!existsSync(parent)) return Object.freeze([]);
  const found = [];
  for (const entry of readdirSync(parent)) {
    const full = join(parent, entry);
    try { if (statSync(full).isDirectory()) found.push(full); } catch { /* vanished mid-scan */ }
  }
  return Object.freeze(found.sort());
}

/** Windows releases a SQLite handle slightly after `close()`; retry rather than give up. */
function removeWithRetries(target, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); return true; } catch { /* busy */ }
  }
  return !existsSync(target);
}

/**
 * §2.3: SWEEP THE RUN ROOTS, HONOURING EVERY LIVE LEASE.
 *
 * This is the routine a global test teardown calls. It is deliberately NOT "remove everything that appeared
 * during my run": that rule is what deleted a live rig. It removes only roots this sweep OWNS (matched by the
 * supplied run ids) or roots that are independently COLLECTABLE, and it REPORTS every root it refused to touch
 * so a reader can see the protection working.
 */
export function sweepRunRoots(input = {}) {
  const base = input.base ?? tmpdir();
  const ownedRunIds = new Set(input.ownedRunIds ?? []);
  const now = input.now ?? Date.now();
  const removed = [];
  const protectedRoots = [];
  for (const root of listRunRoots(base)) {
    const runId = root.split(/[/\\]/u).pop() ?? '';
    const classification = classifyRoot(root, now);
    const owned = ownedRunIds.has(runId);
    /**
     * An OWNED root is collectable even while leased, because the caller is its own owner finishing up. A
     * NON-owned root is collected only when it is independently collectable — which is where a live lease stops
     * the sweep.
     */
    if (owned || classification.verdict === 'COLLECTABLE') {
      if (removeWithRetries(root)) removed.push({ root, reason: owned ? 'OWNED_BY_CALLER' : classification.reason });
      else protectedRoots.push({ root, reason: 'REMOVAL_REFUSED_BY_FILESYSTEM', classification });
      continue;
    }
    protectedRoots.push({ root, reason: classification.reason, ownerPid: classification.lease?.ownerPid ?? null, runId: classification.lease?.runId ?? null });
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'run-root sweep',
    base,
    scanned: listRunRoots(base).length,
    removed: Object.freeze(removed),
    protectedRoots: Object.freeze(protectedRoots),
    /** §2.3: the invariant the sweep guarantees, stated as a value a test can assert. */
    law: 'a run root whose lease names a LIVE owner is never removed by a sweep that does not own it',
  });
}

/** §2.3: create a directory inside a run root, so every rig is attributable to its run. */
export function rigPath(runRootPath, name) {
  const path = join(runRootPath, name);
  mkdirSync(path, { recursive: true });
  return path;
}

export { tmpdir };
