/**
 * SR-1D R2 §7/§8/§9 — the work application-surface cluster.
 *
 * The implementation was decomposed into cohesive application modules (contract / projection /
 * execution / settlement) when the PWRS work paths pushed it past the §26 size ceiling. The cluster
 * keeps the façade TYPES and the one constructor the factory calls, from the same NARROW input as
 * before: it can only see the dependencies it actually reads.
 */

import type { HostDeploymentFactsPort } from "../common.js";
import type { WorkApplicationSurface, WorkController, WorkRuntimeDeps } from "../work_contract.js";
import { makeWorkApplicationSurface } from "../work_runtime.js";

/** PWRS-A: the durable relay recorder port, re-exported so the factory keeps its existing edges. */
export type { ExecutionRelayRecorderPort } from "../../work/execution_relay.js";
export type {
  FinishVerificationFace,
  ResultContinuationFace,
  WorkApplicationSurface,
  WorkDelegationFace,
  WorkRuntimeDeps,
} from "../work_contract.js";

/** Exactly the dependencies this cluster reads — nothing else is visible to it (§9). */
export interface WorkSurfaceDeps {
  readonly controller: WorkController;
  /** Host facts about the running deployment; absent means no dashboard is known of. */
  readonly hostFacts?: HostDeploymentFactsPort | undefined;
  /** §B.15: present when this deployment composes an attempt-result verification runtime. */
  readonly verification?: import("../work_contract.js").FinishVerificationFace | undefined;
  /** LHAPE-A: the composed async worker transport; absent ⇒ no worker can start in this deployment. */
  readonly workDelegation?: import("../work_contract.js").WorkDelegationFace | undefined;
  /** LHAPE-B: the composed result-continuation authority; absent ⇒ no continuation inspection. */
  readonly continuation?: import("../work_contract.js").ResultContinuationFace | undefined;
  /**
   * PWRS-A: the durable settlement record. Absent ⇒ the attribution is still returned to the caller
   * and appears in the pulse, but it is not written to the project journal.
   */
  readonly executionRelay?: import("../../work/execution_relay.js").ExecutionRelayRecorderPort | undefined;
}

export function makeWorkSurfaces(deps: WorkSurfaceDeps): { readonly work: WorkApplicationSurface } {
  // WorkSurfaceDeps mirrors WorkRuntimeDeps at this boundary; the compiler checks the assignment.
  const runtimeDeps: WorkRuntimeDeps = deps;
  return { work: makeWorkApplicationSurface(runtimeDeps) };
}
