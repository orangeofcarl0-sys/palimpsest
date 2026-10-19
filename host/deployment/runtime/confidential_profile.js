// palimpsest-host-deployment/runtime — THE CONFIDENTIAL WORKER PROFILE: AT MOST ONE ACTIVE WORKER.
//
// WHY A CAPACITY LIMIT IS A CONFIDENTIALITY MECHANISM.
//
// R1-HR measured that a worker's own workspace write grant is the LAST writer of its world's label: while a
// worker runs, its world reads Low + NO_WRITE_UP rather than Medium + NO_READ_UP. Two worlds that are both
// ACTIVE are therefore both unprotected from raw code, and each worker can read the other's content. Labelling
// cannot fix it — the grant that makes a world writable is the same write that removes the read fence, and it
// runs on every confined spawn.
//
// So the honest answer for THIS backend is a CAPACITY limit rather than a stronger label: the Windows
// confidential profile runs AT MOST ONE real Work worker at a time. With one worker active, there is no other
// active world to read, and every inactive world keeps its standing label.
//
// THIS IS HOST EXECUTION CAPACITY. It is NOT:
//   · Project Work authority — the canonical project may still expose several runnable tasks;
//   · StageGraph concurrency — the canonical scheduler's semantics are untouched;
//   · a canonical lock, store, event or lease — nothing is persisted and nothing is admitted.
//
// The canonical project keeps its concurrency. The HOST simply declines to run two confidential workers at
// once, which is a statement about this machine's capability rather than about the work.
//
// THE REFUSAL IS HONEST. When a second worker is requested while one is active, this module either waits for
// the existing host-delegation queue or returns a capacity refusal. It never fails the canonical attempt,
// never grants authority, and never rewrites a task: the caller sees a host-capacity fact and the work stays
// exactly as it was.
//
// PLAIN JAVASCRIPT. `host/**` is scanned by the architecture checker as JavaScript.

import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';

/**
 * @typedef {{ readonly adapterId: string, readonly run: (input: any) => Promise<any> }} WorkWorkerPortLike
 * @typedef {{ readonly admitted: boolean, readonly active: number, readonly detail: string }} Admission
 */

/**
 * The confidential profile's capacity, stated as data so a caller can report it rather than infer it.
 *
 * `maxActiveWorkers: 1` is the whole mechanism. It is one because the backend cannot separate two ACTIVE
 * worlds, not because one is a preference.
 */
export const CONFIDENTIAL_PROFILE = Object.freeze({
  id: 'windows-confidential-single-active',
  maxActiveWorkers: 1,
  /** What a deployment may still do concurrently, stated so the limit is not mistaken for a work limit. */
  canonicalConcurrencyUnaffected: true,
  reason: 'a worker\'s own workspace write grant is the last writer of its world label, so two ACTIVE worlds cannot both be read-fenced; the host therefore serializes confidential workers',
});

/**
 * Wrap a worker port so at most `maxActiveWorkers` runs are ACTIVE at once.
 *
 * THE WRAPPER IS THE WHOLE CHANGE, and it is deliberately thin: it counts, it waits or refuses, and it
 * delegates every other behaviour unchanged. The port's own semantics — spawn, timeout, pull channel, result
 * parsing — are untouched, so nothing about Work changes shape.
 *
 * TWO POLICIES, and the caller chooses because the choice is a deployment property:
 *
 *   `wait` (the default) — a second request QUEUES until a slot frees. This is the better default when the
 *   caller already has a queue, because it preserves throughput: the second worker still runs, just later.
 *
 *   `refuse` — a second request returns a capacity refusal immediately. This is the honest answer when no
 *   queue exists, because inventing one would mean holding work the host has not been asked to hold.
 *
 * Either way the refusal is a HOST failure shape, never a Work outcome: no attempt is failed, no authority is
 * granted, and no task is rewritten.
 *
 * @param {{ port: WorkWorkerPortLike, maxActiveWorkers?: number, policy?: 'wait' | 'refuse', onRefusal?: (detail: string) => void }} input
 * @returns {WorkWorkerPortLike & { readonly activeCount: () => number, readonly peakActive: () => number, readonly capacityRefusals: () => number, readonly waited: () => number }}
 */
