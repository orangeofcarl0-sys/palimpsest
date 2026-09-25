/**
 * PLMP-LEAN-1 §D2-d — HOST-LOCAL ASYNCHRONOUS WORK EXECUTION TRANSPORT.
 *
 * The whole design is one equation:
 *
 *     Async D2 = existing synchronous semantics + different lifetime/transport
 *
 * NOT "new scheduler semantics". `prepare`, `run`, `settle`, the completion invariant, basis admission,
 * verification, eligibility and promotion authority are all frozen and unchanged; this module adds a
 * non-blocking `start`, a host-local job lifetime, observation, restart honesty — and nothing else.
 *
 * That is why there is exactly ONE blocking kernel below (`executeMutatingWorkBlocking`) and the async
 * layer is a thin wrapper over it. Two implementations — `syncPrepare` + `asyncRun` +
 * `asyncSpecificSettlement` — would drift within a release, and the drift would be invisible until an
 * async attempt settled under rules the sync path does not share.
 *
 * TWO PLANES, NEVER CONFUSED:
 *
 *     HostJobState  !=  AttemptState          HostJob  is NOT  canonical Project truth
 *
 * The job map is a RUNTIME AID this process holds for Promise ownership, observation and error
 * reporting. It is deliberately thin — an invocation handle, an execution promise and minimal
 * observation metadata — because a job entry that accumulates task definitions, authority state, retry
 * counts and verification status is a scheduler database without durability, which is exactly what this
 * must never become. Every project fact still comes from the canonical layers.
 *
 * Consequently there is no bypass of the form `job FINISHED ⇒ ATTEMPT_COMPLETED`, and no
 * `job HOST_ERROR ⇒ ATTEMPT_FAILED`. The ONLY thing that completes an attempt is
 * `settleMutatingWork()`, and a host failure to keep observing work is not a statement about the work.
 *
 * RESTART HONESTY is stated as plainly as it can be: host-local jobs are NOT durable. After a restart
 * the map is empty, and the canonical project says what is true on its own —
 *
 *     crash before prepare      → nothing started (the host accepted an invocation, nothing more)
 *     crash after prepare       → ATTEMPT RUNNING with its world retained: orphaned execution stays
 *                                 canonically UNRESOLVED. Not failed, not auto-resumed.
 *     crash after a commit      → the same, with a result commit in the world (future recovery input)
 *     crash inside settle       → D2-e1's three windows already close this: export/report replay
 *     crash after settle        → ATTEMPT COMPLETED, and the job map's loss changes nothing
 *
 * INTERNAL: not re-exported by the interaction barrel, so it adds no package public name.
 */
import { randomUUID } from "node:crypto";

import type { ProjectController } from "../tools/controller.js";

/**
 * The worker execution port, declared STRUCTURALLY (this module is L3; the first-party implementation
 * is host/deployment code). Same idiom as `DelegationSnapshotPort` and `FinishVerificationFace`.
 */
export interface WorkWorkerRunPort {
  readonly adapterId: string;
  run(input: {
    readonly workDir: string;
    readonly context: unknown;
    readonly signal?: AbortSignal | undefined;
  }): Promise<{ readonly kind: "READY_FOR_SETTLEMENT" | "NEEDS_ESCALATION" | "HOST_FAILURE"; readonly detail?: string | undefined }>;
}

/** The host-execution phases. Host vocabulary, NOT a project lifecycle. */
export const WORK_JOB_PHASES = ["QUEUED", "RUNNING", "FINISHED", "HOST_ERROR"] as const;
export type WorkJobPhase = (typeof WORK_JOB_PHASES)[number];

/** What one host job can be asked, read-only. */
export interface WorkJobView {
  readonly jobId: string;
  /** The canonical task this job was frozen onto at `start` — never re-resolved afterwards. */
  readonly taskId: string;
  /** Present once prepare succeeded; from then on the caller is not limited to the ephemeral handle. */
  readonly attemptId: string | null;
  readonly phase: WorkJobPhase;
  /** The settlement outcome, once settle ran. A `NOT_READY`/`BASE_DRIFT` here is a NORMAL outcome. */
  readonly settlement: unknown;
  /** The host-side failure detail, when this process could not continue. Never a project fact. */
  readonly hostError: string | null;
}

