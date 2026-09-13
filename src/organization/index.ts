/**
 * G10-F2 organization package — OrganizationDefinition as its own immutable
 * semantic artifact plus the canonical lineage store. No WorkGraph,
 * CoalitionSnapshot, PeerRef, RuntimeScope, Holon, or Institution equivalence.
 */

export {
  ORGANIZATION_DIGEST_DOMAIN,
  OrganizationDefinitionError,
  computeOrganizationDefinitionDigest,
  materializeOrganizationDefinition,
  organizationDefinitionDigestContent,
  organizationMemberKey,
  organizationRefOf,
  organizationRefsEqual,
  parseOrganizationDefinition,
  parseOrganizationRef,
} from "./definition.js";
export type {
  OrganizationAgentMember,
  OrganizationDefinition,
  OrganizationDefinitionId,
  OrganizationDefinitionRef,
  OrganizationDigest,
  OrganizationInteraction,
  OrganizationMemberRef,
  OrganizationNorm,
  OrganizationNormKind,
  OrganizationPeerMember,
  OrganizationRevision,
  RoleAssignment,
  RoleDefinition,
  RoleId,
} from "./definition.js";

export {
  OrganizationStoreError,
  SqliteOrganizationStore,
  defaultOrganizationPath,
} from "./store.js";
export type {
  OrganizationLineageRecord,
  OrganizationRevisionRegistration,
  OrganizationStore,
  OrganizationStoreErrorKind,
} from "./store.js";

export { materializeOrganizationFromCoalition } from "./from_coalition.js";
export type { OrganizationFromCoalitionInput, OrganizationFromCoalitionResult } from "./from_coalition.js";

export { declaredCapabilityIndex, roleEligibilityView } from "./eligibility.js";
export type { RoleEligibilityBasis, RoleEligibilityEntry } from "./eligibility.js";