export function serializeConfidentialWorkers(input) {
  const max = input.maxActiveWorkers ?? CONFIDENTIAL_PROFILE.maxActiveWorkers;
  const policy = input.policy ?? 'wait';
  let active = 0;
  let peak = 0;
  let refusals = 0;
  let waits = 0;
  /** @type {(() => void)[]} */
  const waiters = [];

  /** Release one slot and hand it to the longest-waiting caller. */
  const release = () => {
    active -= 1;
    const next = waiters.shift();
    if (next !== undefined) next();
  };

  /** Wait until a slot is free, or return immediately when one already is. */
  const acquire = async () => {
    if (active < max) return;
    waits += 1;
    await new Promise((resolveWaiter) => {
      waiters.push(() => resolveWaiter(undefined));
    });
  };

  return {
    adapterId: input.port.adapterId,
    async run(runInput) {
      if (active >= max) {
        if (policy === 'refuse') {
          refusals += 1;
          const detail = `the ${CONFIDENTIAL_PROFILE.id} profile runs at most ${String(max)} ACTIVE work worker(s); ${String(active)} is already running. This is a HOST CAPACITY fact, not a Work outcome: no attempt was failed, no authority was granted, and the task is unchanged.`;
          input.onRefusal?.(detail);
          // A host-capacity refusal, in the SAME shape the port uses for its own host failures, so the
          // caller's existing handling applies and nothing new has to understand it.
          return { kind: 'HOST_FAILURE', detail };
        }
        await acquire();
      }
      active += 1;
      if (active > peak) peak = active;
      try {
        return await input.port.run(runInput);
      } finally {
        release();
      }
    },
    activeCount: () => active,
    peakActive: () => peak,
    capacityRefusals: () => refusals,
    waited: () => waits,
  };
}

/**
 * The admission question, answerable without running anything.
 *
 * A host uses this to decide whether to start a confidential worker at all. It is separate from the wrapper
 * because a caller may want to REPORT capacity before it has a run to make.
 *
 * @param {{ active: number, maxActiveWorkers?: number }} input
 * @returns {Admission}
 */
export function admitConfidentialWorker(input) {
  const max = input.maxActiveWorkers ?? CONFIDENTIAL_PROFILE.maxActiveWorkers;
  const admitted = input.active < max;
  return {
    admitted,
    active: input.active,
    detail: admitted
      ? `${String(input.active)}/${String(max)} confidential workers active; admission granted`
      : `${String(input.active)}/${String(max)} confidential workers active; admission refused — a second ACTIVE world cannot be read-fenced on this backend`,
  };
}

/**
 * A HOST-LOCAL, CROSS-PROCESS admission slot for one confidential worker.
 *
 * The in-process wrapper above is enough when one host process runs the workers, but a worker is its own OS
 * process, so the capacity claim has to survive across processes. This uses a single file in the HOST's own
 * directory, and it is deliberately NOT canonical:
 *
 *   · it lives beside the host's session material, never in a Palimpsest store;
 *   · it carries no semantics — a pid and a timestamp, for identification only;
 *   · nothing about Work reads it, and losing it changes no canonical fact.
 *
 * E1RG RG-C §6.3: ACQUISITION IS NOW ATOMIC, AND THE MECHANISM IS AN OS PRIMITIVE.
 *
 * MEASURED ON THE PARENT COMMIT (`rg0-findings.json` F6). `acquire()` read the slot file, compared the holder
 * count, then OVERWROTE the file. Two processes that both read before either wrote both saw zero holders and
 * both were granted the only slot. That is a read-check-write window with no exclusive step, and it is exactly
 * the window a security limit cannot have: R1-HC established that two ACTIVE worlds cannot both be read-fenced
 * on this backend, so admitting two is a confidentiality failure, not a throughput hiccup.
 *
 * THE PRIMITIVE: `mkdir`. Creating a directory is ATOMIC on NTFS — exactly one caller succeeds and every other
 * receives EEXIST — and it needs no dependency, no service and no lock API that behaves differently per
 * platform. The lock directory is `active.lock` beside the record; holding it is the exclusive right to read,
 * decide and write the holder list. The critical section is therefore:
 *
 *     mkdir(lock) -> read holders -> decide -> write holders -> rmdir(lock)
 *
 * and two concurrent acquirers cannot both be inside it.
 *
 * E1RG RG-C §6.4: A LIVE HOLDER IS NEVER EVICTED BY A TIMESTAMP.
 *
 * The previous `staleAfterMs` dropped a holder whose record was older than a fixed age, even when the process
 * was demonstrably alive. A long-running worker would silently lose its protection and a second worker would be
 * admitted alongside it — the exact overlap the limit exists to prevent. Liveness is now decided ONLY by
 * whether the pid still exists; `staleAfterMs` is retained in the signature for compatibility and is recorded,
 * but it no longer evicts a live process.
 *
 * E1RG RG-C §6.5: CRASH RECOVERY IS SAFE AND EXPLICIT.
 *
 * A holder whose process is GONE is recovered — otherwise a crash would block work forever. The lock directory
 * itself is recovered only when it is older than `lockStaleMs` AND its recorded owner is gone; a lock whose
 * owner is still alive is never removed, because deleting a live lock would let two writers in.
 *
 * @param {{ home: string, maxActiveWorkers?: number, staleAfterMs?: number, lockStaleMs?: number, lockTimeoutMs?: number }} input
 * @returns {{
 *   acquire: () => { granted: boolean, detail: string },
 *   release: () => { released: boolean, detail: string },
 *   peek: () => { active: number, detail: string },
 *   mechanism: string,
 * }}
 */
