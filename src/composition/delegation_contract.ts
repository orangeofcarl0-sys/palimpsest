/**
 * PLMP-LEAN-1 §C.11/§C.14 — the D1 delegation INSTALL CONTRACT.
 *
 * These two options live in their own module for the same reason the other extracted contracts do:
 * `install_contract.ts` is at its §25 size ceiling, and the honest response to a size gate is to move
 * a cohesive contract out rather than to compress the prose that explains it.
 *
 * They are NOT separately re-exported: a host supplies them as fields of `InstallPalimpsestOptions`
 * (see `delegation_contract`'s `extends` clause there), so this module adds no package export.
 */

import type { DelegationBranchHost, DelegationService } from "../interaction/delegation.js";
import type { PrincipalDeliveryPort } from "../interaction/delegation_terminal.js";

export interface DelegationInstallOptions {
  /**
   * PLMP-LEAN-1 §C.11 ② (additive): the ASYNC branch host, bound to a FROZEN delegation snapshot's
   * `workDir`. It is the SAME adapter as `reasoningBranchExecution`, started rather than awaited —
   * `same cognition backend · different interaction lifecycle` — and supplying it is what makes
   * `palimpsest_delegate` and `application.delegation` exist at all. Absent ⇒ no delegation face,
   * never a stub.
   */
  delegationBranchExecution?: ((workDir: string) => DelegationBranchHost) | undefined;
  /**
   * PLMP-LEAN-1 §C.11 ③ (additive): where a delegated research branch's TERMINAL result reaches the
   * principal. It is a host primitive ("deliver this text to the principal") and nothing more: what is
   * terminal, what the text says and what a delivery failure means are decided in the product layer. A
   * host that creates its principal session after the install (DSH) leaves this unbound until it can
   * bind one — `launchDeployment` supplies a late-bound holder for exactly that.
   */
  delegationDelivery?: PrincipalDeliveryPort | undefined;
}

export interface DelegationInstallResult {
  /**
   * PLMP-LEAN-1 §C.11/§C.14 (additive): the D1 RESEARCH delegation runtime — the ASYNC sibling of
   * `collaboration`, over the SAME cognition backend and the SAME settlement path. Present iff a
   * reasoning store, a repository and an async branch host are all composed. It creates no Work truth:
   * no Task, no Attempt, no EvidenceAtom, no verification, no promotion eligibility — a research
   * branch's standing stays cell-local and exploratory. Absent ⇒ no `application.delegation` face and
   * no `palimpsest_delegate` tool.
   */
  readonly delegation?: DelegationService | undefined;
}
