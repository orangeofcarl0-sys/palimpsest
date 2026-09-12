/**
 * PLMP-BIND-1 frozen core types — code equivalents of
 * docs/engineering/BINDING-SEMANTIC-CONTRACT-v1.md §3.
 *
 * G10-B3 implementation-validation spike: this module implements frozen core
 * semantics only. It adds no deferred fields (provider/model/tool/workspace
 * selections, run-configuration binding delta), no runtime Agent/Session
 * identity, no authority/organization/collaboration/commitment semantics, and
 * no storage.
 */

export type BindingDefinitionId = string;
/** Scoped to one `BindingDefinitionId` lineage; monotonic within it; no global ordering. */
export type BindingRevision = number;
/** Canonical content identity; excludes id, revision, timestamps, snapshot. */
export type BindingDigest = string;

export interface BindingDefinitionRef {
  readonly bindingDefinitionId: BindingDefinitionId;
  readonly revision: BindingRevision;
  readonly digest: BindingDigest;
}

/** CANDIDATE future identity (AgentDefinition-shaped); never a reuse of Work `definition_id`. */
export type ArchitectureSubjectRef = string;
/** CANDIDATE future identity (PersistentPoint identity); concrete scheme intentionally open. */
export type DurableContinuityRef = string;

/** Logical identifiers, not provider implementation ids; no registry implied. */
export type RuntimeFeatureRef = string;
export type ToolCapabilityRef = string;

/**
 * Normalized continuity intent — presence-only, at most one field present
 * (a `pin` itself implies the persistent requirement). Absence of the whole
 * intent = Case E: ephemeral realization is valid and satisfied.
 */
export interface ContinuityBindingIntent {
  readonly pin?: DurableContinuityRef;
  readonly requirePersistent?: true;
  readonly preferPersistent?: true;
}

/** Association-specific hard requirements (frozen core minimum; semantic sets). */
export interface BindingHardRequirements {
  readonly runtimeFeatures?: readonly RuntimeFeatureRef[];
  readonly toolCapabilities?: readonly ToolCapabilityRef[];
}

export interface SubjectBinding {
  /** A present `continuity: {}` is meaningful: explicit Case E (PF-01). */
  readonly continuity?: ContinuityBindingIntent;
  readonly hard?: BindingHardRequirements;
}

export interface BindingDefinition {
  readonly schemaVersion: 1;
  readonly bindingDefinitionId: BindingDefinitionId;
  readonly revision: BindingRevision;
  readonly digest: BindingDigest;
  /** MapKey = SubjectIdentity; explicit definitions contain ≥1 subject entry (PF-02 totality is validated against participating subjects). */
  readonly bindings: Readonly<Record<ArchitectureSubjectRef, SubjectBinding>>;
}

/** CANDIDATE future identity placeholder: a lineage-scoped revision always travels with its lineage identity. */
export interface DefinitionRevisionRef {
  readonly definitionId: string;
  readonly revision: number;
  readonly digest: string;
}

/** Opaque identity of the exact continuity/runtime observation basis used for resolution. */
export interface SnapshotRef {
  readonly ref: string;
}

export interface ResolverPolicyRef {
  readonly id: string;
  readonly version: string;
}

export type BindingIntentSource =
  | { readonly kind: "explicit"; readonly binding: BindingDefinitionRef }
  | { readonly kind: "implicit_ephemeral_default"; readonly semanticVersion: 1 };

export interface ResolutionProvenance {
  readonly architecture: DefinitionRevisionRef;
  readonly work: DefinitionRevisionRef;
  readonly intentSource: BindingIntentSource;
  readonly runConfigurationDigest: string;
  readonly snapshot: SnapshotRef;
  readonly resolverPolicy?: ResolverPolicyRef;
}

export type ContinuitySelection =
  | { readonly kind: "ephemeral" }
  | { readonly kind: "persistent"; readonly point: DurableContinuityRef };

export type BindingUnsatisfiedReason =
  | "pinned_target_unavailable"
  | "pinned_target_incompatible"
  | "no_matching_persistent_point"
  | "required_capability_unavailable";

export interface SatisfiedBindingResolution {
  readonly status: "satisfied";
  readonly schemaVersion: 1;
  readonly resolutionId: string;
  readonly digest: BindingDigest;
  readonly provenance: ResolutionProvenance;
  readonly continuity: Readonly<Record<ArchitectureSubjectRef, ContinuitySelection>>;
}

export interface UnsatisfiedBindingResolution {
  readonly status: "unsatisfied";
  readonly schemaVersion: 1;
  readonly provenance: ResolutionProvenance;
  readonly reasons: readonly BindingUnsatisfiedReason[];
}

export type BindingResolutionResult = SatisfiedBindingResolution | UnsatisfiedBindingResolution;

export interface BindingResolutionRef {
  readonly resolutionId: string;
  readonly digest: string;
}

export interface ExecutionPlanBindingRef {
  readonly bindingResolution: BindingResolutionRef;
}
