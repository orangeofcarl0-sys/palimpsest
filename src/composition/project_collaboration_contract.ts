/**
 * E3-C §31 — the PROJECT COLLABORATION INSTALL CONTRACT.
 *
 * These two fields live in their own module for the same reason the delegation, continuation and intent
 * contracts do: `install_contract.ts` is at its §25 size ceiling, and the honest response to a size gate is
 * to move a COHESIVE contract out rather than to compress the prose that explains it.
 *
 * They are NOT separately re-exported: a host supplies the options as fields of `InstallPalimpsestOptions`
 * and reads the service off `InstalledPalimpsest` (see that module's `extends` clause), so this module adds
 * no package export of its own.
 */

import type {
  CollaborationNeedAuthoringPort,
  ContactNeedAdmissionPort,
  ProjectCollaborationService,
} from "../project_collaboration/index.js";

export interface ProjectCollaborationInstallOptions {
  /**
   * E3-C §6 (additive): the UNTRUSTED need-authoring seam.
   *
   * This is where a model or host may reason "this failed attempt probably needs optics/calibration
   * expertise". It may propose competence tags and a reason; it may NOT contact a peer, select a peer,
   * create a commitment or grant authority — none of those capabilities exist in the port's shape.
   *
   * Absent ⇒ `prepareNeed` honestly refuses with `NEED_CAPABILITY_UNAVAILABLE` rather than inventing a
   * need from a blocked task.
   */
  projectCollaborationAuthoring?: CollaborationNeedAuthoringPort | undefined;
  /**
   * E3-C §8 (additive): the INDEPENDENT semantic authority for governed contact-need admission.
   *
   * Absent ⇒ the `projectCollaboration` surface still composes and `admitNeed` honestly answers
   * `admission_unresolved` with zero declarations. There is deliberately NO default that admits, and no
   * management mode or caller boolean may stand in for it.
   */
  projectCollaborationAdmission?: ContactNeedAdmissionPort | undefined;
}

export interface ProjectCollaborationInstallResult {
  /**
   * E3-C §31 (additive): the PROJECT-GROUNDED collaboration entry — present iff a Federation service (the
   * declaration owner) is composed.
   *
   *     prepareNeed = no canonical write (a candidate is a value)
   *     assessNeed  = no canonical write (a currentness observation)
   *     admitNeed   = authority-gated EXISTING Federation declaration
   *
   * The existing `installed.federation` continues to own discovery, contact, messaging, commitment and
   * fulfillment. This surface owns only the project-grounded entry into that loop, and it owns no store.
   */
  readonly projectCollaboration?: ProjectCollaborationService | undefined;
}
