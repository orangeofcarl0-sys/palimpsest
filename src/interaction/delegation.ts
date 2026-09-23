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
 * Nothing here creates Work truth. A delegation creates no Task, no Attempt, no EvidenceAtom, does not
 * satisfy a Work Gate or an attempt-result verification, does not touch promotion eligibility and does
 * not need `palimpsest_begin`. A research branch's own standing stays cell-local.
 */
import { canonicalDigest } from "../schema/canonical.js";
import type { AsyncReasoningBranchExecutionPort, BranchExecutionJob } from "../reasoning_cell/branch_execution.js";
import { settleBranchFromOutput, type BranchSettlementOwner } from "../reasoning_cell/branch_settlement.js";
import type { ReasoningCellView } from "../reasoning_cell/service.js";
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

export interface DelegationStartResult {
  readonly delegationRef: string;
  readonly kind: DelegationKind;
  readonly state: "STARTED";
  readonly detail: string;
}

export interface DelegationStatusView {
  readonly delegationRef: string;
  readonly state: DelegationState;
  readonly detail: string;
}

/** `inspect` is progressive disclosure: the same state, plus what a decision would need. */
export interface DelegationInspection extends DelegationStatusView {
  readonly question: string | null;
  /** The commit the research basis WAS — so a finding can name what it was computed against. */
  readonly basisCommit: string | null;
  readonly conclusion: string | null;
}

/** §C.11 principle ③: terminal, actionable, and never a progress ping. */
export interface DelegationTerminalProjection {
  readonly delegationRef: string;
  readonly state: Exclude<DelegationState, "RUNNING">;
  readonly question: string;
  readonly conclusion: string | null;
  readonly detail: string;
}

export interface DelegationServiceDeps {
  readonly reasoning: BranchSettlementOwner & {
    openCell(input: {
      readonly cellId: string;
      readonly objective: string;
      readonly verificationPolicyRef: string;
      readonly admissionPolicyRef: string;
    }): Promise<unknown>;
    openBranch(input: { readonly cellId: string; readonly question: string }): Promise<{
      readonly branch: { readonly ref: { readonly branchId: string } };
    }>;
    branchBrief(input: { readonly cellId: string; readonly branchId: string }): Promise<unknown>;
    cellView(input: { readonly cellId: string }): Promise<ReasoningCellView>;
    closeBranch(input: { readonly cellId: string; readonly branchId: string; readonly reason: string }): Promise<void>;
  };
  /**
   * A port PER delegation, because the snapshot's frozen tree is the port's `workDir` (§C.11 ②).
   * Handing the worker the live repository would leave `ReadBasis` unfrozen.
   */
  readonly branchExecutionFor: (workDir: string) => AsyncReasoningBranchExecutionPort;
  readonly snapshot: DelegationSnapshotPort;
  /** The terminal delivery seam (attention / host followup). Only ever called with a terminal state. */
  readonly onTerminal?: ((projection: DelegationTerminalProjection) => void) | undefined;
  readonly verificationPolicyRef?: string | undefined;
  readonly admissionPolicyRef?: string | undefined;
}

export interface DelegationService {
  start(input: { readonly task: string; readonly kind?: DelegationKind | undefined }): Promise<DelegationStartResult>;
  status(input: { readonly delegationRef: string }): Promise<DelegationStatusView>;
  inspect(input: { readonly delegationRef: string }): Promise<DelegationInspection>;
}

const DEFAULT_VERIFICATION_POLICY = "recipe.explore.verification@v1";
const DEFAULT_ADMISSION_POLICY = "recipe.explore.admission@v1";

/** A delegation ref: opaque to callers, but strictly parseable and round-trippable (§C.3). */
const REF_PREFIX = "dlg1";

export function delegationRefOf(cellId: string, branchId: string): string {
  return `${REF_PREFIX}.${cellId}.${branchId}`;
}

export function parseDelegationRef(ref: string): { readonly cellId: string; readonly branchId: string } | null {
  const parts = ref.split(".");
  if (parts.length !== 3 || parts[0] !== REF_PREFIX) return null;
  const [, cellId, branchId] = parts;
  if (cellId === undefined || branchId === undefined || cellId === "" || branchId === "") return null;
  return { cellId, branchId };
}

export class DelegationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelegationError";
  }
}

