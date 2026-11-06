/**
 * SR-1 §26 / ODPE — the work façade CONTRACT.
 *
 * The cluster's public types live here so the implementation can be decomposed into cohesive
 * application modules without the contract depending on any of them. `surfaces/work.ts` re-exports
 * every name below, so the factory, the compatibility surface and the composition root keep their
 * existing edges.
 */
import type { ProjectController } from "../tools/controller.js";

/** The one controller-facing type the work runtime uses; other work modules import THIS alias. */
export type WorkController = ProjectController;
import type { HostDeploymentFactsPort } from "./common.js";
import type { ProjectStandard } from "../domain/standard.js";

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
    readonly attribution: import("../work/execution_relay.js").ExecutionAttribution | null;
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
    readonly reuse?: import("../continuation/ports.js").ContinuationReusePlan | null;
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

/** Exactly the dependencies the work runtime reads — nothing else is visible to it (§9). */
/** Exactly the dependencies this cluster reads — nothing else is visible to it (§9). */
export interface WorkRuntimeDeps {
  readonly controller: WorkController;
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
  readonly executionRelay?: import("../work/execution_relay.js").ExecutionRelayRecorderPort | undefined;
}

/**
 * ODPE-B — the three action classes a principal must be able to tell apart.
 *
 * CONTINUE_WORK: the candidate is not there yet (or a writer is still observed). Keep working.
 * SEMANTIC_JUDGEMENT: a fact or a contract gap means only the agent can decide (new inputs, a
 *   contract that cannot be evaluated mechanically, a candidate awaiting operator acceptance).
 * MECHANICAL_FINALIZATION: the candidate exists, is committed, the required artifacts are in it,
 *   no writer is observed, and the remaining step is the ordinary settlement path.
 */
export type OutcomeAction = "CONTINUE_WORK" | "SEMANTIC_JUDGEMENT" | "MECHANICAL_FINALIZATION";

export interface OutcomeReadinessArtifact {
  readonly path: string;
  /** The path exists in the attempt's world. */
  readonly present: boolean;
  /** The path exists in the observed result commit (only meaningful when a commit exists). */
  readonly committed: boolean;
}

/**
 * The current outcome facts, derived from the owners (Work, Git, the host job view, the input
 * observation, the completion contract). Nothing here is the model's self-report, and nothing here
 * is acceptance: a mechanical finalization is a settlement, not a Promotion.
 */
export interface OutcomeReadiness {
  readonly schema: "odpe-outcome-readiness/v1";
  readonly action: OutcomeAction;
  /** Why this class was chosen, in the product's words. */
  readonly reasons: readonly string[];
  /**
   * The digest a finalization must carry back. It covers the exact facts this readiness was derived
   * from (attempt, world head, uncommitted set, input digests, project revision), so a decision made
   * on stale facts is refused instead of applied to a moved world.
   */
  readonly observationDigest: string;
  readonly task: { readonly taskId: string; readonly state: string; readonly objective: string | null } | null;
  readonly attempt: {
    readonly attemptId: string;
    readonly state: string;
    readonly baseCommit: string;
    readonly worldPath: string | null;
    readonly worldHead: string | null;
    readonly uncommittedChanges: readonly string[];
    readonly resultCommit: string | null;
    readonly resultCommitted: boolean;
  } | null;
  readonly execution: {
    readonly jobPhase: string | null;
    readonly active: boolean;
    readonly stopRequested: boolean;
    readonly processExit: "OBSERVED" | "UNCONFIRMED" | "UNKNOWN";
    /** PNWF-CQ-B: host-local invocation observation; UNOBSERVED is not "never started". */
    readonly liveness: "ACTIVE" | "EXITED" | "UNKNOWN" | "UNOBSERVED";
  } | null;
  /**
   * PNWF-CQ-A/B: the physical repository outcome relative to the canonical head. This is a fact,
   * not an acceptance and not a judgement that the user's business outcome is complete.
   */
  readonly directOutcome: {
    readonly repositoryHead: string | null;
    readonly projectHead: string;
    readonly relation: "IN_SYNC" | "DIRECT_AHEAD" | "DIVERGED" | "UNOBSERVABLE";
    readonly uncommittedPaths: readonly string[];
  } | null;
  readonly artifacts: readonly OutcomeReadinessArtifact[];
  readonly inputs: {
    readonly state: "OBSERVED" | "UNAVAILABLE" | "NOT_CONFIGURED";
    readonly paths: readonly string[];
    readonly unreadable: readonly string[];
    readonly relevance: "NEEDS_SEMANTIC_ASSESSMENT" | "NONE_OBSERVED";
    readonly detail: string;
  };
  readonly completion: {
    readonly mechanicalChecksEvaluable: boolean;
    readonly readinessState: "READY" | "BLOCKED" | null;
    readonly blockers: readonly string[];
    readonly verificationRequired: boolean;
    readonly verificationSatisfiable: boolean;
  };
  readonly next: readonly string[];
}

