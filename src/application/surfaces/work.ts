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
import { gitTextRunner, planPathReuse, type PathReuseFacts } from "../../work/path_reuse.js";
import { unseenInputs } from "../../work/unseen_inputs.js";

/** PWRS-A: the durable relay recorder port, re-exported so the factory keeps its existing edges. */
export type { ExecutionRelayRecorderPort } from "../../work/execution_relay.js";

/**
 * PWRS-B: path-level reuse facts for a RETAINED attempt world.
 *
 * The same diff the continuation face runs for a COMPLETED result (`work/path_reuse.ts`), applied to
 * an attempt that never settled: a worker stopped, its world may still hold a commit, and a successor
 * needs to know what is still valid before it inherits or redoes. It is a READ — no ref moves, nothing
 * is promoted and no path is accepted.
 */
function relaySourceFacts(
  controller: ProjectController,
  attemptId: string,
): {
  readonly attemptId: string;
  readonly worldPath: string | null;
  readonly resultRevision: string | null;
  readonly currentRevision: string | null;
  readonly facts: PathReuseFacts | null;
} {
  const currentRevision = (controller.status() as { headCommit?: string }).headCommit ?? null;
  let observed: ReturnType<ProjectController["observeAttemptResult"]>;
  try {
    observed = controller.observeAttemptResult(attemptId);
  } catch {
    observed = null;
  }
  if (observed === null || currentRevision === null) {
    return { attemptId, worldPath: null, resultRevision: null, currentRevision, facts: null };
  }
  const baseCommit = controller.attemptWorkRecord(attemptId)?.envelope?.base_commit ?? "";
  return {
    attemptId,
    worldPath: observed.workDir,
    resultRevision: observed.observedHead,
    currentRevision,
    facts: planPathReuse({
      run: gitTextRunner(observed.workDir),
      baseRevision: baseCommit,
      resultRevision: observed.observedHead,
      currentRevision,
    }),
  };
}

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
    readonly attribution: import("../../work/execution_relay.js").ExecutionAttribution | null;
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
    /** ALHS-B: the result's own source revision, for reading unaffected content. */
    readonly resultCommit?: string | null;
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
  /**
   * PWRS-A: the durable settlement record. Absent ⇒ the attribution is still returned to the caller
   * and appears in the pulse, but it is not written to the project journal.
   */
  readonly executionRelay?: import("../../work/execution_relay.js").ExecutionRelayRecorderPort | undefined;
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
  completePlaced(input?: { readonly summary?: string | undefined; readonly acknowledgeInputs?: boolean | undefined } | undefined): Promise<{
    readonly attemptId: string;
    readonly state: "COMPLETED";
    readonly resultCommit: string;
    readonly changedFiles: readonly string[];
    readonly evidenceRecorded: readonly string[];
    readonly nextEvidenceNeeded: readonly string[];
    /** PWRS-A: which execution window the product observed for the settled bytes. */
    readonly attribution: import("../../work/execution_relay.js").ExecutionAttribution;
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
      /**
       * PWRS-A: where this attempt's world is, when it is observable. A path is not authority: the
       * transport still refuses a second writer into an unobserved world, and a principal that reads
       * or writes there must settle through `relay` so the attribution is recorded honestly.
       */
      readonly worldPath: string | null;
      /** PWRS-D: a settled attempt's world is HISTORY; its result commit is the artifact. */
      readonly worldState: "LIVE" | "HISTORICAL";
      readonly worldHead: string | null;
      /** True when the world has commits/changes the result commit does not contain. */
      readonly worldMovedAfterResult: boolean;
      readonly resultCommit: string | null;
      /** PWRS-E: canonical inputs the attempt's base never contained. */
      readonly inputsNotInBasis: readonly string[];
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
  completeTask(input: {
    readonly taskId: string;
    readonly summary?: string | undefined;
    /** PWRS-D: acknowledge project inputs that arrived after the attempt's base. */
    readonly acknowledgeInputs?: boolean | undefined;
  }): Promise<{
    readonly state: "SETTLED" | "NOT_READY" | "BASE_DRIFT" | "NO_RUNNING_ATTEMPT" | "MULTIPLE_ATTEMPTS" | "WORKER_ACTIVE";
    readonly taskId: string;
    readonly detail: string;
    readonly resultCommit: string | null;
    readonly changedFiles: readonly string[];
    /** PWRS-A: present when the attempt settled; the product's own observed attribution. */
    readonly attribution?: import("../../work/execution_relay.js").ExecutionAttribution | null;
  }>;
  /**
   * PWRS-A: continue an attempt whose worker is no longer running.
   *
   * `takeover` closes the SAME attempt after an observed invocation exit (or an explicit declaration
   * that the previous executor is abandoned) and records principal recovery. `successor` closes an
   * attempt this host cannot prove quiescent and returns the retained world's path-level reuse facts,
   * so a NEW attempt can continue the still-valid work in a fresh world at the same basis.
   *
   * Neither route accepts, promotes or verifies anything; both are recorded as declarations or
   * observations, never as worker production.
   */
  relay(input: {
    readonly taskId: string;
    readonly route: "takeover" | "successor";
    /** Required for `takeover` when no invocation exit was observed; recorded as DECLARED. */
    readonly declareExecutorAbandoned?: boolean | undefined;
    /**
     * PWRS-D: the principal's confirmation that it re-read project inputs that arrived after the
     * attempt's base. Without it, a principal settlement is refused while such inputs exist.
     */
    readonly acknowledgeInputs?: boolean | undefined;
    readonly summary?: string | undefined;
  }): Promise<{
    readonly state: "TAKEOVER_SETTLED" | "SUCCESSOR_READY" | "REFUSED" | "NOT_READY";
    readonly taskId: string;
    readonly route: "takeover" | "successor";
    readonly attemptId: string | null;
    readonly detail: string;
    readonly resultCommit: string | null;
    readonly changedFiles: readonly string[];
    readonly attribution: import("../../work/execution_relay.js").ExecutionAttribution | null;
    /** For `successor`: the retained world and its path-level reuse facts against the current head. */
    readonly retainedWorldPath: string | null;
    readonly reuse: import("../../work/path_reuse.js").PathReuseFacts | null;
    /** PWRS-E: project inputs the attempt's base never contained; successor requires acknowledgement. */
    readonly inputsNotInBasis: readonly string[];
    /** For `successor`: the task state after the scheduler tick, so the caller knows what to do next. */
    readonly taskState: string | null;
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
    /**
     * PWRS-A: persist ONE settlement attribution as the durable relay record. The recorder is the
     * project journal (an ordinary REFERENCE_NOTE with one marker), not a new store. A recorder
     * failure is reported but never turns a completed settlement into a failure.
     */
    const recordRelay = async (
      surfaceDeps: WorkSurfaceDeps,
      attemptId: string,
      resultCommit: string,
      attribution: import("../../work/execution_relay.js").ExecutionAttribution,
    ): Promise<void> => {
      if (surfaceDeps.executionRelay === undefined) return;
      const record = surfaceDeps.controller.attemptWorkRecord(attemptId);
      const taskId = record?.taskId ?? "";
      const baseCommit = record?.envelope?.base_commit ?? "";
      if (taskId === "") return;
      try {
        await surfaceDeps.executionRelay.record({ taskId, attemptId, baseCommit, resultCommit, attribution });
      } catch {
        /* the settlement is canonical; a derived record failure must not undo it */
      }
    };

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
          // PWRS-A: the principal path is named as such. The Work owner still attributes the bytes
          // from its own observations; naming the path cannot manufacture worker production.
          observation: {
            path: "PRINCIPAL",
            ...(input?.acknowledgeInputs === true ? { acknowledgeInputs: true } : {}),
          },
        });
        if (settled.state !== "SETTLED") {
          throw new Error(`${settled.state}: ${settled.detail}`);
        }
        deps.controller.step();
        await recordRelay(deps, attemptId, settled.resultCommit, settled.attribution);
        return {
          attemptId,
          state: "COMPLETED" as const,
          resultCommit: settled.resultCommit,
          changedFiles: settled.changedFiles,
          evidenceRecorded: settled.evidenceRecorded,
          nextEvidenceNeeded: Object.freeze([]),
          attribution: settled.attribution,
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
        const attempts = (status.attempts ?? []).map((attempt) => {
          let worldPath: string | null = null;
          let worldHead: string | null = null;
          let dirty = false;
          try {
            const observed = deps.controller.observeAttemptResult(attempt.attempt_id);
            worldPath = observed?.workDir ?? null;
            worldHead = observed?.observedHead ?? null;
            dirty = (observed?.uncommittedChanges.length ?? 0) > 0;
          } catch {
            worldPath = null;
          }
          let resultCommit: string | null = null;
          try {
            resultCommit = deps.controller.promotions.canonicalAttemptResultCommit(attempt.attempt_id);
          } catch {
            resultCommit = null;
          }
          const historical = ["COMPLETED", "FAILED", "CANCELLED", "EXPIRED", "STALE"].includes(attempt.state);
          const baseCommit = deps.controller.attemptWorkRecord(attempt.attempt_id)?.envelope?.base_commit ?? "";
          const repositoryPath = deps.controller.effects.git.repository;
          return {
            taskId: attempt.task_id,
            state: attempt.state,
            taskState: attempt.task_state ?? (attempt.task_id === null ? null : taskStates.get(attempt.task_id) ?? null),
            orphaned: attempt.orphaned === true,
            hostObserved:
              attempt.task_id !== null && activeJobs.some((job) => job.taskId === attempt.task_id),
            worldPath,
            worldState: historical ? ("HISTORICAL" as const) : ("LIVE" as const),
            worldHead,
            worldMovedAfterResult: historical && (dirty || resultCommit === null || worldHead !== resultCommit),
            resultCommit,
            inputsNotInBasis:
              baseCommit === "" || repositoryPath === undefined
                ? Object.freeze([] as string[])
                : unseenInputs({ repository: repositoryPath, baseCommit }),
          };
        });
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
            resultCommit: inspection.resultCommit ?? resultCommit,
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
            observation: {
              path: "PRINCIPAL",
              ...(input.acknowledgeInputs === true ? { acknowledgeInputs: true } : {}),
            },
          });
          if (settled.state === "SETTLED") {
            deps.controller.step();
            await recordRelay(deps, attemptId, settled.resultCommit, settled.attribution);
            return {
              state: "SETTLED" as const,
              taskId: input.taskId,
              detail: `${settled.detail} — this host observed the world; it does not claim the previous worker process is still alive`,
              resultCommit: settled.resultCommit,
              changedFiles: settled.changedFiles,
              attribution: settled.attribution,
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
      relay: async (input) => {
        const status = deps.controller.status() as {
          attempts?: Array<{ attempt_id: string; task_id: string | null; state: string }>;
          tasks?: Array<{ task_id: string; state: string }>;
        };
        const running = (status.attempts ?? []).filter((attempt) => {
          if (attempt.task_id !== input.taskId) return false;
          const record = deps.controller.attemptWorkRecord(attempt.attempt_id) as { state?: string } | null;
          return record?.state === "RUNNING";
        });
        const refused = (detail: string): Awaited<ReturnType<WorkApplicationSurface["relay"]>> => ({
          state: "REFUSED" as const,
          taskId: input.taskId,
          route: input.route,
          attemptId: running.length === 1 ? running[0]!.attempt_id : null,
          detail,
          resultCommit: null,
          changedFiles: Object.freeze([]),
          attribution: null,
          retainedWorldPath: null,
          reuse: null,
          inputsNotInBasis: Object.freeze([]),
          taskState: null,
        });
        if (running.length === 0) {
          return refused(
            "this task has no canonically RUNNING attempt; a relay continues an attempt that exists. If its result already settled, inspect `results` instead",
          );
        }
        if (running.length > 1) {
          return refused(`${String(running.length)} RUNNING attempts exist for this task; the product refuses to guess which one the relay continues`);
        }
        const attemptId = running[0]!.attempt_id;
        const jobs = deps.workDelegation === undefined ? [] : await deps.workDelegation.jobs();
        const active = jobs.find(
          (job) => job.taskId === input.taskId && (job.phase === "QUEUED" || job.phase === "RUNNING"),
        );
        if (active !== undefined) {
          return refused(
            `this host still observes an active worker job (${active.jobId}, ${active.phase}) for the task; a relay would race a writer it can see — stop it or wait for its observed exit`,
          );
        }
        const invocations = deps.controller.executionInvocations.list(attemptId);
        const open = invocations.find((invocation) => invocation.outcome === "OPEN");
        if (open !== undefined) {
          return refused(
            `this host still observes worker invocation ${open.invocationId} as OPEN; the world is being written, so no takeover or successor is recorded`,
          );
        }

        if (input.route === "takeover") {
          const last = invocations.length === 0 ? null : invocations[invocations.length - 1]!;
          const observedExit = last?.outcome === "ENDED";
          /**
           * PWRS-A §6.3: only an OBSERVED exit authorizes a same-world takeover without a statement.
           * No invocation at all (a restart, another host) and an UNCONFIRMED exit both mean the world
           * may still have a writer, so the principal must DECLARE the abandonment — recorded as
           * declared, never as observed — or choose the isolated successor route.
           */
          if (!observedExit && input.declareExecutorAbandoned !== true) {
            return refused(
              last?.outcome === "UNCONFIRMED"
                ? "this host's last worker invocation ended without a confirmed process exit. A same-world takeover needs an explicit `declareExecutorAbandoned=true` declaration (recorded as DECLARED, never as observed), or choose `relayRoute=successor` to continue in an isolated world"
                : "this host observed no worker invocation for the attempt, so its world may still have a writer. A same-world takeover needs an explicit `declareExecutorAbandoned=true` declaration (recorded as DECLARED, never as observed), or choose `relayRoute=successor` to continue in an isolated world",
            );
          }
          const declaration = observedExit
            ? { declaredAt: new Date().toISOString(), declaredBy: "PRINCIPAL" as const, livenessBasis: "OBSERVED_EXIT" as const }
            : { declaredAt: new Date().toISOString(), declaredBy: "PRINCIPAL" as const, livenessBasis: "DECLARED_ABANDONED" as const };
          try {
            const settled = await deps.controller.settleMutatingWork({
              attemptId,
              workerOutcome: { kind: "READY_FOR_SETTLEMENT", ...(input.summary === undefined ? {} : { detail: input.summary }) },
              observation: {
                path: "PRINCIPAL",
                takeover: declaration,
                ...(input.acknowledgeInputs === true ? { acknowledgeInputs: true } : {}),
              },
            });
            if (settled.state !== "SETTLED") {
              return {
                ...refused(`${settled.state}: ${settled.detail}`),
                state: "NOT_READY" as const,
                resultCommit: settled.state === "BASE_DRIFT" ? settled.resultCommit : null,
              };
            }
            deps.controller.step();
            await recordRelay(deps, attemptId, settled.resultCommit, settled.attribution);
            return {
              state: "TAKEOVER_SETTLED" as const,
              taskId: input.taskId,
              route: "takeover" as const,
              attemptId,
              detail:
                `${settled.detail} — the product observed the attempt's world and recorded ${settled.attribution.attribution} ` +
                `(liveness ${settled.attribution.liveness}); independenceEligible=${String(settled.attribution.independenceEligible)}. ` +
                "This is a settlement, not an acceptance or a promotion",
              resultCommit: settled.resultCommit,
              changedFiles: settled.changedFiles,
              attribution: settled.attribution,
              retainedWorldPath: null,
              reuse: null,
              inputsNotInBasis: settled.inputsNotInBasis,
              taskState: null,
            };
          } catch (error) {
            return refused(error instanceof Error ? error.message : String(error));
          }
        }

        /**
         * SUCCESSOR: close the unobserved/unconfirmed attempt and hand back the retained world's
         * path-level reuse facts. The next `delegate` opens a NEW attempt in a NEW world at the same
         * basis, so no second process is ever pointed at the old world.
         *
         * PWRS-E: a successor is a NEW basis decision, so it is held to the same unseen-input fact as
         * a settlement. The caller must acknowledge the paths first; the acknowledgement is a
         * declaration, not a content judgement.
         */
        const baseCommit = deps.controller.attemptWorkRecord(attemptId)?.envelope?.base_commit ?? "";
        const repositoryPath = deps.controller.effects.git.repository;
        const unseen =
          baseCommit === "" || repositoryPath === undefined
            ? Object.freeze([] as string[])
            : unseenInputs({ repository: repositoryPath, baseCommit });
        if (unseen.length > 0 && input.acknowledgeInputs !== true) {
          return {
            ...refused(
              `INPUTS_CHANGED_SINCE_BASIS: the project holds inputs this attempt's base never contained: ${unseen.join(", ")} — ` +
                "read them first; if a new attempt should proceed on that basis, call again with acknowledgeInputs=true",
            ),
            inputsNotInBasis: unseen,
          };
        }
        const retained = relaySourceFacts(deps.controller, attemptId);
        try {
          deps.controller.report(attemptId, {
            workerStatus: "cancelled",
            summary: input.summary ?? "closed as a successor: the previous executor is not observed and a new world continues the work",
          });
          deps.controller.step();
        } catch (error) {
          return refused(error instanceof Error ? error.message : String(error));
        }
        const after = deps.controller.status() as { tasks?: Array<{ task_id: string; state: string }> };
        const taskState = (after.tasks ?? []).find((task) => task.task_id === input.taskId)?.state ?? null;
        if (deps.executionRelay !== undefined) {
          try {
            await deps.executionRelay.record({
              taskId: input.taskId,
              attemptId,
              baseCommit: retained.resultRevision ?? "",
              resultCommit: retained.resultRevision ?? "",
              attribution: {
                schema: "pc1-execution-attribution/v1" as const,
                attribution: "UNATTRIBUTED" as const,
                executor: "UNKNOWN" as const,
                settledBy: "PRINCIPAL" as const,
                workerInvocations: invocations.filter((invocation) => invocation.outcome === "ENDED").length,
                matchedInvocationId: null,
                liveness: "DECLARED_ABANDONED" as const,
                independenceEligible: false,
                evidence: "DECLARED" as const,
                detail:
                  "the principal closed this attempt as a SUCCESSOR because no writer was observed; the retained world stays available for reuse, and no result was settled or accepted",
              },
            });
          } catch {
            /* the canonical cancellation stands; the derived record is best-effort */
          }
        }
        return {
          state: "SUCCESSOR_READY" as const,
          taskId: input.taskId,
          route: "successor" as const,
          attemptId,
          detail:
            `the attempt was closed as a successor (task is ${taskState ?? "unknown"}); the retained world is ${retained.worldPath ?? "not observable"} ` +
            `and its work is at ${(retained.resultRevision ?? "").slice(0, 12) || "no commit"}. ` +
            "Inherit only the paths the facts show as unaffected or already present, re-derive anything conflicted, then delegate the new attempt",
          resultCommit: null,
          changedFiles: Object.freeze([]),
          attribution: null,
          retainedWorldPath: retained.worldPath,
          reuse: retained.facts,
          inputsNotInBasis: unseen,
          taskState,
        };
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
