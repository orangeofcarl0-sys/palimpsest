/**
 * G10-F5 AGT × PAG integration — governed organization evolution (§143–§147).
 *
 * The bottom-up path is explicit at every arrow:

 *   collaboration → CoalitionSnapshot → (explicit authoring) OrganizationDefinition
 *                → (explicit governance) Institution genesis / transition
 *
 * A transformation assessment is the gate: governance approval does NOT satisfy
 * structural/evidence proof obligations (§144). Organization transformation
 * under an institution therefore runs
 *
 *   proposal → assessment (all hard obligations satisfied)
 *            → atomic organization activation
 *            → InstitutionTransitionProposal
 *            → current-charter approvals
 *            → new InstitutionEpoch
 *
 * with NO direct canonical institution-head mutation. A split is NOT an
 * automatic institution fork, and a merge is NOT an automatic institution
 * merge (§146/§147): the institution adopts a body through an explicit
 * authorized epoch transition.
 */

import type { OrganizationDefinition, OrganizationDefinitionRef } from "../organization/definition.js";
import type { OrganizationStore } from "../organization/store.js";
import type { OrganizationTransformationAssessment } from "../organization/transformation.js";
import { activateOrganizationTransformation } from "../organization/transformation.js";
import type { InstitutionCharter, InstitutionEpoch, InstitutionEpochRef, InstitutionTransitionProposal } from "./artifacts.js";
import type { InstitutionService } from "./service.js";
import type { InstitutionStore } from "./store.js";
import { InstitutionStoreError } from "./store.js";

export interface GovernedAdoptionResult {
  /** The organization revisions activated by this change (all-or-none). */
  readonly activatedOrganizations: readonly OrganizationDefinitionRef[];
  /** The institution transition proposal adopting one of them. */
  readonly transition: InstitutionTransitionProposal;
}

/**
 * Activate an admissible organization transformation, then propose the
 * institution transition adopting one of its candidates. Approvals and
 * advancement remain separate explicit calls (`service.approve`/`advance`).
 */
export async function activateAndGovernOrganizationChange(input: {
  readonly organizationStore: OrganizationStore;
  readonly institutionService: InstitutionService;
  readonly institutionId: string;
  readonly assessment: OrganizationTransformationAssessment;
  /** Which candidate becomes the institution's current body (default first). */
  readonly adopt?: number;
  readonly reason: string;
}): Promise<GovernedAdoptionResult> {
  if (input.assessment.status !== "admissible") {
    // §144: an unresolved obligation is never admitted by governance approval.
    throw new InstitutionStoreError(
      "invalid_registration",
      "governance approval cannot satisfy unresolved organization proof obligations",
    );
  }
  const activatedOrganizations = await activateOrganizationTransformation(input.organizationStore, input.assessment);
  const adopted = activatedOrganizations[input.adopt ?? 0];
  if (adopted === undefined) {
    throw new InstitutionStoreError("invalid_registration", "adopt index is out of range for the transformation candidates");
  }
  const transition = await input.institutionService.proposeTransition({
    institutionId: input.institutionId,
    proposedOrganization: adopted,
    reason: input.reason,
  });
  return Object.freeze({ activatedOrganizations, transition });
}

/** A DERIVED view of an institution's current body — never a second truth (§159). */
export interface InstitutionBodyView {
  readonly institutionId: string;
  readonly head: InstitutionEpochRef;
  readonly epoch: InstitutionEpoch;
  readonly charter: InstitutionCharter;
  readonly organization: OrganizationDefinition;
}

export async function institutionBodyView(
  institutionStore: InstitutionStore,
  organizationStore: OrganizationStore,
  institutionId: string,
): Promise<InstitutionBodyView> {
  const head = await institutionStore.head(institutionId);
  if (head === undefined) {
    throw new InstitutionStoreError("unknown_institution", `institution "${institutionId}" does not exist`);
  }
  const epoch = await institutionStore.currentEpoch(institutionId);
  if (epoch === undefined) {
    throw new InstitutionStoreError("unknown_institution", `institution "${institutionId}" has no current epoch`);
  }
  const charter = await institutionStore.currentCharter(institutionId);
  if (charter === undefined) {
    throw new InstitutionStoreError("unknown_institution", `institution "${institutionId}" has no current charter`);
  }
  const organization = await organizationStore.get(epoch.organization);
  if (organization === undefined) {
    throw new InstitutionStoreError("unknown_institution", "institution current organization body is missing");
  }
  return Object.freeze({ institutionId, head, epoch, charter, organization });
}
