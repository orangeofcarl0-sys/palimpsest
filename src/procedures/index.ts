/**
 * E5-P — GOVERNED PROCEDURAL CAPITALIZATION: the PROCEDURE owner's public surface.
 *
 *     Procedure  ≠  Truth        Procedure  ≠  Evidence      Procedure  ≠  Proof
 *     Procedure  ≠  Recipe       Procedure  ≠  host Skill    Procedure  ≠  executable code
 *     Procedure  ≠  Work authority / Effect authority / Commitment authority
 *
 * A procedure tells a worker HOW prior experience suggests proceeding. It authorizes nothing: the
 * current Work envelope and effects policy remain the only authority, and a procedure that
 * recommends a capability cannot assert that the capability exists.
 *
 * ## The gap test (E5-P §2/§3) — NEW_OWNER_JUSTIFIED
 *
 * Before this owner existed, the ruling's §2 audit asked whether an existing concept could carry
 * the whole lifecycle. None could, and the reasons are structural rather than incidental:
 *
 *   `RecipeDefinition`  is versioned PRODUCT CONFIG IN CODE whose only purpose is to be compiled
 *                       and executed. It owns no learned content, no provenance, no admission, no
 *                       project association, and §20 freezes `Procedure ≠ Recipe`.
 *   `ProjectJournal`    stores a free-text `body` with no method structure and no admission.
 *   `OrganizationMemory` is empirical HISTORY (`Observation ≠ Procedure`); §23 freezes that memory
 *                       grounds authoring but never becomes procedure standing.
 *   `ProjectAssetAssociation` carries no content by design — it is a reference record.
 *   `ExternalAsset`     is owned elsewhere: `external ownership ≠ project intellectual capital`.
 *   host Skill / plugin is an installed execution capability, not a project-governed asset.
 *   E1-K Context        is the INHERITANCE BOUNDARY, not a content owner; its kind set is closed.
 *
 * The procedural lifecycle therefore needs durable semantic truth that belongs to none of them:
 * it must survive crash/session, it has its own admission/standing/version lifecycle, and it is
 * not derivable on demand. See `test/e5p_procedural_capitalization.test.ts` for the machine proof.
 *
 * Layer: L2 (`src/procedures/`). Depends on `src/schema/` and, for nothing else, the ports it is
 * handed by composition — never on Work, Proof, Recipe, Context or OrganizationMemory internals.
 */

export {
  PROCEDURE_CONTENT_DOMAIN,
  PROCEDURE_CONTENT_SCHEMA_VERSION,
  ProcedureContentError,
  canonicalProcedureList,
  materializeProcedureContent,
  parseProcedureContent,
  procedureContentDigestOf,
  procedureFail,
} from "./content.js";
export type { ProcedureContent, ProcedureStep } from "./content.js";

export {
  PROCEDURE_CANDIDATE_DOMAIN,
  PROCEDURE_CANDIDATE_ID_DOMAIN,
  PROCEDURE_GROUNDING_REFUSALS,
  PROCEDURE_GROUND_KINDS,
  candidateContentDigest,
  canonicalGrounds,
  materializeProcedureCandidate,
  parseProcedureCandidate,
  parseProcedureGround,
  parseProcedureProvenance,
  procedureCandidateDigestOf,
  procedureCandidateIdOf,
  procedureGroundKey,
} from "./candidate.js";
export type {
  ProcedureCandidate,
  ProcedureGround,
  ProcedureGroundKind,
  ProcedureGroundingRefusal,
  ProcedureProvenance,
} from "./candidate.js";

export {
  PROCEDURE_ADMISSION_DECISIONS,
  assertProcedureAdmissionOutcomeShape,
  assertProcedureAuthoringResult,
  materializeProcedureAdmissionProvenance,
  parseProcedureAdmissionProvenance,
} from "./admission.js";
export type {
  ProcedureAdmissionDecision,
  ProcedureAdmissionInput,
  ProcedureAdmissionOutcome,
  ProcedureAdmissionPort,
  ProcedureAdmissionProvenance,
  ProcedureAssociationPort,
  ProcedureAuthoringInput,
  ProcedureAuthoringPort,
  ProcedureAuthoringResult,
  ProcedureGroundObservation,
  ProcedureGroundPort,
  ProcedurePorts,
} from "./admission.js";

export {
  PROCEDURE_HANDLE_PREFIX,
  PROCEDURE_STANDINGS,
  currentProcedureRevision,
  deriveProcedureStandings,
  materializeProcedureRevision,
  parseProcedureRef,
  parseProcedureRevision,
  procedureHandle,
  procedureRefKey,
  procedureRefOf,
  procedureRevisionDigestOf,
  sameProcedureRef,
} from "./revision.js";
export type { ProcedureRef, ProcedureRevision, ProcedureStanding, ProcedureStandingView } from "./revision.js";

export {
  PROCEDURE_REVISION_PUBLISHED,
  PROCEDURE_RETIRED,
  ProcedureStoreError,
  SqliteProcedureStore,
  defaultProcedureStorePath,
  procedureEventIdOf,
  procedureRetiredEvent,
  procedureRevisionPublishedEvent,
  publishedRevisionsOf,
  retirementsOf,
} from "./store.js";
export type { ProcedureBasis, ProcedureEvent, ProcedureEventDraft, ProcedureEventType, ProcedureStore } from "./store.js";

export { PROCEDURE_REFUSAL_REASONS, ProcedureRefusal, makeProcedureService } from "./service.js";
export type {
  PrepareProcedureInput,
  PreparedProcedure,
  ProcedureAssessment,
  ProcedureGroundRequest,
  ProcedureHistoryEntry,
  ProcedureRefusalReason,
  ProcedureService,
  ProcedureServiceDeps,
  ProcedureView,
  PublishProcedureInput,
  PublishProcedureOutcome,
} from "./service.js";