export interface WorkDelegationStartResult {
  readonly jobId: string;
  readonly taskId: string;
  readonly state: "STARTED";
  readonly resumed: boolean;
  readonly detail: string;
}

export interface WorkDelegationTerminal {
  readonly jobId: string;
  readonly taskId: string;
  readonly attemptId: string | null;
  readonly phase: Extract<WorkJobPhase, "FINISHED" | "HOST_ERROR">;
  readonly settlement: unknown;
  readonly hostError: string | null;
}

export interface WorkDelegationServiceDeps {
  readonly controller: Pick<
    ProjectController,
    "mutatingWorkTarget" | "prepareMutatingWork" | "workWorkerAttemptContext" | "settleMutatingWork" | "attemptWorkRecord"
  >;
  /** A port PER job, bound to the world the job's prepare materializes. */
  readonly workerFor: (worldPath: string) => WorkWorkerRunPort;
  /** Terminal delivery (attention / followup). Only ever called once per job, with a terminal phase. */
  readonly onTerminal?: ((terminal: WorkDelegationTerminal) => void) | undefined;
}

export interface WorkDelegationService {
  start(input?: { readonly expectedTaskId?: string | undefined }): Promise<WorkDelegationStartResult>;
  /** READ-ONLY. Never retries, resumes, settles, verifies or promotes — it is not a command channel. */
  followup(input: { readonly jobId: string }): Promise<WorkJobView | { readonly jobId: string; readonly phase: "UNKNOWN"; readonly detail: string }>;
  /** READ-ONLY canonical inspection, addressed by the DURABLE identity rather than the host handle. */
  inspectAttempt(input: { readonly attemptId: string }): Promise<{
    readonly attemptId: string;
    readonly known: boolean;
    readonly state: string | null;
    readonly taskId: string | null;
  }>;
}

export class WorkDelegationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkDelegationError";
  }
}

/**
 * THE ONE BLOCKING KERNEL: prepare → run → settle, synchronously awaited.
 *
 * Both the blocking entry point and every async job call THIS. Nothing here re-resolves the task after
 * `start` froze it, and nothing here decides eligibility: `settleMutatingWork` is the only thing that
 * can complete an attempt, and it does so on observed facts.
 */
