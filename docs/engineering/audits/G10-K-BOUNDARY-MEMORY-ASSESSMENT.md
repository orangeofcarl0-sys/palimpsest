# G10-K Boundary Memory & LivingSpec — K0 Current-State Assessment

Baseline audited: `orangeofcarl0-sys/palimpsest` `main @ 67b29c9`.
Read: `UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE-v1.md`, G10-E/F/I/J campaign specs,
`G10-J-CARRY-FORWARD.md`, and `src/{federation,coordination,organization,organization_dynamics,organization_evolution,runtime_scope,campaign}/**`,
`src/install.ts`, `src/advanced.ts`.

## 1. What exists today (and its exact owner)

| Concept | Artifact / owner | Non-equivalence already enforced |
|---|---|---|
| Peer identity | `federation/peer.ts` `PeerRef` | `PeerRef ≠ transport address ≠ authority root` |
| Conversation | `federation/messages.ts` `PeerMessage` (body = string) | `Message ≠ Commitment ≠ Evidence` |
| Agreement / responsibility | `federation/commitment.ts` `CommitmentOffer` + `coordination/store.ts` events | `Commitment ≠ Participation ≠ assignment` |
| Formal structure | `organization/definition.ts` `OrganizationDefinition` (immutable, revisioned) | `Organization ≠ Coalition ≠ WorkGraph ≠ RuntimeScope` |
| Runtime organization | `runtime_scope/*` `RuntimeScopeDefinition` + derived `HolonView` | `RuntimeScope ≠ organization`; Holon is a view |
| Observation/diagnosis/proposal | `organization_dynamics/*` (non-canonical, zero mutation authority) | `Observation ≠ Diagnosis ≠ Proposal` |
| Governed evolution | `organization_evolution/*` (append-only case store, authority seam) | `Proposal ≠ Candidate ≠ Authority ≠ Activation` |

**The gap.** There is no canonical owner of a durable, versioned, multi-peer *shared
boundary state* — requirements, constraints, interfaces, compatibility claims,
assumptions, decisions, open questions, organization-authoring blueprints. Today such
content can only live as `PeerMessage.body` strings (conversation), as a
`CommitmentTerms.statement` digest (responsibility), or as an
`OrganizationDefinition` (already-canonical structure). None is a substitute:
conversation is not shared state, commitment is not joint recognition, and an
organization is exactly what has *not* yet been agreed.

Storage ownership check: `CoordinationStore` owns interaction/commitment history;
`OrganizationStore` owns immutable organization revisions; `RuntimeScopeStore` owns
runtime organization; `CampaignStore` owns campaign time. **None may own shared
boundary state without collapsing a frozen non-equivalence.**

## 2. K0 decisions

### K0-Q1 — Boundary Memory is a new canonical semantic truth species: YES
Accepted shared boundary state needs stable identity, version lineage, explicit
acceptance, conflict/staleness, restart, and durability. `ThreadView` reconstruction
cannot supply acceptance or lineage. It therefore gets its own canonical history.
`Conversation ≠ SharedBoundaryState`; `Thread ≠ BoundaryWorkspace`.

### K0-Q2 — Store ownership: new Palimpsest-owned append-only `BoundaryMemoryStore`
`$DSH_HOME/palimpsest/boundary_memory.sqlite`. Rationale: coordination history owns
interaction/commitment; boundary memory owns shared collaboration state. A
derived-only projection is rejected (no durable identity/acceptance). Thread history
as canonical spec is forbidden.

### K0-Q3 — `BoundaryWorkspaceId` is a genuine new stable identity
Explicitly opened (never auto-created from Thread/Commitment/Coalition). Distinct from
`ThreadId`, `ContactNeedId`, `CommitmentId`, `OrganizationDefinitionId`, `CampaignId`,
`RuntimeScopeId`. NOT derived from a peer-pair digest — the same peer pair may hold
several independent workspaces.

### K0-Q4 — Participant model: N fixed participants in v1
`participants` is an explicit canonical set, ≥ 2, sorted, duplicate-free, immutable
after open. Dynamic membership is deferred (trigger: a real multi-party case needing
admission/removal governance) — no half-implemented add/remove API is exposed.

### K0-Q5 — Artifact type extensibility: `BoundaryArtifactTypeRef { typeId, version }` + registry port
The kernel strictly validates the envelope; a host-injected
`BoundaryArtifactTypeRegistry` validates type-specific content. Unknown type fails
closed (`unknown_type`). Never `type: string, payload: any`; never a frozen closed
taxonomy. Builtin types are provided as a *default registry*, not a completeness claim.

### K0-Q6 — Acceptance meaning (frozen)
Acceptance means only: the accepting peer agrees to treat this candidate as the
current shared boundary state. It is NOT truth, evidence sufficiency, implementation
completion, responsibility commitment, effect authority, or organization membership.

### K0-Q7 — Candidates branch; never last-write-wins
A candidate is bound to an exact accepted base (`null` only for the first revision of
an artifact). Concurrent candidates from the same base coexist. When one is accepted,
the others become `STALE` against the new head but their history is retained. No
auto-merge.

