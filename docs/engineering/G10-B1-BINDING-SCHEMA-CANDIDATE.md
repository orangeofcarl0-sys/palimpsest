# G10-B1 — Binding Schema & Interface Candidate

Status: **G10-B1 · BINDING SCHEMA / INTERFACE CANDIDATE · DRAFT · NOT IMPLEMENTED · NOT FROZEN · NO PRODUCTION STORAGE COMMITMENT**

Branch `experiment/g10-b1-binding-schema-candidate`, stacked on the closed B0
branch (`experiment/g10-b0-binding-semantics-design` @ `7435e48`, PR #12 still
open). This document converts the B0 semantic model (including its Stage-0
closures §5A) into the **smallest reviewable candidate contract**. The
TypeScript below is a **NON-PRODUCTION SCHEMA CANDIDATE**: it is not in `src/`,
not compiled, not an API, and commits to no storage. Normative input:
`UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE-v1.md` (PLMP-UAS-1, canonical). Semantic
basis: `G10-B0-BINDING-SEMANTICS-DESIGN.md` §5A/§13.

The three errors this contract is shaped to prevent (hard review criteria):

1. `PersistentPoint` becoming a **mandatory runtime indirection** — prevented by
   making the ephemeral path the schema default and any continuity requirement
   optional and explicit (§3, §6).
2. `BindingDefinition` and `RunConfiguration` becoming **overlapping config
   bags** — prevented by an explicit ownership split and the narrowing-only
   precedence rule (§5, §6).
3. `BindingResolution` acquiring **two independent truth representations** —
   prevented by the single-authoritative-value rule with reference/digest-bound
   projections only (§7).

---

## 1. Frozen constraints carried in

PLMP-UAS-1 invariants (`UAS1-INV-01..30`) are normative, in particular
`AgentDefinition ≠ PersistentPoint ≠ RuntimeAgent ≠ Session`, `Activation ≠
Attempt`, `PeerRef ≠ runtime carrier/session identity`, authority/org/collab/
commitment non-collapse, and the compatibility contracts (`definition_id` =
Work/Task lineage; `AgentGraph v1` = WorkGraph; `GraphPatch` = Work patch;
`CanvasDoc v3` = Work authoring surface; scheduler purity). Nothing here reopens
them; a schema that could not be expressed without violating PLMP-UAS-1 would
have produced a contradiction report instead of this document.

## 2. Candidate identity namespaces (all new; never reused)

| Identity | Kind | Notes |
|---|---|---|
| `BindingDefinitionId` | NEW namespace | semantic instance identity; never `definition_id`, `task_id`, `AgentDefinitionId`, `PersistentPointId`, or `PeerRef` |
| `BindingRevision` | instance evolution | per definition; changes when durable intent changes |
| `BindingDigest` | content identity | canonical, algorithm open (§8) |
| `BindingResolutionId` | derived-artifact identity | exists only under ownership Option A (§7) |
| `ArchitectureSubjectRef` | **CANDIDATE / future identity** | the logical architecture subject a binding clause targets; `AgentDefinitionId` does not exist in production yet — this ref is a placeholder for it, never a reuse of `definition_id` |
| `DurableContinuityRef` | **CANDIDATE / future identity** | PersistentPoint identity; concrete scheme intentionally open; no production type in this stage |

`schemaVersion` (shape evolution) is separate from `BindingRevision` (semantic
instance evolution); the two are never conflated.

## 3. Continuity representation — Strategy B chosen

Two strategies were compared (B0 §5A / §27):

- **Strategy A — continuity policy enum**
  (`ephemeral_allowed | persistent_preferred | persistent_required |
  persistent_pinned`). Rejected as the primary shape: it forces one axis, grows
  combinatorially as other axes appear, and separates a *pin* (an identity
  constraint) from the same field that expresses a mere preference.
