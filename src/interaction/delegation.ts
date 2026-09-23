/**
 * PLMP-LEAN-1 §C.11–§C.15: the D1 RESEARCH delegation runtime.
 *
 * Two lifecycles meet here, and keeping them apart is the whole design:
 *
 *     ReasoningCell semantic state   ≠   host job state
 *
 * ReasoningCell persists `BRANCH_OPENED` / candidate submission / `BRANCH_CLOSED`. It CANNOT persist a
 * PID, whether the host process is alive, or whether a promise is still running. So a delegation's
 * state is derived from BOTH: the canonical branch view, and a HOST-LOCAL map of the jobs this process
 * is actually running.
 *
 *     OPEN branch after a restart  ≠  RUNNING worker
 *
 * That is the difference between an honest `INTERRUPTED` and a state that claims a worker is running
 * when the process that ran it is long gone. v1 does not auto-rerun an `INTERRUPTED` branch: doing so
 * would immediately raise duplicate stochastic cognition and surviving-child questions.
 *
 * A delegation's IDENTITY is derived, never allocated (§C.11 ②):
 *
 *     cellId = H(projectId, basisCommit, task)
 *
 * Three properties follow, and each one is a bug that would otherwise be reachable:
 *
 *   - same project + same task + same basis  → the SAME delegation, so a retry converges instead of
 *     starting a second worker against one semantic branch;
 *   - same task on a NEW head                 → a DIFFERENT delegation, so a conclusion computed
 *     against a stale read basis is never replayed as if it were current;
 *   - two projects sharing one reasoning store → no collision, because the project is in the digest.
 *
 * It also makes the ref RECOVERABLE: a principal that lost its `delegationRef` can re-issue the same
 * task and be told the existing outcome, because the identity is a pure function of what it already
 * knows.
 *
 * Nothing here creates Work truth. A delegation creates no Task, no Attempt, no EvidenceAtom, does not
 * satisfy a Work Gate or an attempt-result verification, does not touch promotion eligibility and does
 * not need `palimpsest_begin`. A research branch's own standing stays cell-local.
 */
import { canonicalDigest } from "../schema/canonical.js";
import { settleBranchFromOutput, statementFromOutput, type BranchSettlementOwner } from "../reasoning_cell/branch_settlement.js";
import type { ReasoningPolicyRef } from "../reasoning_cell/ref.js";
import type { ReasoningCellService, ReasoningCellView } from "../reasoning_cell/service.js";
import { RECIPE_ADMISSION_POLICY, RECIPE_VERIFICATION_POLICY } from "../recipes/execution.js";
/**
 * §C.11 ②: the snapshot port is declared STRUCTURALLY here rather than imported from the deployment
 * layer. The dependency direction matters: this module is a product-interaction service, and importing
 * a host capability's type would add a layer edge the architecture gate forbids — the same reason
 * `FinishVerificationFace` is structural in the work surface. The first-party implementation still
 * lives in `src/deployment/`, and nothing here knows its name.
 */
export interface DelegationSnapshot {
  readonly workDir: string;
  readonly basisCommit: string;
  release(): Promise<void>;
}

export interface DelegationSnapshotPort {
  freeze(): Promise<DelegationSnapshot>;
}

/**
 * §C.12: the ASYNC branch-host seam, declared STRUCTURALLY — the same idiom as
 * `DelegationSnapshotPort`, and for the same reason (this module is a product-interaction service and
 * must not name a host adapter). The shape is what actually matters, and it is deliberately as small
 * as the runtime's need: `start` returns a handle immediately and the result is OPAQUE here, because
 * what a branch produced is settled through the shared settlement owner (§C.13), never parsed twice.
 *
 * The first-party implementation is `dshSubprocessBranchExecutionPort` — the SAME adapter the
 * blocking `palimpsest_collaborate` path uses, bound to a different `workDir`. There is no second
 * branch runtime (§C.12).
 */
