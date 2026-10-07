/**
 * R3-S0 §"Deterministic workers" — THE TEST-ONLY DETERMINISTIC ACTORS.
 *
 * §"Deterministic workers" requires two actors, and says explicitly: these are TEST ACTORS, not canonical
 * Agent types. Neither is registered anywhere, neither is exported on a package surface, and neither can be
 * reached by product code.
 *
 * `ScriptedWorker` — performs ONLY explicitly scripted actions and must not infer missing information. Its
 * canonical form is the ruling's example:
 *
 *     if visible handle X exists -> call governed pull(X)
 *
 * and the rule that makes it useful: if X does NOT reach the consumer boundary, the test MUST FAIL rather than
 * search the filesystem. So this worker has NO filesystem escape hatch — it can only look at the context it was
 * handed and call the pull the host bound to its attempt. A worker that went looking for the body on disk
 * would make a delivery defect invisible, which is exactly the R1-L/R2-U historical failure.
 *
 * `AdversarialWorker` — attempts known-invalid operations and reports what happened. It is used for SAFETY
 * tests, so it records each attempt's outcome rather than asserting: the caller decides what "refused" means.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/* ================================================================ ScriptedWorker */

/**
 * §"Deterministic workers": the script a ScriptedWorker executes.
 *
 * Every field is explicit. There is deliberately NO `searchFilesystem` option: a worker that cannot find its
 * information must report that, not go looking for it.
 */
export const SCRIPTED_WORKER_ACTIONS = Object.freeze({
  /** The happy script: find the named handle in the consumer-visible context and pull it. */
  PULL_VISIBLE_HANDLE: 'PULL_VISIBLE_HANDLE',
  /** Assert a handle is ABSENT from the consumer boundary, then pull it and expect a refusal. */
  ASSERT_HANDLE_ABSENT: 'ASSERT_HANDLE_ABSENT',
  /** Do nothing but report ready. Used for liveness/plumbing only. */
  NOOP_READY: 'NOOP_READY',
  /** Commit the given text to the given file in the world, then report ready. */
  COMMIT_FILE: 'COMMIT_FILE',
});

/**
 * §"Deterministic workers": build a `WorkWorkerRunPort`-shaped actor.
 *
 * @param {{
 *   script: readonly {action: string, handle?: string, path?: string, text?: string}[],
 *   adapterId?: string,
 *   onObservation?: (observation: object) => void,
 * }} input
 */
export function scriptedWorker(input) {
  const adapterId = input.adapterId ?? 'r3s0-scripted-worker';
  const observations = [];
  return Object.freeze({
    adapterId,
    observations,
    async run({ workDir, context, contextPull }) {
      const record = {
        adapterId,
        // §"Consumer-boundary law": the ONLY thing this worker can see is what the consumer was handed.
        visibleHandles: (context?.compiled?.handles ?? []).map((entry) => entry.handle),
        visibleBootKinds: (context?.compiled?.boot ?? []).map((entry) => entry.kind),
        pulls: [],
        failures: [],
      };
      for (const step of input.script) {
        if (step.action === SCRIPTED_WORKER_ACTIONS.NOOP_READY) continue;
        if (step.action === SCRIPTED_WORKER_ACTIONS.COMMIT_FILE) {
          const target = join(workDir, step.path);
          writeFileSync(target, step.text ?? '', 'utf8');
          execFileSync('git', ['add', '-A'], { cwd: workDir });
          execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'scripted'], { cwd: workDir });
          record.failures.push(...[]);
          continue;
        }
        const handle = step.handle;
        if (typeof handle !== 'string' || handle === '') {
          record.failures.push('SCRIPT_MISSING_HANDLE');
          continue;
        }
        const visible = record.visibleHandles.includes(handle);
        if (step.action === SCRIPTED_WORKER_ACTIONS.ASSERT_HANDLE_ABSENT && visible) {
          /**
           * §"Deterministic workers": the handle should NOT have reached the boundary. Failing here is the
           * point — a worker that shrugged and kept going would hide a leakage defect.
           */
          record.failures.push(`HANDLE_LEAKED_TO_CONSUMER:${handle}`);
          continue;
        }
        if (step.action === SCRIPTED_WORKER_ACTIONS.PULL_VISIBLE_HANDLE && !visible) {
          /**
           * §"Deterministic workers": X did NOT reach the consumer boundary, so the test MUST fail. The
           * worker does NOT search the filesystem for the body; it reports the absence.
           */
          record.failures.push(`HANDLE_NOT_AT_CONSUMER_BOUNDARY:${handle}`);
          continue;
        }
        /** The governed pull: the ONLY read this worker performs. */
        if (typeof contextPull !== 'function') {
          record.failures.push(`NO_GOVERNED_PULL_BOUND:${handle}`);
          continue;
        }
        let response;
        try {
          response = await contextPull(handle);
        } catch (error) {
          response = { threw: String(error?.message ?? error) };
        }
        record.pulls.push({ handle, response });
      }
      observations.push(record);
      input.onObservation?.(record);
      const kind = record.failures.length === 0 ? 'READY_FOR_SETTLEMENT' : 'NEEDS_ESCALATION';
      return Object.freeze({ kind, detail: record.failures.length === 0 ? 'script completed' : record.failures.join(', ') });
    },
  });
}

