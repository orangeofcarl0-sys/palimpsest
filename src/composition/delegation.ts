/**
 * PLMP-LEAN-1 §C.11/§C.14 (D1-e) — the DELEGATION composition.
 *
 * A composition cluster like every other one in this directory: no policy of its own, no discovery,
 * no registry, no string-keyed lookup. It decides exactly one thing — whether this deployment can
 * truthfully delegate research — and it composes the delegation service from wiring that already
 * exists, in the same shape the other clusters use.
 *
 * It owns nothing. There is deliberately NO delegation store (§C.3): the identity is derived from
 * `H(projectId, basisCommit, task)`, the state is derived from the canonical ReasoningCell plus this
 * process's own job map, and the frozen read basis is a temporary detached checkout that is discarded
 * when the job ends.
 *
 * ABSENCE SEMANTICS: a delegation needs a reasoning store (where the branch lives), a repository (to
 * snapshot the read basis) and an async branch host (to run the worker). Without any one of them there
 * is no truthful delegation, so the service is simply absent — never a stub, exactly like the campaign,
 * boundary and runtime clusters above it.
 */
import { gitDelegationSnapshotPort } from "../deployment/delegation_snapshot.js";
import { makeDelegationService, type DelegationService } from "../interaction/delegation.js";
import { makePrincipalTerminalComposer, type PrincipalDeliveryPort } from "../interaction/delegation_terminal.js";
import type { ReasoningCellService } from "../reasoning_cell/index.js";
import type { InstallPalimpsestOptions } from "./install_contract.js";

/** Exactly the public options this cluster may read. */
export type DelegationCompositionOptions = Pick<
  InstallPalimpsestOptions,
  "projectId" | "repository" | "delegationBranchExecution" | "delegationDelivery"
>;

/** The already-composed values this cluster consumes. */
export interface DelegationCompositionInput {
  readonly options: DelegationCompositionOptions;
  /** The composed ReasoningCell service, or absent when this deployment has no reasoning store. */
  readonly reasoning: ReasoningCellService | undefined;
}

/**
 * The honest default when no host bound a delivery: a terminal result is undeliverable and says so.
 * It is never a silent drop, and it never makes the result look delivered.
 */
export const unboundPrincipalDelivery: PrincipalDeliveryPort = Object.freeze({
  adapterId: "unbound",
  deliver: async () => ({
    delivered: false,
    detail:
      "this deployment composes no principal delivery seam, so a terminal delegation result cannot be delivered; status and inspect still report it",
  }),
});

export function composeDelegationCapability(input: DelegationCompositionInput): DelegationService | undefined {
  const { options, reasoning } = input;
  const repository = options.repository;
  if (reasoning === undefined || repository === undefined || repository === "" || options.delegationBranchExecution === undefined) {
    return undefined;
  }
  return makeDelegationService({
    projectId: options.projectId,
    reasoning,
    branchExecutionFor: options.delegationBranchExecution,
    snapshot: gitDelegationSnapshotPort({ repository }),
    /**
     * §C.11 ③: the terminal result reaches the principal through the PRODUCT composer, which formats
     * it, states its exploratory standing and records a delivery failure as a delivery failure. The
     * delegation runtime holds this for its whole life; a host may bind the real delivery later.
     */
    onTerminal: makePrincipalTerminalComposer({
      deliver: options.delegationDelivery ?? unboundPrincipalDelivery,
    }).onTerminal,
  });
}
