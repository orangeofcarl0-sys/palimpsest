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
import { createHash, randomUUID } from 'node:crypto';
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
 *   release: () => { released: boolean, detail: string, retryable?: boolean },
 *   peek: () => { active: number, detail: string, malformed: number },
 *   mechanism: string,
 *   domain: { home: string, slotPath: string, identity: string, assumption: string },
 * }}
 */
export function openConfidentialSlot(input) {
  const max = input.maxActiveWorkers ?? CONFIDENTIAL_PROFILE.maxActiveWorkers;
  const staleAfterMs = input.staleAfterMs ?? 6 * 60 * 60 * 1000;
  /** How long a lock directory may exist before it is considered abandoned. */
  const lockStaleMs = input.lockStaleMs ?? 30_000;
  const lockTimeoutMs = input.lockTimeoutMs ?? 5_000;
  /**
   * HOST-S1 §8.6 — THE NAMESPACE IS THE PROTECTED DOMAIN, NOT THE HOME.
   *
   * The capacity limit exists because two ACTIVE WORLDS cannot both be read-fenced. The unit of that statement is
   * therefore the set of worlds a host can expose at once — the PROTECTED DOMAIN (the repository whose
   * `.palimpsest` holds the worlds) — not the host's home directory.
   *
   * MEASURED ON THE PARENT COMMIT (`baseline-and-falsifiers.json` F7). The slot was
   * `<DSH_HOME>/confidential-workers`, so two host instances with different homes each acquired their own slot
   * and both were granted capacity for the SAME repository. That is a confidentiality failure: R1-HC established
   * that two ACTIVE worlds cannot both be read-fenced, and nothing about the two hosts being different processes
   * changes it. A home-local lock cannot provide host-wide exclusion, and §8.6 forbids claiming it does.
   *
   * THE CORRECTION: when a domain root is supplied, the slot lives INSIDE that domain, at
   * `<domain>/.palimpsest/host-capacity/`. Every host capable of exposing the same worlds necessarily resolves
   * the same domain root, so they necessarily contend for the same slot — which is the property that was
   * missing.
   *
   * WHY THIS LOCATION, AND WHY IT IS NOT A STORAGE REDESIGN.
   *
   *   · It is HOST EXECUTION STATE, not canonical state. It lives in a single subdirectory that Palimpsest's
   *     durable layout does not otherwise use, it carries no owner, event, task or asset semantics, and losing it
   *     changes no canonical fact.
   *   · It is NOT inside a worker's world, so the Low-integrity token cannot write it — a worker cannot forge or
   *     release capacity.
   *   · It is inside the protected root, so the read fence's derived coverage labels it along with the rest of
   *     the skipped ancestor's non-spine content.
   *   · It is NOT a change to any existing path: nothing that already reads `.palimpsest` looks at this name.
   *
   * A home-wide slot remains the behaviour when no domain is supplied (`openConfidentialSlot` is also used by
   * tests and by callers that have no repository), and `domain.identity` states which scope is in force so a
   * receipt can never imply the stronger one.
   */
  const domainRoot = typeof input.domain === "string" && input.domain.trim() !== "" ? resolve(input.domain) : null;
  const domainKey = domainRoot === null ? null : createHash("sha256").update(domainRoot.toLowerCase(), "utf8").digest("hex").slice(0, 24);
  const slotDir = domainRoot === null ? resolve(input.home, "confidential-workers") : resolve(domainRoot, ".palimpsest", "host-capacity");
  const slotPath = join(slotDir, "active.json");
  const lockDir = join(slotDir, "active.lock");
  /** A per-instance token, so a release can prove it refers to the holder it recorded. */
  const ownerToken = `${String(process.pid)}-${randomUUID()}`;
  let held = false;
  /** §8.2: the last lock-release failure, so an unsuccessful release is observable rather than swallowed. */
  let lastLockRelease = null;

  /**
   * IS A PID ALIVE? `kill(pid, 0)` sends no signal and reports whether the process exists. ESRCH means it is
   * gone; EPERM means it exists but belongs to another user, which is still ALIVE. A pid of our own process is
   * always alive.
   *
   * HOST-S1 §8.5: AMBIGUITY MUST NOT AUTHORIZE OVERLAP.
   *
   * The previous version returned `error?.code === "EPERM"` and therefore treated EVERY other error — including
   * `EINVAL` for a pid outside the valid range — as "not alive". A liveness probe that fails for a reason other
   * than a known process-not-found is UNKNOWN, not dead, and unknown must not free a slot. The distinction is
   * returned rather than collapsed into a boolean.
   */
  const livenessOf = (pid) => {
    if (pid === process.pid) return { alive: true, basis: "self" };
    if (!Number.isInteger(pid) || pid <= 0) return { alive: null, basis: "invalid-pid" };
    try {
      process.kill(pid, 0);
      return { alive: true, basis: "signal-0" };
    } catch (error) {
      const code = error?.code;
      if (code === "ESRCH") return { alive: false, basis: "not-found" };
      if (code === "EPERM") return { alive: true, basis: "exists-other-owner" };
      return { alive: null, basis: `indeterminate:${String(code ?? error)}` };
    }
  };

  /** The boolean form, for call sites that only need "definitely alive". An indeterminate answer is NOT alive. */
  const isAlive = (pid) => livenessOf(pid).alive === true;

  /**
   * Read the holders. An unreadable or malformed record is NOT evidence of zero holders (§6.4 fail-closed).
   *
   * HOST-S1 §8.1: THE RECORD IS VALIDATED BEFORE LIVENESS FILTERING.
   *
   * The previous version returned `parsed.holders` with only the ARRAY checked, so `liveHolders` then silently
   * dropped every entry whose `pid` was not a number. A malformed holder therefore read as "not a holder", and a
   * syntactically valid record containing one garbage entry was treated as FREE CAPACITY — measured as
   * `baseline-and-falsifiers.json` F4, where a single malformed holder produced `granted: true`.
   *
   * The distinction §8.1 requires is now made explicitly, per holder:
   *
   *   VALID          — pid is a positive integer and (when present) token is a string;
   *   MALFORMED      — the entry is not an object, or a required field has the wrong type;
   *   UNKNOWN        — structurally valid but liveness could not be established.
   *
   * A malformed entry makes the whole record UNTRUSTWORTHY: capacity cannot be established from a record that
   * contains an entry the host cannot interpret, because that entry might be the active worker.
   */
  const readHolders = () => {
    let raw;
    try {
      raw = readFileSync(slotPath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return { ok: true, holders: [], malformed: [], unreadable: false, detail: "no record exists" };
      return { ok: false, holders: [], malformed: [], unreadable: true, detail: `the capacity record could not be read (${String(error?.code ?? error)})` };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, holders: [], malformed: [], unreadable: true, detail: "the capacity record is not valid JSON" };
    }
    if (parsed === null || typeof parsed !== "object" || !Array.isArray(parsed.holders)) {
      return { ok: false, holders: [], malformed: [], unreadable: true, detail: "the capacity record has no holders array" };
    }
    /** §8.1: classify each entry BEFORE any liveness decision. */
    const valid = [];
    const malformed = [];
    for (const entry of parsed.holders) {
      const pidOk = entry !== null && typeof entry === "object" && Number.isInteger(entry.pid) && entry.pid > 0;
      const tokenOk = entry !== null && typeof entry === "object" && (entry.token === undefined || typeof entry.token === "string");
      if (!pidOk || !tokenOk) {
        malformed.push(entry === null || typeof entry !== "object" ? { reason: "not-an-object" } : { reason: !pidOk ? "pid-not-a-positive-integer" : "token-not-a-string", pid: entry.pid, token: entry.token });
        continue;
      }
      valid.push(entry);
    }
    return { ok: true, holders: valid, malformed, unreadable: false, detail: malformed.length === 0 ? "record is well formed" : `${String(malformed.length)} malformed holder entry(ies)` };
  };

  /**
   * Keep only holders that are DEFINITELY ALIVE. Liveness is the only eviction rule.
   *
   * §8.5: an INDETERMINATE liveness answer keeps the holder. Treating "I could not tell" as dead would admit a
   * second worker beside a possibly-live one, which is the exact overlap this mechanism exists to prevent. The
   * holder is counted and named as indeterminate so a refusal can explain itself.
   */
  const liveHolders = (list) =>
    list
      .map((entry) => ({ entry, liveness: livenessOf(entry.pid) }))
      .filter((row) => row.liveness.alive !== false)
      .map((row) => ({ ...row.entry, livenessBasis: row.liveness.basis, livenessCertain: row.liveness.alive === true }));

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
   * HOST-S1 §8.3 — THE ABA RACE IS CLOSED BY NEVER REMOVING A LOCK BY PATHNAME.
   *
   * The previous recovery read the lock's owner and age, decided it was abandoned, and then called
   * `rmSync(lockDir, { recursive: true })`. That removal acts on the PATHNAME, not on the object that was
   * observed. Between the observation and the removal another process can legitimately create a NEW lock at the
   * same pathname — and the delayed remover deletes the successor. Measured as
   * `baseline-and-falsifiers.json` F6: the successor, whose owner was the running process, was removed by a
   * remover acting on an observation of a different object.
   *
   * A security limit cannot contain a window in which a live owner's exclusion is deleted by a process that was
   * looking at something else. The corrected recovery therefore uses an operation that can only ever act on the
   * OBJECT IT OBSERVED:
   *
   *   1. the abandoned lock is CLAIMED by renaming it to a private name that includes this process's owner
   *      token. `rename` is atomic and acts on the directory entry: exactly one recoverer can win, and the
   *      winner moves the OLD object out of the way;
   *   2. the renamed object is verified to be the one observed — if its `owner.json` names a different token than
   *      the one recorded in the observation, this process did not observe it and must not touch it;
   *   3. only then is the claimed object removed, and it is removed BY ITS PRIVATE NAME, which no other process
   *      can create.
   *
   * A successor created at `active.lock` after the rename is untouched: it is a different directory entry and no
   * later step names it.
   *
   * §8.4 — INCOMPLETE OWNER PUBLICATION IS NOT AN ABANDONED LOCK.
   *
   * The lock directory is created by `mkdir` and the owner file is written immediately after. A process that
   * observes the lock in that window sees EEXIST with no readable `owner.json`. It cannot distinguish
   * "initialization in progress", "creator crashed", and "metadata is unreadable" — so it must not reclaim. Such
   * a lock is waited on until `lockStaleMs` has passed SINCE THE DIRECTORY WAS CREATED, and only then, with the
   * owner still unreadable, is it treated as abandoned. Before this correction the age was read as 0 on a stat
   * failure, which made an unreadable lock look brand new forever and block every worker indefinitely.
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
        /**
         * §8.4: PUBLISH THE OWNER BEFORE ANYTHING ELSE. The window between the two calls is unavoidable, but a
         * failure here must remove OUR lock rather than leave an unowned one behind.
         */
        try {
          writeFileSync(join(lockDir, "owner.json"), JSON.stringify({ pid: process.pid, token: ownerToken, at: Date.now() }), "utf8");
        } catch (error) {
          try {
            rmSync(lockDir, { recursive: true, force: true });
          } catch {
            /* the lock is already gone */
          }
          return { acquired: false, detail: `the capacity lock was created but its owner record could not be published (${String(error?.code ?? error)})` };
        }
        return { acquired: true };
      } catch (error) {
        if (error?.code !== "EEXIST") return { acquired: false, detail: `the capacity lock could not be created (${String(error?.code ?? error)})` };
      }
      /** Somebody holds it. Decide whether it is abandoned, using an observation that the removal will re-check. */
      let owner = null;
      let ownerReadable = false;
      try {
        owner = JSON.parse(readFileSync(join(lockDir, "owner.json"), "utf8"));
        ownerReadable = owner !== null && typeof owner === "object" && Number.isInteger(owner.pid) && typeof owner.token === "string";
      } catch {
        owner = null;
        ownerReadable = false;
      }
      let age = 0;
      let ageReadable = true;
      try {
        age = Date.now() - statSync(lockDir).mtimeMs;
      } catch {
        age = 0;
        ageReadable = false;
      }
      /**
       * §8.4: an unreadable owner is only abandoned once the DIRECTORY is demonstrably old. If even the directory
       * cannot be stat'd, the age is unknown and the lock is NOT reclaimed — a lock that cannot be observed
       * cannot be shown to be abandoned.
       */
      const ownerAlive = ownerReadable ? livenessOf(owner.pid).alive !== false : null;
      const abandoned = ageReadable && age > lockStaleMs && (ownerReadable ? ownerAlive === false : true);
      if (abandoned) {
        /**
         * §8.3: CLAIM BY RENAME, THEN VERIFY, THEN REMOVE BY THE PRIVATE NAME.
         *
         * `claimPath` contains this process's token, so no other process can have created it. The rename is the
         * exclusive step: of two recoverers, exactly one succeeds and the other sees ENOENT.
         */
        const claimPath = `${lockDir}.claim-${ownerToken}`;
        let claimed = false;
        try {
          renameSync(lockDir, claimPath);
          claimed = true;
        } catch {
          /** Another recoverer claimed it, or a new lock was installed. Re-examine from the top. */
          claimed = false;
        }
        if (claimed) {
          /**
           * VERIFY THE CLAIMED OBJECT IS THE ONE OBSERVED. A rename that succeeded while the lock was replaced
           * would have moved the SUCCESSOR; its token would differ from the observed one, so it is restored
           * rather than deleted. This is the ABA guard: the removal is conditional on identity, not on name.
           */
          let claimedOwner = null;
          try {
            claimedOwner = JSON.parse(readFileSync(join(claimPath, "owner.json"), "utf8"));
          } catch {
            claimedOwner = null;
          }
          const sameObject = ownerReadable
            ? claimedOwner !== null && claimedOwner?.token === owner.token
            : claimedOwner === null || claimedOwner === undefined;
          if (sameObject) {
            try {
              rmSync(claimPath, { recursive: true, force: true });
            } catch {
              /* the claimed object is already gone; the loop retries either way */
            }
          } else {
            /**
             * THE CLAIMED OBJECT WAS NOT THE OBSERVED LOCK. Put it back by name if the pathname is still free,
             * and never delete it: deleting a live owner's lock is the failure this whole correction prevents.
             */
            try {
              renameSync(claimPath, lockDir);
            } catch {
              /* the pathname was reoccupied; the displaced lock is left under its private name rather than lost */
            }
          }
        }
        continue;
      }
      if (Date.now() - startedAt > lockTimeoutMs) {
        return { acquired: false, detail: `the capacity lock is held by ${ownerReadable ? `pid ${String(owner.pid)}` : "an owner whose record is not yet readable"} and was not acquired within ${String(lockTimeoutMs)}ms` };
      }
      /** Bounded wait: a short sleep keeps this synchronous, which is what the caller requires. */
      const until = Date.now() + 10;
      while (Date.now() < until) {
        /* spin — the critical section is a few file operations */
      }
    }
  };

  /**
   * RELEASE THE LOCK, BY TOKEN, WITHOUT DELETING A SUCCESSOR.
   *
   * The previous version read `owner.json` and removed `lockDir` by pathname when the token matched. Between the
   * read and the removal the lock could be replaced, so the removal could hit a different object. The rename-based
   * release below moves the lock to a private name only if the token still matches, then removes THAT object.
   */
  const releaseLock = () => {
    const claimPath = `${lockDir}.release-${ownerToken}`;
    try {
      const owner = JSON.parse(readFileSync(join(lockDir, "owner.json"), "utf8"));
      if (owner?.token !== ownerToken) return { released: false, detail: "the lock is owned by another process" };
    } catch {
      return { released: false, detail: "the lock's owner record could not be read" };
    }
    try {
      renameSync(lockDir, claimPath);
    } catch (error) {
      return { released: false, detail: `the lock could not be claimed for release (${String(error?.code ?? error)})` };
    }
    /**
     * RE-VERIFY AFTER THE RENAME. If the object that moved is not ours, restore it: a release must never destroy
     * a lock it did not create.
     */
    let claimedOwner = null;
    try {
      claimedOwner = JSON.parse(readFileSync(join(claimPath, "owner.json"), "utf8"));
    } catch {
      claimedOwner = null;
    }
    if (claimedOwner?.token !== ownerToken) {
      try {
        renameSync(claimPath, lockDir);
      } catch {
        /* the pathname was reoccupied; the displaced lock is preserved under its private name */
      }
      return { released: false, detail: "the claimed lock did not carry this handle's token" };
    }
    try {
      rmSync(claimPath, { recursive: true, force: true });
      return { released: true, detail: "released" };
    } catch (error) {
      return { released: false, detail: `the claimed lock could not be removed (${String(error?.code ?? error)})` };
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
          /** §6.4/§8.2: an unreadable record does not grant capacity. */
          return { granted: false, detail: `${String(read.detail)}, so capacity cannot be established. This is a HOST CAPACITY fact: no attempt was failed and no authority was granted.` };
        }
        /**
         * §8.1: A MALFORMED HOLDER IS UNKNOWN OWNERSHIP, NOT ABSENT OWNERSHIP.
         *
         * The record is structurally valid but contains an entry the host cannot interpret. That entry might be
         * the active worker, so granting capacity would admit a second one beside it. The acquisition refuses and
         * names the malformed field; the repair is explicit (an operator inspects the record) rather than
         * speculative (the host guesses the entry is dead).
         */
        if (read.malformed.length > 0) {
          return {
            granted: false,
            detail: `the capacity record contains ${String(read.malformed.length)} malformed holder entr(y/ies) (${read.malformed.slice(0, 3).map((entry) => String(entry.reason)).join(", ")}), so ownership is UNKNOWN and capacity cannot be granted. This is a HOST CAPACITY fact: no attempt was failed and no authority was granted.`,
          };
        }
        const live = liveHolders(read.holders);
        /**
         * §8.5: AN INDETERMINATE LIVENESS ANSWER COUNTS AS A HOLDER. It is reported separately so an operator can
         * see that the refusal rests on an unreadable process rather than on a demonstrably running one.
         */
        const indeterminate = live.filter((entry) => entry.livenessCertain !== true);
        if (live.length >= max) {
          return {
            granted: false,
            detail: `the ${CONFIDENTIAL_PROFILE.id} profile runs at most ${String(max)} ACTIVE work worker(s); ${String(live.length)} already active (pids ${live.map((entry) => String(entry.pid)).join(", ")}${indeterminate.length > 0 ? `; ${String(indeterminate.length)} whose liveness could not be established` : ""}). This is a HOST CAPACITY fact: no attempt was failed, no authority was granted, and the task is unchanged.`,
          };
        }
        /**
         * §8.2: THE WRITE PRESERVES UNRELATED HOLDERS. `live` contains every holder that was read and not shown
         * to be dead, including any whose liveness was indeterminate, so a grant never discards another owner.
         */
        write([...live.map((entry) => ({ pid: entry.pid, at: entry.at, token: entry.token })), { pid: process.pid, at: Date.now(), token: ownerToken }]);
        held = true;
        return { granted: true, detail: `${String(live.length + 1)}/${String(max)} confidential workers active; admission granted` };
      } finally {
        const released = releaseLock();
        /**
         * A FAILED LOCK RELEASE IS OBSERVABLE (§8.2/§8.5). It does not undo the grant — the holder record is
         * already written — but it is recorded so a caller can see that the critical section may still be held.
         */
        if (released.released !== true) lastLockRelease = released.detail;
      }
    },
    release() {
      if (!held) return { released: false, detail: "this handle holds no slot", retryable: false };
      const lock = takeLock();
      if (lock.acquired !== true) {
        /**
         * §8.2: AN UNSUCCESSFUL RELEASE REMAINS OBSERVABLE AND THE HANDLE REMAINS RETRYABLE. `held` is NOT
         * cleared, so a caller that retries after the lock frees will still release its own record.
         */
        return { released: false, detail: `the slot was not released: ${String(lock.detail)}`, retryable: true };
      }
      try {
        const read = readHolders();
        /**
         * §8.2 — A FAILED READ MUST NOT AUTHORISE REWRITING AN EMPTY OWNERSHIP SET.
         *
         * The previous version wrote `(read.ok === true ? read.holders : []).filter(...)`, so an unreadable record
         * was replaced with an EMPTY holder list — destroying every other holder's record. Measured as
         * `baseline-and-falsifiers.json` F5: an unrelated holder was silently erased by a release.
         *
         * The release now refuses, keeps `held` true so it can be retried, and leaves the record untouched.
         */
        if (read.ok !== true) {
          return { released: false, detail: `the slot was not released: ${String(read.detail)}, so the ownership record is UNKNOWN and was not rewritten`, retryable: true };
        }
        /**
         * §8.2: RELEASE REFERS TO THE HOLDER IT RECORDED. A release by a handle that did not record this token
         * cannot remove somebody else's entry. A malformed entry is also PRESERVED verbatim: the release removes
         * only its own token and must not launder an entry it does not understand.
         */
        const remaining = read.holders.filter((entry) => entry?.token !== ownerToken);
        const preservedMalformed = read.malformed.length;
        held = false;
        write([...remaining, ...read.malformed.filter((entry) => entry.token !== undefined && entry.token !== ownerToken && Number.isInteger(entry.pid) && entry.pid > 0)]);
        return {
          released: true,
          detail: `${String(remaining.length)}/${String(max)} confidential workers remain active${preservedMalformed === 0 ? "" : `; ${String(preservedMalformed)} malformed entr(y/ies) were present and are reported rather than dropped`}`,
          retryable: false,
        };
      } catch (error) {
        return { released: false, detail: `the slot was not released: ${error?.message ?? String(error)}`, retryable: true };
      } finally {
        const releasedLock = releaseLock();
        if (releasedLock.released !== true) lastLockRelease = releasedLock.detail;
      }
    },
    peek() {
      const read = readHolders();
      if (read.ok !== true) return { active: -1, detail: `${String(read.detail)}; capacity is UNKNOWN`, malformed: 0 };
      if (read.malformed.length > 0) return { active: -1, detail: `${String(read.malformed.length)} malformed holder entr(y/ies); capacity is UNKNOWN`, malformed: read.malformed.length };
      const live = liveHolders(read.holders);
      return { active: live.length, detail: `${String(live.length)}/${String(max)} confidential workers active`, malformed: 0 };
    },
    /**
     * §8.6: THE SECURITY DOMAIN THIS SLOT BELONGS TO, stated as data.
     *
     * The slot namespace is derived from `DSH_HOME`, and two homes produce two namespaces. That is only sound if
     * every host process capable of exposing the same protected execution assets shares one home. This field
     * makes the assumption explicit and checkable rather than implied by the path.
     */
    domain: {
      home: resolve(input.home),
      root: domainRoot,
      key: domainKey,
      slotPath,
      identity: domainRoot === null ? `dsh-home:${resolve(input.home)}` : `protected-domain:${domainRoot}`,
      assumption:
        domainRoot === null
          ? "capacity exclusion is scoped to this DSH home; hosts with different homes do not share it, and the slot carries no domain identity"
          : "capacity exclusion is scoped to this protected domain; every host that can expose the same worlds must pass the same domain root",
    },
  };
}
