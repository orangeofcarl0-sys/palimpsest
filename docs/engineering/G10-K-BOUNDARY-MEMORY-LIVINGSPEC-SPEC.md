# G10-K — Collaborative Boundary Memory & LivingSpec (Spec)

Baseline: `main @ 67b29c9`. Status: implemented; see
`docs/engineering/audits/G10-K-BOUNDARY-MEMORY-DELIVERY.md`.

## Mission

> Make long-lived peer collaboration share durable boundary state without collapsing
> conversation, agreement, commitment, evidence, or organization.

## Invariants

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

No second truth store; no new global planner/manager; no effect authority; Scheduler and
federation runtime unaffected; UAS-2 not published.

## Semantics

```text
BoundaryWorkspace  →  BoundaryArtifact  →  CandidateRevision  →  explicit acceptance  →  AcceptedRevision
```

- **BoundaryWorkspace** — explicit, stable, long-lived shared-boundary locus. Opened explicitly,
  never derived from a Thread/Commitment/Coalition. `participants` is an N-peer fixed canonical set
  (≥ 2) in v1. Lifecycle: `OPEN → CLOSED` (history preserved; never deletes commitments/organizations).
- **BoundaryArtifact** — a workspace-local stable topic with an extensible
  `BoundaryArtifactTypeRef { typeId, version }`. Artifact identity ≠ candidate digest ≠ accepted revision.
- **CandidateRevision** — `{ workspaceId, artifactId, type, base, content, contentDigest, author,
  requiredAcceptors, intent, digest }`. Immutable, deep-frozen, digest-identified, bound to an exact
  accepted base (`null` only for the first revision). Candidates branch; never last-write-wins.
- **AcceptedRevision** — created only when EVERY required acceptor accepts while the base is still the
  current head. Head advancement is atomic with the final acceptance. Prior revisions become
  historical/superseded, never deleted.

### Acceptance

Acceptance means only: the accepting peer agrees to treat the candidate as the current shared
boundary state. In v1 only JOINT-accepted artifacts are supported: `requiredAcceptors` is an explicit
canonical subset of participants and must include at least one peer other than the author, so an
author can never accept on behalf of another. Remote acceptance requires an authenticated peer
(`authenticatedPeer`); local acceptance derives the configured `localPeer`. Rejection is a legitimate
terminal outcome for that candidate.

### Artifact types

The kernel strictly validates the envelope; a `BoundaryArtifactTypeRegistry` validates type-specific
content. Unknown type fails closed (`unknown_type`). Builtin (default, not exhaustive): 
`boundary.statement.v1`, `boundary.interface.v1`, `boundary.compatibility.v1`,
`boundary.organization-blueprint.v1`. Content references are typed (`organization | runtime_scope |
campaign | evidence | commitment`) — provenance/linkage, never authority.

### Store

`SqliteBoundaryMemoryStore` — Palimpsest-owned append-only history at
`$DSH_HOME/palimpsest/boundary_memory.sqlite`. Per-workspace seq + chain digest, CAS-guarded
`appendAtomic`, idempotent retry (all-present identical → success; partial → `recovery_required`;
conflict → `event_conflict`; stale → `basis_mismatch`). Strict write/read parsing; corrupt history
fails closed. It owns only workspace definitions, candidate history, acceptance/rejection history, and
accepted-revision lineage.

### Commitment binding

`CommitmentScope` gains `{ kind: "boundary_revision", revision: AcceptedBoundaryRevisionRef }`. Only an
exact ACCEPTED revision is representable (a candidate cannot be a scope). Verification is fail-closed
through a host-injected `CommitmentScopeGuard`; without it, a boundary scope is refused
(`unverified_scope`). Artifact supersession never changes a commitment's lifecycle.

### Governed formalization (CF-J-02)

```text
accepted organization-blueprint.v1 revision (workspace/artifact-scoped)
 + fresh FORMALIZE_ORGANIZATION Dynamics proposal (prospective target organization subject)
 + untrusted OrganizationFormalizationCompilerPort → complete CompleteFormalizationCandidate
 + independent OrganizationEvolutionAdmissionPort
 → OrganizationStore genesis (revision 0)
```

- The blueprint reuses the OrganizationDefinition typed parsers/validators verbatim (no weakened schema).
- The candidate's organization content must be **digest-identical** to the accepted blueprint:
  missing roles/norms/assignments can never be inferred.
- `BoundaryAcceptance ≠ EvolutionAuthority`; denial writes nothing.
- Genesis auto-creates NO Institution, RuntimeScope, or Campaign.
- A rich workspace with no FORMALIZE proposal never formalizes (`LivingSpec richness ≠ should formalize`).

## Agent-facing surface

`openWorkspace · closeWorkspace · createArtifact · proposeRevision · acceptRevision · rejectRevision ·
currentAccepted · pendingCandidates · workspaceView · changesSince · acceptedBlueprint ·
admitBoundaryRevisionScope`.

`installed.boundaryMemory` is present iff a `boundaryMemoryStore` + `localPeer` are supplied (never
stubbed); Boundary Memory is exported from `advanced` only, never the root contract core, and never
through `ProjectController` (it is not Work).
