/**
 * SR-1D R2 §7/§8/§9 — the work application-surface cluster.
 *
 * Owns BOTH the façade interfaces (WorkApplicationSurface) and the constructor that
 * implements them, from a NARROW input: this module can only see the 1 dependencies it
 * actually reads (controller). Behaviour is unchanged.
 */

import type { ProjectController } from "../../tools/controller.js";
import type { HostDeploymentFactsPort } from "../common.js";
import type { ProjectStandard } from "../../domain/standard.js";
import { definePalimpsestControl } from "../../tools/control_surface.js";

/**
 * PLMP-LEAN-1 §B.15: the narrow verification face the finish composition needs. Structural on
 * purpose — the application layer composes the two owners without depending on the verification
 * plane's own types, and `ProjectController` never imports it at all.
 */
export interface FinishVerificationFace {
  readonly service: {
    verifyAttemptResult(input: { readonly attemptId: string; readonly requestedBy: string }): Promise<{
      readonly run: { readonly verdict: string | null; readonly status: string } | null;
      readonly detail: string;
    }>;
  };
}

/**
 * LHAPE-A: the async mutating-work transport, structurally.
 *
 * Declared here rather than imported from `src/interaction/work_delegation.ts` so the application
 * layer composes the service without depending on its module. The real `WorkDelegationService`
 * satisfies this shape; no second transport exists.
 */
export interface WorkDelegationFace {
  start(input?: { readonly expectedTaskId?: string | undefined }): Promise<{
    readonly jobId: string;
    readonly taskId: string;
    readonly state: "STARTED";
    readonly resumed: boolean;
    readonly detail: string;
  }>;
  jobs(): Promise<readonly {
    readonly jobId: string;
    readonly taskId: string;
    readonly attemptId: string | null;
    readonly phase: string;
    readonly settlement: unknown;
    readonly hostError: string | null;
    readonly stopRequested: boolean;
  }[]>;
  stop(input: { readonly jobId?: string | undefined; readonly taskId?: string | undefined }): Promise<{
    readonly jobId: string;
    readonly taskId: string;
    readonly phase: string;
    readonly state: "STOP_REQUESTED" | "ALREADY_TERMINAL" | "UNKNOWN";
    readonly detail: string;
  }>;
}

/**
 * LHAPE-B: the existing packaged continuation authority, structurally. The agent may INSPECT and
 * choose a safe continuation route; it never accepts, promotes or verifies a result.
 */
export interface ResultContinuationFace {
  inspect(input: { readonly result: { readonly kind: "ATTEMPT_RESULT" | "DERIVED_RESULT"; readonly ref: string } }): {
    readonly resolved: boolean;
    readonly taskId: string | null;
    readonly compatibility: { readonly outcome: string; readonly issuanceDigest: string | null };
    readonly assessment: {
      readonly assessmentDigest: string;
      readonly currentness: string | null;
      readonly compatibility: string;
      readonly detail: string;
      readonly reuse: {
        readonly exactCurrent: boolean;
        readonly rematerializationAvailable: boolean;
        readonly blocker: string | null;
      };
      readonly rework: { readonly available: boolean; readonly blocker: string | null };
    } | null;
    /** ALHS-B: path-level reuse facts, when the deployment can read them. */
    readonly reuse?: import("../../continuation/ports.js").ContinuationReusePlan | null;
    readonly availableActions: { readonly rematerialize: boolean; readonly rework: boolean };
    readonly detail: string;
  };
  rematerialize(input: {
    readonly result: { readonly kind: "ATTEMPT_RESULT" | "DERIVED_RESULT"; readonly ref: string };
    readonly expectedAssessmentDigest: string;
  }): Promise<{ readonly state: string; readonly taskId: string; readonly detail: string; readonly candidateRef: string | null }>;
  startRework(input: {
    readonly result: { readonly kind: "ATTEMPT_RESULT" | "DERIVED_RESULT"; readonly ref: string };
    readonly expectedAssessmentDigest: string;
  }): Promise<{
    readonly state: string;
    readonly taskId: string;
    readonly detail: string;
    readonly jobId: string | null;
    readonly attemptId: string | null;
  }>;
}