export function openConfidentialSlot(input) {
  const max = input.maxActiveWorkers ?? CONFIDENTIAL_PROFILE.maxActiveWorkers;
  const staleAfterMs = input.staleAfterMs ?? 6 * 60 * 60 * 1000;
  /** How long a lock directory may exist before it is considered abandoned. */
  const lockStaleMs = input.lockStaleMs ?? 30_000;
  const lockTimeoutMs = input.lockTimeoutMs ?? 5_000;
  const slotDir = resolve(input.home, "confidential-workers");
  const slotPath = join(slotDir, "active.json");
  const lockDir = join(slotDir, "active.lock");
  /** A per-instance token, so a release can prove it refers to the holder it recorded. */
  const ownerToken = `${String(process.pid)}-${randomUUID()}`;
  let held = false;

  /**
   * IS A PID ALIVE? `kill(pid, 0)` sends no signal and reports whether the process exists. ESRCH means it is
   * gone; EPERM means it exists but belongs to another user, which is still ALIVE. A pid of our own process is
   * always alive.
   */
  const isAlive = (pid) => {
    if (pid === process.pid) return true;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error?.code === "EPERM";
    }
  };

  /** Read the holders. An unreadable or malformed record is NOT evidence of zero holders (§6.4 fail-closed). */
  const readHolders = () => {
    let raw;
    try {
      raw = readFileSync(slotPath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return { ok: true, holders: [] };
      return { ok: false, holders: [], detail: `the capacity record could not be read (${String(error?.code ?? error)})` };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, holders: [], detail: "the capacity record is not valid JSON" };
    }
    if (parsed === null || typeof parsed !== "object" || !Array.isArray(parsed.holders)) {
      return { ok: false, holders: [], detail: "the capacity record has no holders array" };
    }
    return { ok: true, holders: parsed.holders };
  };

  /** Keep only holders that are still ALIVE. Liveness is the only eviction rule. */
  const liveHolders = (list) =>
    list.filter((entry) => {
      if (entry === null || typeof entry !== "object") return false;
      if (typeof entry.pid !== "number") return false;
      return isAlive(entry.pid);
    });

  /** Write the holder list atomically: a temp file then a rename, so a reader never sees a partial record. */
  const write = (list) => {
    mkdirSync(slotDir, { recursive: true });
    const temp = `${slotPath}.${ownerToken}.tmp`;
    writeFileSync(temp, JSON.stringify({ holders: list, profile: CONFIDENTIAL_PROFILE.id }), "utf8");
    renameSync(temp, slotPath);
  };

  /**
   * TAKE THE EXCLUSIVE LOCK. `mkdir` is the atomic step: exactly one caller creates it.
   *
   * An existing lock is abandoned only when it is OLD and its recorded owner is GONE. A lock whose owner is
   * alive is never removed — that would admit a second writer into the critical section.
   */
  const takeLock = () => {
    /**
     * THE LOCK LIVES INSIDE THE SLOT DIRECTORY, so that directory must exist before the atomic `mkdir`. Creating
     * it with `recursive` is itself idempotent, and it happens OUTSIDE the critical section (the lock is what
     * defines the section), so this cannot admit two writers.
     */
    mkdirSync(slotDir, { recursive: true });
    const startedAt = Date.now();
    for (;;) {
      try {
        mkdirSync(lockDir);
        writeFileSync(join(lockDir, "owner.json"), JSON.stringify({ pid: process.pid, token: ownerToken, at: Date.now() }), "utf8");
        return { acquired: true };
      } catch (error) {
        if (error?.code !== "EEXIST") return { acquired: false, detail: `the capacity lock could not be created (${String(error?.code ?? error)})` };
      }
      /** Somebody holds it. Decide whether it is abandoned. */
      let owner = null;
      let age = 0;
      try {
        owner = JSON.parse(readFileSync(join(lockDir, "owner.json"), "utf8"));
      } catch {
        owner = null;
      }
      try {
        age = Date.now() - statSync(lockDir).mtimeMs;
      } catch {
        age = 0;
      }
      const ownerAlive = owner !== null && typeof owner.pid === "number" ? isAlive(owner.pid) : false;
      if (!ownerAlive && age > lockStaleMs) {
        /**
         * ABANDONED: no live owner and older than the bound. Removed by name, and the removal is itself racy
         * (two recoverers can both try), so a failure simply retries the loop.
         */
        try {
          rmSync(lockDir, { recursive: true, force: true });
        } catch {
          /* another recoverer won */
        }
        continue;
      }
      if (Date.now() - startedAt > lockTimeoutMs) {
        return { acquired: false, detail: `the capacity lock is held by a live owner (pid ${String(owner?.pid ?? "unknown")}) and was not acquired within ${String(lockTimeoutMs)}ms` };
      }
      /** Bounded wait: a short sleep keeps this synchronous, which is what the caller requires. */
      const until = Date.now() + 10;
      while (Date.now() < until) {
        /* spin — the critical section is a few file operations */
      }
    }
  };

  const releaseLock = () => {
    try {
      /** Only remove OUR lock: a lock whose owner token differs belongs to someone else. */
      const owner = JSON.parse(readFileSync(join(lockDir, "owner.json"), "utf8"));
      if (owner?.token !== ownerToken) return;
      rmSync(lockDir, { recursive: true, force: true });
    } catch {
      /* the lock is already gone */
    }
  };

  return {
    /** The ownership mechanism, stated as data so a receipt can name it. */
    mechanism: "mkdir-exclusive-lock",
    acquire() {
      const lock = takeLock();
      if (lock.acquired !== true) {
        return { granted: false, detail: `${lock.detail ?? "the capacity lock was not acquired"}. This is a HOST CAPACITY fact: no attempt was failed, no authority was granted, and the task is unchanged.` };
      }
      try {
        const read = readHolders();
        if (read.ok !== true) {
          /** §6.4: an unreadable or malformed record does not grant capacity. */
          return { granted: false, detail: `${String(read.detail)}, so capacity cannot be established. This is a HOST CAPACITY fact: no attempt was failed and no authority was granted.` };
        }
        const live = liveHolders(read.holders);
        if (live.length >= max) {
          return {
            granted: false,
            detail: `the ${CONFIDENTIAL_PROFILE.id} profile runs at most ${String(max)} ACTIVE work worker(s); ${String(live.length)} already active (pids ${live.map((entry) => String(entry.pid)).join(", ")}). This is a HOST CAPACITY fact: no attempt was failed, no authority was granted, and the task is unchanged.`,
          };
        }
        write([...live, { pid: process.pid, at: Date.now(), token: ownerToken }]);
        held = true;
        return { granted: true, detail: `${String(live.length + 1)}/${String(max)} confidential workers active; admission granted` };
      } finally {
        releaseLock();
      }
    },
    release() {
      if (!held) return { released: false, detail: "this handle holds no slot" };
      held = false;
      const lock = takeLock();
      if (lock.acquired !== true) return { released: false, detail: `the slot was not released: ${String(lock.detail)}` };
      try {
        const read = readHolders();
        /**
         * §6.5: RELEASE REFERS TO THE HOLDER IT RECORDED. A release by a handle that did not record this token
         * cannot remove somebody else's entry.
         */
        const remaining = (read.ok === true ? read.holders : []).filter((entry) => entry?.token !== ownerToken);
        write(remaining);
        return { released: true, detail: `${String(remaining.length)}/${String(max)} confidential workers remain active` };
      } catch (error) {
        return { released: false, detail: `the slot was not released: ${error?.message ?? String(error)}` };
      } finally {
        releaseLock();
      }
    },
    peek() {
      const read = readHolders();
      if (read.ok !== true) return { active: -1, detail: `${String(read.detail)}; capacity is UNKNOWN` };
      const live = liveHolders(read.holders);
      return { active: live.length, detail: `${String(live.length)}/${String(max)} confidential workers active` };
    },
  };
}