/** §"Deterministic workers": read the body out of a governed pull response, whatever shape the owner returns. */
export function pulledBodyOf(response) {
  if (response === null || response === undefined) return null;
  if (typeof response === 'object' && 'body' in response) return response.body ?? null;
  return response;
}

/* ================================================================ AdversarialWorker */

/** §"Deterministic workers": the known-invalid operations the adversarial actor attempts. */
export const ADVERSARIAL_ATTEMPTS = Object.freeze({
  UNLISTED_CONTEXT_PULL: 'UNLISTED_CONTEXT_PULL',
  WRONG_ATTEMPT_HANDLE: 'WRONG_ATTEMPT_HANDLE',
  STALE_RESULT_CONTINUATION: 'STALE_RESULT_CONTINUATION',
  DUPLICATE_PROMOTION: 'DUPLICATE_PROMOTION',
  UNAUTHORIZED_CANONICAL_MUTATION: 'UNAUTHORIZED_CANONICAL_MUTATION',
  PROHIBITED_DIRECT_STORE_ACCESS: 'PROHIBITED_DIRECT_STORE_ACCESS',
  CONTROL_PAYLOAD_DISCOVERY: 'CONTROL_PAYLOAD_DISCOVERY',
});

/**
 * §"Deterministic workers": build an adversarial actor.
 *
 * It ATTEMPTS the operations and RECORDS what happened; it never asserts. A caller reads `attempts` and decides
 * whether the outcome was a refusal, which keeps the safety judgement in the gate rather than in the actor.
 *
 * @param {{
 *   attempts: readonly string[],
 *   unlistedHandle?: string,
 *   wrongAttemptHandle?: string,
 *   prohibitedPaths?: readonly string[],
 *   controlPayloadPaths?: readonly string[],
 *   duplicatePromote?: () => Promise<unknown>,
 * }} input
 */
