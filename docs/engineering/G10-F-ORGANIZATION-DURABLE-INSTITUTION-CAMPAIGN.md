# G10-F — Organization, Coalition & Durable Institution Campaign

Campaign: **Organization, Coalition & Durable Institution Grounding**
Coordination Integrity → Coalition → Organization → Typed Transformation →
Institutional Continuity → AGT × PAG

Baseline at campaign start: `main` @ `6afa292`
(G10-E PARTICIPATION & FEDERATED WORKFORCE CAMPAIGN: PASS).

Frozen semantic/theoretical baselines (unmodified by this campaign):

```text
PLMP-UAS-1   FROZEN · CANONICAL
PLMP-BIND-1  FROZEN · CANONICAL
PLMP-AGT-0   FROZEN · THEORETICAL BASELINE
PLMP-PAG-0   FROZEN · THEORETICAL BASELINE
```

---

## 1. Stage topology (§182)

| Stage | Branch | Focus | Deliverable docs |
| ----- | ------ | ----- | ---------------- |
| F0 | `experiment/g10-f0-coordination-integrity` | coordination durability closure + AGT/PAG inventory | G10-F0-COORDINATION-INTEGRITY, G10-F0-EVENT-PARSER-AUDIT, G10-F0-AGT-PAG-PRODUCTION-MAPPING |
| F1 | `experiment/g10-f1-coalition-grounding` | formal Coalition | G10-F1-COALITION, -COALITION-PROVENANCE, -CONTRACT-COVERAGE, -DELIVERY |
| F2 | `experiment/g10-f2-organization-grounding` | OrganizationDefinition + lineage store | G10-F2-ORGANIZATION, -IDENTITY, -ROLE-NORM-CAPABILITY-BOUNDARIES, -STORE, -DELIVERY |
| F3 | `experiment/g10-f3-organization-transformations` | REVISE/SPLIT/MERGE + proof obligations | G10-F3-ORGANIZATION-TRANSFORMATION, -SPLIT-INTERFACE-SYNTHESIS, -MERGE, -PROOF-OBLIGATIONS, -DELIVERY |
| F4 | `experiment/g10-f4-durable-institution-kernel` | institution continuity kernel | G10-F4-DURABLE-INSTITUTION-KERNEL, -CHARTER-CONTINUATION-AUTHORITY, -INSTITUTION-EPOCHS, -IDENTITY-MATRIX, -DELIVERY |
| F5 | `experiment/g10-f5-agt-pag-integration` | AGT × PAG integration + end-to-end proofs | G10-F5-AGT-PAG-INTEGRATION, -COALITION-TO-ORGANIZATION, -INSTITUTIONAL-EVOLUTION, -NON-EQUIVALENCE-MATRIX, -DELIVERY |
| F6 | `experiment/g10-f6-organization-institution-closure` | campaign-wide review + publication | this document |

Each stage was merged normally (no squash, no force, no bypass) after its exact
final HEAD was proven green.

---

## 2. F0 durability closure (§12–§27)

The G10-E coordination substrate was hardened BEFORE any Organizational
semantics were built:

- **E-STORE-01** — `appendAtomic` + `head()`: one `BEGIN IMMEDIATE`
  transaction; `expectedHeadSeq` conditional admission; contiguous `seq`;
  ROLLBACK on any error; all-present batch idempotent; a partially-present
  declared-atomic transition fails closed (`recovery_required`).
- **E-STORE-02** — write serialization + bounded `busy_timeout`; positive
  different-event concurrent appends; contention surfaces as `database_busy`,
  never a hidden semantic retry.
- **E-PARSE-01** — complete strict artifact-parser registry for all 17 event
  types (exact + nested field rejection, stable ids, enum literals, no
  unchecked casts), run before write AND on read.
- The four-event handoff transition is now ONE atomic batch; every
  state-dependent commitment transition is head-conditional.

Verdict: `COORDINATION HISTORY INTEGRITY: PASS`.

---

## 3. AGT production coverage (§151)

