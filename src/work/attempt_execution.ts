/**
 * PLMP-LEAN-1 §D2-b/§D2-e1 / SR-2 §十一 — the MUTATING ATTEMPT EXECUTION owner.
 *
 *     prepare → execute → observe → settle
 *
 * D2's mutating lifecycle had its PRIMITIVES in the right places already (claim, report, the
 * execution-world port, the scheduler's admission rule) but its DECISION LOGIC — the precondition
 * ladder that must all hold before the first event, and the settlement ladder that decides whether
 * a world's work may become a canonical result — lived inline in `ProjectController`, interleaved
 * with the controller's other concerns. This module is that decision logic, moved whole.
 *
 * ## WHAT DID NOT MOVE, DELIBERATELY
 *
 *     worker.run() transport  →  still WorkDelegationService (D2-d)
 *
 * The host JOB lifecycle (queueing, the per-job world binding, terminal delivery) is a HOST concern
 * and stays where it is. This owner prepares a position, observes a world and settles an attempt; it
 * never runs anything.
 *
 * ## ORDER IS THE SEMANTICS
 *
 * `prepare` evaluates EVERY precondition before the first event, so a refusal is a no-op:
 * `TASK_STARTED` committed and then abandoned would already be canonical mutation. `settle` observes
 * before it admits, admits before it exports, and exports before it reports — because the report is
 * about to NAME a commit, and a name nobody can resolve is worse than a refusal. Each of those
 * orderings is a crash window D2-e1 exists to close.
 *
 * ## THE LADDERS ARE VERBATIM
 *
 * Every check below is the same check, in the same order, with the same typed refusal code and the
 * same message text. SR-2b3 is a boundary refactor: the ruling freezes Work lifecycle, Attempt
 * identity, result identity and the settlement semantics, and the equivalence proofs compare the
 * OBSERVABLE outcome — event sequence, attempt identity, observed files, result commit, settlement
 * state — rather than trusting the move.
 *
 * Layer: L2 (`src/work/`). Consumed by the controller's façade.
 */
import { DomainValidationError } from "../domain/errors.js";
import type { TaskEnvelope } from "../schema/index.js";

/** What a caller needs to place a worker, and nothing about how to run one. */
export interface PreparedMutatingWork {
  readonly state: "PREPARED" | "RESUMED";
  readonly taskId: string;
  readonly attemptId: string;
  readonly placement: "worktree";
  /** The isolated EXECUTION WORLD: a repository at the task's canonical base that owns its own git state. */
  readonly worldPath: string;
  /** `TaskEnvelope.base_commit` — the ONLY Work base. Delegation never mints a second one. */
  readonly baseCommit: string;
  readonly writeScope: readonly string[];
  readonly requiredArtifacts: readonly string[];
  readonly completion: {
    readonly mechanicalChecks: readonly string[];
    readonly independentVerificationRequired: boolean;
  };
  readonly detail: string;
}

/** The outcome of closing one worker's result into canonical Work. */
export type MutatingWorkSettlement =
  | { readonly state: "SETTLED"; readonly attemptId: string; readonly resultCommit: string; readonly changedFiles: readonly string[]; readonly exported: boolean; readonly detail: string }
  | { readonly state: "NOT_READY"; readonly attemptId: string; readonly reason: string; readonly detail: string }
  | { readonly state: "BASE_DRIFT"; readonly attemptId: string; readonly resultCommit: string; readonly worldRetained: true; readonly detail: string };

/** The observed facts about one attempt's execution world. */
export interface AttemptResultObservation {
  readonly observedHead: string;
  readonly changedFiles: readonly string[];
  readonly uncommittedChanges: readonly string[];
}

/**
 * THE PRIMITIVES this owner consumes.
 *
 * Each is a capability the controller already had; the owner composes them into the two ladders.
 * Narrow on purpose: the owner knows how to DECIDE, and asks for the things only the Work owner can
 * do (claim an attempt, report a result, observe a world, admit the head basis).
 */
