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

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
 *   · it carries no semantics — a pid and a timestamp, for staleness only;
 *   · nothing about Work reads it, and losing it changes no canonical fact;
 *   · a stale slot (a host that died) is reclaimed rather than blocking work forever.
 *
 * That last point is why the slot records a pid: an entry whose process is gone is not an active worker, and
 * treating it as one would turn a crash into a permanent capacity refusal. Where the platform cannot answer
 * "is that pid alive", the slot is reclaimed on age — erring toward running work, because a capacity refusal
 * is a statement about this machine, not a safety boundary that must never be crossed.
 *
 * @param {{ home: string, maxActiveWorkers?: number, staleAfterMs?: number }} input
 * @returns {{ acquire: () => { granted: boolean, detail: string }, release: () => void, peek: () => { active: number, detail: string } }}
 */
export function openConfidentialSlot(input) {
  const max = input.maxActiveWorkers ?? CONFIDENTIAL_PROFILE.maxActiveWorkers;
  const staleAfterMs = input.staleAfterMs ?? 6 * 60 * 60 * 1000;
  const slotDir = resolve(input.home, "confidential-workers");
  const slotPath = join(slotDir, "active.json");
  let held = false;

  /** Read the current holders, dropping any whose process is gone or whose record is stale. */
  const holders = () => {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(slotPath, "utf8"));
    } catch {
      return [];
    }
    const list = Array.isArray(parsed?.holders) ? parsed.holders : [];
    const now = Date.now();
    return list.filter((entry) => {
      if (typeof entry?.pid !== "number" || typeof entry?.at !== "number") return false;
      if (now - entry.at > staleAfterMs) return false;
      if (entry.pid === process.pid) return true;
      try {
        process.kill(entry.pid, 0);
        return true;
      } catch (error) {
        // ESRCH means the process is gone; EPERM means it exists but is not ours — still alive.
        return error?.code === "EPERM";
      }
    });
  };

  /** Write the holder list, creating the directory on first use. */
  const write = (list) => {
    mkdirSync(slotDir, { recursive: true });
    writeFileSync(slotPath, JSON.stringify({ holders: list, profile: CONFIDENTIAL_PROFILE.id }), "utf8");
  };

  return {
    acquire() {
      const current = holders();
      if (current.length >= max) {
        return {
          granted: false,
          detail: `the ${CONFIDENTIAL_PROFILE.id} profile runs at most ${String(max)} ACTIVE work worker(s); ${String(current.length)} already active (pids ${current.map((entry) => String(entry.pid)).join(", ")}). This is a HOST CAPACITY fact: no attempt was failed, no authority was granted, and the task is unchanged.`,
        };
      }
      write([...current, { pid: process.pid, at: Date.now() }]);
      held = true;
      return { granted: true, detail: `${String(current.length + 1)}/${String(max)} confidential workers active; admission granted` };
    },
    release() {
      if (!held) return;
      held = false;
      const remaining = holders().filter((entry) => entry.pid !== process.pid);
      try {
        write(remaining);
      } catch {
        /* a failed release must not fail the work; a stale slot is reclaimed on the next acquire */
      }
    },
    peek() {
      const current = holders();
      return { active: current.length, detail: `${String(current.length)}/${String(max)} confidential workers active` };
    },
  };
}
