/** Plan revision preparation. Reads the Work projection, computes closure and builds receipt IDs;
 * it does not append events. The controller's existing atomic batch remains the only writer. */
import type { DatabaseSync } from "node:sqlite";
import type { ProjectIr, SchedulerEvent } from "../schema/index.js";
import { parseNewEvent } from "../schema/index.js";
import { DomainValidationError } from "../domain/errors.js";
import type { ControllerStatusView, WorkNextAction } from "../domain/work_state.js";
import { actionKey, stableEntityId } from "../domain/idempotency.js";
import { computeInvalidationSet, type ChangeClass, type DependencyEdge } from "../evidence/invalidation.js";
import { findOpenWorkerInvocations, type OpenWorkerInvocation } from "./read_model.js";
import { observeCommittedDirectArtifacts } from "./unseen_inputs.js";

/** A CREATED reservation has not granted a writer a world: claim starts it before returning. */
interface DirectRetirementContext {
  readonly current: ProjectIr;
  readonly connection: DatabaseSync;
  readonly repository: string | undefined;
}

function observeDirectTaskRetirement(input: DirectRetirementContext):
  { taskId: string; candidate: string; attempt: { id: string; event: number } | null } | null {
  const { current, connection, repository } = input;
  if (current.tasks.length !== 1) return null;
  const task = current.tasks[0]!;
  const projected = connection.prepare(`SELECT state, envelope_json IS NOT NULL AND
    json_type(CAST(envelope_json AS TEXT), '$.obligations') IS NULL AS ordinary
    FROM tasks WHERE project_id=? AND task_id=?`)
    .get(current.project_id, task.task_id);
  if (projected?.state !== "ACTIVE") return null;
  const attempts = connection.prepare("SELECT attempt_id, state, last_event_id FROM attempts WHERE project_id=? AND task_id=?")
    .all(current.project_id, task.task_id);
  if (attempts.length > 1 || attempts.some(row => row.state !== "CREATED")) return null;
  const reserved = attempts[0];
  if (reserved && connection.prepare("SELECT 1 FROM attempts WHERE project_id=? AND task_id<>? AND state IN ('CREATED','LEASED','RUNNING')")
    .get(current.project_id, task.task_id)) return null;
  // Governed obligations retain their own verifier and acceptance path.
  if (reserved && projected.ordinary !== 1) return null;
  const candidate = observeCommittedDirectArtifacts(repository, current.head_commit, task.required_artifacts,
    reserved ? task.write_paths : undefined);
  return candidate === null ? null : {
    taskId: task.task_id, candidate,
    attempt: reserved ? { id: String(reserved.attempt_id), event: Number(reserved.last_event_id) } : null,
  };
}

