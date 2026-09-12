# Binding Semantic Contract v1

Status: **PLMP-BIND-1 · FROZEN**

A subordinate semantic contract under `UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE-v1.md`
(PLMP-UAS-1, FROZEN, CANONICAL). It is **not** PLMP-UAS-2 and does not amend
PLMP-UAS-1; where PLMP-UAS-1 and this contract touch the same concept, PLMP-UAS-1
prevails. PLMP-UAS-0/AGT-0/PAG-0 remain immutable historical records. This
document is readable standalone.

Freeze scope: **semantic boundaries of the Binding seam only**. This contract
freezes no storage backend, resolver algorithm, PersistentPoint implementation,
provider matching, tool registry, workspace allocator, DSH API, or Ordarium API,
and adds no production code, schema, or migration. The pseudo-schema below is
the single authoritative frozen shape (documentation-only; not in `src/`, not
built, not an API). Provenance for every frozen statement:
`G10-B2-BINDING-CANDIDATE-REDLINE.md` and `G10-B2-BINDING-SCHEMA-FORMAL-REVIEW.md`.

Publication status: the freeze decision was issued by G10-B2
(`BINDING SCHEMA REVIEW: PASS`); canonical repository adoption occurs when the
approved PR stack merges into `main`.

---

## 1. Scope and model

Binding connects declarative Architecture/Work intent to durable continuity
loci and concrete runtime resources **without collapsing** definition,
continuity, runtime, authority, organization, collaboration, or commitment.
The pipeline:

```text
Architecture / Work hard requirements
        +
Binding intent source
   ├─ explicit BindingDefinition
   └─ implicit legacy ephemeral default
        +
RunConfiguration narrowing
        ↓
validated effective admissible set
        ↓
pure Binding resolution      → satisfied | unsatisfied
        ↓
one immutable authoritative BindingResolution (referenced by ExecutionPlan state)
        ↓
effectful runtime realization (outside resolution and outside Scheduler.decide())
        ↓
RuntimeAgent / Session (DSH-owned attachment state)
```

Two orthogonal axes are frozen:

```text
Satisfied ≠ Unsatisfied        (satisfiability against the resolution snapshot)
Current ≠ Stale                (freshness of the derived resolution)
```

`RunDefinition = ArchitectureDefinition + WorkDefinition + BindingDefinition +
RunConfiguration` is preserved: a RunDefinition **always has binding semantics**;
that component originates either from an explicit `BindingDefinition` or from the
well-known implicit legacy ephemeral default (§4) — never from a synthetic
persisted object.

## 2. Core concepts (FROZEN CORE)

| Concept | Statement |
|---|---|
| `BindingDefinitionId` | NEW identity namespace; never reuses `definition_id`, `task_id`, `AgentDefinitionId`, `PersistentPointId`, or `PeerRef` |
| `BindingRevision` | scoped to **one** `BindingDefinitionId` lineage; monotonically ordered within the lineage; no global ordering; consumers must not infer semantic adjacency from numeric difference |
| `BindingDigest` | canonical **content** identity of the binding semantic content; excludes id, revision, timestamps, runtime snapshot, provider availability → `identity ≠ digest` (same content under different ids ⇒ same digest) |
| `BindingDefinitionRef` | `{ bindingDefinitionId, revision, digest }` |
| `ArchitectureSubjectRef` | CANDIDATE future identity: the logical architecture subject a binding entry targets (AgentDefinition-shaped); never a reuse of Work `definition_id` |
| `DurableContinuityRef` | CANDIDATE future identity: PersistentPoint identity; concrete scheme intentionally open |
| `BindingIntentSource` | discriminated provenance of the binding semantics (§4) |
| `ContinuityBindingIntent` | normalized continuity intent (§5) |
| `SubjectBinding` | per-subject association intent: continuity intent and/or association-specific hard requirements |
| `BindingDefinition` | subject-keyed map of entries + identity/revision/digest/schemaVersion |
| `ResolutionProvenance` | the exact freshness basis of a resolution (§7) |
| `SatisfiedBindingResolution` / `UnsatisfiedBindingResolution` / `BindingResolutionResult` | discriminated resolution results (§6) |
| `BindingResolutionRef` | `{ resolutionId, digest }` — how an ExecutionPlan state references its resolution |
| `ExecutionPlanBindingRef` | an auditable ExecutionPlan state identifies exactly one resolution by immutable id+digest |

