# Universal Agent Semantics — v1 CANDIDATE

Status: **PLMP-UAS-1-CANDIDATE · DRAFT · NOT FROZEN · NO PRODUCTION SCHEMA COMMITMENT**

Supersession note (G10-A2 freeze review, additive): this candidate was reviewed
and **superseded by `UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE-v1.md`
(PLMP-UAS-1, FROZEN)**; narrow review corrections applied here are recorded in
`G10-A2-UAS1-FREEZE-REDLINE.md`. This document is retained as the audited
candidate record.

This is a candidate semantic architecture, not a frozen specification. It
refines and extends the frozen `UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE.md`
(PLMP-UAS-0) using the G10-A0 evidence-grounded rebase and the PAL-FED-0D…0I
evidence campaign. **PLMP-UAS-0 is not edited**; this document supersedes it
only where an explicit redline decision says so
(`G10-A1-UAS-REDLINE.md`). Migration reasoning is in
`G10-A1-UAS-SEMANTIC-CONSOLIDATION.md`.

Evidence labels on new concepts:

```text
[HISTORICAL INVARIANT]     inherited from UAS-0 / frozen specs
[MACHINE-BACKED]           mechanically shown by tests/constructions
[SUPPORTED DIRECTION]      evidence-supported architecture direction
[DESIGN PROPOSAL]          a proposal; not yet evidence-backed
[OPEN]                     undecided
```

---

## 1. Model shape

The architecture is **not** a stack of layers. It is:

$$
UAS = Dimensions + ConcernDomains + Entities + Relations + Invariants
$$

- **Dimensions** answer: *what semantic/lifecycle dimension is this state about?*
- **Concern domains** answer: *what kind of system concern does this concept
  participate in?*

Dimensions are orthogonal. Concern domains are **cross-cutting**: a concern may
span several dimensions, and a dimension contains concepts from several
concerns. The relationship is a matrix, not a replacement of four dimensions by
six layers.

```text
Dimensions         (orthogonal):  Architecture | Work | Runtime | Continuity
ConcernDomains  (cross-cutting):  Definition | Identity&Continuity | Execution
                                  | Collaboration | Governance/Epistemic | Effect
```

Adjudicated explicitly: **UAS dimensions ≠ concern planes** (see
`G10-A1-UAS-SEMANTIC-CONSOLIDATION.md` §3). G10-A0's six "planes" are retained
as **concern domains**, not as a new dimension set.

---

## 2. Dimensions (orthogonal)

| Dimension | Question it answers | Primary concepts |
|---|---|---|
| **Architecture** | what is declared/invariant by design? | `ArchitectureDefinition`, `AgentDefinition`, policies, profiles |
| **Work** | what execution-bearing work is structured? | `WorkDefinition`, `WorkUnit`/task, dependencies, `WorkGraph` |
| **Runtime** | what is executing now? | Runtime Agent, `Session`, `Activation`, `Attempt`, `ExecutionPlan` |
| **Continuity** | what persists across time and carrier replacement? | `PersistentPoint`, long-lived context, lifecycle continuity |

`Architecture ≠ Work ≠ Runtime ≠ Continuity` `[HISTORICAL INVARIANT]` (UAS-0 §2).

---

## 3. Concern domains (cross-cutting)

| Concern domain | Scope | Typical dimensions crossed |
|---|---|---|
| **Definition** | declarative specification of architecture and work; `BindingDefinition` is the declarative binding seam | primarily Architecture and Work; `BindingDefinition` spans Architecture/Work/Runtime/Continuity |
| **Identity & Continuity** | stable identity, locality, long-lived history | Continuity (binds Architecture/Runtime carriers) |
| **Execution** | carriers, activations, attempts, invocations, plans | Runtime (binds Architecture and Work) |
| **Collaboration** | boundary events, delivery, derived history, emergent relations | Continuity, Runtime, Work, Architecture policy |
| **Governance / Epistemic** | reports, evidence, candidate conclusions, admission, verification, abstention | Work, Runtime, Continuity, Architecture policy |
| **Effect** | effect admission, authority for effects, receipts, CAS/idempotency | external boundary (Ordarium) |

