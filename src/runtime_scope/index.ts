/**
 * G10-H RuntimeScope & Holon — recursive runtime organization, advanced surface only.
 *
 *   RuntimeScope ≠ Organization ≠ Work scope ≠ PeerRef ≠ PersistentPoint
 *   RuntimeScope ≠ Activation ≠ SessionRef ≠ Campaign ≠ Coalition
 *   Holon ≠ Organization ≠ VisualGroup ≠ "manager + workers" ≠ PeerRef
 */

export {
  RuntimeScopeArtifactError,
  materializeRuntimeScopeRef,
  parseRuntimeScopeRef,
  requireNonEmpty,
  requireStableId,
  runtimeScopeRefKey,
  runtimeScopeRefsEqual,
} from "./ref.js";
export type { RuntimeScopeId, RuntimeScopeRef } from "./ref.js";

export {
  RUNTIME_SCOPE_CHAIN_DOMAIN,
  RUNTIME_SCOPE_EVENT_PARSERS,
  RUNTIME_SCOPE_HOLON_DOMAIN,
  asObject,
  exactKeys,
  holonProjectionDigest,
  materializeRuntimeScopeDefinition,
  parseOrganizationBasisRef,
  parseRuntimeScopeBasis,
  parseRuntimeScopeBoundary,
  parseRuntimeScopeBoundarySource,
  parseRuntimeScopeDefinition,
  parseRuntimeScopeMember,
  runtimeScopeChainDigest,
  runtimeScopeMemberKey,
  runtimeScopeMembersEqual,
} from "./artifacts.js";
export type {
  OrganizationBasisRef,
  RuntimeScopeBasis,
  RuntimeScopeBoundary,
  RuntimeScopeBoundarySource,
  RuntimeScopeDefinition,
  RuntimeScopeEventPayloadParser,
  RuntimeScopeEventParsers,
  RuntimeScopeEventType,
  RuntimeScopeLifecycle,
  RuntimeScopeMember,
} from "./artifacts.js";

export { RuntimeScopeStoreError, SqliteRuntimeScopeStore, defaultRuntimeScopePath } from "./store.js";
export type {
  RuntimeScopeAppendRequest,
  RuntimeScopeCreateRequest,
  RuntimeScopeEvent,
  RuntimeScopeStore,
  RuntimeScopeStoreErrorKind,
  RuntimeScopeStructuralScopeRequest,
  RuntimeScopeStructuralTransition,
  RuntimeScopeStructuralTransitionResult,
} from "./store.js";

export { makeRuntimeScopeService, sameRuntimeScope } from "./service.js";
export type {
  HolonView,
  OrganizationBasisFreshness,
  RuntimeScopeCampaignPort,
  RuntimeScopeOrganizationPort,
  RuntimeScopeRepresentationAdmissionPort,
  RuntimeScopeRepresentationMutation,
  RuntimeScopeService,
  RuntimeScopeServiceDeps,
  RuntimeScopeState,
} from "./service.js";
