# Universal Agent Semantics — Architecture v1

Status: **PLMP-UAS-1 · FROZEN**

This specification supersedes `UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE.md`
(PLMP-UAS-0) as the current semantic architecture. PLMP-UAS-0 remains an
immutable historical record, as do the frozen AGT-0 and PAG-0 specifications.

Publication status: the semantic freeze decision was issued by G10-A2
(`FREEZE REVIEW: PASS`). Canonical repository adoption occurs when the approved
semantic PR stack is merged into `main`; until then this document is the frozen
semantic decision, not yet the canonical published baseline. No UAS-0 invariant
is revoked by this freeze; the freeze redline
(`G10-A2-UAS1-FREEZE-REDLINE.md`) records every decision, and provenance for
each frozen statement lives there and in `G10-A2-UAS1-FREEZE-REVIEW.md`, not in
this text. This document is readable standalone; no experiment history is
required to understand it.

Freeze scope: **semantic boundaries only**. No runtime code, schema, migration,
package boundary, persistence partition, or tool contract is frozen by this
document. A "frozen" statement here constrains semantic interpretation; it does
not assert that a component is implemented.

---

## 1. Scope and status

Universal Agent Semantics (UAS) defines the semantic vocabulary and boundaries
for systems that declare, execute, and govern durable agent work. UAS-1 freezes
the smallest set of distinctions needed to prevent the category collapses the
evidence campaign exposed (§7). Everything else remains derived, informative, a
design heuristic, or intentionally open (§14).

## 2. Model shape

```text
UAS = Dimensions + ConcernDomains + Entities + Relations + Invariants
```

Dimensions and concern domains are different kinds of classification:

- A **dimension** classifies the semantic/lifecycle position of a state or
  concept: *what is this about?*
- A **concern domain** classifies cross-cutting participation: *what kind of
  system concern does this concept take part in?*

Their relationship is a **classification matrix**, not a Cartesian runtime
structure and not a layer stack: a matrix cell may be empty, and no cell implies
an instantiated component, a persistence partition, or a package boundary.

## 3. Frozen dimensions

Four orthogonal semantic/lifecycle dimensions:

```text
Architecture   what is declared/invariant by design
Work           what execution-bearing work is structured
Runtime        what is executing now
Continuity     what persists across time and carrier replacement
```

These are the only dimensions. Concern domains (§4), graph species (§8), and
mechanisms such as Binding, Collaboration, Governance, or Effect are **not**
dimensions.

## 4. Concern domains

Six cross-cutting analytical concern domains:

```text
Definition               declarative specification of architecture and work
Identity & Continuity    stable identity, locality, long-lived history
Execution                carriers, activations, attempts, invocations, plans
Collaboration            boundary events, delivery, derived history, emergent relations
Governance / Epistemic   reports, evidence, candidate conclusions, admission, verification, abstention
Effect                   effect admission, authority for effects, receipts (Ordarium-owned)
```

Two properties are part of this freeze:

```text
ConcernDomain ≠ Dimension          a concern is not a fifth/sixth dimension
ConcernDomain ≠ CanonicalStore     a concern is not a database, partition,
                                   package boundary, or runtime layer
```

`BindingDefinition` is an entity and a seam inside the Definition concern; it is
not a dimension. The Definition concern is primarily Architecture and Work, with
`BindingDefinition` able to span Architecture/Work/Runtime/Continuity as the
declarative binding seam.

Naming: **Continuity** is the dimension; **Identity & Continuity** is the
concern domain. The frozen text never uses the two interchangeably.

## 5. Core entities

Canonical status per entity: `current` (exists today), `candidate` (semantic
commitment, not implemented), `derived` (view), `open` (undecided). No entity
here freezes a TypeScript shape, storage layout, or migration.