**Naming collision resolved.** UAS-0's dimension is **Continuity**; the
G10-A0 concern plane is renamed **Identity & Continuity** so the two are never
confused. The dimension answers "is this state about persistence across time?";
the concern domain groups the identity/continuity concepts and their bindings.

The effect concern is an **external responsibility boundary** (Ordarium), not a
Palimpsest agent plane.

---

## 4. Dimension × concern matrix (candidate)

`•` primary placement; `◦` participates / binds; blank = not applicable.

| Concept | Arch | Work | Runtime | Continuity | Concern domain |
|---|:--:|:--:|:--:|:--:|---|
| `ArchitectureDefinition` | • | | | | Definition |
| `AgentDefinition` | • | | | | Definition |
| `WorkDefinition` | | • | | | Definition |
| `BindingDefinition` | ◦ | ◦ | ◦ | ◦ | Definition (seam) |
| `RunConfiguration` | ◦ | ◦ | | | Definition |
| `RunDefinition` | • | • | | | Definition (composite) |
| `PersistentPoint` | | | ◦ | • | Identity & Continuity |
| `PeerRef` (candidate) | | | ◦ | ◦ | Identity & Continuity / Collaboration |
| Runtime Agent | | | • | | Execution |
| `Session` | | | • | ◦ | Execution |
| `Activation` | ◦ | | • | | Execution |
| `Attempt` | | ◦ | • | | Execution |
| `ExecutionPlan` (derived) | ◦ | ◦ | • | | Execution |
| `WorkGraph` | | • | | | Work |
| Organization graph | ◦ | | | • | Identity & Continuity (future) |
| Collaboration relation / event | | ◦ | ◦ | ◦ | Collaboration |
| `Thread` (derived) | | | | | Collaboration |
| `WorkerReport` | | ◦ | • | | Governance/Epistemic |
| `Evidence` | | ◦ | ◦ | ◦ | Governance/Epistemic |
| `CandidateConclusion` | | ◦ | | | Governance/Epistemic |
| `AdmissionDecision` | ◦ | | ◦ | | Governance/Epistemic |
| `EffectReceipt` | | ◦ | ◦ | | Effect (Ordarium) |

No cell implies implementation. Blank/`◦` cells are semantic participation, not
schema.

---

## 5. Candidate entity table

| Entity | Dimension(s) | Concern | Status | Identity semantics |
|---|---|---|---|---|
| `ArchitectureDefinition` | Architecture | Definition | canonical candidate | independent identity (not `definition_id`) |
| `AgentDefinition` | Architecture | Definition | canonical candidate | independent identity namespace |
| `WorkDefinition` | Work | Definition | canonical candidate | independent identity |
| `WorkUnit` / task | Work | Definition/Execution | current (partial) | `task_id` runtime entity; `definition_id` = Work/Task lineage |
| `BindingDefinition` | Arch/Work/Runtime/Continuity | Definition | OPEN schema | binds logical to concrete |
| `RunConfiguration` | Arch/Work | Definition | current (partial) | run-scoped |
| `RunDefinition` | Architecture+Work | Definition | composite | `ArchitectureDefinition + WorkDefinition + BindingDefinition + RunConfiguration` |
| `PersistentPoint` | Continuity | Identity & Continuity | NEW distinction, no schema | stable durable locus identity; independent of runtime carrier |
| `PeerRef` | Continuity/Runtime | Identity & Continuity / Collaboration | experimental; relation to PersistentPoint OPEN | collaboration-facing address |
| Runtime Agent | Runtime | Execution | current (DSH-owned) | DSH runtime identity |
| `Session` | Runtime | Execution | current (DSH-owned) | DSH session identity |
| `Activation` | Runtime | Execution | UAS-0 concept | AgentDefinition → Activation |
| `Attempt` | Runtime/Work | Execution | current (partial) | WorkUnit → Attempt |
| `ExecutionPlan` | Runtime | Execution | derived | compiled from RunDefinition |
| `CollaborationEvent` / candidate `BoundaryEvent` | Arch/Work/Runtime/Continuity | Collaboration | experimental direction | immutable event identity |
| `Thread` | — | Collaboration | derived view | `View(CollaborationEvents)`; never canonical |
| `Evidence` | Work/Runtime/Continuity | Governance | OPEN schema | evidence identity |
| `WorkerReport` | Runtime | Governance | observed | a report, **not** evidence |
| `CandidateConclusion` | Work/Runtime | Governance | OPEN | candidate, not accepted |
| `AdmissionDecision` | Architecture/Runtime | Governance | OPEN (experimental instrument only) | policy outcome |
| `VerificationResult` | — | Governance | OPEN | not designed here |
| `EffectReceipt` | Work/Runtime | Effect | Ordarium-owned | effect receipt identity |

