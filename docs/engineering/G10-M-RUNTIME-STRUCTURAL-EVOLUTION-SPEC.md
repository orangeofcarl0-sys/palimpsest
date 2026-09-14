# G10-M — Runtime Structural Evolution & Retirement (Spec)

Baseline: `main @ dd38147`. Status: implemented; see
`docs/engineering/audits/G10-M-RUNTIME-STRUCTURAL-EVOLUTION-DELIVERY.md`.

## Mission

> Make runtime organization topology itself governably evolvable without collapsing runtime
> change into organization change.

```text
Fresh DynamicsProposal → Complete Runtime Candidate → Deterministic Safety Assessment
→ Independent Runtime-Structural Authority → Atomic Multi-Scope Activation → Post-Change Observation
```

Core principle:
> Internal runtime refactoring must be cheap when external contracts are preserved, but it must
> never be semantically invisible when external contracts would be destroyed.

## Firewalls

```text
RuntimeScope topology ≠ OrganizationDefinition      RuntimeScope membership ≠ Organization membership
RuntimeScope structural evolution ≠ Organization transformation
RuntimeScope close ≠ retirement   ≠ Campaign termination ≠ Activation termination ≠ Commitment release
ENCAPSULATE ≠ Organization SPLIT    COLLAPSE ≠ Organization MERGE
RuntimeStructuralAuthority ≠ RepresentationAdmission ≠ OrganizationEvolutionAuthority
                            ≠ InstitutionContinuationAuthority ≠ EffectAuthority ≠ UserFocus ≠ MainAgent
Organization retirement ≠ revision deletion ≠ empty revision ≠ Institution/Campaign termination
Retired ≠ erased   Closed ≠ retired   Inactive ≠ nonexistent
Proposal ≠ Candidate ≠ Assessment ≠ Authority ≠ Activation ≠ beneficial outcome
```

## Multi-scope atomicity (highest load-bearing invariant)

`RuntimeScopeStore.applyStructuralTransition({ expectedScopes, createScopes })` applies one
logical topology transition in ONE `BEGIN IMMEDIATE`:
- each existing scope carries an exact expected basis (drift → `basis_mismatch`);
- each new scope definition + its post-open events are created in the same transaction;
- all-present identical → idempotent; ANY partial presence → `recovery_required`;
- duplicate/conflicting `eventId` → `event_conflict`;
- each scope keeps its OWN chain — no global runtime chain.

A partial canonical forest is therefore never visible. No saga was needed, so none was built.

## Candidate vocabulary

`CompleteRuntimeEvolutionCandidate` (strict tagged union, its own digest domain):
- `ENCAPSULATE { sourceParent: {ref, basis}, newChild: RuntimeScopeDefinition, membersToMove }`
- `COLLAPSE { child: {ref, basis}, parent: {ref, basis} }`
- `RETIRE_SCOPE { scope: {ref, basis} }`

Produced by an untrusted `RuntimeStructuralEvolutionCompilerPort` (no store, authority,
activation, or effects). The compiler may not say "make a sub-scope for these things": exact
member refs, the new definition, and source bases are required and strictly parsed.

## Safety assessment (pure, deterministic)

`assessRuntimeStructuralEvolution(candidate, sources, {proposalFresh})` → obligations +
`admissible | blocked`. Obligation kinds: `proposal_freshness`, `source_basis_freshness`,
`scope_exists`, `scope_open`, `parent_relationship_current`, `member_set_exact`,
`forest_acyclic`, `single_parent_preserved`, `member_collision_absent`, `external_peer_absent`,
`boundary_absent`, `campaign_association_absent`, `new_scope_id_available`. A blocked
assessment can never be authority-overridden.

Semantics:
- **ENCAPSULATE** — exact member move; the new child inherits NO peer/boundary/organization
  basis/campaign; an internal-only change leaves the parent's external Holon digest
  byte-identical.
- **COLLAPSE** — v1 requires an OPEN child with exactly one parent, `peer === null`,
  `boundary === null`, no campaign association, and no member collision. The child survives as
  CLOSED, replayable history. External/campaign semantics are NEVER transferred to the parent.
- **RETIRE_SCOPE** — v1 requires structural emptiness (no activation/child members), no
  external surface, no campaign association, and an OPEN parent. `SCOPE_CLOSED` still means
  runtime lifecycle closure; retirement is `safe detach + close + evolution receipt`.

## Authority & case continuity

`RuntimeStructuralEvolutionAdmissionPort` answers only whether an admissible candidate may
activate. Input: proposal/candidate/assessment digests, kind, touched scopes+bases, impact.
A caller cannot supply `authorized: true`. The append-only `SqliteRuntimeEvolutionStore`
owns runtime evolution PROCESS history only (never RuntimeScope structure, Organization,
Institution, BoundaryMemory, Campaign, or Dynamics truth); case identity is derived from
`proposalDigest + candidateDigest` (same proposal + different candidate → `candidate_conflict`).

## Freshness & post-observation

The G10-I proposal freshness is reused. Immediately before the irreversible write EVERY source
scope is re-read and must be basis-identical (any drift → `stale_candidate`, zero structural
writes), and the new scope id must still be absent. After activation the Dynamics snapshot
before/after digests are recorded; `structural change activated ≠ performance improvement`.

## Organization retirement

`OrganizationLifecycle = ACTIVE | RETIRED`, append-only one-way truth in the canonical
`OrganizationStore` (`organization_retirements`). `registerRevision` on a retired lineage fails
at the STORE (`retired_lineage`); a retired lineage cannot ground a new RuntimeScope
(`organization_retired`) and cannot be newly adopted by an Institution
(`organization_retired`). The retirement assessment requires: target exists and is the current
head, proposal fresh, lifecycle ACTIVE, no current institution body references it (exhaustive
read-only enumeration, else UNRESOLVED), and no OPEN RuntimeScope grounded to it. Authority is
the SAME `OrganizationEvolutionAdmissionPort` with `kind: "RETIRE"`. History stays readable;
no Campaign is terminated.