export async function executeMutatingWorkBlocking(
  deps: WorkDelegationServiceDeps,
  input: { readonly expectedTaskId: string; readonly signal?: AbortSignal | undefined },
): Promise<{
  readonly taskId: string;
  readonly attemptId: string;
  readonly settlement: unknown;
}> {
  // Re-ASSERT the frozen target (and, inside, the head basis) before any effect: a world that moved
  // between `start` and here is refused rather than silently reinterpreted as a different request.
  const prepared = await deps.controller.prepareMutatingWork({ expectedTaskId: input.expectedTaskId });
  // §D5-c3: compiled AFTER the attempt's identity and world exist (prepared),
  // BEFORE the worker runs — per attempt, never per task-latest.
  const context = await deps.controller.workWorkerAttemptContext(prepared.attemptId);
  const worker = deps.workerFor(prepared.worldPath);
  const workerOutcome = await worker.run({
    workDir: prepared.worldPath,
    context,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  const settlement = await deps.controller.settleMutatingWork({
    attemptId: prepared.attemptId,
    workerOutcome,
  });
  return Object.freeze({ taskId: prepared.taskId, attemptId: prepared.attemptId, settlement });
}

export function makeWorkDelegationService(deps: WorkDelegationServiceDeps): WorkDelegationService {
  /**
   * The HOST-LOCAL half: thin on purpose. Nothing here is canonical, nothing here is durable, and
   * nothing here may grow into a second scheduler store.
   */
  const jobs = new Map<string, WorkJobView & { readonly promise: Promise<void> }>();

  function viewOf(entry: WorkJobView & { readonly promise: Promise<void> }): WorkJobView {
    return Object.freeze({
      jobId: entry.jobId,
      taskId: entry.taskId,
      attemptId: entry.attemptId,
      phase: entry.phase,
      settlement: entry.settlement,
      hostError: entry.hostError,
    });
  }

  return Object.freeze({
    async start(input: { readonly expectedTaskId?: string | undefined } = {}): Promise<WorkDelegationStartResult> {
      // RESOLVE ONCE, before any job exists: this is what freezes the execution request identity. A
      // refusal here (no canonical work, wrong task, occupied lane, prose instead of work) means no job,
      // no attempt, no world and no event.
      const target = deps.controller.mutatingWorkTarget(
        input.expectedTaskId === undefined ? {} : { expectedTaskId: input.expectedTaskId },
      );
      const jobId = `wdj-${randomUUID()}`;
      const entry = {
        jobId,
        taskId: target.taskId,
        attemptId: null as string | null,
        phase: "QUEUED" as WorkJobPhase,
        settlement: null as unknown,
        hostError: null as string | null,
        promise: Promise.resolve(),
      };
      jobs.set(jobId, entry);

      const terminal = (phase: Extract<WorkJobPhase, "FINISHED" | "HOST_ERROR">): void => {
        entry.phase = phase;
        try {
          deps.onTerminal?.({
            jobId,
            taskId: entry.taskId,
            attemptId: entry.attemptId,
            phase,
            settlement: entry.settlement,
            hostError: entry.hostError,
          });
        } catch {
          /* delivery failed; the canonical state is unchanged and `followup` still tells the truth */
        }
      };

      entry.promise = (async () => {
        entry.phase = "RUNNING";
        try {
          const prepared = await deps.controller.prepareMutatingWork({ expectedTaskId: target.taskId });
          // Exposed as soon as it exists: from here the caller has a DURABLE identity, not just this
          // process's ephemeral handle.
          entry.attemptId = prepared.attemptId;
          const context = await deps.controller.workWorkerAttemptContext(prepared.attemptId);
          const workerOutcome = await deps.workerFor(prepared.worldPath).run({ workDir: prepared.worldPath, context });
          entry.settlement = await deps.controller.settleMutatingWork({
            attemptId: prepared.attemptId,
            workerOutcome,
          });
          terminal("FINISHED");
        } catch (error) {
          /**
           * A HOST-side failure to continue. It is recorded as such and NOTHING ELSE: the canonical
           * attempt keeps whatever state it really has (RUNNING, with its world and any commit in it),
           * the lane stays fenced, and no `ATTEMPT_FAILED` is fabricated.
           */
          entry.hostError = error instanceof Error ? error.message : String(error);
          terminal("HOST_ERROR");
        }
      })();
      // Nothing awaits the job here: that is the entire point of the async transport.
      void entry.promise;

      return Object.freeze({
        jobId,
        taskId: target.taskId,
        state: "STARTED" as const,
        resumed: target.resumed,
        detail: target.resumed
          ? "this work already held the mutating lane, so the job resumes its existing execution position"
          : "the canonical task was resolved and frozen; the job is preparing its execution world",
      });
    },

    async followup(input: { readonly jobId: string }): Promise<WorkJobView | { readonly jobId: string; readonly phase: "UNKNOWN"; readonly detail: string }> {
      const { jobId } = input;
      const entry = jobs.get(jobId);
      if (entry === undefined) {
        /**
         * An unknown handle after a restart is NOT a failure. Host jobs are not durable, so this process
         * simply never had it — and the honest answer says which of the two query spaces applies.
         */
        return Object.freeze({
          jobId,
          phase: "UNKNOWN" as const,
          detail:
            "this host has no such job (host-local jobs are not durable, so a restart forgets them) — inspect the attempt by its own id for the canonical truth",
        });
      }
      return viewOf(entry);
    },

    async inspectAttempt(input: { readonly attemptId: string }) {
      const { attemptId } = input;
      const record = deps.controller.attemptWorkRecord(attemptId);
      return Object.freeze({
        attemptId,
        known: record !== null,
        state: record?.state ?? null,
        taskId: record?.taskId ?? null,
      });
    },
  });
}
