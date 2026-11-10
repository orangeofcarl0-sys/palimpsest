/**
 * SR-1 §26 / ODPE — the work application runtime.
 *
 * Composes the cohesive method groups into the façade the cluster publishes. Each group owns one
 * kind of decision (projection / execution / settlement / outcome); this file only wires them.
 * The outcome group receives the SETTLEMENT function, so the bounded finalization performs the
 * ordinary Work settlement rather than a second one.
 */
import type { WorkApplicationSurface, WorkRuntimeDeps } from "./work_contract.js";
import { makeWorkExecutionSurface } from "./work_execution.js";
import { makeWorkOutcomeSurface } from "./work_outcome.js";
import { makeWorkProjectionSurface } from "./work_projection.js";
import { makeWorkSettlementSurface } from "./work_settlement.js";

export function makeWorkApplicationSurface(deps: WorkRuntimeDeps): WorkApplicationSurface {
  const settlement = makeWorkSettlementSurface(deps);
  return {
    readRevisionReceipt: query => deps.controller.readRevisionReceipt(query),
    ...makeWorkProjectionSurface(deps),
    ...makeWorkExecutionSurface(deps),
    ...settlement,
    ...makeWorkOutcomeSurface(deps, { completeTask: settlement.completeTask }),
  };
}