export function adversarialWorker(input) {
  const adapterId = input.adapterId ?? 'r3s0-adversarial-worker';
  const attempts = [];
  return Object.freeze({
    adapterId,
    attempts,
    async run({ workDir, context, contextPull }) {
      const record = (attempt, outcome, detail) => attempts.push(Object.freeze({ attempt, outcome, detail }));

      /** 1. An UNLISTED context pull: a handle that was never compiled into this attempt. */
      if (input.attempts.includes(ADVERSARIAL_ATTEMPTS.UNLISTED_CONTEXT_PULL)) {
        const handle = input.unlistedHandle ?? '@ctx/proof/not-compiled-into-this-attempt';
        const visible = (context?.compiled?.handles ?? []).some((entry) => entry.handle === handle);
        let outcome;
        try {
          const response = await contextPull(handle);
          outcome = response === null || response === undefined ? 'REFUSED' : 'RESOLVED';
          record(ADVERSARIAL_ATTEMPTS.UNLISTED_CONTEXT_PULL, visible ? 'LISTED_UNEXPECTEDLY' : outcome, JSON.stringify(response ?? null).slice(0, 160));
        } catch (error) {
          record(ADVERSARIAL_ATTEMPTS.UNLISTED_CONTEXT_PULL, 'REFUSED', String(error?.message ?? error).slice(0, 160));
        }
      }

      /** 2. A WRONG-ATTEMPT handle: a handle that belongs to a DIFFERENT attempt's manifest. */
      if (input.attempts.includes(ADVERSARIAL_ATTEMPTS.WRONG_ATTEMPT_HANDLE)) {
        const handle = input.wrongAttemptHandle ?? '@ctx/proof/from-another-attempt';
        try {
          const response = await contextPull(handle);
          record(ADVERSARIAL_ATTEMPTS.WRONG_ATTEMPT_HANDLE, response === null || response === undefined ? 'REFUSED' : 'RESOLVED', JSON.stringify(response ?? null).slice(0, 160));
        } catch (error) {
          record(ADVERSARIAL_ATTEMPTS.WRONG_ATTEMPT_HANDLE, 'REFUSED', String(error?.message ?? error).slice(0, 160));
        }
      }

      /** 3. A PROHIBITED DIRECT STORE READ: can the actor read the backing store directly? */
      if (input.attempts.includes(ADVERSARIAL_ATTEMPTS.PROHIBITED_DIRECT_STORE_ACCESS)) {
        for (const path of input.prohibitedPaths ?? []) {
          try {
            const text = readFileSync(path, 'utf8');
            record(ADVERSARIAL_ATTEMPTS.PROHIBITED_DIRECT_STORE_ACCESS, 'READ_SUCCEEDED', `${path} (${String(text.length)} bytes)`);
          } catch (error) {
            record(ADVERSARIAL_ATTEMPTS.PROHIBITED_DIRECT_STORE_ACCESS, 'REFUSED', `${path}: ${String(error?.code ?? error?.message ?? error)}`.slice(0, 160));
          }
        }
      }

      /** 4. CONTROL PAYLOAD DISCOVERY: can the actor reach the host control payload? */
      if (input.attempts.includes(ADVERSARIAL_ATTEMPTS.CONTROL_PAYLOAD_DISCOVERY)) {
        for (const path of input.controlPayloadPaths ?? []) {
          try {
            readFileSync(path, 'utf8');
            record(ADVERSARIAL_ATTEMPTS.CONTROL_PAYLOAD_DISCOVERY, 'READ_SUCCEEDED', path);
          } catch (error) {
            record(ADVERSARIAL_ATTEMPTS.CONTROL_PAYLOAD_DISCOVERY, 'REFUSED', `${path}: ${String(error?.code ?? error?.message ?? error)}`.slice(0, 160));
          }
        }
      }

      /**
       * 5. A DUPLICATE PROMOTION: attempt the same promotion twice through the caller-supplied seam. The seam
       * is a TEST seam; the actor never reaches the product's promotion path itself.
       */
      if (input.attempts.includes(ADVERSARIAL_ATTEMPTS.DUPLICATE_PROMOTION) && typeof input.duplicatePromote === 'function') {
        for (let index = 0; index < 2; index += 1) {
          try {
            const outcome = await input.duplicatePromote();
            record(ADVERSARIAL_ATTEMPTS.DUPLICATE_PROMOTION, index === 0 ? 'FIRST_OUTCOME' : 'SECOND_OUTCOME', JSON.stringify(outcome ?? null).slice(0, 200));
          } catch (error) {
            record(ADVERSARIAL_ATTEMPTS.DUPLICATE_PROMOTION, 'REFUSED', String(error?.message ?? error).slice(0, 200));
          }
        }
      }

      /**
       * 6. An UNAUTHORIZED CANONICAL MUTATION: try to write a canonical fact with no authority. The seam is
       * supplied by the caller; the actor only attempts it.
       */
      if (input.attempts.includes(ADVERSARIAL_ATTEMPTS.UNAUTHORIZED_CANONICAL_MUTATION) && typeof input.unauthorizedMutation === 'function') {
        try {
          const outcome = await input.unauthorizedMutation();
          record(ADVERSARIAL_ATTEMPTS.UNAUTHORIZED_CANONICAL_MUTATION, 'ACCEPTED', JSON.stringify(outcome ?? null).slice(0, 200));
        } catch (error) {
          record(ADVERSARIAL_ATTEMPTS.UNAUTHORIZED_CANONICAL_MUTATION, 'REFUSED', String(error?.message ?? error).slice(0, 200));
        }
      }

      /**
       * 7. A STALE-RESULT CONTINUATION VIOLATION: continue from a result whose world basis has moved. The seam
       * is supplied by the caller.
       */
      if (input.attempts.includes(ADVERSARIAL_ATTEMPTS.STALE_RESULT_CONTINUATION) && typeof input.staleContinuation === 'function') {
        try {
          const outcome = await input.staleContinuation();
          record(ADVERSARIAL_ATTEMPTS.STALE_RESULT_CONTINUATION, 'ACCEPTED', JSON.stringify(outcome ?? null).slice(0, 200));
        } catch (error) {
          record(ADVERSARIAL_ATTEMPTS.STALE_RESULT_CONTINUATION, 'REFUSED', String(error?.message ?? error).slice(0, 200));
        }
      }

      /** The adversarial actor never reports success: it reports that it finished attempting. */
      return Object.freeze({ kind: 'NEEDS_ESCALATION', detail: `adversarial attempts: ${String(attempts.length)}` });
    },
  });
}

/** §"Deterministic workers": the attempts the adversarial actor REFUSED, for a bypass witness. */
export function refusedAttempts(attempts) {
  return attempts.filter((entry) => entry.outcome === 'REFUSED').map((entry) => entry.attempt);
}

/** §"Deterministic workers": the attempts that were NOT refused, which are the ones a safety gate must explain. */
export function acceptedAttempts(attempts) {
  return attempts.filter((entry) => entry.outcome !== 'REFUSED');
}
