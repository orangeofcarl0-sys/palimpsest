/** Plan revision preparation. Reads the Work projection, computes closure and builds receipt IDs;
 * it does not append events. The controller's existing atomic batch remains the only writer. */
import type { DatabaseSync } from "node:sqlite";
import type { ProjectIr } from "../schema/index.js";
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