| Entity | Dimension | Concern | Status |
|---|---|---|---|
| `ArchitectureDefinition` | Architecture | Definition | candidate |
| `AgentDefinition` | Architecture | Definition | candidate |
| `WorkDefinition` | Work | Definition | candidate |
| `WorkUnit` / task | Work | Definition/Execution | current (partial) |
| `BindingDefinition` | spans Architecture/Work/Runtime/Continuity | Definition (seam) | open schema |
| `RunConfiguration` | Architecture/Work | Definition | current (partial) |
| `RunDefinition` | Architecture + Work | Definition (composite) | `ArchitectureDefinition + WorkDefinition + BindingDefinition + RunConfiguration` |
| `PersistentPoint` | Continuity | Identity & Continuity | candidate (§9) |
| `PeerRef` | Continuity/Runtime | Identity & Continuity / Collaboration | candidate; relation to PersistentPoint intentionally open (§9) |
| Runtime Agent | Runtime | Execution | current (DSH-owned) |
| `Session` | Runtime | Execution | current (DSH-owned) |
| `Activation` | Runtime | Execution | current concept |
| `Attempt` | Runtime/Work | Execution | current (partial) |
| `ExecutionPlan` | Runtime | Execution | derived from `RunDefinition` |
| `WorkGraph` | Work | Work | current (`AgentGraph v1`) |
| `CollaborationEvent` (candidate `BoundaryEvent`) | spans | Collaboration | experimental direction |
| `Thread` | — | Collaboration | derived view |
| `WorkerReport` | Runtime | Governance | observed concept |
| `Evidence` | spans | Governance | open schema |
| `CandidateConclusion` | Work/Runtime | Governance | open |
| `AdmissionDecision` | Architecture/Runtime | Governance | open (semantic distinction only) |
| `VerificationResult` | — | Governance | open |
| `EffectReceipt` | Work/Runtime | Effect | Ordarium-owned |

"Main Agent" is **not** a primary ontology term in UAS-1. Where legacy APIs or
docs use it, read it as *user-facing focal runtime actor* — never as authority
root, manager, or global planner.

## 6. Core relations and intentionally open relation zones

Frozen relations:

```text
AgentDefinition → Activation
WorkUnit        → Attempt
RuntimeAgent    ↔ Session           (runtime carrier, DSH-owned)
ExecutionPlan   derived from RunDefinition
Thread          = view over collaboration events
```

Intentionally open relation zones (the boundary is frozen; the internal model is
not — see §14):

```text
Activation ↔ Attempt linking via Invocation / Participation
AgentDefinition ↔ PersistentPoint binding (cardinality and lifecycle)
PeerRef ↔ PersistentPoint (identity vs address relation)
Binding schema (definition ↔ persistent point ↔ runtime provider/resource)
```

`Activation` and `Attempt` remain orthogonal identities. No parent-child
ownership tree between them is frozen, and none may be inferred from the open
relation zone.

## 7. Frozen non-equivalences / invariants

These are the frozen semantic boundaries. Each is stated as a single claim;
provenance and rationale are in the freeze redline.

### Dimensions and definitions

```text
UAS1-INV-01  Architecture ≠ Work ≠ Runtime ≠ Continuity
UAS1-INV-02  AgentDefinition ≠ WorkDefinition / TaskDefinition
UAS1-INV-03  Definition ≠ Activation
UAS1-INV-04  Activation ≠ Attempt
UAS1-INV-05  current definition_id = Work/Task lineage; it is never
             reinterpreted in place as any other identity; future identities
             (AgentDefinitionId, PersistentPointId, PeerRef,
              ArchitectureDefinitionId) require distinct fields/types
UAS1-INV-06  current AgentGraph v1 is WorkGraph / task-bearing; it is not an
             organization or collaboration graph
UAS1-INV-07  GraphPatch is a Work patch
UAS1-INV-08  Canvas/View ≠ CanonicalTruth
UAS1-INV-09  a dynamic runtime entity must not silently rewrite a Definition
             graph; promotion into canonical definitions is always explicit
```

### Identity and continuity

```text
UAS1-INV-10  PersistentPoint ≠ AgentDefinition
UAS1-INV-11  PersistentPoint ≠ RuntimeAgent; PersistentPoint ≠ Session;
             PersistentPoint ≠ Activation
UAS1-INV-12  peer collaboration identity ≠ runtime carrier/session identity
             (PeerRef ≠ DshAgentId ≠ DshSessionId)
UAS1-INV-13  Session is runtime-carrier continuity; it is not a PersistentPoint,
             Attempt, or Activation identity
UAS1-INV-14  an ephemeral runtime actor (subagent/branch) is not a
             PersistentPoint; promotion, if ever supported, is explicit
```

### Graphs, collaboration, organization

```text
UAS1-INV-15  WorkGraph ≠ OrganizationGraph; WorkGraph ≠ CollaborationGraph;
             OrganizationGraph ≠ CollaborationGraph
UAS1-INV-16  Group ≠ PersistentPoint (plural organization vs individual locus)
UAS1-INV-17  Wake ≠ Ack
UAS1-INV-18  Attention ≠ Collaboration
UAS1-INV-19  Conversation ≠ Agreement
UAS1-INV-20  Assignment ≠ Commitment
UAS1-INV-21  Handoff is a responsibility/session ownership transition, not an
             ordinary collaboration event
UAS1-INV-22  Ownership ≠ ContactNeed
```