- **Strategy B — constraints + optional pin** (chosen). Continuity intent is
  three optional, individually typed declarations; **absence of all three is
  Case E** (ephemeral-valid) with no null hacks and no placeholder points. The
  pin stays qualitatively distinct (identity constraint, hard) from
  `requirePersistent` (hard, any suitable locus) and `preferPersistent` (soft).

## 4. Logical subject model — map, not clause list

A `BindingDefinition` is the association intent for **one run's architecture**,
covering one or more logical subjects via a **map keyed by
`ArchitectureSubjectRef`** rather than a `BindingClause` list. Adjudication: a
map needs no clause IDs, has deterministic canonical ordering (key-sorted), and
conflicts are per-subject validation failures; a clause list would need synthetic
identities and ordering rules for no added expressiveness. A single-subject run
is a one-entry map; the frozen `RunDefinition` composition (`… +
BindingDefinition + …`) stays singular.

## 5. Ownership split: BindingDefinition vs RunConfiguration

| Semantic fact | Owner |
|---|---|
| agent competence intent | `AgentDefinition` |
| work-specific required capability / resource budget | `WorkDefinition` |
| durable continuity pin; association-specific hard constraint; stable association preference | `BindingDefinition` |
| run-scoped selection / run-scoped preference / temporary operating policy / run-scoped provider-model choice | `RunConfiguration` |
| concrete resolved provider/model/point/tool/workspace selection | `BindingResolution` |
| current Agent/Session | DSH runtime attachment (DSH-owned) |
| authority grant | NOT Binding (intentionally open model) |
| commitment | NOT Binding |

This avoids the duplicate-requirements-store failure: Architecture/Work
requirements are **resolver inputs**; BindingDefinition adds only
association-specific constraints, pins, and preferences (B0 §59–§60 adjudication).

**Hard precedence rule (Closure C):**

$$
Allowed(EffectiveBindingRequest) \subseteq Allowed(BindingDefinition),\quad
EffectiveBindingRequest = Specialize(BindingDefinition, RunConfiguration)
$$

```text
1. BindingDefinition hard constraints / durable pins      — non-overridable
2. RunConfiguration explicit run-scoped selections
3. RunConfiguration run-scoped preferences
4. BindingDefinition stable preferences
5. resolver tie-breaking                                   — levels 2–5 only within
                                                             the hard-admissible space
```

A run request outside the admissible set fails **configuration validation before
resolution** (fail-fast compile discipline); `run_selection_conflict` as an
unsatisfied reason is reserved for availability-dependent conflicts discovered
during resolution.

## 6. Candidate type surface (NON-PRODUCTION SCHEMA CANDIDATE)

