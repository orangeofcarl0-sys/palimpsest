# G10-J J0 — Governed Dynamic Evolution Audit

Baseline: `main @ b30b01129aa6e019278344b32450e9cf5a8946d4`. Audited the real F3/F5 code
(`src/organization/transformation.ts`, `src/organization/store.ts`,
`src/institution/{service,artifacts,store,governed}.ts`) plus G10-I.

## J0-Q1 — Exact F3 proposal types

`OrganizationTransformationProposal = ReviseProposal | SplitProposal | MergeProposal`
(`transformation.ts:151-206`).

- **REVISE** `{kind:"REVISE", base: OrganizationDefinitionRef, candidate: OrganizationDefinition, claimedEvidenceRefs?}` —
  candidate revision must be `base.revision + 1`.
- **SPLIT** `{kind:"SPLIT", base, left/right: SplitSuccessorSpec{organizationDefinitionId,revision,mission}, memberPlacements[], rolePlacements[], normPlacements[], overlapDeclared, claimedEvidenceRefs?}`.
- **MERGE** `{kind:"MERGE", sources[], target{organizationDefinitionId,revision,mission}, roleResolutions[], members?, normResolutions?, claimedEvidenceRefs?}`.

`evaluateOrganizationTransformation(proposal, {bases, evidence?})` is **pure** and returns
`OrganizationTransformationAssessment {kind, bases, candidates, boundaryPorts, obligations,
interfaceReport?, status:"admissible"|"blocked"}`; `status` is blocked iff any obligation is
`unresolved`. Diagnostics = the `obligations` array (no separate field).

## J0-Q2 — Activation APIs and authority assumptions

| API | Writes | Assumed authority |
|---|---|---|
| `planTransformationActivation(assessment)` | none (pure; throws if not admissible) | none |
| `activateOrganizationTransformation(store, assessment)` | OrganizationStore revisions | **trusted administrative caller** |
| `activateAndGovernOrganizationChange({organizationStore, institutionService, institutionId, assessment, adopt?, reason})` | org revisions + institution transition proposal | trusted administrative caller |
| `InstitutionService.proposeTransition/approveLocal/approveRemote/advance` | institution store | continuation governance (charter threshold) |
| `RuntimeScopeService` mutators | runtime-scope store | representation admission (H) |
| `OrganizationStore.registerRevisions` | org revisions | trusted administrative |

## J0-Q3 — Does F3 activation contain an authority gate?

**No.** `activateOrganizationTransformation` is a trusted administrative API. Therefore J MUST
place an evolution-specific admission seam in front of it; the Dynamics path must never
inherit "trusted caller".

## J0-Q4 — Institution governance requirement

`InstitutionStore.currentEpoch(id).organization` is the current body ref
(`institution/artifacts.ts:232-241`), and `institutionBodyView(...)` is the read-only derived
view (`institution/governed.ts:84`). There is **no reverse index** (organization → institution).
Honest decision: the application supplies the institution id under governance (an explicit
`institution` wiring in J); if the source organization ref equals that institution's current
body, the change is institution-governed, else standalone. No institution truth is copied.

## J0-Q5 — Durable Evolution Case history?

**Required.** A real evolution spans proposal → compile → assessment → authority → institution
approvals → activation → crash/restart → post-observation across independent stores; digest
artifacts alone cannot answer "what happened to this proposal" idempotently. Introduce
`OrganizationEvolutionStore` owning **only** evolution governance/execution history — never
Organization/Institution/RuntimeScope/Dynamics truth. Case identity is **derived**:
`caseRef = ec-<digest(proposalDigest, candidateDigest)>` (no random durable id).

## J0-Q6 — Executable proposal-kind matrix

| Dynamics kind | J result |
|---|---|
| `NO_CHANGE` | TERMINAL_NON_MUTATING |
| `RETAIN_FEDERATION` | TERMINAL_NON_MUTATING |
| `REVISE_ORGANIZATION` | EXECUTABLE_IN_J → F3 REVISE |
| `SPLIT_ORGANIZATION` | EXECUTABLE_IN_J → F3 SPLIT |
| `MERGE_ORGANIZATIONS` | EXECUTABLE_IN_J → F3 MERGE |
| `FORMALIZE_ORGANIZATION` | DEFERRED_UNSUPPORTED |
| `ENCAPSULATE_RUNTIME_SCOPE` | DEFERRED_UNSUPPORTED |
| `COLLAPSE_RUNTIME_STRUCTURE` | DEFERRED_UNSUPPORTED |
| `DISSOLVE_OR_RETIRE_CANDIDATE` | DEFERRED_UNSUPPORTED |

`unsupported` never silently becomes `NO_CHANGE`.

## J0-Q7 — FORMALIZE via coalition authoring?

`materializeOrganizationFromCoalition` is pure and provenance-only; it does not create an
Organization. A Dynamics proposal lacks the full mission/role/norm/assignment structure, and
peer sets must never auto-become an Organization. **Deferred** (carry-forward) until a real
formalization authoring use case exists.

## J0-Q8 — RuntimeScope structural proposals?

`ENCAPSULATE_RUNTIME_SCOPE` / `COLLAPSE_RUNTIME_STRUCTURE` have no typed structural mutation
candidate or safety semantics. **Deferred**; J does not refactor H.

## J0-Q9 — Campaign activity observation (close CF-I-02)

Add a read-only, `known/unknown/error`-disciplined `CampaignActivityObservation` port:
campaign exists, lifecycle, basis head, semantic event count, active commitment count,
active watch count, in-flight wake. Counts are mechanical facts — never value/health, and
inactivity never becomes dissolution authority (`dormant ≠ dead`). No Campaign/Wake change.

## J0-Q10 — Minimum governance chain

- **Standalone**: fresh Proposal → Candidate → F3 admissible → evolution authority authorized
  → F3 activation → post-change observation.
- **Institution-governed**: … → authority → org candidate revision activated → F5 transition
  proposal → current-charter approvals → new epoch adopts the successor → post-observation.

## Decisions summary

Evolution Compiler is an untrusted host-injected port producing a complete F3-typed candidate.
One shared proposal-freshness evaluator (G10-I) + a candidate-freshness evaluator bound to exact
source refs. Authority is an independent admission seam (≠ continuation/effect authority).
Institution governance reuses F5 (`proposeTransition`/`approve*`/`advance`). A derived-identity
Evolution Case store provides continuity. Source organizations remain immutable historical
artifacts. No mutation happens without a fresh candidate, an admissible assessment, and an
explicit authorized outcome.

No stop condition applies: UAS-1 is unchanged, the dynamics layer stays non-mutating, evolution
authority stays distinct from continuation/effect authority, F3 obligations are reused
unchanged, and multi-store consistency is an honest idempotent saga.