/** Exactly the dependencies this cluster reads — nothing else is visible to it (§9). */
export interface WorkSurfaceDeps {
  readonly controller: ProjectController;
  /** Host facts about the running deployment; absent means no dashboard is known of. */
  readonly hostFacts?: HostDeploymentFactsPort | undefined;
  /** §B.15: present when this deployment composes an attempt-result verification runtime. */
  readonly verification?: FinishVerificationFace | undefined;
  /** LHAPE-A: the composed async worker transport; absent ⇒ no worker can start in this deployment. */
  readonly workDelegation?: WorkDelegationFace | undefined;
  /** LHAPE-B: the composed result-continuation authority; absent ⇒ no continuation inspection. */
  readonly continuation?: ResultContinuationFace | undefined;
}

export interface WorkApplicationSurface {
  /**
   * Where a human can watch this project, or null when no dashboard is known.
   *
   * The agent is the primary surface, so the person it is talking to needs the way to the dashboard.
   * Only the host can answer this, and only once it has served; the adapter reports null rather than
   * inventing a url.
   */
  dashboardUrl(): string | null;
  /**
   * How the dashboard is guarded, or null when none is served. This is what makes the agent's answer
   * complete: fence ⇒ the address alone opens it; token ⇒ the person needs the handoff link, which
   * is at {@link dashboardHandoffFile} — never in this conversation.
   */
  dashboardAuth(): "fence" | "token" | null;
  /** Token mode only: the file holding the person's handoff link. Null otherwise. */
  dashboardHandoffFile(): string | null;
  /**
   * PLMP-LEAN-1 §1/§4: the project's confirmed done-ness, or null when the operator has not stated
   * one (a derivation candidate is NOT a standard). This is what lets a user-facing surface show
   * "what counts as done here" instead of asking a person to choose predicates.
   */
  standard(): ProjectStandard | undefined;
  /** The commands this deployment authorizes — the options a gate form may offer, and nothing else. */
  authorizedCommands(): readonly { readonly executable: string; readonly argv_prefix: readonly string[] }[];
  /** The gate ids already declared, so a promotion control offers real ids instead of a text box. */
  declaredGateIds(): readonly string[];
  /**
   * PLMP-LEAN-1 appendix A: the agent says "this piece is done" ONCE and the product derives the
   * rest — which commands to run, what the write scope was, whether the declared artifacts exist,
   * and what the attempt's report must say. The caller supplies no attempt id, predicate, command,
   * exit code or changed-file list. Every failure leaves the attempt RUNNING.
   */
  finish(input?: { readonly summary?: string | undefined } | undefined): Promise<{
    readonly attemptId: string;
    readonly state: "COMPLETED";
    readonly changedFiles: readonly string[];
    readonly evidenceRecorded: readonly string[];
    readonly nextEvidenceNeeded: readonly string[];
    /**
     * §B.15: the verification conclusion, when this attempt's contract requires one. A verification
     * FAILURE is reported here and NEVER as a thrown error — the attempt really is COMPLETED, and
     * pretending otherwise would leave the principal editing a settled attempt.
     */
    readonly verification: {
      readonly required: boolean;
      readonly satisfied: boolean;
      readonly verdict: string | null;
      readonly detail: string | null;
    };
  }>;
  /**
   * PLMP-LEAN-1 appendix E (2A-B): the **begin** protocol, symmetric with `finish`. The agent states
   * what the work is (a goal and the write scope it intends to touch) and the product MECHANICALLY
   * establishes the single managed work position — project, task, envelope, attempt, claim — so the
   * principal can just start working. The agent never operates the scheduler and never sees an
   * attempt id. Every precondition is checked before anything is written.
   */
  begin(input: {
    readonly goal: string;
    readonly writePaths: readonly string[];
    readonly requiredArtifacts?: readonly string[] | undefined;
  }): Promise<{
    readonly state: "READY" | "RESUMED";
    readonly goal: string;
    readonly writeScope: readonly string[];
    readonly requiredArtifacts: readonly string[];
    readonly completion: {
      readonly mechanicalChecks: readonly string[];
      readonly independentVerificationRequired: boolean;
    };
  }>;
  /**
   * PC1 S02-R02: close the CURRENT placed attempt through the existing settlement owner. This is the
   * principal-facing equivalent of `finish` for a deployment that places work in an isolated world:
   * the product observes the world, exports the result, evaluates the completion contract and reports
   * the attempt. It refuses when there is not exactly one RUNNING attempt.
   */
  completePlaced(input?: { readonly summary?: string | undefined } | undefined): Promise<{
    readonly attemptId: string;
    readonly state: "COMPLETED";
    readonly resultCommit: string;
    readonly changedFiles: readonly string[];
    readonly evidenceRecorded: readonly string[];
    readonly nextEvidenceNeeded: readonly string[];
  }>;
  /**
   * LHAPE-A: start a REAL work worker for one existing canonical task, in its own execution world.
   * The call returns once the position is prepared (or refused); it never waits for the worker.
   */
  startWorker(input?: { readonly taskId?: string | undefined } | undefined): Promise<{
    readonly state: "STARTED" | "UNAVAILABLE" | "REFUSED";
    readonly taskId: string | null;
    readonly jobId: string | null;
    readonly resumed: boolean;
    readonly detail: string;
  }>;
  /**
   * LHAPE-A/B: what this host can actually see about worker execution. Host jobs are NOT durable, so
   * a canonical RUNNING attempt with no host job is reported as UNOBSERVED, never as running.
   */
  workers(): Promise<{
    readonly placement: "in-place" | "worktree";
    readonly jobs: readonly {
      readonly jobId: string;
      readonly taskId: string;
      readonly phase: string;
      readonly settlementState: string | null;
      readonly hostError: string | null;
      readonly stopRequested: boolean;
    }[];
    readonly attempts: readonly {
      readonly taskId: string | null;
      readonly state: string;
      readonly taskState: string | null;
      readonly orphaned: boolean;
      readonly hostObserved: boolean;
    }[];
    readonly detail: string;
  }>;
  /** LHAPE-B: request a stop. `STOP_REQUESTED` is explicitly not an observation that it stopped. */
  stopWorker(input: { readonly taskId: string }): Promise<{
    readonly state: "STOP_REQUESTED" | "ALREADY_TERMINAL" | "UNKNOWN" | "UNAVAILABLE";
    readonly taskId: string;
    readonly detail: string;
  }>;
  /**
   * LHAPE-B: inspect the latest COMPLETED result for one task, or all such tasks, through the packaged
   * continuation authority. The digest is the freshness fence a subsequent route must carry.
   */
  results(input?: { readonly taskId?: string | undefined } | undefined): Promise<{
    readonly state: "OK" | "UNAVAILABLE";
    readonly results: readonly {
      readonly taskId: string;
      readonly taskState: string | null;
      readonly resolved: boolean;
      readonly compatibility: string;
      readonly currentness: string | null;
      readonly exactCurrent: boolean;
      readonly actions: { readonly rematerialize: boolean; readonly rework: boolean };
      readonly assessmentDigest: string | null;
      /** The observable candidate commit, when the attempt has a completed report. */
      readonly resultCommit: string | null;
      /**
       * ALHS-B: path-level reuse facts. `unaffectedPaths` may be reused by a NEW governed attempt;
       * `conflictedPaths` must be recomputed. This is planning evidence, not acceptance.
       */
      readonly reuse: import("../../continuation/ports.js").ContinuationReusePlan | null;
      readonly detail: string;
    }[];
    readonly detail: string;
  }>;
  /**
   * LHAPE-B: choose a safe continuation route for a task's latest result. The product re-observes the
   * world and refuses a stale assessment; this is a route choice, never acceptance.
   */
  continueResult(input: {
    readonly taskId: string;
    readonly route: "rematerialize" | "rework";
    readonly expectedAssessmentDigest: string;
  }): Promise<{
    readonly state: string;
    readonly taskId: string;
    readonly detail: string;
    readonly candidateRef: string | null;
    readonly jobId: string | null;
  }>;
  /**
   * LHAPE-B: settle ONE specific task's RUNNING attempt from the canonical world. This is the recovery
   * path after a host without its job map: the observation of the world decides, and an active host job
   * for the same task is refused rather than raced.
   */
  completeTask(input: { readonly taskId: string; readonly summary?: string | undefined }): Promise<{
    readonly state: "SETTLED" | "NOT_READY" | "BASE_DRIFT" | "NO_RUNNING_ATTEMPT" | "MULTIPLE_ATTEMPTS" | "WORKER_ACTIVE";
    readonly taskId: string;
    readonly detail: string;
    readonly resultCommit: string | null;
    readonly changedFiles: readonly string[];
  }>;
  /**
   * PLMP-LEAN-1 §5 / 2A-Q: readiness in two layers — what the DEPLOYMENT can do, and what the
   * CURRENT task requires. The deployment layer is answerable at startup; the task layer only once a
   * task exists. A deployment gap ("no independent verifier") is a task blocker only when this task
   * actually needs one, so a project is never marked NOT READY for a requirement it does not have.
   */
  completionReadiness(): import("../../domain/completion_contract.js").CompletionReadiness;
  status(): unknown;
  graph(): unknown;
  preview(): unknown;
  /** Work control verbs (pause/resume/next/run/claim/gate/report/plan/promote/holdSet/holdClear). */
  control(op: string, args: readonly unknown[]): unknown;
  /**
   * PC1 S02-R02: WHERE this deployment places work. The normal completion facade uses it to choose
   * the real path instead of making the agent guess whether `finish` applies.
   */
  placement(): "in-place" | "worktree";
  /**
   * PC1-V1 R4: the ACTUAL filesystem boundary, stated before the first write.
   *
   * A non-moving canonical ProjectIR head does not mean the live Git tree or HEAD stayed still.
   * This projection keeps the two protections distinct and never calls in-place work isolated.
   */
  boundary(): {
    readonly placement: "in-place" | "worktree";
    readonly liveRepositoryMutable: boolean;
    readonly isolated: boolean;
    readonly preAcceptance: boolean;
    readonly detail: string;
    readonly warning: string | null;
  };
}

