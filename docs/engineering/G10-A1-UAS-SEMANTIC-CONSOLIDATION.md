# G10-A1 — UAS Semantic Consolidation Memo

Status: **DRAFT · NOT FROZEN · NO PRODUCTION SCHEMA COMMITMENT**

This memo is the migration/reasoning history behind the candidate
`UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE-v1-CANDIDATE.md`. It records what UAS-0
said, what G10-A0 added, and what G10-A1 preserves, refines, supersedes, or
leaves open. The redline matrix (`G10-A1-UAS-REDLINE.md`) is the per-principle
companion.

---

## 1. What UAS-0 (frozen) said

`docs/engineering/UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE.md` (PLMP-UAS-0)
froze:

- four orthogonal dimensions `Architecture ≠ Work ≠ Runtime ≠ Continuity` (§2);
- `AgentDefinition ≠ TaskDefinition` (UA-INV-1) and `Definition ≠ Activation`
  (UA-INV-3), with UA-INV-1..14;
- Definition / Runtime / Trace three-graph separation (§5);
- orchestration as strategy, scheduler not the runtime definition (§11);
- Channel / Context / State as explicit semantic axes (§8/§9/§10);
- ArchitectureProfile + fidelity, ForeignRuntimeHolon, ArchitectureRequirements
  and constrained synthesis (§13–§17);
- AGT-0/PAG-0 as cited constraints: five objects, four relations, five planes,
  execution-ownership layering, `Campaign ≠ Project`,
  `EvidenceHistory ≠ CurrentBeliefState`, six-plane separation;
- Palimpsest as a short-horizon execution engine; Ordarium keeps effect
  authority (UA-INV-13).

UAS-0 remains the audit baseline and is **not edited**.

## 2. What G10-A0 added

The G10-A0 evidence-grounded rebase (`G10-A0-EVIDENCE-GROUNDED-SEMANTIC-REBASE.md`,
`G10-A0-EVIDENCE-MATRIX.md`) added, from PAL-FED-0D…0I evidence:

- a set of **cross-cutting concern domains** (Definition, Continuity, Execution,
  Collaboration, Governance/Epistemic, Effect);
- the `PersistentPoint` continuity distinction and the
  `PeerRef ≠ DshAgentId ≠ DshSessionId` machine-backed split;
- the epistemic admission distinctions (`WorkerReport ≠ Evidence`,
  `PolicyAdmission ≠ TruthVerification`, `EpistemicAdmission ≠ EffectAdmission`,
  abstention legitimacy);
- graph-species separation (`WorkGraph ≠ OrganizationGraph ≠ CollaborationGraph`);
- `UserFocus ≠ AuthorityRoot`;
- demotion of `BoundaryContract`, the 8-kind event taxonomy, canonical `Thread`,
  the §41 criterion and structured-provenance metadata;
- explicit OPEN problems (conflict detection, verification, authority
  representation, provenance schema, organization memory).

G10-A1's job is to make those additions **coherent with** the four UAS-0
dimensions, not to replace them.

## 3. Central adjudication: dimensions vs concern domains

**Decision: `UAS dimensions ≠ concern planes`.** The six G10-A0 "planes" are
retained as **concern domains**, not as a new dimension set. Replacing four
orthogonal dimensions with six layers would be semantically wrong because the
concerns have different natures:

- Dimensions are **orthogonal** and answer "what lifecycle/semantic dimension is
  this state about?".
- Concern domains are **cross-cutting** and answer "what kind of system concern
  does this concept participate in?". Each concern spans multiple dimensions:

| Concern | Crosses |
|---|---|
| Definition | Architecture, Work (with `BindingDefinition` as the declarative binding seam spanning Architecture/Work/Runtime/Continuity) |
| Identity & Continuity | Continuity (binds Architecture/Runtime carriers) |
| Execution | Runtime (binds Architecture and Work) |
| Collaboration | Continuity, Runtime, Work, Architecture policy |
| Governance/Epistemic | Work, Runtime, Continuity, Architecture policy |
| Effect | external Ordarium boundary |

Therefore the model is `Dimensions × ConcernDomains`, a matrix, not
`Layer₁ → Layer₂ → …`. "Definition" is **not** a replacement for Architecture:
it contains architecture, work and binding concepts. Collaboration is **not** a
fifth dimension: it binds continuity, runtime and work.

## 4. Continuity naming collision

UAS-0's dimension **Continuity** and G10-A0's concern plane **Continuity**
overlapped in language. Resolution: keep the dimension `Continuity`; rename the
concern domain to **`Identity & Continuity`**. The dimension is the orthogonal
lifecycle axis; the concern domain groups the identity/continuity concepts and
their bindings to definitions and runtime carriers. This resolves the collision
without dropping either concept.

## 5. What G10-A1 preserves / refines / supersedes / leaves open

### Preserved (no contradiction found)
- `Architecture ≠ Work ≠ Runtime ≠ Continuity`.
- `AgentDefinition ≠ TaskDefinition`; `Definition ≠ Activation`.
- current `AgentGraph v1` = task-bearing WorkGraph; current `definition_id` =
  Work/Task lineage.
- `RunDefinition = ArchitectureDefinition + WorkDefinition + BindingDefinition +
  RunConfiguration`.
- `Activation ↔ WorkUnit → Attempt` orthogonality with Invocation/Participation
  as the relation zone.