## 3. Frozen pseudo-schema (single authoritative copy)

```ts
/* PLMP-BIND-1 FROZEN pseudo-contract — documentation only; no storage, no runtime */

type BindingDefinitionId = string;   // NEW namespace (branded opaque id at rest)
type BindingRevision = number;       // scoped to one BindingDefinitionId lineage
type BindingDigest = string;         // canonical content identity

interface BindingDefinitionRef {
  readonly bindingDefinitionId: BindingDefinitionId;
  readonly revision: BindingRevision;
  readonly digest: BindingDigest;
}

type ArchitectureSubjectRef = string;  // CANDIDATE future identity
type DurableContinuityRef = string;    // CANDIDATE future identity

type RuntimeFeatureRef = string;       // logical identifier; NOT a provider implementation id
type ToolCapabilityRef = string;       // logical identifier; no registry implied

/* continuity intent — normalized, presence-only, at most ONE field present;
   absence of the whole intent = ephemeral allowed (Case E) */
interface ContinuityBindingIntent {
  readonly pin?: DurableContinuityRef;   // Case P: exact durable locus required
                                         // (a pin itself implies the persistent requirement)
  readonly requirePersistent?: true;     // Case R: some durable locus required
  readonly preferPersistent?: true;      // soft: persistent preferred, ephemeral fallback valid
}

/* association-specific HARD requirements (frozen core minimum) */
interface BindingHardRequirements {
  readonly runtimeFeatures?: readonly RuntimeFeatureRef[];    // semantic set
  readonly toolCapabilities?: readonly ToolCapabilityRef[];   // semantic set
}

interface SubjectBinding {   // at least one of continuity/hard must be present;
                             // a present `continuity: {}` is MEANINGFUL (explicit Case E)
  readonly continuity?: ContinuityBindingIntent;
  readonly hard?: BindingHardRequirements;
}

interface BindingDefinition {   // explicit definitions contain ≥1 subject entry
  readonly schemaVersion: 1;    // shape evolution — distinct from BindingRevision
  readonly bindingDefinitionId: BindingDefinitionId;
  readonly revision: BindingRevision;
  readonly digest: BindingDigest;   // over §8 content, key-canonical; excludes id/revision
  readonly bindings: Readonly<Record<ArchitectureSubjectRef, SubjectBinding>>;
}
// MapKey = SubjectIdentity (single subject truth; keys are serialized subject refs
// at runtime — the parser, not TypeScript, enforces canonical keying and rejects
// duplicate serialized keys).

/* ── resolution (derived; exactly ONE authoritative value per plan state) ── */

interface DefinitionRevisionRef {   // CANDIDATE future identity placeholder
  readonly definitionId: string;    // future Architecture/Work definition identity
  readonly revision: number;
  readonly digest: string;
}

interface SnapshotRef { readonly ref: string }   // OPAQUE identity of the exact
                                                 // continuity/runtime observation basis
interface ResolverPolicyRef { readonly id: string; readonly version: string }

/* BR-01: provenance of the binding semantics (no synthetic definition) */
type BindingIntentSource =
  | { readonly kind: "explicit"; readonly binding: BindingDefinitionRef }
  | { readonly kind: "implicit_ephemeral_default"; readonly semanticVersion: 1 };

interface ResolutionProvenance {
  readonly architecture: DefinitionRevisionRef;
  readonly work: DefinitionRevisionRef;
  readonly intentSource: BindingIntentSource;
  readonly runConfigurationDigest: string;   // deterministic representation; no new identity
  readonly snapshot: SnapshotRef;
  readonly resolverPolicy?: ResolverPolicyRef;
}

type ContinuitySelection =
  | { readonly kind: "ephemeral" }                                   // first-class satisfied outcome
  | { readonly kind: "persistent"; readonly point: DurableContinuityRef };

type BindingUnsatisfiedReason =
  | "pinned_target_unavailable"
  | "pinned_target_incompatible"
  | "no_matching_persistent_point"
  | "required_capability_unavailable";   // runtime-feature or tool-capability shortfall
                                         // (kind is diagnostic detail, not ontology)

interface SatisfiedBindingResolution {
  readonly status: "satisfied";
  readonly schemaVersion: 1;
  readonly resolutionId: string;    // opaque derived-artifact identity
  readonly digest: string;          // content/freshness identity (excludes resolutionId)
  readonly provenance: ResolutionProvenance;
  readonly continuity: Readonly<Record<ArchitectureSubjectRef, ContinuitySelection>>;
  // deliberately ABSENT: provider/model/tool/workspace selections (deferred
  // extensions), dshAgentId, dshSessionId, toolCallId, processId, currentAttemptId
}

interface UnsatisfiedBindingResolution {
  readonly status: "unsatisfied";
  readonly schemaVersion: 1;
  readonly provenance: ResolutionProvenance;   // same inputs; no selections; no id (§ BR-10)
  readonly reasons: readonly BindingUnsatisfiedReason[];
}

type BindingResolutionResult = SatisfiedBindingResolution | UnsatisfiedBindingResolution;

interface BindingResolutionRef { readonly resolutionId: string; readonly digest: string; }

/* ── ExecutionPlan delta (single-truth ownership) ── */
interface ExecutionPlanBindingRef {
  readonly bindingResolution: BindingResolutionRef;   // exactly one, immutable id+digest
}
```