export function makeDelegationService(deps: DelegationServiceDeps): DelegationService {
  /**
   * The HOST-LOCAL half of the state. Deliberately in memory and deliberately not canonical: it
   * answers "is a worker running IN THIS PROCESS", which is exactly what a durable store cannot say.
   */
  const active = new Map<
    string,
    {
      readonly job: BranchExecutionJob;
      readonly snapshot: DelegationSnapshot;
      readonly cellId: string;
      readonly branchId: string;
      readonly question: string;
      settled: boolean;
    }
  >();

  async function branchView(cellId: string, branchId: string): Promise<{ closed: boolean; admitted: boolean } | null> {
    let view: ReasoningCellView;
    try {
      view = await deps.reasoning.cellView({ cellId });
    } catch {
      return null;
    }
    const branch = view.branches.find((entry) => entry.ref.branchId === branchId);
    if (branch === undefined) return null;
    const admitted = view.candidates.some(
      (candidate) => candidate.branchId === branchId && candidate.status === "ADMITTED",
    );
    return { closed: branch.closed, admitted };
  }

  async function stateOf(ref: string): Promise<{ state: DelegationState; detail: string }> {
    const parsed = parseDelegationRef(ref);
    if (parsed === null) return { state: "UNKNOWN", detail: "this is not a delegation ref" };
    const view = await branchView(parsed.cellId, parsed.branchId);
    if (view === null) {
      return { state: "UNKNOWN", detail: "the canonical reasoning branch behind this ref does not exist" };
    }
    const entry = active.get(ref);
    if (!view.closed) {
      // §C.11 ①: the semantic branch is open. Whether a WORKER exists is a host fact.
      return entry !== undefined && !entry.settled
        ? { state: "RUNNING", detail: "the research branch is open and this process is running its job" }
        : {
            state: "INTERRUPTED",
            detail:
              "the research branch is still open, but no job for it exists in this process (a restart or crash); it is NOT running and v1 does not auto-rerun it",
          };
    }
    return view.admitted
      ? { state: "COMPLETED", detail: "the research branch closed with an admitted conclusion" }
      : { state: "FAILED", detail: "the research branch closed without an admissible conclusion" };
  }

  async function conclude(
    ref: string,
    entry: { readonly cellId: string; readonly branchId: string; readonly question: string; readonly snapshot: DelegationSnapshot },
    output: unknown,
    failure: string | null,
  ): Promise<void> {
    const record = active.get(ref);
    if (record !== undefined) record.settled = true;
    let conclusion: string | null = null;
    let detail: string;
    let state: Exclude<DelegationState, "RUNNING">;
    try {
      if (failure !== null) {
        // A host failure is an unresolved branch — never a fabricated claim (§C.13).
        detail = failure;
        state = "FAILED";
      } else {
        const settlement = await settleBranchFromOutput({
          reasoning: deps.reasoning,
          cellId: entry.cellId,
          branchId: entry.branchId,
          output,
        });
        conclusion =
          typeof output === "object" && output !== null && typeof (output as { statement?: unknown }).statement === "string"
            ? ((output as { statement: string }).statement)
            : null;
        state = settlement.admittedClaimId !== null ? "COMPLETED" : "FAILED";
        detail =
          settlement.admittedClaimId !== null
            ? "the research branch produced an admitted conclusion"
            : settlement.unresolved
              ? "the research branch produced no admissible conclusion"
              : "the research branch converged on an existing conclusion";
      }
      await deps.reasoning.closeBranch({
        cellId: entry.cellId,
        branchId: entry.branchId,
        reason: state === "COMPLETED" ? "research completed" : "research closed without an admissible conclusion",
      });
    } catch (error) {
      state = "FAILED";
      detail = `the research branch could not be settled: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      active.delete(ref);
      // The snapshot is released ALWAYS, including on the failure paths above.
      try {
        await entry.snapshot.release();
      } catch {
        /* hygiene only; a cleanup failure must never rewrite a research outcome */
      }
    }
    deps.onTerminal?.({
      delegationRef: ref,
      state,
      question: entry.question,
      conclusion,
      detail,
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

      // A deterministic cell per task, so two identical delegations converge on the same cell rather
      // than minting a second one.
      const cellId = `delegation-${canonicalDigest({ task }).slice(0, 32)}`;
      await deps.reasoning.openCell({
        cellId,
        objective: task,
        verificationPolicyRef: deps.verificationPolicyRef ?? DEFAULT_VERIFICATION_POLICY,
        admissionPolicyRef: deps.admissionPolicyRef ?? DEFAULT_ADMISSION_POLICY,
      });
      const opened = await deps.reasoning.openBranch({ cellId, question: task });
      const branchId = opened.branch.ref.branchId;
      const ref = delegationRefOf(cellId, branchId);

      const brief = await deps.reasoning.branchBrief({ cellId, branchId });
      // §C.11 ②: freeze the basis FIRST. If it cannot be frozen we must not start a worker against a
      // live tree, so this failure is the caller's, not a background one.
      const snapshot = await deps.snapshot.freeze();
      const port = deps.branchExecutionFor(snapshot.workDir);
      const job = port.start({ brief });
      active.set(ref, { job, snapshot, cellId, branchId, question: task, settled: false });

      // The async half: nothing awaits this, and nothing about it reaches the principal except the
      // terminal projection below.
      void job.completion
        .then((output) => conclude(ref, { cellId, branchId, question: task, snapshot }, output, null))
        .catch((error: unknown) =>
          conclude(
            ref,
            { cellId, branchId, question: task, snapshot },
            undefined,
            `the research host failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );

      return Object.freeze({
        delegationRef: ref,
        kind,
        state: "STARTED" as const,
        detail:
          "the research branch is open and its host job has started; the principal does not need to wait or poll — a terminal result will arrive on its own",
      });
    },

    async status(input: { readonly delegationRef: string }): Promise<DelegationStatusView> {
      const derived = await stateOf(input.delegationRef);
      return Object.freeze({ delegationRef: input.delegationRef, ...derived });
    },

    async inspect(input: { readonly delegationRef: string }): Promise<DelegationInspection> {
      const derived = await stateOf(input.delegationRef);
      const parsed = parseDelegationRef(input.delegationRef);
      let question: string | null = null;
      let conclusion: string | null = null;
      if (parsed !== null) {
        try {
          const view = await deps.reasoning.cellView({ cellId: parsed.cellId });
          question = view.branches.find((entry) => entry.ref.branchId === parsed.branchId)?.question ?? null;
          const admitted = view.candidates.find(
            (candidate) => candidate.branchId === parsed.branchId && candidate.status === "ADMITTED",
          );
          const content = admitted?.claim.content;
          conclusion =
            typeof content === "object" && content !== null && typeof (content as { statement?: unknown }).statement === "string"
              ? ((content as { statement: string }).statement)
              : null;
        } catch {
          /* an unreadable cell leaves the detail fields null rather than inventing them */
        }
      }
      const entry = active.get(input.delegationRef);
      return Object.freeze({
        delegationRef: input.delegationRef,
        ...derived,
        question,
        basisCommit: entry?.snapshot.basisCommit ?? null,
        conclusion,
      });
    },
  });
}