- Definition/Runtime/Trace separation; scheduler purity; `Canvas/View ≠
  CanonicalTruth`; Ordarium effect authority; DSH runtime substrate.

### Refined
- UAS-0's "Continuity" dimension gains a first-class concept,
  `PersistentPoint`, formalized as *not* `AgentDefinition`, `Activation`,
  Runtime Agent or Session.
- The AGT/PAG planes are re-read as **concern domains** cross-cutting UAS
  dimensions, rather than as a competing stack.
- `BindingDefinition` is elevated as the likely seam between declarative
  architecture and durable/runtime reality (see §7).
- Evidence labels for the epistemic/effect boundary are tightened (§8).

### Superseded
- Only the label "plane/layer" for the six concerns is superseded (replaced by
  "concern domain"). No UAS-0 invariant is superseded; no semantic assumption of
  UAS-0 is contradicted by the evidence.

### Open
- `Invocation`/`Participation` model; `PeerRef ↔ PersistentPoint` cardinality
  and type separation; conflict detection; verification policy; authority
  representation; production admission interface; provenance/org-memory schema;
  Binding schema; typed patch unions; dynamic promotion/discovery; Holon
  realization; attention scheduling; commitment semantics.

## 6. PeerRef ↔ PersistentPoint decision

PAL-FED-0D proves `PeerRef ≠ DshAgentId ≠ DshSessionId` but does **not**
establish whether `PeerRef` and a `PersistentPointId` must be separate types.
G10-A1 therefore decides **C — remain OPEN**, with an explicit lean (option B:
`PeerRef` as a separate collaboration-facing address bound to a PersistentPoint)
recorded but not adopted. Choosing A or B now would be driven by the
experimental implementation rather than by evidence; multiplicity/aliasing
evidence is absent. This is a formalization question for the freeze review.

## 7. RunDefinition and the Binding seam

`RunDefinition = ArchitectureDefinition + WorkDefinition + BindingDefinition +
RunConfiguration` is preserved. `PersistentPoint` is **not** inserted into
`RunDefinition` without analysis. Candidate relationship: `BindingDefinition`
binds logical architecture to existing/new PersistentPoints and runtime resources
(provider/model/tools/workspace). This is `[DESIGN PROPOSAL]`, not frozen fact.
G10 evidence strengthens Binding because the definition↔persistent-point↔runtime
mapping is exactly where the evidence campaign kept locating the boundary; but no
schema is frozen.

## 8. Evidence-label tightening

G10-A0's matrix used `[MACHINE]` broadly. G10-A1 splits it where machine evidence
supports only part of a distinction while the architectural promotion is a
judgment:

```text
[MACHINE-BACKED]                      a test/construction proves the mechanism
[MACHINE-BACKED ARCHITECTURAL         machine evidence supports the boundary,
 DISTINCTION]                         but owning it a particular way is a decision
[SUPPORTED ARCHITECTURAL BOUNDARY]    converging design/evidence, not machine fact
[HISTORICAL INVARIANT]                inherited from UAS-0 / frozen specs
[SUPPORTED DIRECTION]                 evidence-supported direction
[DESIGN PROPOSAL] / [OPEN]            proposal / undecided
```

Applied examples: `PersistentPoint ≠ RuntimeAgent` is `[MACHINE-BACKED]` for the
carrier separation; `EpistemicAdmission ≠ EffectAdmission` is
`[MACHINE-BACKED ARCHITECTURAL DISTINCTION]` (0I's gate required no Ordarium
change) with the Palimpsest/Odarium ownership split labelled
`[SUPPORTED ARCHITECTURAL BOUNDARY]`, **not** pure machine fact.

## 9. AGT / PAG audit

- **Group vs PersistentPoint.** AGT's `VisualGroup`/`Organization`/`Coalition`
  are **plural** organization concepts; `PersistentPoint` is an **individual**
  durable locus. Do not collapse Group into PersistentPoint.
- **Holon.** AGT's Holon ("internally plural, externally unitary") remains an
  open recursive organization concept; do not derive a Holon from every group,
  and do not freeze `ProjectCell`.
- **RuntimeScope.** Retained separately from PersistentPoint, Group and
  WorkGraph. Its relation to orchestration policy is **OPEN**; do not
  prematurely bind it to organization.
- **PAG continuity.** PAG's persistent identity / memory / campaign continuity /
  institutional continuity is **broader** than a single PersistentPoint:
  `Campaign ≠ Project` and `EvidenceHistory ≠ CurrentBeliefState` remain cited
  constraints. PersistentPoint is the individual continuity locus; PAG operates
  above it. Do not duplicate one continuity concept under multiple names.

## 10. Three multi-agent forms (preserved)

```text
1. Persistent federated peers      — durable independent loci (locality/authority/lifecycle)
2. Collaborative reasoning cells    — Danus-like parallel cognition over shared accepted state
3. Internal agent acceleration      — subagents/branches/search/TPS within one locus
```

Do not collapse all three into "multi-agent". An ephemeral runtime actor does not
automatically become a PersistentPoint; promotion must be explicit and its
workflow is OPEN.

## 11. What must remain impossible to collapse

```text
definition into runtime
work into organization
identity into session
focus into authority
report into evidence
admission into truth
collaboration into assignment
epistemic governance into effect authority
```

These are the semantic failure modes the candidate is designed to prevent. They
are enforced by the non-equivalence table and the candidate invariants, not by
production code in this batch.