export interface MutatingExecutionPorts {
  readonly execution: string;
  /** Whether a canonical plan exists. Delegation does not plan. */
  projectInitialized(): boolean;
  /** The canonical repository path. */
  canonicalRepository(): string;
  /** The repository's live HEAD, as the deployment observes it. */
  observedHead(repository: string): string;
  /** The derived head status (IN_SYNC / SYNC_REQUIRED / CONFLICT). */
  headStatus(): { readonly state: string; readonly projectHeadCommit: string; readonly provenEffectHeadCommit: string };
  /** The §D4-0 admission read both mutating entrances share. */
  speculativeAdmission(expectedTaskId: string | undefined): { readonly kind: "START" | "RESUME"; readonly taskId: string } | { readonly kind: "REFUSE"; readonly code: string; readonly detail: string };
  /** The task's canonical envelope. */
  taskEnvelope(taskId: string): TaskEnvelope;
  /** The nonterminal attempts (who holds a lane). */
  nonterminalAttempts(): readonly { readonly attemptId: string; readonly taskId: string; readonly state: string }[];
  /** The completion contract derived from an envelope. */
  completionContractForEnvelope(envelope: TaskEnvelope): {
    readonly verification: { readonly required: boolean; readonly requiredReasons: readonly string[] };
  };
  /** The confirmed completion standard, or undefined. */
  standard(): { readonly confirmed: boolean } | undefined;
  /** The commands the deployment's policy authorizes (the policy's own shape, not a flattened list). */
  authorizedCommands(): readonly { readonly executable: string; readonly argv_prefix: readonly string[] }[];
  /** Whether an executable independent ATTEMPT_RESULT verifier is composed. */
  attemptResultVerificationAvailable(): boolean;
  /** The completion-readiness derivation. */
  completionReadiness(input: { readonly contract: unknown }): { readonly task: { readonly state: string; readonly blockers: readonly string[] } | null };
  /** Refuse when the canonical tree holds work nobody owns. */
  assertNoUnownedWork(repository: string): void;
  /** Advance the lifecycle to a claimable attempt and return its id. */
  advanceToClaimableAttempt(): string;
  /** Claim an attempt, returning its world path. */
  claim(attemptId: string): Promise<{ readonly worktreePath: string }>;
  /** The attempt's recorded authorization + envelope. */
  attemptContext(attemptId: string): [Record<string, unknown>, TaskEnvelope];
  /** The attempt's work directory, when its world exists. */
  attemptWorkDir(attemptId: string): { readonly placement: string; readonly workDir: string } | null;
  /** D2-a's observation of the world. */
  observeAttemptResult(attemptId: string, baseCommit: string): AttemptResultObservation | null;
  /** Export a frozen revision into the canonical object database. */
  exportResultCommit(input: { readonly attemptId: string; readonly commit: string }): Promise<{ readonly imported: boolean; readonly detail: string }>;
  /** Whether an execution-world port is composed at all. */
  hasExecutionWorldPort(): boolean;
  /** Record the attempt's report (the observation is the product's, never the worker's word). */
  report(attemptId: string): void;
  /** The §D2-b projection of a prepared position. */
  preparedProjection(input: {
    readonly state: "PREPARED" | "RESUMED";
    readonly taskId: string;
    readonly attemptId: string;
    readonly worldPath: string;
    readonly envelope: TaskEnvelope;
    readonly contract: unknown;
    readonly standard: unknown;
    readonly detail: string;
  }): PreparedMutatingWork;
}

export interface MutatingAttemptService {
  /** Which task a mutating start would take, without touching anything. */
  target(input: { readonly expectedTaskId?: string | undefined }): {
    readonly taskId: string;
    readonly baseCommit: string;
    readonly resumed: boolean;
  };
  /** Prepare (or resume) an isolated execution position for one canonical Work task. */
  prepare(input: { readonly expectedTaskId?: string | undefined }): Promise<PreparedMutatingWork>;
  /** Close a worker's result into canonical Work. */
  settle(input: {
    readonly attemptId: string;
    readonly workerOutcome: {
      readonly kind: "READY_FOR_SETTLEMENT" | "NEEDS_ESCALATION" | "HOST_FAILURE";
      readonly detail?: string | undefined;
    };
  }): Promise<MutatingWorkSettlement>;
}

const normalize = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