## 4. Legacy implicit ephemeral default

`NoBindingSpecified → BindingIntentSource { kind: "implicit_ephemeral_default",
semanticVersion: 1 }`. The implicit source is **not** a BindingDefinition: no
`BindingDefinitionId`, no revision, no persisted canonical state. Existing
projects keep ephemeral-valid behavior with no migration; durable continuity is
strictly opt-in via an explicit BindingDefinition. If default semantics ever
change, `semanticVersion` increments — old resolution provenance stays
auditable. The implicit default's version is distinct from the contract's
`schemaVersion` (they evolve for different reasons).

## 5. Continuity canonical states (per subject)

Exactly one state; at most one field present; the parser rejects `false` flags
and any multi-field combination (pin dominates require dominates prefer — the
canonical form contains only the strongest necessary declaration):

```text
{ }                            Case E — ephemeral allowed (satisfied ephemeral outcome)
{ preferPersistent: true }     persistent preferred; ephemeral fallback valid
{ requirePersistent: true }    some durable locus required
{ pin: P }                     exact durable locus P required (implies requirement)
```

## 5A. Implementation-adequacy closures (G10-B3 preflight, 2026-09-12)

Narrow clarifications of already-approved semantics, recorded before canonical
publication so a resolver implementation needs no semantic invention. They amend
nothing else in this contract.

**PF-01 — explicit Case E is representable.** A present `continuity: {}` is a
**meaningful canonical value** (explicit Case E), not a meaningless empty
structure: canonicalization normalizes a present-but-empty `hard` object to
absent, but **preserves** a present `continuity: {}`. A subject with only
`continuity: {}` is valid. The digest therefore distinguishes *subject present
with explicit Case E* from *subject absent*; generic "empty object removal" must
not collapse them.

**PF-02 — explicit definitions are total over participating subjects.**
`ExplicitBindingDefinition ⇒ BindingSubjects = ParticipatingArchitectureSubjects`:
when the intent source is explicit, every participating architecture subject must
have exactly one entry; a missing subject is a **configuration-validation failure
before resolution** (fail-fast, not a resolver reason). A subject may select
Case E explicitly (`continuity: {}`) — total coverage does not force any durable
requirement. Legacy no-binding keeps the whole-run implicit ephemeral default;
mixed explicit/implicit per-subject provenance is not admitted.

**PF-03 — artifact identity is allocation, not resolution.** The pure resolver
determines selections, provenance, digest, and satisfiability deterministically;
`resolutionId` is allocated by the artifact/materialization layer from a
caller-supplied opaque id. `resolutionId` is never the digest (artifact identity
and content/freshness identity remain distinct), and no random/UUID policy is
frozen. Only satisfied results receive an id.

**PF-04 — durable continuity is opt-in.** Case E resolves against **ephemeral
candidates only**; a subject never becomes durable merely because a point is
available. Durable continuity requires explicit `preferPersistent`,
`requirePersistent`, or `pin` intent.