---

## 6. Candidate relations

`CURRENT` = exists in the current system; `FUTURE/OPEN` = not decided.

| Relation | Status |
|---|---|
| `AgentDefinition` activates as `Activation` | current (UAS-0) |
| `WorkUnit` executes as `Attempt` | current (UAS-0) |
| `Activation` participates in `Attempt` via Invocation/Participation | **OPEN** |
| Definition binds to PersistentPoint | **OPEN** (Binding is the likely seam) |
| PersistentPoint carried by Runtime Agent | **OPEN** (carrier ≠ identity) |
| Runtime Agent associated with Session | current (DSH) |
| PersistentPoint collaborates with PersistentPoint | supported direction |
| CollaborationEvent belongs to a derived thread projection | supported |
| WorkerReport references an Attempt | supported |
| Evidence supports a Claim/Conclusion | **OPEN** |
| AdmissionDecision evaluates a CandidateConclusion | OPEN (semantic distinction only) |
| EffectReceipt records an effect result | Ordarium-owned |

---

## 7. Non-equivalence table (central artifact)

```text
Architecture ≠ Work ≠ Runtime ≠ Continuity

AgentDefinition ≠ WorkDefinition / TaskDefinition
AgentDefinition ≠ PersistentPoint
PersistentPoint ≠ RuntimeAgent
RuntimeAgent ≠ Session

Activation ≠ Attempt
Invocation / Participation relation model = INTENTIONALLY OPEN

PeerRef ≠ runtime identity (DshAgentId / DshSessionId)

WorkGraph ≠ OrganizationGraph
WorkGraph ≠ CollaborationGraph
OrganizationGraph ≠ CollaborationGraph

WorkerReport ≠ Evidence
CollaborationEvent ≠ Evidence

PolicyAdmission ≠ TruthVerification
EpistemicAdmission ≠ EffectAdmission

UserFocus ≠ AuthorityRoot
Wake ≠ Ack
Attention ≠ Collaboration

Ownership ≠ ContactNeed
Conversation ≠ Agreement
Assignment ≠ Commitment
Handoff ≠ ordinary collaboration event

Unresolved ≠ execution failure / tool error / cancellation
Canvas/View ≠ CanonicalTruth
```

Each row's provenance and status are in `G10-A1-UAS-REDLINE.md`.

---

## 8. Graph species and canonicality

| Graph | Horizon | Canonicality candidate | Notes |
|---|---|---|---|
| Architecture/System | future | definition state | open schema; not a runtime persistent-point graph |
| Work | current | canonical work definition | current `AgentGraph v1` lives here |
| Organization | future | mixed/open | hierarchy is one relation class; **not** derived from user focus |
| Collaboration | experimental | mostly derived candidate | runtime edges may emerge; declared relations possible |
| Evidence/Governance | future | open | a semantic concern, **not** automatically a graph database |

Shared renderer/layout/selection/interaction is allowed; a shared **truth store**
is not. `Canvas/View ≠ CanonicalTruth` remains a key constraint. This table
exists specifically to prevent a "five graph databases" architecture.

---

## 9. PersistentPoint formalization

$$
PersistentPoint \neq AgentDefinition \neq Activation \neq RuntimeAgent \neq Session
$$

A `PersistentPoint` is a **durable operational locus** that can possess: stable
identity, workspace/locality, long-lived context/history, authority locality,
collaboration continuity, lifecycle continuity. `[MACHINE-BACKED]` for the
carrier separation (PAL-FED-0D); `[SUPPORTED DIRECTION]` for the concept.

- It is **not necessarily** an `AgentDefinition` instance. A future system may
  bind `AgentDefinition ↔ PersistentPoint`, but cardinality and lifecycle
  remain **OPEN** (one definition → several points? one point → definition
  revision over time? a point surviving carrier replacement?).