| AGT object | Coverage after F |
| ---------- | ---------------- |
| `A` members | IMPLEMENTED — tagged membership (`peer` \| `agent_definition`) |
| `R` roles | IMPLEMENTED |
| `C` capability vocabulary / role requirements | IMPLEMENTED AS REQUIREMENTS |
| `ρ` role assignments | IMPLEMENTED |
| `κ` verified capability possession | **DEFERRED** (advertisements are not evidence) |
| `F` mission | MINIMAL IMPLEMENTATION |
| `N` norms | MINIMAL IMPLEMENTATION |
| `Γ` declared interaction structure | IMPLEMENTED |
| `∂` synthesized boundaries | IMPLEMENTED FOR TRANSFORMATIONS |
| `Π` routing/scheduler policy | DEFERRED (RuntimeScope concern) |
| `X` runtime internal state | DEFERRED (Runtime concern) |
| `S` full behavioral semantics | DEFERRED (Holon concern) |

## 4. PAG production coverage (§152)

| PAG object | Coverage after F |
| ---------- | ---------------- |
| stable institution identity | IMPLEMENTED |
| authorized lineage / epochs | IMPLEMENTED |
| versioned charter | IMPLEMENTED |
| continuation authority | IMPLEMENTED |
| organization-body evolution | IMPLEMENTED |
| commitment registry | EXISTING elsewhere, not institution-integrated |
| Campaigns | DEFERRED |
| `EvidenceHistory` | EXISTING elsewhere, not institution-integrated |
| `CurrentBeliefState` | DEFERRED |
| Prospective Memory / Watchers | DEFERRED |
| wake / reconciliation lifecycle | DEFERRED |
| `CampaignCompiler` | DEFERRED |

`Durable Institution Continuity Kernel ≠ complete PLMP-PAG-0 stack`.

---

## 5. Coalition semantics

A Coalition is temporary, purpose/scope-driven, derived, overlapping, and
scope-bound — NEVER membership authority and NEVER a durable organization.

`CoalitionSnapshot = { schemaVersion, scope, basis, members, sourceCommitments,
sourceParticipations, digest }`:
- no `CoalitionId` (identified by scope + basis + content digest);
- typed scope (`attempt_participation` | `contact_need`);
- `CoordinationBasisRef {throughSeq, digest}` records the history basis, so old
  snapshots are recognizably historical;
- membership only from ACTIVE commitment holders; active participations are
  recorded as provenance (Activation-anchored, no PeerRef → no member);
  messages/acks/advertisements/candidates/focus never create members;
- derivation is read-only; `CoalitionProvenanceRef` is citation only.

## 6. Organization schema

`OrganizationDefinition = { schemaVersion, organizationDefinitionId, revision,
digest, mission, members, roles, assignments, norms, interactions }` with a
tagged `OrganizationMemberRef` union, `RoleDefinition {roleId,
requiredCapabilities}`, `RoleAssignment`, `OrganizationNorm {normId, kind:
obligation|permission|prohibition, roleId, actionTag}`, and
`OrganizationInteraction {interactionId, fromRoleId, toRoleId, protocol}`.

- canonical semantic sets (order-independent, duplicates rejected);
- digest domain `palimpsest.organization-definition.v1`, content identity
  EXCLUDES id + revision;
- strict parser + deep freeze + input detachment; digest fail-closed;
- `Role ≠ Agent`; capability requirement ≠ possession; norm permission ≠ effect
  authority; declared interaction ≠ collaboration history.

## 7. Organization store

`$DSH_HOME/palimpsest/organization.sqlite` owns immutable OrganizationDefinition
revisions ONLY. Registration requires the same organization id, revision =
current-head + 1, an explicit parent ref equal to the current head, and the
caller's `expectedHeadRevision`; otherwise `head_mismatch` / `lineage_conflict`
/ `artifact_conflict`. No in-place mutation, no silent lineage fork, idempotent
retry. `registerRevisions` provides one-transaction atomic multi-registration.

## 8. Transformation semantics

`T = (r, β, χ, PO, E)` pipeline: proposal → typed candidate → structural
validation → boundary/interface synthesis → proof obligations → evidence
assessment → explicit activation → new immutable revision(s).

- `REVISE` — explicit candidate advancing the revision.
- `SPLIT = Partition + InterfaceSynthesis + InterfaceReport`; a partition alone
  is blocked; member/role/norm classification is explicit; cross-successor
  interactions become paired `OrganizationBoundaryPort`s (protocol preserved,
  directions compatible, every port traces to a source interaction, none
  invented); the interface report is descriptive, sufficiency is the hard
  obligation.
- `MERGE` — explicit role-collision decisions (`same_role` / `rename` /
  `keep_distinct`), explicit norm-conflict resolution, explicit target mission;
  never guesses, never concatenates a mission.