```ts
/* ── G10-B1 NON-PRODUCTION SCHEMA CANDIDATE — not in src/, not built, not API ── */

/* identities: all NEW namespaces; never definition_id / task_id /
   AgentDefinitionId / PersistentPointId / PeerRef */
declare const bindingDefinitionId: unique symbol;
type BindingDefinitionId = string & { readonly [bindingDefinitionId]: true };
type BindingRevision = number;            // semantic instance evolution
type BindingDigest = string;              // canonical content identity (algorithm open)

interface BindingDefinitionRef {
  readonly bindingDefinitionId: BindingDefinitionId;
  readonly revision: BindingRevision;
  readonly digest: BindingDigest;
}

/* CANDIDATE / future identities — placeholders for identities that do not
   exist in production yet; never reuses Work definition_id */
declare const architectureSubject: unique symbol;
type ArchitectureSubjectRef = string & { readonly [architectureSubject]: true };
declare const durableContinuity: unique symbol;
type DurableContinuityRef = string & { readonly [durableContinuity]: true };

/* provider-neutral logical refs */
type RuntimeFeatureRef = string;          // logical kind, e.g. "web_search"
type ToolCapabilityRef = string;          // logical tool capability kind
type ModelCapabilityClass = string;

interface WorkspaceLocalityRequirement {  // logical requirement; NO host paths
  readonly kind: "repository_scoped" | "isolated_worktree";
}

/* HARD association requirements (minimal set: continuity, runtime feature,
   tool capability, workspace locality — nothing richer) */
interface BindingRequirements {
  readonly runtimeFeatures?: readonly RuntimeFeatureRef[];
  readonly toolCapabilities?: readonly ToolCapabilityRef[];
  readonly workspace?: WorkspaceLocalityRequirement;
}

/* SOFT stable preferences (ranking hints, never requirements) */
interface BindingPreferences {
  readonly modelCapabilityClass?: ModelCapabilityClass;
  readonly contextBudget?: number;        // provider-neutral magnitude
}

/* Continuity intent — Strategy B: constraints + optional pin; NO enum.
   Absence of all fields = Case E: ephemeral realization is valid & satisfied. */
interface ContinuityBindingIntent {
  readonly pin?: DurableContinuityRef;    // HARD identity constraint (Case P)
  readonly requirePersistent?: boolean;   // HARD: some durable locus required (Case R)
  readonly preferPersistent?: boolean;    // SOFT (persistent preferred; Case pref)
}
// validation: pin ⇒ requirePersistent (a pin is itself a hard continuity requirement)

interface SubjectBinding {
  readonly subject: ArchitectureSubjectRef;
  readonly continuity: ContinuityBindingIntent;
  readonly hard: BindingRequirements;
  readonly preferences: BindingPreferences;
}

interface BindingDefinition {
  readonly schemaVersion: 1;              // shape evolution ≠ BindingRevision
  readonly bindingDefinitionId: BindingDefinitionId;
  readonly revision: BindingRevision;
  readonly digest: BindingDigest;         // over subjects+continuity+hard+preferences, key-canonical
  readonly bindings: Readonly<Record<ArchitectureSubjectRef, SubjectBinding>>;
}

/* ── resolution (derived) ── */

interface ProviderModelSelection { readonly provider: string; readonly model: string; }

type ContinuitySelection =
  | { readonly kind: "ephemeral" }                                    // first-class satisfied outcome
  | { readonly kind: "persistent"; readonly point: DurableContinuityRef };

interface SubjectResolution {
  readonly continuity: ContinuitySelection;
  readonly providerModel?: ProviderModelSelection;                    // concrete, actually derived
  readonly toolImplementations?: readonly {
    readonly capability: ToolCapabilityRef;
    readonly implementation: string;
  }[];
  readonly workspace?: {
    readonly locality: WorkspaceLocalityRequirement;
    readonly logicalResource?: string;                                // logical/current resource; effect-created
  };                                                                  // worktree paths stay realization-side
  // deliberately ABSENT: dshAgentId, dshSessionId, toolCallId, processId,
  // currentAttemptId — runtime attachment is DSH-owned state (PLMP-UAS-1)
}

interface ResolutionProvenance {          // freshness inputs (names candidate)
  readonly architecture: { readonly revision: number; readonly digest: string };
  readonly work: { readonly revision: number; readonly digest: string };
  readonly binding: BindingDefinitionRef;
  readonly runConfiguration: { readonly digest: string };             // deterministic representation
  readonly snapshot: { readonly ref: string };                        // continuity/runtime observation basis
  readonly resolverPolicy?: { readonly id: string; readonly version: string };
}

interface BindingResolution {
  readonly schemaVersion: 1;
  readonly resolutionId: string;
  readonly digest: string;                // over selections + provenance refs + snapshot identity
  readonly provenance: ResolutionProvenance;
  readonly selections: Readonly<Record<ArchitectureSubjectRef, SubjectResolution>>;
}

type BindingUnsatisfiedReason =
  | "hard_constraint_unsatisfied"
  | "pinned_target_unavailable"
  | "pinned_target_incompatible"
  | "no_matching_persistent_point"
  | "runtime_feature_unavailable"
  | "run_selection_conflict"
  | "stale_inputs";

interface UnsatisfiedBindingResolution {
  readonly schemaVersion: 1;
  readonly provenance: ResolutionProvenance;   // same inputs; no selections
  readonly reasons: readonly BindingUnsatisfiedReason[];
}

type BindingResolutionResult = BindingResolution | UnsatisfiedBindingResolution;

interface BindingResolutionRef { readonly resolutionId: string; readonly digest: string; }

/* ── RunConfiguration binding delta (extension contract only) ── */
interface RunConfigurationBindingDelta {
  readonly providerModel?: ProviderModelSelection;   // run-scoped concrete choice (precedence level 2)
  readonly preferences?: BindingPreferences;         // run-scoped preference override (level 3)
}
// NOT expressible here: durable point retarget; hard-constraint violation; authority.

/* ── ExecutionPlan delta (ownership Option A) ── */
interface ExecutionPlanBindingRef {
  readonly bindingResolution: BindingResolutionRef;  // exactly one authoritative resolution, by id+digest
}
```