- It belongs fundamentally to the **Continuity** dimension and the **Identity &
  Continuity** concern.
- No TypeScript shape is frozen.

### PeerRef vs PersistentPoint

`PeerRef ≠ DshAgentId ≠ DshSessionId` is `[MACHINE-BACKED]` (PAL-FED-0D).
Whether `PeerRef` and a `PersistentPointId` must be separate types is **not**
established by that evidence. Decision:

```text
C. remain OPEN
```

Lean (not decided): option **B** — `PeerRef` as a separate collaboration-facing
relation/address identity bound to a `PersistentPoint` — because collaboration
addressing may exist without, or in multiplicity over, a persistent point. Option
**A** (PeerRef is the collaboration-facing identifier of a PersistentPoint)
remains viable if addressing is strictly one-to-one. Multiplicity/aliasing
evidence is absent; this is a formalization question for the freeze review.

---

## 10. Invocation / Participation — the question, not a forced closure

The relation zone between `AgentActivation`, `Attempt`, `Invocation`,
`Participation`, and `Session` is **OPEN**. Candidate readings to test:

```text
Invocation:    one request that causes a runtime actor to perform cognition/action?
Participation: a relation between an Activation and an Attempt?
Session:       runtime-carrier continuity, not a work or activation identity?
```

Do **not** solve this by choosing a convenient parent-child tree. `Activation ≠
Attempt` holds; the linking relation is exactly what remains to be formalized.

---

## 11. Cross-cutting concern formalizations

- **Epistemic vs effect admission.** `EpistemicAdmission ≠ EffectAdmission`.
  Palimpsest owns epistemic/governance semantics; Ordarium remains effect
  authority. The gate experiment required no Ordarium change
  (`[MACHINE-BACKED]` for that boundary); the ownership split itself is
  `[SUPPORTED ARCHITECTURAL BOUNDARY]`, not pure machine fact.
- **Admission vs verification.** `PolicyAdmission ≠ TruthVerification`.
  Verification policy (deterministic test, checker, witness, measurement,
  authority approval, composite) is **OPEN**; do not design a universal engine.
- **Abstention.** `Unresolved` is a first-class, legitimate epistemic outcome,
  semantically distinct from execution failure, tool error, or cancellation.
  Storage representation **OPEN**.
- **WorkerReport / Evidence / Claim.** `WorkerReport ≠ Evidence` and
  `CollaborationEvent ≠ Evidence`. A report/event may contain claims, reference
  evidence, or trigger verification, but is not automatically accepted evidence.
  Candidate knowledge stages: report/claim → evidence linkage → candidate
  conclusion → policy admission → optional verification → accepted
  knowledge/state; canonical representation **OPEN**.
- **Authority and capability.** `Knowledge ≠ Authority`,
  `Competence ≠ AuthorityGrant`,
  `ImplementationState ≠ CommitmentAuthority`. Keep `Competence`,
  `RuntimeFeature`, `AuthorityGrant` distinct; do not collapse into one
  `capabilities[]`. Authority representation (registry/capability/policy/grant/
  ownership) is **OPEN**; no `AuthorityRegistry` here.
- **Conversation / agreement / assignment.** `Conversation ≠ Agreement`,
  `Assignment ≠ Commitment`. `BoundaryContract` remains optional/deferred.
  Peer sovereignty: a cross-peer request does not imply subordinate ownership.
- **Handoff.** `Handoff` = session/responsibility ownership transition, not an
  ordinary collaboration event.
- **Attention.** `Attention ≠ Collaboration`, `Wake ≠ Ack`. Attention scheduling
  (which persistent point should wake/reason) is a distinct future concern from
  task scheduling (what work is runnable). The experimental polling watcher is
  an existence proof, not the design.

---

## 12. Minimal Persistent Peer Core and rejected core

### 12.1 Minimal Persistent Peer Core (semantic candidate)

| Element | Status |
|---|---|
| stable collaboration identity (`PeerRef`) | supported |
| runtime carrier separation | machine-backed |
| workspace / locality | supported |
| authority locality | supported / conceptual |
| local evidence access | supported |
| immutable boundary events | experimental direction |
| durable delivery / replay | mechanically demonstrated |
| attention / wake | mechanically demonstrated |
| derived conversation/history projection | mechanically demonstrated |