export function makeWorkSurfaces(deps: WorkSurfaceDeps): { readonly work: WorkApplicationSurface } {
    const work: WorkApplicationSurface = {
      dashboardUrl: () => deps.hostFacts?.dashboardUrl() ?? null,
      dashboardAuth: () => deps.hostFacts?.dashboardAuth() ?? null,
      dashboardHandoffFile: () => deps.hostFacts?.dashboardHandoffFile() ?? null,
      standard: () => deps.controller.standard(),
      authorizedCommands: () => deps.controller.authorizedCommands(),
      declaredGateIds: () => deps.controller.declaredGateIds(),
      finish: async (input) => {
        // The WORK half first: once this returns, the attempt really is COMPLETED.
        const completed = await deps.controller.finish(input ?? {});
        // §B.15: the two owners meet HERE, in the product layer. `ProjectController` must not import
        // Verification, so the orchestration lives in the application composition instead.
        const contract = deps.controller.completionContract(completed.attemptId);
        if (contract === null || !contract.verification.required) {
          return {
            ...completed,
            verification: { required: false, satisfied: false, verdict: null, detail: null },
          };
        }
        if (deps.verification === undefined) {
          return {
            ...completed,
            verification: {
              required: true,
              satisfied: false,
              verdict: null,
              detail:
                "this attempt's contract requires independent verification and this deployment composes no runtime for it",
            },
          };
        }
        const outcome = await deps.verification.service.verifyAttemptResult({
          attemptId: completed.attemptId,
          requestedBy: "agent:palimpsest_finish",
        });
        const verdict = outcome.run?.verdict ?? null;
        return {
          ...completed,
          verification: {
            required: true,
            satisfied: verdict === "PASS",
            verdict,
            detail: outcome.detail,
          },
        };
      },
      completePlaced: async (input) => {
        const running = deps.controller.status().attempts.filter((attempt) => attempt.state === "RUNNING");
        if (running.length !== 1) {
          throw new Error(
            running.length === 0
              ? "no RUNNING attempt is available to complete; use `palimpsest_work action=run` to reach one"
              : `${String(running.length)} attempts are RUNNING; the product refuses to guess which one this completion closes`,
          );
        }
        const attemptId = running[0]!.attempt_id;
        const settled = await deps.controller.settleMutatingWork({
          attemptId,
          workerOutcome: { kind: "READY_FOR_SETTLEMENT", ...(input?.summary === undefined ? {} : { detail: input.summary }) },
        });
        if (settled.state !== "SETTLED") {
          throw new Error(`${settled.state}: ${settled.detail}`);
        }
        deps.controller.step();
        return {
          attemptId,
          state: "COMPLETED" as const,
          resultCommit: settled.resultCommit,
          changedFiles: settled.changedFiles,
          evidenceRecorded: settled.evidenceRecorded,
          nextEvidenceNeeded: Object.freeze([]),
        };
      },
      startWorker: async (input) => {
        if (deps.workDelegation === undefined) {
          return {
            state: "UNAVAILABLE" as const,
            taskId: input?.taskId ?? null,
            jobId: null,
            resumed: false,
            detail:
              "this deployment composes no work-worker transport, so no real worker can start; the canonical Work path remains available",
          };
        }
        try {
          const started = await deps.workDelegation.start(
            input?.taskId === undefined ? {} : { expectedTaskId: input.taskId },
          );
          /**
           * Do not return until the POSITION is canonical (or the job already failed). This is what
           * makes two sequential `delegate` calls deterministic: the first task is ACTIVE before the
           * scheduler is asked for the next one. It still returns while the worker RUNS — the wait is
           * bounded preparation observation, never completion.
           */
          for (let attempt = 0; attempt < 600; attempt += 1) {
            const current = (await deps.workDelegation.jobs()).find((job) => job.jobId === started.jobId);
            if (current === undefined) break;
            if (current.phase === "HOST_ERROR") {
              return {
                state: "REFUSED" as const,
                taskId: current.taskId,
                jobId: current.jobId,
                resumed: started.resumed,
                detail: current.hostError ?? "the worker host failed before the execution position became observable",
              };
            }
            if (current.attemptId !== null) {
              return {
                state: "STARTED" as const,
                taskId: current.taskId,
                jobId: current.jobId,
                resumed: started.resumed,
                detail:
                  current.phase === "FINISHED"
                    ? "the worker finished and the product settled its result before this reply"
                    : `the execution position is prepared and the worker is ${current.phase}; the task is canonical before this reply`,
              };
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          return {
            state: "STARTED" as const,
            taskId: started.taskId,
            jobId: started.jobId,
            resumed: started.resumed,
            detail: `${started.detail} (this reply did not observe the prepared position within its bounded wait)`,
          };
        } catch (error) {
          return {
            state: "REFUSED" as const,
            taskId: input?.taskId ?? null,
            jobId: null,
            resumed: false,
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      },
      workers: async () => {
        const status = deps.controller.status() as {
          attempts?: Array<{ attempt_id: string; task_id: string | null; state: string; orphaned?: boolean; task_state?: string }>;
          tasks?: Array<{ task_id: string; state: string }>;
        };
        const taskStates = new Map((status.tasks ?? []).map((task) => [task.task_id, task.state]));
        const jobs = deps.workDelegation === undefined ? [] : await deps.workDelegation.jobs();
        const activeJobs = jobs.filter((job) => job.phase === "QUEUED" || job.phase === "RUNNING");
        const attempts = (status.attempts ?? []).map((attempt) => ({
          taskId: attempt.task_id,
          state: attempt.state,
          taskState: attempt.task_state ?? (attempt.task_id === null ? null : taskStates.get(attempt.task_id) ?? null),
          orphaned: attempt.orphaned === true,
          hostObserved:
            attempt.task_id !== null && activeJobs.some((job) => job.taskId === attempt.task_id),
        }));
        return {
          placement: deps.controller.execution,
          jobs: jobs.map((job) => ({
            jobId: job.jobId,
            taskId: job.taskId,
            phase: job.phase,
            settlementState:
              typeof job.settlement === "object" && job.settlement !== null && "state" in job.settlement
                ? String((job.settlement as { state: unknown }).state)
                : null,
            hostError: job.hostError,
            stopRequested: job.stopRequested,
          })),
          attempts,
          detail:
            deps.workDelegation === undefined
              ? "no worker transport is composed in this deployment; only canonical attempt state is observable"
              : "host jobs are local to THIS process and are not durable; a canonical attempt with no active job is NOT proven to be running",
        };
      },
      stopWorker: async (input) => {
        if (deps.workDelegation === undefined) {
          return { state: "UNAVAILABLE" as const, taskId: input.taskId, detail: "this deployment composes no work-worker transport" };
        }
        const stopped = await deps.workDelegation.stop({ taskId: input.taskId });
        return { state: stopped.state, taskId: stopped.taskId === "" ? input.taskId : stopped.taskId, detail: stopped.detail };
      },
      results: async (input) => {
        if (deps.continuation === undefined) {
          return {
            state: "UNAVAILABLE" as const,
            results: [],
            detail: "this deployment composes no result-continuation authority, so no result can be inspected",
          };
        }
        const status = deps.controller.status() as {
          attempts?: Array<{ attempt_id: string; task_id: string | null; state: string }>;
          tasks?: Array<{ task_id: string; state: string }>;
        };
        const taskStates = new Map((status.tasks ?? []).map((task) => [task.task_id, task.state]));
        const latest = new Map<string, string>();
        for (const attempt of status.attempts ?? []) {
          if (attempt.state !== "COMPLETED" || attempt.task_id === null) continue;
          latest.set(attempt.task_id, attempt.attempt_id);
        }
        const taskIds =
          input?.taskId === undefined
            ? [...latest.keys()].sort()
            : latest.has(input.taskId)
              ? [input.taskId]
              : [];
        const results = taskIds.map((taskId) => {
          const attemptId = latest.get(taskId)!;
          const inspection = deps.continuation!.inspect({
            result: { kind: "ATTEMPT_RESULT" as const, ref: attemptId },
          });
          let resultCommit: string | null = null;
          try {
            resultCommit = deps.controller.promotions.canonicalAttemptResultCommit(attemptId);
          } catch {
            resultCommit = null;
          }
          return {
            taskId,
            taskState: taskStates.get(taskId) ?? null,
            resolved: inspection.resolved,
            compatibility: inspection.compatibility.outcome,
            currentness: inspection.assessment?.currentness ?? null,
            exactCurrent: inspection.assessment?.reuse.exactCurrent ?? false,
            actions: inspection.availableActions,
            assessmentDigest: inspection.assessment?.assessmentDigest ?? null,
            resultCommit,
            reuse: inspection.reuse ?? null,
            detail: inspection.detail,
          };
        });
        return {
          state: "OK" as const,
          results,
          detail:
            results.length === 0
              ? "no COMPLETED attempt result exists for that task in this project"
              : "each result is historical until an authorized Promotion accepts it; the digest is the freshness fence for a continuation route",
        };
      },
      continueResult: async (input) => {
        if (deps.continuation === undefined) {
          return {
            state: "UNAVAILABLE" as const,
            taskId: input.taskId,
            detail: "this deployment composes no result-continuation authority",
            candidateRef: null,
            jobId: null,
          };
        }
        const status = deps.controller.status() as {
          attempts?: Array<{ attempt_id: string; task_id: string | null; state: string }>;
        };
        const completed = (status.attempts ?? []).filter(
          (attempt) => attempt.task_id === input.taskId && attempt.state === "COMPLETED",
        );
        const latest = completed[completed.length - 1];
        if (latest === undefined) {
          return {
            state: "REFUSED" as const,
            taskId: input.taskId,
            detail: "this task has no COMPLETED attempt result to continue",
            candidateRef: null,
            jobId: null,
          };
        }
        const result = { kind: "ATTEMPT_RESULT" as const, ref: latest.attempt_id };
        try {
          if (input.route === "rematerialize") {
            const outcome = await deps.continuation.rematerialize({
              result,
              expectedAssessmentDigest: input.expectedAssessmentDigest,
            });
            return {
              state: outcome.state,
              taskId: outcome.taskId === "" ? input.taskId : outcome.taskId,
              detail: outcome.detail,
              candidateRef: outcome.candidateRef,
              jobId: null,
            };
          }
          const outcome = await deps.continuation.startRework({
            result,
            expectedAssessmentDigest: input.expectedAssessmentDigest,
          });
          return {
            state: outcome.state,
            taskId: outcome.taskId === "" ? input.taskId : outcome.taskId,
            detail: outcome.detail,
            candidateRef: null,
            jobId: outcome.jobId,
          };
        } catch (error) {
          return {
            state: "REFUSED" as const,
            taskId: input.taskId,
            detail: error instanceof Error ? error.message : String(error),
            candidateRef: null,
            jobId: null,
          };
        }
      },
      completeTask: async (input) => {
        const status = deps.controller.status() as {
          attempts?: Array<{ attempt_id: string; task_id: string | null; state: string }>;
        };
        const rawRunning = (status.attempts ?? []).filter((attempt) => {
          if (attempt.task_id !== input.taskId) return false;
          const record = deps.controller.attemptWorkRecord(attempt.attempt_id) as { state?: string } | null;
          return record?.state === "RUNNING";
        });
        if (rawRunning.length === 0) {
          return {
            state: "NO_RUNNING_ATTEMPT" as const,
            taskId: input.taskId,
            detail:
              "this task has no canonically RUNNING attempt; nothing was observed or settled. If its result already settled, inspect `results` instead",
            resultCommit: null,
            changedFiles: Object.freeze([]),
          };
        }
        if (rawRunning.length > 1) {
          return {
            state: "MULTIPLE_ATTEMPTS" as const,
            taskId: input.taskId,
            detail: `${String(rawRunning.length)} RUNNING attempts exist for this task; the product refuses to guess which one owns the work`,
            resultCommit: null,
            changedFiles: Object.freeze([]),
          };
        }
        const jobs = deps.workDelegation === undefined ? [] : await deps.workDelegation.jobs();
        const active = jobs.find(
          (job) => job.taskId === input.taskId && (job.phase === "QUEUED" || job.phase === "RUNNING"),
        );
        if (active !== undefined) {
          return {
            state: "WORKER_ACTIVE" as const,
            taskId: input.taskId,
            detail: `this host still has an active worker job (${active.jobId}, ${active.phase}) for the task; stop it or wait for the host observation instead of racing it`,
            resultCommit: null,
            changedFiles: Object.freeze([]),
          };
        }
        const attemptId = rawRunning[0]!.attempt_id;
        try {
          const settled = await deps.controller.settleMutatingWork({
            attemptId,
            workerOutcome: { kind: "READY_FOR_SETTLEMENT", ...(input.summary === undefined ? {} : { detail: input.summary }) },
          });
          if (settled.state === "SETTLED") {
            deps.controller.step();
            return {
              state: "SETTLED" as const,
              taskId: input.taskId,
              detail: `${settled.detail} — this host observed the world; it does not claim the previous worker process is still alive`,
              resultCommit: settled.resultCommit,
              changedFiles: settled.changedFiles,
            };
          }
          return {
            state: settled.state,
            taskId: input.taskId,
            detail: settled.detail,
            resultCommit: settled.state === "BASE_DRIFT" ? settled.resultCommit : null,
            changedFiles: Object.freeze([]),
          };
        } catch (error) {
          return {
            state: "NOT_READY" as const,
            taskId: input.taskId,
            detail: error instanceof Error ? error.message : String(error),
            resultCommit: null,
            changedFiles: Object.freeze([]),
          };
        }
      },
      begin: (input) => deps.controller.begin(input),
      completionReadiness: () => deps.controller.completionReadiness(),
      status: () => deps.controller.status(),
      graph: () => deps.controller.orchestrationGraph(),
      preview: () => deps.controller.preview(),
      placement: () => deps.controller.execution,
      boundary: () =>
        deps.controller.execution === "in-place"
          ? Object.freeze({
              placement: "in-place" as const,
              liveRepositoryMutable: true,
              isolated: false,
              preAcceptance: true,
              detail:
                "DIRECT LOW-RISK EDITING: native file edits and commits change the live repository and its Git HEAD immediately. Work completion observes the changed paths and enforces the declared write scope, but it cannot prevent an earlier edit. The canonical ProjectIR head moves only when an authorized Promotion accepts a result.",
              warning:
                "before your first edit: this is the live project tree, not an isolated candidate. For high-impact governed work, use isolated (worktree) execution so acceptance remains separate.",
            })
          : Object.freeze({
              placement: "worktree" as const,
              liveRepositoryMutable: false,
              isolated: true,
              preAcceptance: true,
              detail:
                "GOVERNED ISOLATED CANDIDATE: work happens in an isolated Git worktree. Edits there do not change the canonical branch or its HEAD; the canonical head moves only when an authorized Promotion accepts the result.",
              warning: null,
            }),
      control: (op, args) => {
        // Reuse the existing Work control surface — Work stays Work-scoped.
        const surface = definePalimpsestControl(deps.controller) as unknown as Record<string, (...a: readonly unknown[]) => unknown>;
        const verb = surface[op];
        if (verb === undefined) throw new Error(`unknown work control verb "${op}"`);
        return verb(...args);
      },
    };


  return { work };
}