- `EXTRACT` / `INLINE` / `REWIRE` — DEFERRED (§76).

## 9. Proof obligations

First-class `OrganizationProofObligation {obligationId, kind, status, detail,
evidenceRefs?}` with deterministic ids. Structural obligations are
deterministically resolvable; evidence obligations are NEVER satisfied by
compilation or by governance. An unresolved obligation makes the assessment
`blocked`, and `planTransformationActivation` refuses blocked assessments.

## 10. Institution charter & continuation authority

`InstitutionCharter {schemaVersion, institutionId, revision, digest, purpose,
continuationAuthority}` — content identity excludes id/revision. The
`ContinuationAuthorityRule {authorities, requiredApprovals}` is validated
`1 ≤ requiredApprovals ≤ |unique authorities|`. Continuation authority is its
own authority domain: it grants no Ordarium effect authority and no truth
authority. The current authority controls its own successor: approvals are
counted against the head-epoch charter, so a new authority set cannot
authorize itself into existence.

## 11. Epoch lineage

`InstitutionEpoch {schemaVersion, institutionId, epoch, predecessor, charter,
organization, transition, digest}` — contiguous predecessors, no
cross-institution edges. `InstitutionEpoch ≠ Activation/Session`; an
institution exists and is readable with ZERO active runtime. The store keeps
append-only charter/epoch/transition/approval history plus a verified head
projection (a projection mismatch fails closed). Advancement is atomic and
rejects a stale base epoch. Identity survives total member replacement and
organization-body replacement under an authorized lineage.

## 12. AGT × PAG integration

```text
real collaboration → CoalitionSnapshot → (explicit authoring) OrganizationDefinition
                   → (explicit governance) Institution genesis / transition
```

Every arrow explicit; none automatic. `activateAndGovernOrganizationChange`
requires an admissible assessment before governance, then proposes an
institution transition. A split does not fork the institution; a merge does not
merge institutions. Governance approval ≠ truth verification.

## 13. Identity matrix (§170)

| Identity | Owner | Not equivalent to |
| -------- | ----- | ----------------- |
| `PeerRef` | Collaboration | org/institution/runtime |
| `AgentDefinitionId` | Architecture | role/member/peer |
| `RoleId` | Organization | agent/member/authority |
| `OrganizationDefinitionId` | Organization | coalition/institution |
| `CoalitionSnapshot` digest | derived Coalition | organization identity |
| `InstitutionId` | Institution | organization/peer/point |
| `InstitutionEpoch` | Institution lineage | runtime activation |
| `PersistentPointId` | Continuity | institution/org |
| `RuntimeAgentRef` | runtime host | institution/org |
| `SessionRef` | runtime host | epoch/institution |
| `CommitmentId` | collaboration | institutional approval |
| `InstitutionApproval` | institution governance | commitment/truth verification |

## 14. Authority matrix (§171)

| Authority | Domain | Implies nothing else |
| --------- | ------ | -------------------- |
| Organization norm permission | organizational expectation | effect authority |
| Institution continuation authority | lineage advancement | effect authority, truth |
| Work governance/policy | Work orchestration | continuation authority |
| Ordarium effect authority | effect admission | institution governance |
| Epistemic truth verification | evidence/truth | any of the above |

No automatic mapping exists between any pair (static + behavioral proofs).

## 15. Store ownership matrix (§167/§168)

| Store | Owns |
| ----- | ---- |
| Work EventStore | Work/orchestration history |
| Ordarium ledger | effect admission/operations |
| Continuity store | PersistentPoint identities |
| Coordination store | participation/collaboration/commitment history |
| Organization store | immutable Organization definitions/revisions |
| Institution store | charter/approval/epoch/institution lineage |

No overlapping truth. Physical consolidation is optional and never changes
semantic ownership.

---

## 16. Canonical checkpoints

| Stage | PR | final HEAD | merge commit | CI run | CI |
| ----- | -- | ---------- | ------------ | ------ | -- |
| F0 | #33 | `32f556d` | `ae2ca7f` | 34752355719 | success (first run) |
| F1 | #34 | `8a92ee3` | `3eb70e3` | 34752705661 | success (first run) |
| F2 | #35 | `41ac314` | `d784d2b` | 34753113196 | success (first run) |
| F3 | #36 | `65e60c0` | `c76ca63` | 34753428792 | success (first run) |
| F4 | #37 | `e649d1d` | `4cf7bdb` | 34753802125 | success (first run) |
| F5 | #38 | `4cb905a` | `ddea5ef` | 34754165413 | success (first run) |
| F6 | #39 | `03de4d6` | `3f3ab6f` | 34754382983 (PR) + 34754464524 (main) | success (first run) |