export function directTaskRetirement(input: DirectRetirementContext & {
  readonly next: ProjectIr;
  readonly headAdvance: boolean;
  readonly plan: { readonly changeClass?: string | undefined; readonly directRetirement?: Pick<NonNullable<ControllerStatusView["directRetirement"]>,
    "revision" | "attemptId" | "candidate"> | undefined; readonly goal?: unknown; readonly requirements?: unknown;
    readonly decisions?: unknown; readonly changedIds?: unknown };
}) {
  const { current, next, repository, plan, headAdvance } = input;
  const expected = plan.directRetirement;
  const removal = plan.changeClass === "metadata_only" && !headAdvance && next.tasks.length === 0;
  if (expected && (!removal || plan.goal !== undefined || plan.requirements !== undefined || plan.decisions !== undefined ||
      plan.changedIds !== undefined)) throw new DomainValidationError("direct retirement requires only removing the redundant plan");
  if (!removal) return null;
  const observed = observeDirectTaskRetirement(input);
  if (expected && (observed?.attempt?.id !== expected.attemptId || observed?.candidate !== expected.candidate ||
      current.revision !== expected.revision)) {
    throw new DomainValidationError("direct retirement facts changed; read readiness again");
  }
  if (!observed || (!expected && observed.attempt)) return null;
  const { attempt, candidate, taskId } = observed;
  const task = current.tasks[0]!;
  const cancellation = attempt && parseNewEvent({
    schema_version: 1,
    project_id: current.project_id,
    event_type: "ATTEMPT_CANCELLED",
    payload_version: 1,
    entity_type: "attempt",
    entity_id: attempt.id,
    payload: { previous_state: "CREATED", new_state: "CANCELLED", lease_generation: null,
      reason: "Retire the unclaimed attempt after direct delivery", attempt_report: null, before_dispatch: true },
    causation_id: attempt.event,
    correlation_id: `attempt:${attempt.id}`,
    idempotency_key: actionKey("attempt-callback-v1", { attempt_id: attempt.id, terminal_event_type: "ATTEMPT_CANCELLED", attempt_report_digest: null }),
    expected_project_revision: current.revision,
  });
  return { taskId, cancellation, verify: () => {
    if (observeCommittedDirectArtifacts(repository, current.head_commit, task.required_artifacts,
      attempt ? task.write_paths : undefined) !== candidate) {
      throw new DomainValidationError("direct retirement facts changed; read readiness again");
    }
    // The open reservation is checked by the cancellation event before the task is staled.
    if (!attempt && input.connection.prepare("SELECT 1 FROM attempts WHERE project_id=? AND task_id=? LIMIT 1")
      .get(current.project_id, taskId)) throw new DomainValidationError("direct retirement facts changed; read readiness again");
  } };
}

export function projectDirectRetirement(input: DirectRetirementContext, status: Pick<ControllerStatusView, "attempts" | "directOutcome">,
  headState: string, promotionFenced: boolean): { directRetirement: NonNullable<ControllerStatusView["directRetirement"]>; nextAction: WorkNextAction } | null {
  if (headState !== "IN_SYNC" || promotionFenced || status.directOutcome?.relation !== "DIRECT_AHEAD" ||
      !status.attempts.some(row => row.state === "CREATED") || status.attempts.some(row => row.orphaned)) return null;
  const observed = observeDirectTaskRetirement(input);
  if (!observed?.attempt || observed.candidate !== status.directOutcome.repositoryHead) return null;
  const directRetirement = { revision: input.current.revision, taskId: observed.taskId,
    attemptId: observed.attempt.id, candidate: observed.candidate };
  return { directRetirement, nextAction: {
    kind: "NO_SETTLEABLE_DELTA", executable: false, action: null, taskId: observed.taskId,
    detail: "The direct candidate is committed. To close out, call plan with tasks=[], changeClass=metadata_only and the returned directRetirement observation.",
    blockers: [],
  } };
}

export function directBasisEntityId(input: {
  readonly projectId: string;
  readonly revision: number;
  readonly commit: string;
}): string {
  return stableEntityId("basis", actionKey("direct-basis-admission-v1", input));
}

/**
 * PNWF-CQ-D — the invalidation set and the owner-local OPEN-invocation read, in one place.
 */