export interface DelegationBranchHost {
  readonly adapterId: string;
  start(input: {
    readonly brief: unknown;
    readonly executionBudget?: unknown;
    readonly signal?: AbortSignal;
    readonly evidenceContext?: unknown;
  }): DelegationBranchJob;
}

export interface DelegationBranchJob {
  readonly completion: Promise<unknown>;
  cancel(): void;
}

/** D1 implements RESEARCH only. WORK waits for D2; cross-project already has its own tool. */
export const DELEGATION_KINDS = ["RESEARCH"] as const;
export type DelegationKind = (typeof DELEGATION_KINDS)[number];

/**
 * The product-facing state, derived from BOTH layers (§C.11).
 *
 * `INTERRUPTED` is the one that matters: an OPEN branch with no host job in THIS process means the
 * worker is gone, not running.
 */
export const DELEGATION_STATES = ["RUNNING", "COMPLETED", "FAILED", "INTERRUPTED", "UNKNOWN"] as const;
export type DelegationState = (typeof DELEGATION_STATES)[number];

/**
 * What a `start` call actually DID — distinct from the delegation's own state, because "start" is a
 * verb and the honest answer to it is not always "I started one".
 */
export const DELEGATION_START_OUTCOMES = ["STARTED", "ALREADY_RUNNING", "EXISTING"] as const;
export type DelegationStartOutcome = (typeof DELEGATION_START_OUTCOMES)[number];

export interface DelegationStartResult {
  readonly delegationRef: string;
  readonly kind: DelegationKind;
  /** STARTED = a new host job; ALREADY_RUNNING = an identical live delegation; EXISTING = replayed. */
  readonly outcome: DelegationStartOutcome;
  /** The delegation's state AFTER this call, derived the same way `status` derives it. */
  readonly state: DelegationState;
  /** The frozen read basis this delegation was (or is) computed against (§C.11 ②). */
  readonly basisCommit: string;
  /** Present only when an existing delegation already reached a conclusion (a replay, not a new run). */
  readonly conclusion: string | null;
  readonly detail: string;
}

export interface DelegationStatusView {
  readonly delegationRef: string;
  readonly state: DelegationState;
  /** The basis the ref carries, or null when the ref itself could not be parsed. */
  readonly basisCommit: string | null;
  readonly detail: string;
}

/** `inspect` is progressive disclosure: the same state, plus what a decision would need. */
export interface DelegationInspection extends DelegationStatusView {
  readonly question: string | null;
  readonly conclusion: string | null;
}

/** §C.11 principle ③: terminal, actionable, and never a progress ping. */
export interface DelegationTerminalProjection {
  readonly delegationRef: string;
  readonly state: Exclude<DelegationState, "RUNNING">;
  /** §C.11 ②/C-r1: the basis travels WITH the result, so a finding can name what it was computed on. */
  readonly basisCommit: string;
  readonly question: string;
  readonly conclusion: string | null;
  readonly detail: string;
}

/**
 * Exactly the ReasoningCell face this runtime reads, taken from the OWNER's type rather than
 * re-declared: a signature change in the owner then breaks this module instead of being silently
 * tolerated. `submitCandidate`/`evaluateCandidate` arrive through the shared settlement owner, so the
 * async path cannot drift from the blocking one (§C.13).
 */
export type DelegationReasoningOwner = Pick<
  ReasoningCellService,
  "openCell" | "openBranch" | "branchBrief" | "cellView" | "closeBranch"
> &
  BranchSettlementOwner;