### Governance / epistemic / effect

```text
UAS1-INV-23  WorkerReport ≠ Evidence
UAS1-INV-24  CollaborationEvent ≠ Evidence (delivery/observation of an event
             does not make its content true)
UAS1-INV-25  PolicyAdmission ≠ TruthVerification
UAS1-INV-26  EpistemicAdmission ≠ EffectAdmission
UAS1-INV-27  Unresolved is a legitimate epistemic outcome, distinct from tool
             error, attempt failure, cancellation, and timeout
UAS1-INV-28  UserFocus ≠ AuthorityRoot
UAS1-INV-29  Knowledge ≠ Authority; Competence ≠ AuthorityGrant;
             ImplementationState ≠ CommitmentAuthority
UAS1-INV-30  ConcernDomain ≠ Dimension; ConcernDomain ≠ CanonicalStore
```

Candidate knowledge stages — report/claim → evidence linkage → candidate
conclusion → policy admission → optional verification → accepted knowledge —
are informative; no canonical representation is frozen.

## 8. Graph species and canonicality

| Graph species | Horizon | Canonicality | Non-equivalence |
|---|---|---|---|
| Architecture/System | future | `FUTURE CANONICAL CANDIDATE` (declarative semantic species; no implemented canonical graph is implied) | ≠ WorkGraph; ≠ runtime persistent-point continuity |
| Work | current | `CURRENT CANONICAL` (work definition; `AgentGraph v1` lives here) | ≠ OrganizationGraph; ≠ CollaborationGraph |
| Organization | future | `MIXED / OPEN` (semantic species; hierarchy is one possible relation class, not its definition) | ≠ WorkGraph; ≠ CollaborationGraph |
| Collaboration | experimental | `DERIVED / PROJECTION` (may be partly derived from durable collaboration history; declared relations possible; no canonical adjacency store) | ≠ WorkGraph; ≠ OrganizationGraph |
| Evidence/Governance | future | `SEMANTIC ONLY` (a concern, not a graph database; no KnowledgeGraph/EvidenceGraph is frozen) | distinct concern from Work |

Multiple species may share renderer, layout engine, selection shell, and
interaction primitives. They must not share a semantic truth store
(`UAS1-INV-08`).

## 9. PersistentPoint semantics

A **PersistentPoint** is a durable operational identity/locus whose continuity is
not identical to any one runtime carrier or session. That is the frozen
definition.

The following are **possible/typical properties**, not definitional
requirements: workspace/locality; long-lived context/history; authority locality;
collaboration continuity; resource ownership. A PersistentPoint that never
collaborates need not possess peer mechanics.

Frozen distinctions: `PersistentPoint ≠ AgentDefinition` (a declarative
architecture concept vs a durable continuity/operational locus);
`PersistentPoint ≠ RuntimeAgent`; `≠ Session`; `≠ Activation`. Binding a
definition to a persistent point, and the cardinality or lifecycle of that
binding, are intentionally open.

`PeerRef`: frozen as *not* a runtime Agent/Session identity
(`UAS1-INV-12`). Whether `PeerRef` is the collaboration-facing identity of a
PersistentPoint or a separate relation/address identity bound to one is
**intentionally open**; no frozen invariant depends on choosing between them.

## 10. Governance / epistemic semantics

- **Epistemic admission** is the policy-governed decision about whether a
  candidate epistemic output may enter an accepted/system state under the
  configured policy. This is a semantic definition only: no admission API, gate
  mode, conflict ticket, or completion endpoint is frozen.
- **Verification** is distinct from admission (`UAS1-INV-25`). Its architecture
  is intentionally open (§14); no universal verification engine is frozen.
- **Unresolved** (`UAS1-INV-27`) is a legitimate epistemic status, not a failure.
- **Conflict detection** does not exist as a frozen or implemented component;
  it is intentionally open.
- **Effect admission** is separate (`UAS1-INV-26`): Ordarium owns effect
  authority/admission mechanics and effect receipts; Palimpsest may consume
  receipts. Ordarium is not a truth-verification engine and not an agent
  semantic plane.

## 11. Responsibility boundaries

Conceptual responsibility, not a claim that every responsibility is implemented:

| Concern | Palimpsest | DSH | Ordarium |
|---|---|---|---|
| persistent semantic identity | ✓ | runtime carrier only | no |
| model invocation loop | no | ✓ | no |
| session/runtime lifecycle | semantic binding only | ✓ | no |
| collaboration semantics | ✓ | transport/wake support | durable substrate |
| epistemic governance | ✓ (semantic responsibility) | cognition | no |
| effect admission | policy consumes result | no | ✓ |
| CAS / idempotency / fencing | no | no | ✓ |