export interface FinalizeOutcome {
  readonly state: "SETTLED" | "ALREADY_SETTLED" | "NOT_READY" | "STALE_OBSERVATION" | "REFUSED";
  readonly taskId: string;
  readonly detail: string;
  readonly resultCommit: string | null;
  readonly attribution: import("../work/execution_relay.js").ExecutionAttribution | null;
  readonly taskState: string | null;
  /** The readiness the reply was derived from (fresh, not the caller's copy). */
  readonly readiness: OutcomeReadiness;
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
    readonly attribution: import("../work/execution_relay.js").ExecutionAttribution;
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
      /** ODPE-A: canonical inputs the attempt's base never contained. */
      readonly inputsNotInBasis: readonly string[];
      readonly inputsState: "OBSERVED" | "UNAVAILABLE";
      readonly inputsDetail: string;
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
      readonly reuse: import("../continuation/ports.js").ContinuationReusePlan | null;
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
    readonly attribution?: import("../work/execution_relay.js").ExecutionAttribution | null;
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
    readonly attribution: import("../work/execution_relay.js").ExecutionAttribution | null;
    /** For `successor`: the retained world and its path-level reuse facts against the current head. */
    readonly retainedWorldPath: string | null;
    readonly reuse: import("../work/path_reuse.js").PathReuseFacts | null;
    /** ODPE-A: project inputs the attempt's base never contained; successor requires acknowledgement. */
    readonly inputsNotInBasis: readonly string[];
    readonly inputsState: "OBSERVED" | "UNAVAILABLE";
    readonly inputsDetail: string;
    /** For `successor`: the task state after the scheduler tick, so the caller knows what to do next. */
    readonly taskState: string | null;
  }>;
  /**
   * PLMP-LEAN-1 §5 / 2A-Q: readiness in two layers — what the DEPLOYMENT can do, and what the
   * CURRENT task requires. The deployment layer is answerable at startup; the task layer only once a
   * task exists. A deployment gap ("no independent verifier") is a task blocker only when this task
   * actually needs one, so a project is never marked NOT READY for a requirement it does not have.
   * Pass `attemptId` to derive the task layer from THAT attempt's contract; without it the first
   * RUNNING attempt stands in, which is only unambiguous while one attempt is in flight.
   */
  completionReadiness(attemptId?: string): import("../domain/completion_contract.js").CompletionReadiness;
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
  };  /**
   * ODPE-B: the current OUTCOME facts from the ordinary product entry. Read-only; derived from the
   * Work/Git/host/input/contract owners, never from a model's statement. The three action classes
   * are the product's classification, not a permission.
   */
  outcomeReadiness(input?: { readonly taskId?: string | undefined } | undefined): Promise<OutcomeReadiness>;
  /**
   * ODPE-B: the bounded mechanical finalization. It re-observes every fact the readiness was derived
   * from and REFUSES a stale digest, then settles through the existing Work owner and advances the
   * existing scheduler. It never promotes, never accepts an operator decision and never records an
   * episode conclusion — those remain the operator's and the principal's acts.
   */
  finalizeOutcome(input: {
    readonly taskId: string;
    readonly expectedObservationDigest: string;
    /** The principal's semantic confirmation that it re-read inputs that arrived after the basis. */
    readonly acknowledgeInputs?: boolean | undefined;
    readonly summary?: string | undefined;
  }): Promise<FinalizeOutcome>;
}