export interface DelegationServiceDeps {
  /** §C.11 ②: part of the delegation's identity — two projects never collide on one task. */
  readonly projectId: string;
  readonly reasoning: DelegationReasoningOwner;
  /**
   * A port PER delegation, because the snapshot's frozen tree is the port's `workDir` (§C.11 ②).
   * Handing the worker the live repository would leave `ReadBasis` unfrozen.
   */
  readonly branchExecutionFor: (workDir: string) => DelegationBranchHost;
  readonly snapshot: DelegationSnapshotPort;
  /** The terminal delivery seam (principal attention / host followup). Called at most once per ref. */
  readonly onTerminal?: ((projection: DelegationTerminalProjection) => void) | undefined;
  /**
   * The cell's policy refs. They are NOT free choices: a deployment's verification/admission policy
   * ports serve exactly the refs they were built for, and the first-party exploratory bundle serves
   * the recipe EXPLORE refs. Defaulting to those is what makes a delegation work out of the box; a
   * deployment with its own policies passes its own refs.
   */
  readonly verificationPolicyRef?: ReasoningPolicyRef | undefined;
  readonly admissionPolicyRef?: ReasoningPolicyRef | undefined;
}

export interface DelegationService {
  start(input: { readonly task: string; readonly kind?: DelegationKind | undefined }): Promise<DelegationStartResult>;
  status(input: { readonly delegationRef: string }): Promise<DelegationStatusView>;
  inspect(input: { readonly delegationRef: string }): Promise<DelegationInspection>;
}

const DEFAULT_VERIFICATION_POLICY: ReasoningPolicyRef = RECIPE_VERIFICATION_POLICY;
const DEFAULT_ADMISSION_POLICY: ReasoningPolicyRef = RECIPE_ADMISSION_POLICY;

/**
 * A delegation ref: opaque to callers, but strictly parseable and round-trippable (§C.3), and it
 * CARRIES the exact basis so `inspect` still answers "computed against which commit?" after the
 * in-memory job is gone (§C.11 ② — the alternative was a delegation store, which C.3 forbids).
 *
 * `dlg2` is a new version on purpose: the payload changed incompatibly, and a v1 ref must parse to
 * null (UNKNOWN) rather than be mis-read as a v2 one.
 */
const REF_PREFIX = "dlg2";

/** `delegation-<32 hex>` — the derived cell identity, prefixed so a hand-made cell is distinguishable. */
export function delegationCellIdOf(input: {
  readonly projectId: string;
  readonly basisCommit: string;
  readonly task: string;
}): string {
  return `delegation-${canonicalDigest({
    domain: "palimpsest.delegation.v1",
    projectId: input.projectId,
    basisCommit: input.basisCommit,
    task: input.task,
  }).slice(0, 32)}`;
}

export function delegationRefOf(input: {
  readonly cellId: string;
  readonly branchId: string;
  readonly basisCommit: string;
}): string {
  return `${REF_PREFIX}.${input.basisCommit}.${input.cellId}.${input.branchId}`;
}

export function parseDelegationRef(
  ref: string,
): { readonly cellId: string; readonly branchId: string; readonly basisCommit: string } | null {
  const parts = ref.split(".");
  if (parts.length !== 4 || parts[0] !== REF_PREFIX) return null;
  const [, basisCommit, cellId, branchId] = parts;
  // Strict on every segment: a ref that merely LOOKS like one must not become a basis a finding cites.
  if (basisCommit === undefined || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(basisCommit)) return null;
  if (cellId === undefined || cellId === "" || branchId === undefined || branchId === "") return null;
  return { cellId, branchId, basisCommit };
}

export class DelegationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelegationError";
  }
}

/** What the canonical cell says about one branch — the SEMANTIC half of the state. */
interface BranchObservation {
  readonly branchId: string;
  readonly question: string;
  readonly closed: boolean;
  readonly admitted: boolean;
  readonly deduplicated: boolean;
  readonly conclusion: string | null;
}

