# G10-B2 — Binding Schema Formal Review

Status: **FORMAL CONTRACT REVIEW · COMPLETE**

Reviewed candidate: `G10-B1-BINDING-SCHEMA-CANDIDATE.md` (with
`G10-B1-BINDING-CONTRACT-MATRIX.md`, `G10-B1-BINDING-EXAMPLES.md`,
`G10-B1-DELIVERY.md`) at `experiment/g10-b1-binding-schema-candidate` @
`da4c211` (draft PR #13), together with the B0 semantic basis
(`G10-B0-BINDING-SEMANTICS-DESIGN.md` §5A, identity matrix, delivery) and the
canonical `UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE-v1.md` (PLMP-UAS-1). Current
source was consulted only for compatibility assumptions (no binding concept
exists on `main`; model selection is runtime/advisory). No new behavioral
experiments.

Review branch: `experiment/g10-b2-binding-schema-formal-review`, stacked on the
B1 HEAD; the B2 draft PR targets the B1 branch. PRs #12/#13 were not merged to
simplify topology. Canonical adoption of the freeze follows the stack merge
(#12 → #13 → B2); the verdict below is the **semantic freeze decision**.

Review principle:

$$
BindingFreezeReview = Consistency + Minimality + SingleTruth + BackwardCompatibility + Freshness + UAS1Compatibility
$$

Every candidate field/type/rule was asked: *if removed, which actual semantic
ambiguity returns?* Items without a concrete answer were removed or deferred.
No bulk approval.

---

## 1. Blocker ledger (BR-01…BR-10)

| ID | Candidate issue | Resolution | Final status |
|---|---|---|---|
| BR-01 | Legacy `NoBindingSpecified → ephemeral` conflicts with `ResolutionProvenance.binding: BindingDefinitionRef` (every resolution cited an explicit definition) | Adopt discriminated **`BindingIntentSource`** (`{kind:"explicit", binding} \| {kind:"implicit_ephemeral_default", semanticVersion}`) in `ResolutionProvenance`. The implicit source is not a BindingDefinition, has no id/revision, and is not persisted canonical state; `semanticVersion` (currently `1`) makes future default-behavior changes auditable. Option A (optional field) rejected — absence overloaded with omission/corruption; Option C (synthetic persisted definition) rejected — hidden canonical truth. RunDefinition interpretation frozen: **RunDefinition always has binding semantics**; that component originates from an explicit BindingDefinition or the well-known implicit ephemeral default — composition semantics preserved without a fake object | CLOSED |
| BR-02 | `stale_inputs` modelled as a `BindingUnsatisfiedReason` | **`StaleResolution ≠ UnsatisfiedBinding`** frozen. Unsatisfied = no admissible selection satisfies hard constraints *against the snapshot*; stale = the resolution was evaluated against an obsolete freshness basis and is inadmissible for current execution (the binding may be perfectly satisfiable). Freshness is a validation/admission property of the derived resolution (G9 model), **not** a third outcome variant: `stale_inputs` removed from the reason taxonomy; satisfiability and currency are orthogonal axes (`Satisfied ≠ Unsatisfied`, `Current ≠ Stale`) | CLOSED |
| BR-03 | `BindingResolutionResult` union had no discriminant | Frozen result union uses an explicit `status` discriminant: `"satisfied" \| "unsatisfied"`. No `"stale"` variant (BR-02). Renamed for clarity: `SatisfiedBindingResolution` / `UnsatisfiedBindingResolution` / `BindingResolutionResult` (no compatibility constraint exists) | CLOSED |
| BR-04 | Subject identity dual truth: map key **and** `SubjectBinding.subject` | **`MapKey = SubjectIdentity`** frozen. `SubjectBinding.subject` removed; same audit applied to `BindingResolution.selections` (values carry no subject field). TypeScript caveat recorded: `Record<ArchitectureSubjectRef, …>` is pseudo-schema; at runtime keys are serialized strings and the parser (not TypeScript) enforces canonical keying and rejects duplicate serialized keys | CLOSED |
| BR-05 | `ContinuityBindingIntent` booleans admit invalid/redundant states (`false` flags, `pin+requirePersistent`, `pin+prefer`, `require+prefer`) | Normalized to **presence-only `true` fields with at most one present** (parser rejects `false` and any combination): `{}` → Case E; `{preferPersistent:true}` → preferred; `{requirePersistent:true}` → required; `{pin:P}` → pinned (a pin **itself implies** the persistent requirement, so no `pin+requirePersistent` encoding). Canonical form contains only the strongest necessary declaration → stable digests. Strategy-A enum reversal considered and **not** taken: normalized presence semantics remove the invalid states without enum proliferation | CLOSED |
| BR-06 | Admissible-set rule ignored Architecture/Work hard requirements | Frozen broader model: `BaseAdmissibleSet = ArchitectureHardRequirements ∩ WorkHardRequirements ∩ BindingHardConstraints`; `Allowed(EffectiveRunBinding) ⊆ BaseAdmissibleSet`. Ownership preserved — requirements stay with their owners; the resolver consumes all of them; BindingDefinition does not become a requirements mirror. Naming: ownership + monotonic narrowing are frozen; `EffectiveBindingRequest`/`MergeHardInputs` remain explanatory, not an API | CLOSED |
| BR-07 | `BindingPreferences` (`modelCapabilityClass`, `contextBudget`) risked duplicating AgentDefinition/Work semantics | Ownership audit: `modelCapabilityClass` is AgentDefinition model-policy intent (or a RunConfiguration run-scoped preference); `contextBudget` is a Work resource budget / runtime policy — neither is association-specific. **Generic `BindingPreferences` removed from the frozen contract**; the only stable soft preference is `preferPersistent` inside continuity intent. Run-scoped provider/model preferences belong to existing runtime/model-policy surfaces, not binding | CLOSED |
| BR-08 | Multi-subject BindingDefinition vs a *global* RunConfiguration delta | Resolved by **shrinking** rather than growing: provider/model selection is not part of the Binding contract at all (see FR-A). The frozen run-scoped binding delta is therefore **deferred** — RunConfiguration participates in resolution as a provenance-tracked narrowing input (`runConfigurationDigest`), and its concrete binding-delta schema is a deferred extension. Multi-subject run-scoped overrides are consequently deferred with it and stated explicitly (§102 proof) | CLOSED |
| BR-09 | Rebinding updated `ExecutionPlan.bindingResolutionRef` in place, contradicting immutable/auditable plan state | Frozen (weaker, implementation-safe) rule: **an auditable ExecutionPlan state identifies exactly one BindingResolution by immutable id+digest; changing the resolution produces a new auditable plan state/version — never an untracked pointer mutation.** Rebinding: new resolution + new plan state; old artifacts remain auditable. Plan admissibility depends on its referenced resolution remaining current | CLOSED |
| BR-10 | `BindingRevision` scope/order undefined | Frozen: revision is **scoped to one `BindingDefinitionId` lineage** and monotonically ordered within it; no global/project ordering exists; consumers must not infer semantic adjacency from numeric difference (no `r2 = r1 + 1`); `(BindingDefinitionId, BindingRevision)` uniquely identifies one semantic version and the digest verifies content. `BindingResolutionId` is an opaque derived-artifact identity (digest carries content/freshness identity; identity ≠ digest). Unsatisfied results carry **no** id — they are transient results; audit/retry provenance does not yet require identifying them | CLOSED |

Narrow corrections only; no new ontology was required. After applying them the
full review was re-run; the final verdict is PASS (§6).

### Additional findings (FR-A…FR-F, folded into the same re-run)

| ID | Finding | Resolution |
|---|---|---|
| FR-A | Provider/model selection inside the binding delta/resolution drifts Binding toward a dependency-injection container (§35/§62/§65) | Provider/model/tool-implementation/workspace **selections are deferred extensions**, not frozen core. Frozen resolution scope = **continuity/locus association resolution** (+ provenance). `ProviderModelSelection`, `toolImplementations`, `workspace` removed from frozen core; RunConfiguration binding delta deferred with them |
| FR-B | `stale_inputs`/`run_selection_conflict`/umbrella overlap in the reason taxonomy (§46–§48) | Configuration validation (static incompatibility) happens **before** resolution and is not a resolver reason. Frozen taxonomy (with deterministic evaluation order): `pinned_target_unavailable`, `pinned_target_incompatible`, `no_matching_persistent_point`, `required_capability_unavailable` (one reason covering runtime-feature and tool-capability shortfalls; kind is diagnostic detail, not ontology). `hard_constraint_unsatisfied` umbrella and `run_selection_conflict`/`stale_inputs` removed |
| FR-C | `workspace` locality enum mirrored today's worktree implementation (§85) | Deferred to a typed extension; not frozen |
| FR-D | `hard`/`continuity` mandatory-`{}` boilerplate (§59/§60) | `SubjectBinding` requires **at least one** of `continuity`/`hard`; presence-only flags; absent vs present-but-empty canonicalized (empty → absent) so equivalent documents cannot hash differently |
| FR-E | Provenance revisions without lineage identity (§78/§79) | `DefinitionRevisionRef { definitionId, revision, digest }` with CANDIDATE future-identity placeholder; frozen principle: **a lineage-scoped revision always travels with its lineage identity**. No `GenericVersionedRef<T>` |
| FR-F | Duplicate requirement entries / map ordering (§56/§58/§83/§84) | `runtimeFeatures`/`toolCapabilities` are **semantic sets**: parser rejects duplicates, canonical form is sorted; subject map digest input is key-sorted by canonical serialized subject ref |

## 2. Candidate field disposition (§114)

| B1 field/type | Disposition | Notes |
|---|---|---|
| `BindingDefinitionId` / `BindingRevision` / `BindingDigest` | KEEP (NARROWED semantics) | revision scope/order frozen (BR-10) |
| `BindingDefinitionRef` | KEEP | — |
| `ArchitectureSubjectRef` / `DurableContinuityRef` | KEEP | CANDIDATE future identities; opaque at rest |
| `RuntimeFeatureRef` / `ToolCapabilityRef` | KEEP (NARROWED) | logical identifiers, semantic sets, deduped+sorted; no registry |
| `WorkspaceLocalityRequirement` | DEFER | current-implementation-shaped (FR-C) |
| `BindingRequirements` | KEEP (NARROWED) → `BindingHardRequirements` | `runtimeFeatures` + `toolCapabilities` only; workspace deferred |
| `BindingPreferences` | **REMOVE** | BR-07/§30 |
| `ContinuityBindingIntent` | KEEP (NORMALIZED) | presence-only, at most one field, pin dominates (BR-05) |
| `SubjectBinding` | KEEP (NARROWED) | `subject` removed (BR-04); ≥1 of continuity/hard (FR-D) |
| `BindingDefinition` | KEEP | ≥1 subject entry (§57); empty explicit map invalid |
| `ProviderModelSelection` | **DEFER** | FR-A (also removed from RunConfiguration delta) |
| `toolImplementations` | **DEFER** | §63 — capability satisfaction provenance may return as a typed extension |
| `workspace` selection / `logicalResource` | **DEFER** | §64 — opaque string escape hatch avoided |
| `ResolutionProvenance` | KEEP (NARROWED) | `intentSource` added (BR-01); `DefinitionRevisionRef` (FR-E); `runConfigurationDigest` kept, no new identity (§77) |
| `BindingResolution` | KEEP (RENAMED + NARROWED) → `SatisfiedBindingResolution` | `status` discriminant; continuity-only selections (FR-A) |
| `UnsatisfiedBindingResolution` | KEEP (NARROWED) | `status` discriminant; 4 reasons; no id (§44) |
| `BindingResolutionResult` | KEEP | discriminated union (BR-03) |
| `BindingResolutionRef` | KEEP | id + digest both required (§74) |
| `RunConfigurationBindingDelta` | **DEFER** | BR-08/FR-A; narrowing semantics frozen, shape deferred |
| `ExecutionPlanBindingRef` | KEEP | BR-09/§74 |
| `stale_inputs`, `run_selection_conflict`, `hard_constraint_unsatisfied` reasons | **REMOVE** | BR-02/FR-B/§48 |

## 3. Rule dispositions (§115)

**BIND-CAND-01…17:** INV-carrying rules 01–11 freeze into `BIND1-INV-01/02/03/04/05/09/10` (mapping in the redline) — 03/04 narrowed to the corrected continuity model; 08 narrowed (freshness separated from satisfiability); 12–17 freeze as frozen invariants/rules (12→INV-03, 13→reason taxonomy + INV-03, 14→INV-05, 15→INV-06, 16→INV-07, 17→INV-11). No rule was rejected; two were split (08 → satisfiability vs currency; 14 → narrowing rule + validation-timing rule).

**B1-01…10:** B1-01 (pin vs preference) freezes as part of the continuity canonical model; B1-02 (typed hard/preference) freezes with `BindingPreferences` removed; B1-03 (resolver purity) freezes; B1-04 (determinism) freezes with deterministic tie-breaking required and no randomness; B1-05 (schema version ≠ revision) freezes; B1-06 (parser discipline) freezes as parser obligations; B1-07 (provider-neutral refs) freezes; B1-08 (no duplicate requirements store) freezes; B1-09 (ExecutionPlan ref) freezes narrowed by BR-09; B1-10 (unsatisfied ≠ failure) freezes.

## 4. Canonical frozen state model (summary)

```text
Continuity canonical states (per subject; exactly one; at most one field present):
  {}                                → Case E  (ephemeral allowed; satisfied ephemeral outcome)
  { preferPersistent: true }        → persistent preferred; ephemeral fallback valid
  { requirePersistent: true }       → persistent required; none suitable ⇒ unsatisfied
  { pin: P }                        → exact durable locus P required (implies requirement)

Reason evaluation order (deterministic disambiguation):
  1. pin present → pinned_target_unavailable (no such locus) | pinned_target_incompatible (locus fails a hard constraint)
  2. required capability not satisfiable by any candidate → required_capability_unavailable
  3. persistent required (no pin) and no admissible durable locus → no_matching_persistent_point
```

Unsatisfied ≠ attempt failure ≠ tool error ≠ staleness. Staleness is detected by
provenance: any freshness-critical input or the snapshot moving on ⇒ the derived
resolution is stale/inadmissible for current execution (`LateStaleSuccess ≠
CurrentCommittableResult`), while the binding itself may remain satisfiable.

## 5. Freeze proofs (§99–§106)

- **Legacy (§99):** no BindingDefinition specified → `intentSource =
  {kind:"implicit_ephemeral_default", semanticVersion:1}` → ephemeral-valid
  resolution; no fake point, no fake definition identity, no synthetic persisted
  object. First-class freeze test.
- **Pinned (§100):** `pin:P` + P available and compatible → satisfied
  `{kind:"persistent", point:P}`; P missing → `pinned_target_unavailable`; P
  failing a hard constraint → `pinned_target_incompatible`.
- **Required (§100):** `requirePersistent` + no admissible durable locus →
  `no_matching_persistent_point`; no creation.
- **Preferred fallback (§100):** `preferPersistent` alone, nothing available →
  satisfied ephemeral.
- **Run-configuration conflict (§101):** a run-scoped request outside the
  admissible set — where the admissible set is the intersection of Architecture,
  Work, and Binding hard inputs — fails configuration validation before
  resolution; not only BindingDefinition is protected.
- **Subject overrides (§102):** multi-subject run-scoped overrides are **deferred**
  with the RunConfiguration binding delta; stated explicitly rather than left as
  accidental global-only semantics.
- **Single truth (§103):** one resolution artifact, one digest, one plan
  reference; no independent embedded copy.
- **Rebinding (§104):** r1→plan-state p1; snapshot moves; r2→new plan-state p2;
  nothing mutated (definition, point, old resolution, old plan state).
- **Revision (§105):** `B@r1` / `B@r2` = two versions in one
  `BindingDefinitionId` lineage; no global meaning.
- **Digest (§106):** same semantic content ⇒ same digest independent of map
  insertion order, set order, timestamps, and (content-digest rule) identity
  lineage; `identity ≠ digest`.

## 6. Verdict

All ten mandatory blockers BR-01…BR-10 are CLOSED with narrow, contract-level
corrections; the field disposition and rule dispositions are complete; the
freeze proofs hold against the corrected contract; all firewalls (authority,
organization, collaboration, commitment, Invocation/Participation, runtime
identity, effects, point creation) survive; PLMP-UAS-1 is untouched; the frozen
core is smaller than the candidate (preferences, provider/model/tool/workspace
selections, and the RunConfiguration delta are deferred, not frozen).

```text
BINDING SCHEMA REVIEW: PASS
```

Frozen artifact: `docs/engineering/BINDING-SEMANTIC-CONTRACT-v1.md`
(**PLMP-BIND-1 · FROZEN**) — a subordinate contract under PLMP-UAS-1 (not
UAS-2). Canonical adoption follows the stack merge (#12 → #13 → B2).

## 7. Implementation-adequacy preflight addendum (G10-B3 Stage 0A, 2026-09-12)

Before canonical publication, the frozen contract was reviewed as if implementing
it (G10-B3 Stage 0A). Four implementation-level consistency points were found and
closed as **narrow clarifications of already-approved semantics** — no new
semantic decision was required, so the PASS verdict stands:

- **PF-01**: a present `continuity: {}` is a meaningful canonical value (explicit
  Case E); present-but-empty `hard` normalizes to absent; the digest distinguishes
  subject-present-with-Case-E from subject-absent. (The original "empty optional
  structures canonicalize to absent" wording would have made explicit Case E with
  no hard requirements unrepresentable.)
- **PF-02**: explicit BindingDefinitions are **total** over participating
  subjects — `ExplicitBindingDefinition ⇒ BindingSubjects =
  ParticipatingArchitectureSubjects`; a missing subject is a
  configuration-validation failure before resolution. Case E may be selected
  explicitly per subject; mixed per-subject explicit/implicit provenance is not
  admitted.
- **PF-03**: artifact identity (`resolutionId`) is allocation by the
  materialization layer from a caller-supplied opaque id; the pure resolver
  determines selections/provenance/digest/satisfiability deterministically;
  `resolutionId ≠ digest`; no random/UUID policy is frozen.
- **PF-04**: durable continuity is opt-in — Case E resolves against ephemeral
  candidates only; a subject never becomes durable merely because a point is
  available.

These are recorded in `BINDING-SEMANTIC-CONTRACT-v1.md` §5A with matching §3/§8/§10
clarifications. Freeze gates re-run after the corrections (see delivery).
