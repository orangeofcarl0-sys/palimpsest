# G10-B2 — Delivery Report

Status: **BINDING SCHEMA FORMAL REVIEW COMPLETE · PLMP-BIND-1 FROZEN (semantic decision; canonical adoption follows the PR stack)**

Topology: **stacked**. Review branch
`experiment/g10-b2-binding-schema-formal-review` from
`experiment/g10-b1-binding-schema-candidate` @ `da4c211` (PR #13 open); the B2
draft PR targets the B1 branch. PRs #12/#13 were not merged to simplify
topology. Expected eventual merge order: #12 → #13 → B2.

## Answers (30)

1. **Was the BR-01 legacy provenance contradiction fixed?** Yes — resolution
   provenance now carries a discriminated `BindingIntentSource`
   (`explicit` with a `BindingDefinitionRef`, or
   `implicit_ephemeral_default` with `semanticVersion`), so a legacy resolution
   no longer needs to cite a definition that does not exist.
2. **How is implicit legacy binding represented?** As the well-known semantic
   default source `{kind:"implicit_ephemeral_default", semanticVersion:1}` — not
   a BindingDefinition, no id/revision, not persisted canonical state.
3. **Is a synthetic BindingDefinition created?** No — rejected explicitly
   (hidden canonical truth).
4. **Was `stale` removed from BindingUnsatisfied?** Yes — `StaleResolution ≠
   UnsatisfiedBinding` is frozen; `stale_inputs` is gone from the reason
   taxonomy.
5. **Where is freshness/staleness modelled?** As an admission/validation
   property of the derived resolution, evaluated against its
   `ResolutionProvenance` (input refs + opaque `SnapshotRef`); orthogonal to
   satisfiability (`Satisfied ≠ Unsatisfied`, `Current ≠ Stale`).
6. **Does BindingResolutionResult have a discriminant?** Yes —
   `status: "satisfied" | "unsatisfied"`; types renamed
   `SatisfiedBindingResolution` / `UnsatisfiedBindingResolution`.
7. **Is map key the single subject identity?** Yes — `MapKey = SubjectIdentity`;
   `SubjectBinding.subject` and any subject field in resolution values were
   removed; the parser (not TypeScript) enforces canonical keying.
8. **How are invalid continuity combinations prevented?** Presence-only `true`
   fields, at most one present, pin dominates; the parser rejects `false` flags
   and multi-field combinations; canonical form holds only the strongest
   declaration (stable digests).
9. **Is pin itself sufficient to require persistence?** Yes — a pin implies the
   persistent requirement; no `pin + requirePersistent` encoding exists.
10. **What is the final continuity canonical state model?** Exactly four
    canonical states: `{}` (Case E), `{preferPersistent}`,
    `{requirePersistent}`, `{pin}` (§5 of the contract).
11. **Does admissibility include Architecture/Work hard requirements?** Yes —
    `BaseAdmissibleSet = ArchitectureHard ∩ WorkHard ∩ BindingHard`;
    `Allowed(EffectiveRunBinding) ⊆ BaseAdmissibleSet` (BR-06), with ownership
    preserved (no requirements mirror).
12. **What remains owned by BindingDefinition?** Association-specific hard
    requirements (runtime features, tool capabilities — as logical identifier
    sets) and continuity intent (pin/require/prefer); plus its
    identity/revision/digest.
13. **Was generic BindingPreferences retained or removed?** **Removed** —
    `modelCapabilityClass` (model-policy intent) and `contextBudget` (work
    budget/runtime policy) are not association-specific; the only stable soft
    preference is `preferPersistent` inside continuity intent.
14. **Where do model/context preferences live?** AgentDefinition model-policy
    intent, Work resource budgets, and RunConfiguration run-scoped preferences
    (existing runtime/model-policy surfaces) — not in the Binding contract.
15. **How are multi-subject run-scoped selections represented?** They are
    **deferred**: the RunConfiguration binding-delta shape is a deferred
    extension (narrowing semantics and its provenance digest are frozen; the
    shape is not), stated explicitly rather than left as accidental
    global-only semantics.
16. **Does provider/model selection remain in the Binding contract?** No —
    deferred (FR-A/§35/§62): it is a resolver input from other configuration
    surfaces, not Binding-owned.
17. **Is BindingResolution still standalone Option A?** Yes — a standalone
    immutable derived artifact; `ExecutionPlan` stores only
    `bindingResolutionRef { resolutionId, digest }`.
18. **Is each ExecutionPlan state bound to one immutable resolution?** Yes —
    one plan state ↔ one resolution id+digest; plan admissibility depends on the
    referenced resolution remaining current.
19. **What happens on rebinding?** New resolution + **new auditable plan
    state/version**; nothing is mutated (definition, point, old resolution, old
    plan state).
20. **What is BindingRevision scope?** One `BindingDefinitionId` lineage;
    monotonic within the lineage; no global ordering; no arithmetic-adjacency
    assumptions; `(id, revision)` uniquely identifies one semantic version.
21. **Is revision arithmetic meaningful?** No — only ordering within a lineage;
    the digest verifies content identity.
22. **What is included in the BindingDefinition digest?** Canonical semantic
    content only (subject-keyed intent, hard requirements, continuity intent),
    key-sorted; excludes id, revision, timestamps, snapshot, provider
    availability.
23. **Is identity included in the content digest?** No — `identity ≠ digest`:
    the same semantic content under different ids yields the same digest.
24. **What is included in the BindingResolution digest?** Resolved selections,
    provenance refs, snapshot identity, resolver-policy identity/version;
    excludes `resolutionId`, timestamps, volatile telemetry.
25. **What is the final unsatisfied reason taxonomy?** Four reasons with a
    deterministic evaluation order: `pinned_target_unavailable`,
    `pinned_target_incompatible`, `no_matching_persistent_point`,
    `required_capability_unavailable` (one reason covering runtime-feature and
    tool-capability shortfalls; detail attached separately, not in the reason
    string). Static run-configuration conflicts fail validation before
    resolution.
26. **Which B1 fields were removed/deferred?** Removed: `BindingPreferences`
    (with `modelCapabilityClass`/`contextBudget`), `SubjectBinding.subject`,
    three reasons. Deferred: `WorkspaceLocalityRequirement`,
    provider/model selections, tool implementations, workspace selections,
    `RunConfigurationBindingDelta` shape. Added: `BindingIntentSource`,
    `DefinitionRevisionRef`, opaque `SnapshotRef`, `status` discriminants,
    four-reason taxonomy. Full table in the redline.
27. **Were all firewalls preserved?** Yes — authority, organization,
    collaboration, commitment, Invocation/Participation, runtime identity,
    effects (pure resolution), and PersistentPoint-creation firewalls are all
    intact at the schema level; `createIfMissing`-style fields do not exist.
28. **Did any production code/schema change?** No — docs-only diff
    (`docs/engineering/`); no parser code, no storage, no migrations, no
    Ordarium/DSH change.
29. **Was `PLMP-BIND-1` frozen?** Yes —
    `docs/engineering/BINDING-SEMANTIC-CONTRACT-v1.md`
    (**PLMP-BIND-1 · FROZEN**), a subordinate contract under PLMP-UAS-1 (not
    UAS-2), with 14 frozen invariants `BIND1-INV-01..14` and the core/deferred/
    rejected classification. The B1 candidate document is retained; the
    candidate→frozen mapping is `G10-B2-BINDING-CANDIDATE-REDLINE.md`.
30. **What is the recommended next stage?** **A — G10-B3: Minimal Binding
    compiler/resolver spike** (legacy implicit ephemeral, explicit ephemeral,
    pin/require/prefer against an in-memory fixture catalog, pure resolver,
    freshness/provenance; no storage, no DSH agent creation, no PersistentPoint
    database). Not started.

## Deliverables

- `docs/engineering/G10-B2-BINDING-SCHEMA-FORMAL-REVIEW.md` (blocker ledger,
  field disposition, rule dispositions, proofs, verdict)
- `docs/engineering/BINDING-SEMANTIC-CONTRACT-v1.md` (PLMP-BIND-1 · FROZEN)
- `docs/engineering/G10-B2-BINDING-CANDIDATE-REDLINE.md`
- `docs/engineering/G10-B2-DELIVERY.md` (this file)
- `docs/engineering/README.md` + `docs/engineering/audits/G10-G11-ROADMAP.md`
  (additive)

## Freeze proofs (§99–§106)

Legacy provenance self-consistency; explicit pin / required / preferred-fallback
cases; run-conflict protection across Architecture, Work, and Binding hard
inputs; multi-subject override deferral stated; single truth (one artifact, one
digest, one plan reference); rebinding without mutation; revision lineage
scoping; digest order-independence. All hold against the frozen contract
(documentation-level; no machine script — §121 default NO).

## Gates

- `git diff --check` — clean; diff is `docs/engineering/` only.
- `pnpm test` — 60 files / 433 passed; `pnpm build`, `pnpm build:web` — pass;
  `pnpm test:e2e` — recorded from the observed run (Playwright `retries = 0`).
- Remote CI recorded from the observed run on this PR; not fabricated.

## Recommended next stage

**A — G10-B3 minimal compiler/resolver spike** within the §129 boundary
(in-memory fixture catalog, pure resolver, no storage/DSH/PersistentPoint
persistence). Not started.