Field-minimality review (§96): every field above answers "what ambiguity returns
if removed" — remove `pin` and Case P becomes inexpressible; remove
`requirePersistent` and Case R collapses into preference; remove
`preferPersistent` and preference≠requirement is untestable; remove `hard` /
`preferences` separation and config bags return; remove provenance and staleness
is undetectable; remove `schemaVersion` and shape evolution conflates with
instance revision. Removed during review: display labels, descriptions, generic
metadata, policy-ID registries, selection-hint frameworks, negative-constraint
language (deferred — no current semantics needs `must_not_use`), cost/latency
preferences (deferred).

## 7. Resolution ownership — Option A selected (§44–§48 mandatory decision)

**Selected: Option A.** `BindingResolution` is a **standalone immutable derived
artifact**; `ExecutionPlan` references it by `resolutionId` + `digest`
(`ExecutionPlanBindingRef`). The phrase "referenced by (or embedded in)" is
retired everywhere.

Rationale (tested, not assumed): resolution (i) can fail
(`UnsatisfiedBindingResolution`) **before** a plan exists — under Option B a
failed resolution would force either a plan-shaped failure object or a second
representation; (ii) goes stale **independently** of the plan's definition
provenance, because its snapshot input moves on its own cadence; (iii) is
**replaced wholesale by rebinding** without touching plan provenance; (iv) has
its own provenance/freshness inputs. Option B's benefit (smaller artifact model)
does not justify coupling those four concerns. Under Option A, any cached or
projected resolution copy is digest-bound and never a second truth
(`OneAuthoritativeDerivedBindingResolution`, B0 Closure D).

## 8. Digest and determinism contracts

- **BindingDefinition digest** covers: subjects, per-subject continuity intent,
  hard requirements, preferences — canonical (key-sorted) form. Excludes:
  timestamps, runtime availability, Session/Agent IDs, incidental ordering.
- **BindingResolution digest** covers: resolved selections, input
  revision/digest refs, snapshot/freshness identity. Excludes volatile
  telemetry. No hash algorithm is required by this stage.
- **Determinism (candidate property):** `SameSemanticInputs +
  SameResolutionSnapshot + SameResolverPolicy → DeterministicResolution`.
  Same binding intent alone does **not** imply the same concrete carrier —
  provider/runtime availability is part of the resolution context (B0 §68).
  Resolver "policy" enters only as a provenance id/version; no policy framework.

## 9. Parser, versioning, and legacy-default contracts

- **Candidate parser requirements** (future implementation, Palimpsest house
  style): reject unknown fields; fail closed; typed discriminants
  (`ContinuitySelection.kind`, `BindingResolutionResult` union); explicit
  `schemaVersion`; deterministic canonicalization.