## 6. Unsatisfied semantics and reason order

`UnsatisfiedBindingResolution` is a **planning condition**: no admissible
selection satisfies the hard constraints against the snapshot. It is not attempt
failure, not tool error, not task failure, not staleness, and never triggers
PersistentPoint creation. Reason evaluation order is deterministic (most
specific first):

```text
1. pin present → pinned_target_unavailable (locus absent)
               | pinned_target_incompatible (locus fails a hard constraint)
2. required capability unsatisfiable by any candidate → required_capability_unavailable
   (one reason for runtime-feature and tool-capability shortfalls; the kind is
    diagnostic detail attached separately, never encoded in the reason string)
3. persistent required without pin, no admissible durable locus → no_matching_persistent_point
```

Static incompatibility between RunConfiguration narrowing and any declarative
hard input is a **configuration-validation failure before resolution**, not a
resolver reason.

## 7. Freshness, staleness, and rebinding

- `ResolutionProvenance` is the exact freshness basis: Architecture/Work
  definition revision refs (each **with its lineage identity** — a revision alone
  is not globally identifying), the binding intent source, the RunConfiguration
  digest, and the opaque `SnapshotRef` of the observation basis. The snapshot is
  an **input reference**: the resolution never becomes the canonical owner of
  availability, point, provider, or tool state.
- A resolution whose freshness basis no longer holds is **stale** — inadmissible
  for current execution (`LateStaleSuccess ≠ CurrentCommittableResult`) — while
  the binding itself may remain satisfiable.
- **Rebinding** produces a new resolution and a **new auditable ExecutionPlan
  state/version** referencing it. Committed plan states are never mutated;
  old resolutions/plan states stay auditable. ExecutionPlan admissibility
  depends on its referenced resolution remaining current.
- The resolver is **pure/derived**: agent creation, session resume, worktree
  allocation, and resource opening are effectful realization outside resolution
  and outside `Scheduler.decide()` (which stays pure; `commit()` persists the
  prepared event).

## 8. Digest and canonicalization

- **BindingDefinition digest** covers canonical semantic content only: the
  subject-keyed binding intent, hard association requirements, and continuity
  intent. It **excludes** `bindingDefinitionId`, `revision`, timestamps, runtime
  snapshot, and provider availability. Same semantic content under different
  ids ⇒ same digest (`identity ≠ digest`).
- **Resolution digest** covers resolved selections, provenance refs, snapshot
  identity, and resolver-policy identity/version; it excludes `resolutionId`,
  timestamps, and volatile telemetry.
- **Canonicalization:** subject maps are key-sorted by canonical serialized
  subject ref; requirement arrays are semantic **sets** (parser rejects
  duplicates; canonical form sorted); a present-but-empty `hard` object
  canonicalizes to absent, while a present `continuity: {}` is **preserved** as
  the meaningful canonical Case E (PF-01); presence flags are `true`-only.
  Equivalent semantic documents cannot hash differently, and explicit Case E
  remains digest-distinct from subject absence. No serialization format is
  frozen beyond these rules.

## 9. Determinism

For identical complete inputs — semantic inputs, resolution snapshot, and
resolver policy — resolution is **deterministic**. Tie-breaking, if any, is
deterministic and part of the resolver-policy identity; no randomness is
permitted without becoming provenance. Map order in a BindingDefinition is never
priority. Resolver policy appears only as provenance (`id`, `version`); no
plugin architecture.

## 10. Parser obligations (future implementation; house style)

```text
reject unknown fields
reject invalid continuity combinations (multi-field, false flags)
reject duplicate serialized subject keys
reject duplicate requirement entries
require ≥1 subject entry in an explicit BindingDefinition
require ≥1 of continuity/hard per subject entry
preserve a present `continuity: {}` as canonical Case E (PF-01);
  normalize a present-but-empty `hard` object to absent
validate explicit subject coverage before resolution (PF-02)
validate digest after canonicalization
validate configuration narrowing before resolution
```

## 11. Responsibility and firewall boundaries