### K0-Q8 — Acceptance policy: explicit `requiredAcceptors`, all required must accept
No majority vote, no hidden default authority. `requiredAcceptors` is an explicit
non-empty canonical subset of participants. **v1 supports only joint-accepted
artifacts**: at least one required acceptor must differ from the author, so an author
can never unilaterally accept on behalf of another peer. Single-party authoritative
records are a different standing and are not modeled here.

### K0-Q9 — Commitment binding: new `CommitmentScope` variant `boundary_revision`
`{ kind: "boundary_revision", revision: AcceptedBoundaryRevisionRef }`. Only an exact
**accepted** revision is representable (a candidate cannot be a commitment scope).
Verification is a fail-closed guard port supplied by boundary memory; without it a
`boundary_revision` scope is refused (`unverified_scope`). Artifact supersession never
auto-changes a commitment's lifecycle.

### K0-Q10 — FORMALIZE_ORGANIZATION becomes executable through the G10-J path
`accepted OrganizationBlueprint` + `fresh FORMALIZE DynamicsProposal` + complete
formalization candidate + `OrganizationEvolutionAdmissionPort` → `OrganizationStore`
genesis (revision 0). `Workspace exists ≠ organization exists`; accepted blueprint
causes **zero** canonical organization writes. The blueprint reuses
`OrganizationDefinition` typed parsers/validators — no weakened role/norm schema. The
formalization candidate must reproduce the blueprint content exactly (digest equality),
proving the untrusted compiler invents no roles/norms/assignments.

Minimal integration chosen (spec §32/§56): additive extension of `OrganizationEvolution`
with a separate strict formalization candidate artifact (`FORMALIZE` target kind), a
`OrganizationFormalizationCompilerPort`, and a read-only
`OrganizationFormalizationBoundaryPort`. No second governance store.

**Subject decision.** G10-I's `DynamicsSubject` is `organization | runtime_scope`. A
BoundaryWorkspace is neither. The minimal, non-rebasing choice is: a FORMALIZE proposal
names the *prospective target organization* as
`{ kind: "organization", organization: { organizationDefinitionId, revision: 0, digest } }`,
where `digest` is the accepted blueprint's organization content digest. Freshness of the
proposal's basis therefore remains stable across genesis (no head → head with the same
digest). Blueprint freshness and target-id availability are verified independently by the
formalization branch (spec §34). A first-class `boundary_workspace` dynamics subject is
deferred (CF-K-01).

## 3. Red lines preserved

```text
Conversation ≠ SharedBoundaryState        Message ≠ BoundaryArtifact
Ack ≠ BoundaryAcceptance                  BoundaryAcceptance ≠ Commitment
BoundaryAcceptance ≠ Evidence             BoundaryAcceptance ≠ TruthVerification
BoundaryAcceptance ≠ AuthorityGrant       BoundaryAcceptance ≠ Organization membership
BoundaryArtifact ≠ OrganizationDefinition BoundaryWorkspace ≠ Organization/Coalition/Thread/Campaign/WorkGraph
CandidateRevision ≠ AcceptedRevision      SupersededRevision ≠ DeletedHistory
author ≠ unilateral acceptor for others   workspace participant ≠ authority root
LivingSpec ≠ task list / transcript / evidence DB / universal graph
```

No `ProjectController.boundarySpec`; Boundary Memory is not Work. No WorkGraph
mutation, no Scheduler awareness, no Ordarium effect authority, no global manager.

## 4. Frozen-contract impact

None. UAS-1/BIND-1/AGT-0/PAG-0 and G10-E/F/H/I/J non-equivalences are untouched;
changes are additive (new scope variant, new disposition value, new event types, new
subject-free formalization path). No semantic rebase is required.

## 5. CF-J disposition (detail in `G10-K-J-CARRY-FORWARD-DISPOSITION.md`)

```text
CF-J-01 Organization-level campaign association     STILL_DEFERRED_WITH_CONCRETE_TRIGGER
CF-J-02 FORMALIZE_ORGANIZATION                      CLOSED_IN_K
CF-J-03 RuntimeScope structural kinds               STILL_DEFERRED_WITH_CONCRETE_TRIGGER
CF-J-04 DISSOLVE / RETIRE                           STILL_DEFERRED_WITH_CONCRETE_TRIGGER
CF-J-05 Multi-institution governance                STILL_DEFERRED_WITH_CONCRETE_TRIGGER
CF-J-06 MERGE target-id reuse                       CLOSED_IN_K (target-id-free check added)
CF-J-07 Evolution store optional                    CLOSED_IN_K (install requires boundary store)
CF-J-08 Evidence port caller-supplied               REQUIRED_BUT_RESCOPED_WITH_PROOF (carried as CF-K-04)
CF-J-09 Post-observation structural only            STILL_DEFERRED_WITH_CONCRETE_TRIGGER
```