This tuple is **not** one frozen entity schema.

### 12.2 Explicitly excluded from the core

`BoundaryContract`; the 8-kind `CollaborationEvent` ontology; a mandatory
`Thread` entity; a central manager; a global planner; a shared WorkGraph; a
production `decision_submit`; a global provenance sidecar; an authority
registry; a verification engine; an automatic conflict detector. Negative
evidence stays visible.

### 12.3 Optional layers

Optional collaboration layer (commitments, contracts, negotiation, structured
organizational memory); governance layer (epistemic admission, verification
policy, evidence handling); future organization layer (groups, holons, dynamic
discovery).

---

## 13. Candidate invariants

Each maps to UAS-0, G10-A0 or PAL-FED evidence; none is invented for symmetry.

| Invariant | Statement | Provenance | Label |
|---|---|---|---|
| `UAS1-CAND-INV-01` | `Architecture ≠ Work ≠ Runtime ≠ Continuity` | UAS-0 §2 | HISTORICAL INVARIANT |
| `UAS1-CAND-INV-02` | `AgentDefinition ≠ WorkDefinition/TaskDefinition` | UAS-0 UA-INV-1 | HISTORICAL INVARIANT |
| `UAS1-CAND-INV-03` | `AgentDefinition ≠ PersistentPoint` | G10-A0 / PAL-FED-0D | SUPPORTED ARCHITECTURAL DISTINCTION |
| `UAS1-CAND-INV-04` | `PersistentPoint ≠ RuntimeAgent` and `PersistentPoint ≠ Session` | PAL-FED-0D machine tests (carrier/identity split) + architecture decision | SUPPORTED ARCHITECTURAL DISTINCTION (machine-backed for carrier/identity; the PersistentPoint reading is an architecture decision) |
| `UAS1-CAND-INV-05` | `Activation ≠ Attempt` | UAS-0 UA-INV-3 / UAS-D-INV-5 | HISTORICAL INVARIANT |
| `UAS1-CAND-INV-06` | peer identity ≠ runtime session identity | PAL-FED-0D machine tests | MACHINE-BACKED |
| `UAS1-CAND-INV-07` | `UserFocus ≠ AuthorityRoot` | G10-A0 supported | SUPPORTED DIRECTION |
| `UAS1-CAND-INV-08` | `WorkGraph ≠ OrganizationGraph ≠ CollaborationGraph` | UAS-0 SystemGraph≠WorkGraph + PAL-FED-0/0D | SUPPORTED DIRECTION |
| `UAS1-CAND-INV-09` | `WorkerReport ≠ Evidence`; `CollaborationEvent ≠ Evidence` | PAL-FED-0I + construction | EVIDENCE-GROUNDED ARCHITECTURAL INVARIANT |
| `UAS1-CAND-INV-10` | `PolicyAdmission ≠ TruthVerification` | PAL-FED-0I observed | SUPPORTED DIRECTION |
| `UAS1-CAND-INV-11` | `EpistemicAdmission ≠ EffectAdmission` | PAL-FED-0I machine-backed boundary | MACHINE-BACKED ARCHITECTURAL DISTINCTION |
| `UAS1-CAND-INV-12` | `Wake ≠ Ack`; `Attention ≠ Collaboration` | PAL-FED-0D machine tests (wake/ack); architecture decision (attention/collaboration) | SPLIT IN FREEZE REVIEW: `Wake ≠ Ack` MACHINE-BACKED; `Attention ≠ Collaboration` SUPPORTED ARCHITECTURAL BOUNDARY |
| `UAS1-CAND-INV-13` | `Conversation ≠ Agreement`; `Assignment ≠ Commitment` | PAL-FED-0/0D + construction | SUPPORTED DIRECTION |
| `UAS1-CAND-INV-14` | `Unresolved` is a legitimate epistemic outcome | PAL-FED-0I observed | SUPPORTED DIRECTION |
| `UAS1-CAND-INV-15` | `Canvas/View ≠ CanonicalTruth` | UAS-0 / specs 17/21/32 | HISTORICAL INVARIANT |
| `UAS1-CAND-INV-16` | current `definition_id` = Work/Task lineage; never reinterpreted in place | spec 30 / 32 | HISTORICAL INVARIANT |
| `UAS1-CAND-INV-17` | current `AgentGraph v1` = WorkGraph/task-bearing | spec 32 §5 | HISTORICAL INVARIANT |