export function makeMutatingAttemptService(ports: MutatingExecutionPorts): MutatingAttemptService {
  /** P0 — placement. A worker lane is an ISOLATED world by definition (§D2.2 ②). */
  const assertWorktreePlacement = (): void => {
    if (ports.execution !== "worktree") {
      throw new DomainValidationError(
        "WORKTREE_PLACEMENT_REQUIRED: a mutating delegation runs in an isolated work execution world, and this deployment works in the canonical tree (in-place) — the principal's own tree is not a worker lane",
      );
    }
  };

  /** P1 — the work must already exist. Delegation does not plan. */
  const assertProjectInitialized = (): void => {
    if (!ports.projectInitialized()) {
      throw new DomainValidationError(
        "WORK_NOT_DECLARED: this project has no canonical plan, so there is no task to execute — declare the work first (a plan, or palimpsest_begin for direct work); delegation executes work the project already recognizes, it does not invent it",
      );
    }
  };

  const assertAdmission = (expectedTaskId: string | undefined) => {
    const admission = ports.speculativeAdmission(expectedTaskId);
    if (admission.kind === "REFUSE") {
      throw new DomainValidationError(`${admission.code}: ${admission.detail}`);
    }
    return admission;
  };

  return Object.freeze({
    target(input: { readonly expectedTaskId?: string | undefined } = {}) {
      const expectedTaskId = normalize(input.expectedTaskId);
      assertWorktreePlacement();
      assertProjectInitialized();
      /**
       * §D4-0: ONE admission read, shared with `prepare`. It decides whether a SPECULATIVE world may
       * open or resume, and defers to the scheduler for whether a NEW position may start — so how many
       * tasks may be in flight is what the PLAN declares, not a product-wide constant.
       */
      const admission = assertAdmission(expectedTaskId);
      return Object.freeze({
        taskId: admission.taskId,
        baseCommit: ports.taskEnvelope(admission.taskId).base_commit,
        resumed: admission.kind === "RESUME",
      });
    },

    async prepare(input: { readonly expectedTaskId?: string | undefined } = {}): Promise<PreparedMutatingWork> {
      const expectedTaskId = normalize(input.expectedTaskId);

      assertWorktreePlacement();
      assertProjectInitialized();

      // P2 — the head basis must be settled. Not a D2 rule: G10-X already forbids activating new
      // READY work while the project head needs reconciliation, and a bootstrap is exactly that.
      const headStatus = ports.headStatus();
      if (headStatus.state !== "IN_SYNC") {
        throw new DomainValidationError(
          `HEAD_NOT_IN_SYNC: this project's head is ${headStatus.state} (project head ${headStatus.projectHeadCommit.slice(0, 12)}, proven effect head ${headStatus.provenEffectHeadCommit.slice(0, 12)}) — new work must not be activated until the head is reconciled`,
        );
      }

      const repository = ports.canonicalRepository();

      // P3/P4 — the SAME admission read `target` uses, so the two entrances cannot disagree.
      const admission = assertAdmission(expectedTaskId);

      if (admission.kind === "RESUME") {
        // The position already exists. Nothing is re-claimed and no second world is made.
        const holder = ports.nonterminalAttempts().find((attempt) => attempt.taskId === admission.taskId);
        if (holder === undefined) {
          throw new DomainValidationError(
            `the admission named task "${admission.taskId}" as holding a position, but no nonterminal attempt for it exists — the read and the state disagree, and this refuses rather than guessing`,
          );
        }
        const envelope = ports.taskEnvelope(holder.taskId);
        const contract = ports.completionContractForEnvelope(envelope);
        const resumedStandard = ports.standard();
        if (resumedStandard === undefined) {
          throw new DomainValidationError(
            "NEEDS_STANDARD_CONFIRMATION: this project has no confirmed completion standard, so nothing can be derived as done — the operator states one sentence first, and delegation does not mint one",
          );
        }
        if (holder.state === "CREATED") {
          // A retry after a crash between ATTEMPT_CREATED and the claim: the attempt exists, the world
          // does not. Claim THAT attempt — stepping again would deadlock, because the scheduler returns
          // nothing while a task occupies the stage.
          const claimed = await ports.claim(holder.attemptId);
          return ports.preparedProjection({
            state: "PREPARED",
            taskId: holder.taskId,
            attemptId: holder.attemptId,
            worldPath: claimed.worktreePath,
            envelope,
            contract,
            standard: resumedStandard,
            detail: "the task's attempt existed and was claimed; its isolated work world is ready",
          });
        }
        // LEASED or RUNNING: the position exists, whatever state its worker is in.
        const observed = ports.attemptWorkDir(holder.attemptId);
        return ports.preparedProjection({
          state: "RESUMED",
          taskId: holder.taskId,
          attemptId: holder.attemptId,
          worldPath: observed?.workDir ?? "",
          envelope,
          contract,
          standard: resumedStandard,
          detail: "this work already holds a mutating position; its execution world is unchanged and nothing was re-claimed",
        });
      }

      const taskId = admission.taskId;
      const envelope = ports.taskEnvelope(taskId);

      // P5 — what completion will require, derived from the canonical envelope BEFORE anything is
      // written, and refused here if this deployment cannot meet it. Same rule `begin` applies.
      const standard = ports.standard();
      if (standard === undefined || !standard.confirmed) {
        throw new DomainValidationError(
          "NEEDS_STANDARD_CONFIRMATION: this project has no confirmed completion standard, so nothing can be derived as done — the operator states one sentence first, and delegation does not mint one",
        );
      }
      const contract = ports.completionContractForEnvelope(envelope);
      if (contract.verification.required && !ports.attemptResultVerificationAvailable()) {
        throw new DomainValidationError(
          `ATTEMPT_RESULT_VERIFICATION_UNAVAILABLE: this task requires independent verification (${contract.verification.requiredReasons.join("; ")}) and this deployment composes no executable verifier for an attempt result — the operator must register one, and until then this work must not begin`,
        );
      }
      const readiness = ports.completionReadiness({ contract });
      if (readiness.task !== null && readiness.task.state !== "READY") {
        throw new DomainValidationError(`prepareMutatingWork refused before writing anything: ${readiness.task.blockers.join("; ")}`);
      }

      // P6 — the canonical tree must hold no work nobody owns, judged by the SAME predicate `begin`
      // uses (§E.7): a second definition of "clean" over one repository is how two entrances drift.
      ports.assertNoUnownedWork(repository);

      // P7 — one base, agreed four ways. `TaskEnvelope.base_commit` IS the Work base; this only proves
      // the world still agrees with it. Nothing is "frozen" here and no second base value is stored,
      // because two bases is how `Result identity != promotion authority` gets quietly broken.
      const liveHead = ports.observedHead(repository);
      if (
        liveHead !== headStatus.projectHeadCommit ||
        headStatus.projectHeadCommit !== headStatus.provenEffectHeadCommit ||
        liveHead !== envelope.base_commit
      ) {
        throw new DomainValidationError(
          `HEAD_BASIS_MISMATCH: the repository is at ${liveHead.slice(0, 12)}, the project head at ${headStatus.projectHeadCommit.slice(0, 12)}, the proven effect head at ${headStatus.provenEffectHeadCommit.slice(0, 12)} and the task's base at ${envelope.base_commit.slice(0, 12)} — a worker's world must start where its envelope says the work starts`,
        );
      }

      // ONLY NOW: lifecycle events, then the isolated world.
      const attemptId = ports.advanceToClaimableAttempt();
      const claimed = await ports.claim(attemptId);
      return ports.preparedProjection({
        state: "PREPARED",
        taskId,
        attemptId,
        worldPath: claimed.worktreePath,
        envelope,
        contract,
        standard,
        detail: "the task was started, its attempt claimed and its isolated work world created; no worker is running yet",
      });
    },

    async settle(input: {
      readonly attemptId: string;
      readonly workerOutcome: {
        readonly kind: "READY_FOR_SETTLEMENT" | "NEEDS_ESCALATION" | "HOST_FAILURE";
        readonly detail?: string | undefined;
      };
    }): Promise<MutatingWorkSettlement> {
      const { attemptId } = input;

      // A worker that did not hand over work keeps everything: escalation and host failure are facts
      // about a worker, and D2-c already refused to turn them into canonical outcomes.
      if (input.workerOutcome.kind !== "READY_FOR_SETTLEMENT") {
        return Object.freeze({
          state: "NOT_READY" as const,
          attemptId,
          reason: input.workerOutcome.kind,
          detail: "the worker did not report the work ready for settlement, so nothing is observed, exported or recorded — the attempt and its world are untouched",
        });
      }

      // Observe the WORLD. The observation is D2-a's, unchanged: same commands, same `.palimpsest/`
      // filter, same completion invariant as an in-place attempt.
      const [, envelope] = ports.attemptContext(attemptId);
      const observed = ports.observeAttemptResult(attemptId, envelope.base_commit);
      if (observed === null) {
        return Object.freeze({
          state: "NOT_READY" as const,
          attemptId,
          reason: "WORLD_UNOBSERVABLE",
          detail: "this attempt's execution world cannot be observed, so nothing can be established about its work",
        });
      }

      // §2.6, the SAME invariant: a completed attempt's work must be commit-materialized. `report`
      // holds this too — this is the early, explanatory refusal, not a second rule.
      if (observed.uncommittedChanges.length > 0) {
        return Object.freeze({
          state: "NOT_READY" as const,
          attemptId,
          reason: "UNCOMMITTED_WORK",
          detail: `the world still holds work that is not committed: ${observed.uncommittedChanges.join(", ")} — a settled result commit must contain the work, so the worker has to commit (or revert) it and report again`,
        });
      }
      if (observed.changedFiles.length === 0) {
        return Object.freeze({
          state: "NOT_READY" as const,
          attemptId,
          reason: "NO_WORK",
          detail: "the world holds no observable change against its base, so there is nothing to settle",
        });
      }
      const outOfScope = observed.changedFiles.filter(
        (path) => !envelope.write_paths.some((allowed) => path === allowed || path.startsWith(`${allowed}/`)),
      );
      if (outOfScope.length > 0) {
        return Object.freeze({
          state: "NOT_READY" as const,
          attemptId,
          reason: "OUT_OF_SCOPE",
          detail: `the world changed paths outside the task envelope's write_paths [${envelope.write_paths.join(", ")}]: ${outOfScope.join(", ")}`,
        });
      }

      // BASIS ADMISSION, before any effect: the project head must still be what the world was cut
      // from. This is §D2.6's exit re-check, and it is the same four-way agreement P7 applies inward.
      const headStatus = ports.headStatus();
      const liveHead = ports.observedHead(ports.canonicalRepository());
      if (
        headStatus.state !== "IN_SYNC" ||
        headStatus.projectHeadCommit !== headStatus.provenEffectHeadCommit ||
        headStatus.projectHeadCommit !== envelope.base_commit ||
        liveHead !== envelope.base_commit
      ) {
        return Object.freeze({
          state: "BASE_DRIFT" as const,
          attemptId,
          resultCommit: observed.observedHead,
          worldRetained: true as const,
          detail: `BASE_DRIFT: this result was computed at ${envelope.base_commit.slice(0, 12)} but the project is now at ${headStatus.projectHeadCommit.slice(0, 12)} (head state ${headStatus.state}, repository ${liveHead.slice(0, 12)}) — the result is retained in its world and stays available, and the attempt keeps its lane rather than being terminalised by someone else's head move`,
        });
      }

      // EXPORT before REPORT: the report is about to name `result_commit = R`, and R must be
      // resolvable in the canonical object database — otherwise a released world would leave a name
      // nobody can resolve.
      let exported = true;
      let exportDetail = "no execution world port is composed, so the result was not imported";
      if (ports.hasExecutionWorldPort()) {
        const outcome = await ports.exportResultCommit({ attemptId, commit: observed.observedHead });
        exported = outcome.imported;
        exportDetail = outcome.detail;
        if (!exported) {
          return Object.freeze({
            state: "NOT_READY" as const,
            attemptId,
            reason: "RESULT_NOT_EXPORTED",
            detail: `the result commit could not be imported into the canonical object database (${outcome.detail}), so recording it would name a commit the project cannot materialize`,
          });
        }
      }

      // NOW the ledger. `report` re-observes independently — this call supplied no claim, and passing
      // none is the point: nothing here can smuggle a caller's word into the attempt's record.
      ports.report(attemptId);
      return Object.freeze({
        state: "SETTLED" as const,
        attemptId,
        resultCommit: observed.observedHead,
        changedFiles: observed.changedFiles,
        exported,
        detail: `the attempt is COMPLETED with result commit ${observed.observedHead.slice(0, 12)}; ${exportDetail}`,
      });
    },
  });
}