export function invalidationAffectedForPlan(input: {
  readonly project: ProjectIr;
  readonly from: number;
  readonly to: number;
  readonly changeClass: ChangeClass;
  readonly changedIds: readonly string[];
  readonly projectId: string;
  readonly connection: DatabaseSync;
  readonly invocations: (attemptId: string) => readonly { readonly invocationId: string; readonly outcome: string }[];
  readonly onOpenWorker: (open: OpenWorkerInvocation) => never;
}): readonly string[] {
  const edges: DependencyEdge[] = input.project.tasks.flatMap((task) =>
    task.depends_on.map((dependency) => ({
      from: dependency,
      to: task.task_id,
      sensitive_to: ["behavior_change", "contract_breaking"] as const,
    })),
  );
  const affected = [
    ...computeInvalidationSet(
      { from: input.from, to: input.to, change_class: input.changeClass, changed_ids: input.changedIds },
      edges,
    ),
  ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const openWorkerInvocations = findOpenWorkerInvocations({
    connection: input.connection,
    projectId: input.projectId,
    taskIds: affected,
    invocations: input.invocations,
  });
  if (openWorkerInvocations.length > 0) input.onOpenWorker(openWorkerInvocations[0]!);
  return Object.freeze(affected);
}

/** The revision receipt identity: a promotion-backed plan or an operator-mediated direct basis. */
export function directBasisReceipt(input: {
  readonly projectId: string;
  readonly revision: number;
  readonly commit: string;
  readonly operator: string;
}): { readonly promotionId: string; readonly correlationId: string; readonly idempotencyKey: string } {
  return {
    promotionId: directBasisEntityId(input),
    correlationId: `basis:${input.commit}`,
    idempotencyKey: actionKey("direct-basis-admission-v1", input),
  };
}

/** Read the recorded acceptance behind a canonical head, from ascending project events. */
export function recordedHeadAcceptance(events: readonly SchedulerEvent[], commit: string) {
  let head: string | undefined;
  let advance: SchedulerEvent | undefined;
  for (const event of events) {
    if (event.event_type !== "PROJECT_CREATED" && event.event_type !== "PROJECT_REVISED") continue;
    const revision = event.payload.project_ir as ProjectIr;
    if (revision.head_commit === head) continue;
    head = revision.head_commit;
    advance = event.event_type === "PROJECT_REVISED" ? event : undefined;
  }
  if (advance === undefined || head !== commit) return null;
  const revision = (advance.payload.project_ir as ProjectIr).revision;
  if (advance.correlation_id === `basis:${commit}`) {
    const approval = events.findLast((event) =>
      event.event_type === "MANUAL_APPROVAL_RECORDED" &&
      event.event_id < advance.event_id &&
      event.expected_project_revision === advance.expected_project_revision &&
      event.correlation_id === advance.correlation_id &&
      event.payload.subject_type === "commit" &&
      event.payload.subject_id === commit,
    );
    if (approval === undefined || typeof approval.payload.approver !== "string") return null;
    const receipt = directBasisReceipt({
      projectId: advance.project_id, revision, commit, operator: approval.payload.approver,
    });
    return advance.payload.promotion_id !== receipt.promotionId ? null : {
      kind: "DIRECT_BASIS" as const, commit, eventId: advance.event_id, approvalEventId: approval.event_id,
    };
  }
  const promotion = events.findLast((event) =>
    event.event_type === "PROMOTION_COMMITTED" &&
    event.event_id < advance.event_id &&
    event.payload.resulting_head_commit === commit,
  );
  return promotion === undefined ? null : { kind: "PROMOTION" as const, commit, eventId: promotion.event_id };
}

/** A direct basis admission is head-only; a task graph change belongs to a separate revision. */
export function assertDirectBasisHeadOnly(diffs: readonly { readonly class: string }[]): void {
  const graphChanged = diffs.some((diff) => diff.class !== "RETAIN_UNCHANGED" && diff.class !== "TERMINAL_HISTORICAL");
  if (graphChanged) {
    throw new DomainValidationError(
      "DIRECT_BASIS_GRAPH_CHANGED: a direct basis admission is head-only; admit the basis first, then revise the task graph separately",
    );
  }
}

/** The revision receipt: promotion-backed plan identity, or the direct-basis identity. */
export function planReceipt(input: {
  readonly projectId: string;
  readonly revision: number;
  readonly directBasis?: { readonly toHead: string; readonly operator?: string | undefined } | undefined;
}): { readonly promotionId: string; readonly correlationId: string; readonly idempotencyKey: string } {
  if (input.directBasis !== undefined) {
    return directBasisReceipt({
      projectId: input.projectId,
      revision: input.revision,
      commit: input.directBasis.toHead,
      operator: input.directBasis.operator ?? "",
    });
  }
  return {
    promotionId: stableEntityId("plan", actionKey("plan-revision-v1", { project_id: input.projectId, revision: input.revision })),
    correlationId: `plan:${input.revision}`,
    idempotencyKey: actionKey("plan-revision-v1", { project_id: input.projectId, revision: input.revision }),
  };
}
