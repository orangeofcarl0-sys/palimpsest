/** Plan revision preparation. Reads the Work projection, computes closure and builds receipt IDs;
 * it does not append events. The controller's existing atomic batch remains the only writer. */
import type { DatabaseSync } from "node:sqlite";
import type { ProjectIr, SchedulerEvent } from "../schema/index.js";
import { DomainValidationError } from "../domain/errors.js";
import { actionKey, stableEntityId } from "../domain/idempotency.js";
import { computeInvalidationSet, type ChangeClass, type DependencyEdge } from "../evidence/invalidation.js";
import { findOpenWorkerInvocations, type OpenWorkerInvocation } from "./read_model.js";

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