- **Legacy compatibility (Closure D / B0 §87–§90):** `NoBindingSpecified →
  LegacyEphemeralBindingBehavior` — existing projects keep ephemeral-valid
  behavior with no PersistentPoint requirement. This is a **semantic default**:
  `BindingDefinition` is optional in the `RunDefinition` composition and the
  compiler/resolver supplies ephemeral-default semantics. A persisted synthetic
  BindingDefinition with fake identity is **rejected** (hidden canonical truth).
  Durable continuity is strictly opt-in.

## 10. Firewalls preserved at schema level

| Firewall | Mechanism in the candidate |
|---|---|
| Authority | no `authority`/`permissions`/`rolePower`/`ownership` fields anywhere; binding-to-a-point grants nothing (`BIND-CAND-05`) |
| Organization | no `manager`/`parentAgent`/`orgId`/`teamId`/`reportsTo` fields |
| Collaboration | no `peerRef`/`thread`/`collaborationEdge` fields; `PeerRef` relation untouched |
| Commitment | no assignment/promise/contract fields |
| Invocation/Participation | no `attemptOwner`/`activationOwner`/`invocationId`/`participationMode` fields; `Activation ≠ Attempt` untouched |
| Runtime attachment | resolution excludes `dshAgentId`/`dshSessionId`/`toolCallId`/`processId`/`currentAttemptId` |
| Effect allocation | `Resolve(…)` is pure/derived; creation/resume/worktree allocation are effectful realization outside resolution and outside `Scheduler.decide()` |
| PersistentPoint creation | no `createIfMissing` (or equivalent) anywhere; required-and-missing → `no_matching_persistent_point` |

## 11. Machine review (paper proofs, §95)

| Required proof | How the contract proves it |
|---|---|
| ephemeral binding validates | `continuity: {}` (all fields absent) + empty-satisfaction `SubjectResolution.continuity = {kind:"ephemeral"}` — first-class, no placeholder |
| persistent pin validates | `continuity.pin = P` (+ implied `requirePersistent`), resolution `{kind:"persistent", point:P}` |
| persistent-required unsatisfied representable | `requirePersistent` + `UnsatisfiedBindingResolution.reasons = ["no_matching_persistent_point"]` |
| preference fallback representable | `preferPersistent` alone with no available point → satisfied `{kind:"ephemeral"}` (preference ≠ requirement) |
| `SessionId` cannot appear in durable definition | no such field on `BindingDefinition`/`SubjectBinding`; identities are branded new namespaces |
| RunConfiguration cannot override a hard pin | `RunConfigurationBindingDelta` has no point field; precedence rule level 1 non-overridable; out-of-set request fails pre-resolution validation |
| authority cannot be represented as binding | no authority fields; ownership matrix assigns authority elsewhere |
| `PeerRef` is not required | no `peerRef` field; subject/continuity refs are the only identities |
| one authoritative resolution | Option A: plan holds `bindingResolutionRef` (id+digest); copies are digest-bound projections |
| stale resolution detectable | `ResolutionProvenance` refs + `snapshot.ref`; input/snapshot change ⇒ digest mismatch ⇒ `stale_inputs` |

## 12. Verdict

All ten machine-review proofs hold against the candidate as written; the three
targeted failure modes are structurally difficult (ephemeral is the default;
hard constraints are a separate typed collection that RunConfiguration cannot
reach; resolution truth is single and digest-bound). Candidate invariants
reviewed: B0 `BIND-CAND-01..17` all carried into the contract matrix
(`G10-B1-BINDING-CONTRACT-MATRIX.md`) unchanged in meaning; no new ontology
entities were needed and none of the forbidden entities
(`BindingGraph/Broker/Lease/Session/Instance/Slot/Manager`, registries) was
introduced.

```text
SCHEMA CANDIDATE: READY FOR FORMAL REVIEW
```

Recommended next stage (not started): **A — G10-B2 Binding schema formal
review/freeze**, using the same review discipline as PLMP-UAS-1; a minimal
compiler/resolver spike (option B) should follow only after that review.