Dynamic runtime entities must not silently rewrite a definition graph
(UAS-0 UA-INV-4) remains in force unedited.

---

## 14. Design heuristics (explicitly not invariants)

```text
HEUR-1  Never create another durable agent unless the boundary itself has
        engineering value (workspace locality, authority separation, failure
        containment, independent lifecycle, evidence independence, resource
        ownership, persistent context).
HEUR-2  Prefer local authoritative evidence before cross-peer contact.
HEUR-3  Prefer event-driven collaboration semantics over chat/status polling as
        the semantic model (the 2 s polling is transport, not semantics).
```

These are `[DESIGN PROPOSAL]` heuristics. They are not elevated to universal
invariants: PAL-FED showed contact-policy sensitivity and local-resolution
tradeoffs, so neither is a law.

---

## 15. Responsibility boundary

| Concern | Palimpsest | DSH | Ordarium |
|---|---|---|---|
| persistent semantic identity | ✓ | runtime carrier only | no |
| model invocation loop | no | ✓ | no |
| session/runtime lifecycle | semantic binding only | ✓ | no |
| collaboration semantics | ✓ | transport/wake support | durable substrate |
| epistemic governance | ✓ candidate | cognition | no |
| effect admission | policy consumes result | no | ✓ |
| CAS / idempotency / fencing | no | no | ✓ |

Do not overstate current implementation: the "✓ candidate" cells are semantic
responsibilities, not shipped modules.

---

## 16. Candidate data flow (CURRENT vs FUTURE/OPEN)

```text
ArchitectureDefinition + WorkDefinition + BindingDefinition + RunConfiguration
        ↓                                   [CURRENT, partial]
derived ExecutionPlan                        [CURRENT, partial]
        ↓
Runtime carriers / Activations / Attempts    [CURRENT]
        ↓
Worker reports / collaboration events        [CURRENT experimental]
        ↓
Evidence / candidate conclusions             [FUTURE/OPEN]
        ↓
Epistemic governance / admission             [FUTURE/OPEN]
        ↓
accepted system knowledge/state              [FUTURE/OPEN]
        ↓
optional effect request                      [CURRENT on Ordarium side]
        ↓
Ordarium effect admission / receipt          [CURRENT, Ordarium-owned]
```

This pipeline is **not** fully implemented. Epistemic admission is not moved
into the scheduler: the scheduler answers "what work may run?", not "what claim
is true?".

---

## 17. Open questions

```text
automatic conflict detection
verification policy / admission of verified knowledge
authority representation
production epistemic-admission interface
production provenance schema
organization-memory schema
Invocation / Participation model
PeerRef ↔ PersistentPoint cardinality and type separation
Binding schema (definition ↔ persistent point ↔ runtime/provider/resource)
typed patch unions (System/Work/Binding/Organization)
dynamic agent promotion workflow
dynamic peer discovery / N-peer federation
group / Holon realization
attention-scheduler design
commitment-protocol semantics
```

Automatic conflict detection stays fully OPEN (0I used
`conflictDetection="oracle_fixture"`; no `ConflictDetector` exists).

---

## 18. Freeze readiness and recommendation

Freeze-readiness criteria (§90) are met at the *candidate*
level: dimensions vs concern domains are unambiguous; identities are not
overloaded; `definition_id` and `AgentGraph` semantics are intact;
PersistentPoint is not conflated with runtime identity; admission is not
conflated with verification; authority is not conflated with competence;
organization/collaboration graphs are not conflated with WorkGraph;
experimental mechanisms are not promoted; all OPEN questions are explicit.

Status: **PLMP-UAS-1-CANDIDATE · READY FOR FREEZE REVIEW**. Not frozen. The
recommended next stage is **A. UAS-1 formal freeze review** (see
`G10-A1-DELIVERY.md`).