Binding grants **no authority** and implies **no organization membership, no
collaboration edge, no commitment**. Architecture/Work hard requirements remain
owned by their definitions (the resolver consumes them; BindingDefinition is not
a requirements mirror). BindingDefinition and BindingResolution contain **no
runtime carrier/session identity** (`dshAgentId`, `dshSessionId`, `callId`,
`attemptId`, `processId`), no `peerRef`/thread/channel, no
`manager`/`orgId`/`teamId`, no permissions/ownership/grant fields — runtime
attachment is DSH-owned state outside this contract. A required durable target
that is unavailable is **unsatisfied**, never implicitly created
(`createIfMissing`/`autoPromote`/`spawnPersistent` do not exist).

## 12. Core vs deferred extensions (classification)

**FROZEN CORE:** §2 concepts, §3 schema, §4 legacy default, §5 continuity states,
§6 unsatisfied semantics, §7 freshness/rebinding, §8 digests, §9 determinism,
§10 parser obligations, §11 firewalls.

**FROZEN INTERFACE BOUNDARY:** `BindingResolutionRef` /
`ExecutionPlanBindingRef` (how a plan references its resolution);
`BindingIntentSource` (how legacy/default provenance is expressed).

**DEFERRED EXTENSIONS (explicitly not frozen):** run-scoped binding delta shape
(including multi-subject run-scoped overrides); provider/model selections;
tool-implementation selections; workspace locality requirement vocabulary and
logical-resource selection; capability-satisfaction provenance shape; negative
constraints; cost/latency preferences; PersistentPoint identity scheme;
resolver-policy framework. Future schema revisions add these as **typed**
fields — never a `Record<string, unknown>` escape hatch.

**REJECTED:** synthetic persisted default BindingDefinition; mandatory
PersistentPoint; runtime identity in durable contract; authority/org/collab/
commitment fields; continuity enum; generic preferences object; `stale_inputs` /
`run_selection_conflict` / umbrella `hard_constraint_unsatisfied` reasons;
in-place plan pointer mutation.

## 13. Frozen invariants

| Invariant | Statement |
|---|---|
| `BIND1-INV-01` | `BindingDefinition ≠ BindingResolution` (declarative intent vs derived artifact) |
| `BIND1-INV-02` | Runtime attachment is DSH-owned runtime state and is not part of the Binding contract |
| `BIND1-INV-03` | PersistentPoint participation is optional; ephemeral realization is first-class |
| `BIND1-INV-04` | Binding resolution does not create PersistentPoints |
| `BIND1-INV-05` | Run-scoped narrowing may reduce but never violate declarative hard requirements (Architecture, Work, Binding) |
| `BIND1-INV-06` | A durable continuity pin changes only through a BindingDefinition revision |
| `BIND1-INV-07` | Exactly one authoritative BindingResolution per plan state, referenced by immutable id+digest |
| `BIND1-INV-08` | Rebinding produces a new resolution and a new auditable plan state; committed plan states are never mutated |
| `BIND1-INV-09` | Binding grants no authority and implies no organization, collaboration, or commitment |
| `BIND1-INV-10` | BindingDefinition and BindingResolution contain no runtime carrier/session identity |
| `BIND1-INV-11` | Legacy no-binding semantics are the explicit implicit ephemeral default source, not a synthetic definition |
| `BIND1-INV-12` | `Satisfied ≠ Unsatisfied` and `Current ≠ Stale` are orthogonal axes |
| `BIND1-INV-13` | A lineage-scoped revision always travels with its lineage identity; revisions are scoped to one BindingDefinitionId lineage |
| `BIND1-INV-14` | Resolution is pure/derived; effectful realization lies outside resolution and outside `Scheduler.decide()` |

## 14. Intentionally open

PeerRef ↔ PersistentPoint; Activation/Participation; PersistentPoint identity
scheme and creation/promotion workflow; authority representation; verification
architecture; conflict detection; storage backends; resolver algorithm and
policy framework; deferred extension vocabularies (§12). None of these blocks
this freeze; the frozen boundaries are decidable without them.

## 15. Compatibility

`NoBindingSpecified → ImplicitEphemeralDefault@1` requires no migration: existing
projects keep their ephemeral behavior, and existing fields (`definition_id`,
`AgentGraph v1`, `GraphPatch`, `CanvasDoc v3`, scheduler semantics) are untouched.
Future durable binding is additive; new identities use the new namespaces above,
never a reinterpretation of `definition_id`.
