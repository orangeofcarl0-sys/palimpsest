/**
 * E5-P §27 — the PROCEDURE INSTALL CONTRACT.
 *
 * These two fields live in their own module for the same reason the delegation, continuation,
 * intent, collaboration and learning contracts do: `install_contract.ts` is at its §25 size
 * ceiling, and the honest response to a size gate is to move a COHESIVE contract out rather than to
 * compress the prose that explains it.
 *
 * They are NOT separately re-exported: a host supplies the options as fields of
 * `InstallPalimpsestOptions` and reads the service off `InstalledPalimpsest` (see that module's
 * `extends` clause), so this module adds no package export of its own.
 */

import type { ProcedureAdmissionPort, ProcedureAuthoringPort, ProcedureService } from "../procedures/index.js";

export interface ProcedureInstallOptions {
  /**
   * E5-P §7 (additive): the UNTRUSTED procedure-authoring seam.
   *
   * This is where a model or host may reason "this experiment suggests inspecting the canonical
   * basis before mutating". It proposes procedural CONTENT and nothing else: it cannot publish,
   * grant standing, associate an asset, change Work or execute the method — none of those
   * capabilities exist in the port's shape, and its output is strict-parsed.
   *
   * Absent ⇒ `prepare` honestly refuses with `PROCEDURE_AUTHORING_UNAVAILABLE` rather than
   * synthesizing a method from durable experience.
   */
  procedureAuthoring?: ProcedureAuthoringPort | undefined;
  /**
   * E5-P §10 (additive): the INDEPENDENT semantic authority for procedure admission.
   *
   * Absent ⇒ the `procedures` surface still composes and `publish` honestly answers
   * `admission_unresolved` with ZERO canonical writes. There is deliberately NO default that
   * publishes, no caller boolean (`published: true`), no `managementMode` shortcut and no
   * self-publication by the authoring model.
   */
  procedureAdmission?: ProcedureAdmissionPort | undefined;
  /**
   * E5-P §26 (additive): the durable procedure store. Absent ⇒ the `procedures` face is simply
   * absent (never a stub), because a procedure that cannot survive a restart cannot be inherited.
   */
  procedureStore?: import("../procedures/index.js").ProcedureStore | undefined;
  /**
   * E5-P §26 (additive): whether THIS install created the procedure store and should close it in
   * `dispose()`. Default `false` — a caller-supplied store belongs to its caller.
   */
  procedureStoreOwned?: boolean | undefined;
}

export interface ProcedureInstallResult {
  /**
   * E5-P §27 (additive): the PROCEDURE face — present iff a procedure store is composed.
   *
   *     prepare  = no canonical write (a candidate is a VALUE)
   *     assess   = no canonical write (a grounding + supersession observation)
   *     publish  = authority-gated EXISTING store append
   *
   * It owns procedural capital and nothing else. It reaches no Work, effect, promotion, commitment,
   * intent or organization-evolution authority, and it never injects itself into an attempt's
   * context: inheritance goes through the existing E1-K Context discipline.
   */
  readonly procedures?: ProcedureService | undefined;
}