DSH is the runtime substrate (agent lifecycle, session, model loop, scoped
tools, wake/followup/inbox, disposal/resume) and is not the owner of
collaboration or governance semantics. Ordarium remains host-neutral
deterministic coordination with effect authority (UA-INV-13 preserved).

The Work scheduler is untouched by governance semantics:
`Scheduler.decide()` stays pure and `Scheduler.commit()` persists the prepared
event. The scheduler answers "what work may run?", never "what claim is true?".
Attention scheduling (which persistent locus should wake/reason) is a distinct
future concern; its implementation is open, and no `AttentionScheduler` entity
is frozen.

## 12. Historical compatibility / migration constraints

The freeze preserves, without rename or reinterpretation:

```text
current definition_id        = Work/Task lineage                     (UAS1-INV-05)
current AgentGraph v1        = WorkGraph / task-bearing              (UAS1-INV-06)
current GraphPatch           = Work patch                            (UAS1-INV-07)
current CanvasDoc v3         = Work authoring surface                (UAS1-INV-08)
current scheduler invariants decide() pure / commit() persists
current DSH runtime integration and Ordarium effect boundary
```

No source/API rename is required or authorized by this freeze. Future
identities require new fields/types, never reinterpretation of existing ones.
Legacy terms (Main Agent, Agent, worker, peer, session, thread, contract,
evidence, admission) are read through §5 and the migration table in the
consolidation memo; none is silently redefined by this freeze.

## 13. Design heuristics (non-normative)

```text
HEUR-1  Never create another durable agent unless the boundary itself has
        engineering value (workspace locality, authority separation, failure
        containment, independent lifecycle, evidence independence, resource
        ownership, persistent context).
HEUR-2  Prefer local authoritative evidence before cross-peer contact; the
        existence of evidence does not establish its sufficiency.
HEUR-3  Prefer event-driven collaboration semantics over chat/status polling;
        mechanical polling is transport, not collaboration semantics.
```

These are heuristics, deliberately not invariants.

Informative taxonomy (not formal invariants): the three multi-agent forms —
persistent federated peers; collaborative reasoning cells; internal agent
acceleration — remain distinct and must not be collapsed into one "multi-agent"
notion.

## 14. Intentionally open extension points

An entry below means: the surrounding boundary is frozen, the internal
relation/model is deliberately not. None of these blocks this freeze; frozen
semantics are unambiguous without deciding them.

| Open point | Frozen surrounding boundary |
|---|---|
| `PeerRef ↔ PersistentPoint` identity-vs-address relation and cardinality | `UAS1-INV-12`; PersistentPoint ≠ runtime carrier |
| `Invocation` / `Participation` relation model | `UAS1-INV-04` (Activation ≠ Attempt) |
| `AgentDefinition ↔ PersistentPoint` binding schema | `UAS1-INV-10`; `RunDefinition` composition unchanged |
| Binding schema (provider/model/tools/workspace) | logical need ≠ concrete provider (direction) |
| Automatic conflict detection | `PolicyAdmission ≠ TruthVerification`; no ConflictDetector exists |
| Verification policy architecture | `UAS1-INV-25` |
| Authority representation (registry/capability/policy/grant/ownership) | `UAS1-INV-29` |
| Production epistemic-admission interface | `UAS1-INV-26` boundary only |
| Provenance / evidence schema | `UAS1-INV-23` / `UAS1-INV-24` |
| Organization-memory schema | distinct from raw conversation history |
| Dynamic promotion of ephemeral actors | `UAS1-INV-14` |
| Organization / Holon realization | `UAS1-INV-16`; AGT Holon stays open |
| Attention-scheduler design | `UAS1-INV-18` |
| Commitment-protocol semantics | `UAS1-INV-19` / `UAS1-INV-20` |
| Typed patch families (System/Work/Binding/Organization) | `UAS1-INV-07` |

Excluded from the frozen core (negative decisions retained): `BoundaryContract`
(optional higher-level mechanism only); the 8-kind collaboration-event taxonomy
(a generic immutable boundary event with optional lightweight classification and
references is the favored direction); `Thread` as canonical state; a central
manager or global planner; a shared WorkGraph; a production
`decision_submit`-style completion API; a global provenance sidecar; an
`AuthorityRegistry`; a verification engine; an implemented `ConflictDetector`;
any DSH mechanism (followup, polling interval), tool set, or storage layout.
