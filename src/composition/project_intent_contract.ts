/**
 * E2-I §24/§30 — the PROJECT INTENT INSTALL CONTRACT.
 *
 * These two fields live in their own module for the same reason the delegation and continuation
 * contracts do: `install_contract.ts` is at its §25 size ceiling, and the honest response to a size gate
 * is to move a COHESIVE contract out rather than to compress the prose that explains it.
 *
 * They are NOT separately re-exported: a host supplies the option as a field of
 * `InstallPalimpsestOptions` and reads the service off `InstalledPalimpsest` (see this module's `extends`
 * clause there), so this module adds no package export of its own.
 */

import type { ProjectIntentAdmissionPort, ProjectIntentService } from "../project_intent/index.js";

export interface ProjectIntentInstallOptions {
  /**
   * E2-I §17 (additive): the INDEPENDENT semantic authority for governed project-intent reconciliation.
   *
   * Absent ⇒ the `intent` surface still composes and `apply` honestly answers `authority_unresolved`
   * with zero writes. There is deliberately NO default that admits: a deployment that composes no
   * authority must not acquire one implicitly, and no management mode or caller boolean may stand in
   * for it.
   */
  projectIntentAdmission?: ProjectIntentAdmissionPort | undefined;
}

export interface ProjectIntentInstallResult {
  /**
   * E2-I §24 (additive): the GOVERNED PROJECT INTENT surface — present iff a workspace (the knowledge
   * owner the grounds are read from) is composed.
   *
   *     prepare = no canonical write
   *     assess  = no canonical write
   *     apply   = authority-gated EXISTING ProjectIR revision
   *
   * The low-level mutation primitives are deliberately NOT exposed.
   */
  readonly intent?: ProjectIntentService | undefined;
}