## 17. CI history and known flakes

Every stage was verified with the exact final HEAD green before merge. The
documented flaky E2E specs `E2E-DEBUG-01` and `E2E-RUNTIME-03` were exercised
locally and on CI; failures used the documented failed-job rerun protocol
(§185) — never a code change. No unclassified CI failure occurred. One
transient unit-suite flake was observed once during F5 and the suite was green
twice immediately after (recorded in G10-F5-DELIVERY).

## 18. Campaign adversarial findings

The consolidated review (`test/f6_campaign_review.test.ts`) plus per-stage
reviews found NO unresolved campaign blocker. All identified defects were
implementation issues fixed in-stage (transaction ordering, genesis
idempotency, stale-head classification, current-charter derivation from the
head epoch, merge role/norm remapping, digest determinism). The campaign
anti-patterns are absent:

```text
no coalition → organization automatic promotion
no organization = workgraph/runtimescope/holon/visualgroup
no member = owner, no manager/hierarchy
no capability claim = evidence
no norm permission = effect authority
no institution = organization revision/persistentpoint/peer/runtimeagent
no governance = truth verification
no self-authorizing continuation authority
no member replacement changing InstitutionId
no groupId/group_id collapse
no scheduler organization awareness
no mandatory persistence
```

## 19. Final verdict

```text
G10-F ORGANIZATION & DURABLE INSTITUTION CAMPAIGN: PASS
```

Organization semantics are executable. Institutional continuity semantics are
executable. A minimal AGT × PAG intersection exists. The full PLMP-PAG-0 stack
is explicitly NOT claimed.

### 19.1 Campaign final canonical gate (§189)

Recorded on canonical `main` after the F6 merge:

```text
main SHA                3f3ab6f91f3196395d687ad70fbdfa2f971d1af9
git diff --check        clean
unit                    90 files / 793 tests passed
pnpm build              PASS
pnpm build:web          PASS
e2e                     21/21 passed
canonical main CI       run 34754464524 — SUCCESS (first run)
```

All §191 PASS criteria hold: F0 coordination atomicity closed; different-event
multi-process append safe; all persisted event parsers fully strict; handoff
transition crash-atomic; Coalition formally grounded and derived/overlapping;
Coalition ≠ Organization executable; OrganizationDefinition production-realized
with independent identity/revision/digest; member identity namespaces explicit;
roles/assignments/capability-requirements production-realized; capability
advertisement ≠ truth preserved; norms production-realized; norm permission ≠
effect authority; declared interaction structure production-realized;
organization lineage store immutable; typed REVISE/SPLIT/MERGE implemented;
Split = Partition + InterfaceSynthesis + report with cross-boundary
preservation proven; merge conflict handling explicit; proof obligations
first-class and blocking; transformation proposals ≠ canonical state;
DurableInstitution identity production-realized; versioned charter; explicit
continuation authority; epoch lineage; stale approvals rejected; new authorities
cannot self-authorize; epoch transition atomic; institution identity survives
total member replacement and organization-body replacement only through
explicit authorized transition; institution exists with zero runtime;
Organization ≠ RuntimeScope/Holon; Institution ≠ PersistentPoint/RuntimeAgent/
Organization; Coalition → Organization and Organization → Institution paths
explicit only; governance ≠ truth verification; Work/runtime/federation remain
independently usable; full adversarial review complete; canonical main green.

## 20. Recommended next major campaign (§203 — NOT started)

```text
G10-G — Campaign, Epistemic Continuity & Wake Grounding
```

covering the deliberately deferred PAG dimensions: Campaign, EvidenceHistory vs
CurrentBeliefState, hypothesis branches, the institution/agent commitment
registry, epoch-spanning campaign state, Prospective Memory, Watchers, WAIT,
the DORMANT/WAKING/RECONCILING lifecycle, world reconciliation, belief
revision, and CampaignCompiler.

Alternative: `Holon / RuntimeScope grounding`, if evidence shows organizational
execution boundaries are now the highest-value missing layer. Follow evidence.
