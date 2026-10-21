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

import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

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
 * THE CONFIDENTIAL CAPACITY SLOT: ONE ACTIVE CONFIDENTIAL WORKER PER SECURITY PRINCIPAL AND MACHINE.
 *
 * WHAT THE SLOT IS. A cross-process admission claim, held for the few milliseconds it takes to read and write
 * the holder record. It carries no canonical semantics: a pid, a token and a timestamp, nothing about Work.
 *
 * ============================================================================
 * S1R-A — THE EXCLUSION DOMAIN IS THE WINDOWS SECURITY PRINCIPAL ON THIS MACHINE.
 * ============================================================================
 *
 * WHY THE DOMAIN HAD TO CHANGE. Host-S1 keyed the slot by the protected repository
 * (`<repository>/.palimpsest/host-capacity/`), on the premise that a repository is the confidentiality domain.
 * That premise was never measured. It is false on this host.
 *
 * MEASURED (`baseline-security-falsifiers.json` F3, `scripts/host_s1r/reproduce-concerns.mjs`). Two independent
 * test-owned repositories were each given their own `.palimpsest`, their own world and their own synthetic
 * canary. BOTH worlds were made ACTIVE with the same first-party `AclWriteGrant` the sandbox applies on every
 * confined spawn — that grant is the last writer of a world's label, which is the whole reason the capacity
 * limit exists. A process running under the real DSH sandbox, granted ONLY repository A's workspace, read
 * repository B's ACTIVE-world canary. B's durable state was refused (EPERM); B's ACTIVE WORLD was not.
 *
 * The two worlds had DIFFERENT workspace write SIDs (`S-1-4-394482434-518543731` vs `S-1-4-938573126-899541022`),
 * so the isolation is neither per-workspace nor per-repository. What they share is the LOW INTEGRITY LEVEL the
 * backend assigns to every confined process of this principal, and a label is a level, not a compartment: two
 * ACTIVE worlds are both at Low, so neither can refuse the other. The unit that must be serialized is therefore
 * every confidential worker THIS PRINCIPAL can start ON THIS MACHINE — not the repository, not the DSH home.
 *
 * THE NAMESPACE. `%LOCALAPPDATA%\Palimpsest\host-capacity\` is per-principal and per-machine by construction,
 * and every host process of this principal resolves the same path regardless of which repository it serves or
 * which DSH home it was given. That is the property Host-S1's home-keyed and domain-keyed designs both lacked:
 * two hosts could each acquire a slot for the SAME worlds, or for DIFFERENT worlds they could each read.
 *
 * WHY NOT MACHINE-WIDE. A path shared by every principal would need ACLs this stage is not authorised to
 * design (§5.3 forbids inventing a new coordinator, and a machine-wide writable directory is a tampering
 * surface). Different Windows principals are already separated by the default profile ACLs and by their own
 * integrity levels, so the principal is the correct outer bound. `domain.assumption` states exactly this so no
 * receipt can imply a stronger scope.
 *
 * THE ANCESTRY IS VERIFIED, NOT ASSUMED (§5.3). Every ancestor of the capacity root is inspected with `lstat`;
 * if any is a reparse point the slot REFUSES to operate, because a junction would let the namespace be
 * redirected to a path another principal controls. The result is reported in `domain.reparseAncestors`.
 *
 * ============================================================================
 * S1R-B — RECOVERY: SAFE EXCLUSION, AND AUTOMATIC RECLAMATION DELIBERATELY DISABLED.
 * ============================================================================
 *
 * THE ACHIEVEMENT KEPT. `mkdir` remains the acquisition primitive: creating a directory is atomic on NTFS, so
 * exactly one caller wins. The read-check-write race E1RG closed stays closed.
 *
 * WHAT WAS MEASURED ON THE PARENT (F1, and it is worse than the hypothesis). Recovery read the lock's owner,
 * decided it was abandoned, then renamed the PATHNAME to a private claim and compared tokens AFTERWARDS. An
 * instrumented interleaving — a live successor installed immediately before the recoverer's rename — showed:
 *
 *   · the recoverer MOVED the live successor (`recovererMovedTheSuccessor: true`);
 *   · a third process acquired the vacated pathname (`thirdPartyAcquiredTheVacatedPathname: true`);
 *   · the successor was displaced and the third party held the lock;
 *   · and the recovery then FAILED TO TERMINATE, because the abandoned branch `continue`s past the timeout
 *     check and its claim name is deterministic per process, so the second pass collided with its own leftover
 *     claim and looped forever (`childTimedOut: true`).
 *
 * WHY AUTOMATIC RECLAMATION IS NOW DISABLED RATHER THAN NARROWED. The window is structural. A recovery that
 * removes a lock by PATHNAME frees that pathname between the removal and any re-publication, and the
 * filesystem offers no compare-and-unlink: `rename`, `mkdir` and `rmdir` each act on whatever currently bears
 * the name. Re-verifying the object's file index immediately before the rename shrinks the window but cannot
 * close it — a replacement landing between the verification and the rename is still moved, and if a third party
 * takes the freed pathname before the restore, the displaced owner believes it holds a lock it no longer holds.
 * That is overlapping ownership, which §6.2 makes non-negotiable.
 *
 * §6.4 states the preference explicitly: "If the automatic stale-recovery algorithm cannot demonstrate
 * object-identity-safe exclusion, disable automatic reclamation of ambiguous lock directories. Preserve a
 * fail-closed refusal with explicit operator recovery requirements." That is what this module now does.
 *
 * THE AVAILABILITY COST IS SMALL AND IS MEASURED. The lock is held ONLY across the read-modify-write of the
 * holder record — a handful of file operations. The long-lived claim is the HOLDER RECORD, and that is still
 * recovered automatically: a holder whose pid is demonstrably gone is evicted, so a crashed worker frees
 * capacity. Only a crash inside the millisecond critical section requires an operator, and the refusal names
 * the exact path and the required action.
 *
 * AN UNREADABLE OWNER RECORD IS NEVER RECLAIMED (§6.5). "Publication in progress", "creator crashed" and
 * "metadata unreadable" are indistinguishable from outside, and §6.5 forbids treating the third as the second.
 *
 * @param {{ home: string, domain?: string, capacityRoot?: string, maxActiveWorkers?: number, staleAfterMs?: number,
 *   lockStaleMs?: number, lockTimeoutMs?: number }} input
 * @returns {{
 *   acquire: () => { granted: boolean, detail: string },
 *   release: () => { released: boolean, detail: string, retryable?: boolean },
 *   peek: () => { active: number, detail: string, malformed: number },
 *   mechanism: string,
 *   domain: { scope: string, principal: string | null, capacityRoot: string, slotPath: string, lockPath: string,
 *     key: string | null, home: string, root: string | null, identity: string, assumption: string,
 *     reparseAncestors: readonly string[] },
 * }}
 */
export function openConfidentialSlot(input) {
  const max = input.maxActiveWorkers ?? CONFIDENTIAL_PROFILE.maxActiveWorkers;
  /** Retained for compatibility and recorded, but it never evicts a live holder (see `liveHolders`). */
  const staleAfterMs = input.staleAfterMs ?? 6 * 60 * 60 * 1000;
  const lockTimeoutMs = input.lockTimeoutMs ?? 5_000;

  /**
   * THE PRINCIPAL. `USERDOMAIN\USERNAME@COMPUTERNAME` names the security context whose confined processes share
   * one integrity level. It is reported so a receipt states the scope it actually had.
   */
  const principal = (() => {
    const user = typeof process.env.USERNAME === "string" ? process.env.USERNAME.trim() : "";
    if (user === "") return null;
    const domainName = typeof process.env.USERDOMAIN === "string" ? process.env.USERDOMAIN.trim() : "";
    const machine = typeof process.env.COMPUTERNAME === "string" ? process.env.COMPUTERNAME.trim() : "";
    return { domain: domainName, user, machine, identity: `${domainName}\\${user}@${machine}` };
  })();

  /**
   * THE CAPACITY ROOT. Production resolves the per-principal, per-machine location.
   *
   * TWO EXPLICIT SEAMS, both the same kind as `input.api` in `read_fence.js` — a caller that needs a different
   * location says so, and production callers say nothing:
   *
   *   `input.capacityRoot`                 an in-process caller (a conformance case) names its own root;
   *   PALIMPSEST_HOST_CAPACITY_ROOT        a DEPLOYMENT names a root for every process it starts, which is how
   *                                        a conformance rig drives the REAL runner without contending with the
   *                                        machine's capacity state.
   *
   * The environment seam exists because the runner constructs the slot itself: without it, a suite that drives
   * `runWorker` would contend with — and could refuse — a real confidential worker on this machine. It is
   * HOST CONFIGURATION in the same sense as `PALIMPSEST_WORKER_PROTECTED_ROOTS`: it names a runtime location and
   * carries no authority.
   */
  const configuredRoot = (() => {
    if (typeof input.capacityRoot === "string" && input.capacityRoot.trim() !== "") return input.capacityRoot.trim();
    const fromEnvironment = typeof process.env.PALIMPSEST_HOST_CAPACITY_ROOT === "string" ? process.env.PALIMPSEST_HOST_CAPACITY_ROOT.trim() : "";
    return fromEnvironment === "" ? null : fromEnvironment;
  })();
  const capacityRoot =
    configuredRoot !== null
      ? resolve(configuredRoot)
      : join(process.env.LOCALAPPDATA?.trim() || join(homedir(), "AppData", "Local"), "Palimpsest", "host-capacity");
  const slotPath = join(capacityRoot, "active.json");
  const lockDir = join(capacityRoot, "active.lock");
  const slotDir = capacityRoot;

  /** §5.3: the ancestry must not be reachable through a reparse point, or the namespace could be redirected. */
  const reparseAncestors = (() => {
    const findings = [];
    const chain = [];
    let current = resolve(capacityRoot);
    for (;;) {
      chain.push(current);
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    for (const path of chain.reverse()) {
      try {
        if (lstatSync(path).isSymbolicLink()) findings.push(path);
      } catch {
        /* a component that does not exist yet cannot be a link */
      }
    }
    return findings;
  })();

  /** A per-instance token, so a release can prove it refers to the holder it recorded. */
  const ownerToken = `${String(process.pid)}-${randomUUID()}`;
  let held = false;
  /** The last lock-release failure, so an unsuccessful release is observable rather than swallowed (§6.6). */
  let lastLockRelease = null;

  /**
   * IS A PID ALIVE? `kill(pid, 0)` sends no signal and reports whether the process exists. ESRCH means it is
   * gone; EPERM means it exists but belongs to another user, which is still ALIVE. A pid of our own process is
   * always alive.
   *
   * §8.5: ambiguity must not authorize overlap. Every other error — including EINVAL for an out-of-range pid —
   * is UNKNOWN, not dead, and unknown must not free a slot.
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

  /**
   * Read the holders. An unreadable or malformed record is NOT evidence of zero holders (§6.4 fail-closed).
   *
   * §6.6: THE RECORD IS VALIDATED BEFORE LIVENESS FILTERING, and each entry is classified:
   *   VALID      — pid is a positive integer and (when present) token is a string;
   *   MALFORMED  — not an object, or a required field has the wrong type.
   * A malformed entry makes the whole record UNTRUSTWORTHY: it might be the active worker.
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
    const valid = [];
    const malformed = [];
    for (const entry of parsed.holders) {
      const pidOk = entry !== null && typeof entry === "object" && Number.isInteger(entry.pid) && entry.pid > 0;
      const tokenOk = entry !== null && typeof entry === "object" && (entry.token === undefined || typeof entry.token === "string");
      if (!pidOk || !tokenOk) {
        /** The RAW entry is kept, so a later release can write it back verbatim rather than laundering it. */
        malformed.push(entry);
        continue;
      }
      valid.push(entry);
    }
    return {
      ok: true,
      holders: valid,
      malformed,
      unreadable: false,
      detail: malformed.length === 0 ? "record is well formed" : `${String(malformed.length)} malformed holder entry(ies)`,
    };
  };

  /**
   * Keep only holders that are DEFINITELY ALIVE. Liveness is the only eviction rule.
   *
   * §8.5: an INDETERMINATE liveness answer keeps the holder. Treating "I could not tell" as dead would admit a
   * second worker beside a possibly-live one — the exact overlap this mechanism exists to prevent.
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
   * DESCRIBE THE CURRENT LOCK, so a refusal can explain itself without pretending to know whether it is
   * abandoned. Nothing here reclaims.
   */
  const describeLock = () => {
    let owner = null;
    let readable = false;
    try {
      owner = JSON.parse(readFileSync(join(lockDir, "owner.json"), "utf8"));
      readable = owner !== null && typeof owner === "object" && Number.isInteger(owner.pid) && typeof owner.token === "string";
    } catch {
      readable = false;
    }
    if (!readable) {
      return {
        readable: false,
        owner: null,
        liveness: null,
        detail:
          "the capacity lock exists but its owner record is not readable; an interrupted publication, a crashed owner and unreadable metadata are indistinguishable from outside, so it is NOT treated as abandoned",
      };
    }
    const liveness = livenessOf(owner.pid);
    if (liveness.alive === false) {
      return {
        readable: true,
        owner,
        liveness,
        detail: `the capacity lock is held by pid ${String(owner.pid)}, which no longer exists; automatic reclamation is DISABLED because removing a lock by pathname cannot be proven to act on the observed object`,
      };
    }
    return {
      readable: true,
      owner,
      liveness,
      detail: `the capacity lock is held by pid ${String(owner.pid)} (${liveness.basis})`,
    };
  };

  /**
   * TAKE THE EXCLUSIVE LOCK. `mkdir` is the atomic step: exactly one caller creates it.
   *
   * NO PATH IS TAKEN HERE THAT REMOVES OR RENAMES SOMEBODY ELSE'S LOCK. The loop only ever creates, waits and
   * reports; the timeout bounds the wait on EVERY path, including the one where the observed owner is dead.
   */
  const takeLock = () => {
    if (reparseAncestors.length > 0) {
      return {
        acquired: false,
        detail: `the capacity namespace is reachable through a reparse point (${reparseAncestors.join(", ")}), so it cannot be shown to be this principal's own directory`,
      };
    }
    try {
      mkdirSync(slotDir, { recursive: true });
    } catch (error) {
      return { acquired: false, detail: `the capacity directory could not be created (${String(error?.code ?? error)})` };
    }
    const startedAt = Date.now();
    let lastDetail = "the capacity lock is held";
    for (;;) {
      try {
        mkdirSync(lockDir);
        /** §6.5: publish the owner before anything else, and remove OUR lock if publication fails. */
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
      lastDetail = describeLock().detail;
      if (Date.now() - startedAt > lockTimeoutMs) {
        return {
          acquired: false,
          detail: `${lastDetail}. It was not acquired within ${String(lockTimeoutMs)}ms. OPERATOR ACTION: confirm no confidential worker is active, then remove ${lockDir}`,
        };
      }
      /** Bounded wait: a short spin keeps this synchronous, which is what the caller requires. */
      const until = Date.now() + 10;
      while (Date.now() < until) {
        /* spin — the critical section is a few file operations */
      }
    }
  };

  /**
   * RELEASE THE LOCK, BY TOKEN, WITHOUT DELETING A SUCCESSOR.
   *
   * The rename-then-re-verify shape is kept: the lock is moved to a name that contains this handle's token, the
   * moved object is confirmed to be ours, and only then is it removed. A release therefore never destroys a
   * lock it did not create.
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
          /** §6.4: an unreadable record does not grant capacity. */
          return { granted: false, detail: `${String(read.detail)}, so capacity cannot be established. This is a HOST CAPACITY fact: no attempt was failed and no authority was granted.` };
        }
        /**
         * §6.6: A MALFORMED HOLDER IS UNKNOWN OWNERSHIP, NOT ABSENT OWNERSHIP. That entry might be the active
         * worker, so granting capacity would admit a second one beside it. The repair is explicit, not
         * speculative.
         */
        if (read.malformed.length > 0) {
          return {
            granted: false,
            detail: `the capacity record contains ${String(read.malformed.length)} malformed holder entr(y/ies), so ownership is UNKNOWN and capacity cannot be granted. This is a HOST CAPACITY fact: no attempt was failed and no authority was granted.`,
          };
        }
        const live = liveHolders(read.holders);
        /** §8.5: an indeterminate liveness answer COUNTS AS A HOLDER, and is reported separately. */
        const indeterminate = live.filter((entry) => entry.livenessCertain !== true);
        if (live.length >= max) {
          return {
            granted: false,
            detail: `the ${CONFIDENTIAL_PROFILE.id} profile runs at most ${String(max)} ACTIVE work worker(s); ${String(live.length)} already active (pids ${live.map((entry) => String(entry.pid)).join(", ")}${indeterminate.length > 0 ? `; ${String(indeterminate.length)} whose liveness could not be established` : ""}). This is a HOST CAPACITY fact: no attempt was failed, no authority was granted, and the task is unchanged.`,
          };
        }
        /** §6.6: the write preserves unrelated holders, including any whose liveness was indeterminate. */
        write([...live.map((entry) => ({ pid: entry.pid, at: entry.at, token: entry.token })), { pid: process.pid, at: Date.now(), token: ownerToken }]);
        /** `held` becomes true ONLY after the record is durably written. */
        held = true;
        return { granted: true, detail: `${String(live.length + 1)}/${String(max)} confidential workers active; admission granted` };
      } catch (error) {
        return {
          granted: false,
          detail: `the capacity record could not be written (${String(error?.code ?? error?.message ?? error)}), so the grant was not recorded and capacity is UNKNOWN. This is a HOST CAPACITY fact: no attempt was failed and no authority was granted.`,
        };
      } finally {
        const released = releaseLock();
        if (released.released !== true) lastLockRelease = released.detail;
      }
    },
    release() {
      if (!held) return { released: false, detail: "this handle holds no slot", retryable: false };
      const lock = takeLock();
      if (lock.acquired !== true) {
        /** §6.6: an unsuccessful release remains observable and the handle remains retryable. */
        return { released: false, detail: `the slot was not released: ${String(lock.detail)}`, retryable: true };
      }
      try {
        const read = readHolders();
        /**
         * §6.6 — A FAILED READ MUST NOT AUTHORISE REWRITING AN EMPTY OWNERSHIP SET. The record is left untouched
         * and `held` stays true so the caller can retry.
         */
        if (read.ok !== true) {
          return { released: false, detail: `the slot was not released: ${String(read.detail)}, so the ownership record is UNKNOWN and was not rewritten`, retryable: true };
        }
        /**
         * §6.6: A RELEASE REFERS TO THE HOLDER IT RECORDED. If this handle's token is not in the actual record,
         * there is nothing of ours to remove — and somebody else's entry must not be touched to make the call
         * look successful.
         */
        if (!read.holders.some((entry) => entry?.token === ownerToken)) {
          held = false;
          return { released: false, detail: "this handle's record is not present in the capacity record, so nothing was removed", retryable: false };
        }
        const remaining = read.holders.filter((entry) => entry?.token !== ownerToken);
        /**
         * §6.6: MALFORMED ENTRIES ARE WRITTEN BACK VERBATIM. Dropping or repairing an entry this module cannot
         * interpret would be exactly the laundering §6.6 forbids.
         */
        write([...remaining, ...read.malformed]);
        /** `held` becomes false ONLY after the reduced record is durably written. */
        held = false;
        return {
          released: true,
          detail: `${String(remaining.length)}/${String(max)} confidential workers remain active${read.malformed.length === 0 ? "" : `; ${String(read.malformed.length)} malformed entr(y/ies) were preserved`}`,
          retryable: false,
        };
      } catch (error) {
        /**
         * THE WRITE FAILED. `held` stays true, the record on disk is unchanged, and the caller may retry — the
         * previous version cleared `held` before writing, so a failed write left a phantom holder that no later
         * release could remove (measured as F2).
         */
        return { released: false, detail: `the slot was not released: ${String(error?.code ?? error?.message ?? error)}, so this handle still holds its record and the release is retryable`, retryable: true };
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
    /** The last failed lock release, or null. §6.6: a failed Lock release must remain observable. */
    lastLockRelease: () => lastLockRelease,
    /**
     * THE SECURITY DOMAIN THIS SLOT BELONGS TO, stated as data so no receipt can overclaim the scope.
     */
    domain: {
      scope: "windows-principal-machine",
      principal: principal === null ? null : principal.identity,
      capacityRoot,
      slotPath,
      lockPath: lockDir,
      key: principal === null ? null : createHash("sha256").update(principal.identity.toLowerCase(), "utf8").digest("hex").slice(0, 24),
      /** Retained for receipt compatibility: the home and the requested domain are METADATA, not the namespace. */
      home: resolve(input.home),
      root: typeof input.domain === "string" && input.domain.trim() !== "" ? resolve(input.domain) : null,
      identity: principal === null ? `capacity-root:${capacityRoot}` : `windows-principal:${principal.identity}`,
      assumption:
        "capacity exclusion is scoped to this Windows principal on this machine: every confidential worker this principal can start contends for one slot, whatever repository or DSH home it serves. Different principals are not covered and are separated by their own profile ACLs and integrity levels.",
      reparseAncestors,
    },
  };
}