function observeBranch(view: ReasoningCellView, branchId: string): BranchObservation | null {
  const branch = view.branches.find((entry) => entry.ref.branchId === branchId);
  if (branch === undefined) return null;
  const candidates = view.candidates.filter((candidate) => candidate.branchId === branchId);
  // A DEDUPLICATED candidate is a successful terminal research outcome: the branch reached a
  // conclusion the cell already held. Treating it as failure would make the async path disagree with
  // the blocking one about what "converged" means (§C.13 — the drift the shared settlement prevents).
  const settled = candidates.find(
    (candidate) => candidate.status === "ADMITTED" || candidate.status === "DEDUPLICATED",
  );
  const content = settled?.claim.content;
  const conclusion =
    typeof content === "object" && content !== null && typeof (content as { statement?: unknown }).statement === "string"
      ? (content as { statement: string }).statement
      : null;
  return {
    branchId,
    question: branch.question,
    closed: branch.closed,
    admitted: candidates.some((candidate) => candidate.status === "ADMITTED"),
    deduplicated: candidates.some((candidate) => candidate.status === "DEDUPLICATED"),
    conclusion,
  };
}

export function makeDelegationService(deps: DelegationServiceDeps): DelegationService {
  /**
   * The HOST-LOCAL half of the state. Deliberately in memory and deliberately not canonical: it
   * answers "is a worker running IN THIS PROCESS", which is exactly what a durable store cannot say.
   */
  const active = new Map<
    string,
    {
      /** The host handle. Kept so a future verb could cancel; v1 exposes no cancel and never awaits it. */
      readonly job: DelegationBranchJob;
      readonly snapshot: DelegationSnapshot;
      readonly cellId: string;
      readonly branchId: string;
      readonly question: string;
      settled: boolean;
    }
  >();

  /**
   * §C.11 ③: one ref yields AT MOST ONE terminal projection in this process, for the whole lifetime
   * of the service — not just while the job is in the map. Without this, a failure in the terminal
   * DELIVERY would travel back through `job.completion`'s rejection path and settle the branch a
   * second time (a second close, a second release, a second notification).
   */
  const concluded = new Set<string>();

  async function readCell(cellId: string): Promise<ReasoningCellView | null> {
    try {
      return await deps.reasoning.cellView({ cellId });
    } catch {
      // An unknown cell is not an error here: it is the normal "nothing exists yet" answer.
      return null;
    }
  }

  /** The SEMANTIC state alone; the host half is folded in by `deriveState`. */
  function deriveState(ref: string, observation: BranchObservation | null): { state: DelegationState; detail: string } {
    if (observation === null) {
      return { state: "UNKNOWN", detail: "the canonical reasoning branch behind this ref does not exist" };
    }
    if (!observation.closed) {
      const entry = active.get(ref);
      // §C.11 ①: the semantic branch is open. Whether a WORKER exists is a host fact.
      return entry !== undefined && !entry.settled
        ? { state: "RUNNING", detail: "the research branch is open and this process is running its job" }
        : {
            state: "INTERRUPTED",
            detail:
              "the research branch is still open, but no job for it exists in this process (a restart or crash); it is NOT running and v1 does not auto-rerun it",
          };
    }
    if (observation.admitted) return { state: "COMPLETED", detail: "the research branch closed with an admitted conclusion" };
    if (observation.deduplicated) {
      return {
        state: "COMPLETED",
        detail: "the research branch closed, converging on an existing exploratory conclusion",
      };
    }
    return { state: "FAILED", detail: "the research branch closed without an admissible conclusion" };
  }

  async function release(snapshot: DelegationSnapshot): Promise<void> {
    try {
      await snapshot.release();
    } catch {
      /* hygiene only; a cleanup failure must never rewrite a research outcome */
    }
  }

  /**
   * Settle one delegation. Three failures are deliberately kept apart (§C.11 ③):
   *
   *     host execution failure  ≠  semantic settlement failure  ≠  terminal delivery failure
   *
   * Only the first two decide the OUTCOME. A delivery failure means "the notification did not arrive"
   * — it can never rewrite what the research concluded, and it can never trigger a second settlement.
   */
  async function conclude(
    ref: string,
    entry: { readonly cellId: string; readonly branchId: string; readonly question: string; readonly snapshot: DelegationSnapshot; readonly basisCommit: string },
    output: unknown,
    hostFailure: string | null,
  ): Promise<void> {
    if (concluded.has(ref)) return;
    concluded.add(ref);
    const record = active.get(ref);
    if (record !== undefined) record.settled = true;

    let conclusion: string | null = null;
    let detail: string;
    let state: Exclude<DelegationState, "RUNNING">;
    let reason: string;
    try {
      if (hostFailure !== null) {
        // A host failure is an unresolved branch — never a fabricated claim (§C.13).
        detail = hostFailure;
        state = "FAILED";
        reason = "research closed without an admissible conclusion";
      } else {
        const settlement = await settleBranchFromOutput({
          reasoning: deps.reasoning,
          cellId: entry.cellId,
          branchId: entry.branchId,
          output,
        });
        if (settlement.admittedClaimId !== null) {
          state = "COMPLETED";
          conclusion = statementFromOutput(output) ?? null;
          detail = "the research branch produced an admitted conclusion";
          reason = "research completed";
        } else if (settlement.converged) {
          // DEDUPLICATED: the branch converged on a claim the cell already held. The blocking path
          // counts this as convergence, so the async path must too.
          state = "COMPLETED";
          conclusion = statementFromOutput(output) ?? null;
          detail = "the research branch converged on an existing exploratory conclusion";
          reason = "research converged on an existing conclusion";
        } else {
          state = "FAILED";
          detail = "the research branch produced no admissible conclusion";
          reason = "research closed without an admissible conclusion";
        }
      }
      await deps.reasoning.closeBranch({ cellId: entry.cellId, branchId: entry.branchId, reason });
    } catch (error) {
      state = "FAILED";
      detail = `the research branch could not be settled: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      active.delete(ref);
      // The snapshot is released ALWAYS, including on the failure paths above.
      await release(entry.snapshot);
    }

    // The DELIVERY is the third failure class: it is attempted once, and its failure is recorded as
    // nothing more than "the notification did not arrive". `status`/`inspect` still tell the truth.
    try {
      deps.onTerminal?.({
        delegationRef: ref,
        state,
        basisCommit: entry.basisCommit,
        question: entry.question,
        conclusion,
        detail,
      });
    } catch {
      /* delivery failed; the research outcome stands and the canonical state is unchanged */
    }
  }

  async function statusOf(delegationRef: string): Promise<DelegationStatusView> {
    const parsed = parseDelegationRef(delegationRef);
    if (parsed === null) {
      return Object.freeze({
        delegationRef,
        state: "UNKNOWN" as const,
        basisCommit: null,
        detail: "this is not a delegation ref",
      });
    }
    const view = await readCell(parsed.cellId);
    const derived = deriveState(delegationRef, view === null ? null : observeBranch(view, parsed.branchId));
    return Object.freeze({
      delegationRef,
      ...derived,
      // The basis comes from the REF, so it survives the job map, a restart and a settlement.
      basisCommit: parsed.basisCommit,
    });
  }

  return Object.freeze({
    async start(input: { readonly task: string; readonly kind?: DelegationKind | undefined }): Promise<DelegationStartResult> {
      const task = input.task.trim();
      if (task === "") throw new DelegationError("a delegation needs a task — state what should be investigated");
      const kind: DelegationKind = input.kind ?? "RESEARCH";
      if (kind !== "RESEARCH") {
        throw new DelegationError(`D1 implements RESEARCH delegation only; "${kind}" is not available yet`);
      }

      // §C.11 ②: freeze the basis FIRST. Identity derives from it, and a worker must never be pointed
      // at a live tree — so a snapshot failure is the CALLER's failure, not a background one.
      const snapshot = await deps.snapshot.freeze();
      const basisCommit = snapshot.basisCommit;
      const cellId = delegationCellIdOf({ projectId: deps.projectId, basisCommit, task });

      /**
       * §C.11 ②: inspect what ALREADY exists BEFORE creating or starting anything. Opening the branch
       * first would erase the one fact this needs — whether the branch was already there — and an
       * OPEN branch with no job in this process is a restart, not a fresh start.
       */
      const view = await readCell(cellId);
      if (view !== null) {
        const existing = view.branches.find((entry) => entry.question === task);
        if (existing !== undefined) {
          const branchId = existing.ref.branchId;
          const ref = delegationRefOf({ cellId, branchId, basisCommit });
          const observation = observeBranch(view, branchId);
          const derived = deriveState(ref, observation);
          await release(snapshot);
          if (derived.state === "RUNNING") {
            return Object.freeze({
              delegationRef: ref,
              kind,
              outcome: "ALREADY_RUNNING" as const,
              state: "RUNNING" as const,
              basisCommit,
              conclusion: null,
              detail:
                "an identical delegation (same project, same basis, same task) is already running in this process; no second worker was started",
            });
          }
          return Object.freeze({
            delegationRef: ref,
            kind,
            outcome: "EXISTING" as const,
            state: derived.state,
            basisCommit,
            conclusion: observation?.conclusion ?? null,
            detail: `${derived.detail}; nothing new was started`,
          });
        }
      }

      // Nothing exists: this really is a new delegation.
      const verificationPolicyRef = deps.verificationPolicyRef ?? DEFAULT_VERIFICATION_POLICY;
      const admissionPolicyRef = deps.admissionPolicyRef ?? DEFAULT_ADMISSION_POLICY;
      let ref: string;
      let branchId: string;
      let job: DelegationBranchJob;
      try {
        await deps.reasoning.openCell({ cellId, objective: task, verificationPolicyRef, admissionPolicyRef });
        const opened = await deps.reasoning.openBranch({ cellId, question: task });
        branchId = opened.branch.ref.branchId;
        ref = delegationRefOf({ cellId, branchId, basisCommit });
        const brief = await deps.reasoning.branchBrief({ cellId, branchId });
        job = deps.branchExecutionFor(snapshot.workDir).start({ brief });
      } catch (error) {
        // A delegation that never started owns nothing: release the snapshot we froze for it.
        await release(snapshot);
        throw error;
      }
      active.set(ref, { job, snapshot, cellId, branchId, question: task, settled: false });

      // The async half: nothing awaits this, and nothing about it reaches the principal except the
      // terminal projection delivered from `conclude`.
      const entry = { cellId, branchId, question: task, snapshot, basisCommit };
      void job.completion
        .then((output) => conclude(ref, entry, output, null))
        .catch((error: unknown) =>
          conclude(
            ref,
            entry,
            undefined,
            `the research host failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );

      return Object.freeze({
        delegationRef: ref,
        kind,
        outcome: "STARTED" as const,
        state: "RUNNING" as const,
        basisCommit,
        conclusion: null,
        detail:
          "the research branch is open and its host job has started; the principal does not need to wait or poll — a terminal result will arrive on its own",
      });
    },

    async status(input: { readonly delegationRef: string }): Promise<DelegationStatusView> {
      return statusOf(input.delegationRef);
    },

    async inspect(input: { readonly delegationRef: string }): Promise<DelegationInspection> {
      const status = await statusOf(input.delegationRef);
      const parsed = parseDelegationRef(input.delegationRef);
      let question: string | null = null;
      let conclusion: string | null = null;
      if (parsed !== null) {
        const view = await readCell(parsed.cellId);
        const observation = view === null ? null : observeBranch(view, parsed.branchId);
        question = observation?.question ?? null;
        conclusion = observation?.conclusion ?? null;
      }
      return Object.freeze({ ...status, question, conclusion });
    },
  });
}
