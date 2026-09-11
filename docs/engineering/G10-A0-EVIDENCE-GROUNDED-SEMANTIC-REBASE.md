# G10-A0 — Evidence-Grounded Semantic Rebase

Status: **DRAFT · EVIDENCE-GROUNDED · NOT UAS FROZEN · NO PRODUCTION SCHEMA COMMITMENT**

This document is the G10-A0 semantic rebase (the documentation-only pre-gate
registered in `audits/G10-G11-ROADMAP.md`, between G9-G and G10-A). It
consolidates the PAL-FED-0D…0I evidence campaign into candidate semantic
principles, and adjudicates the entity/identity/binding questions registered for
G10-A0.

It **refines and supersedes some semantic assumptions** without rewriting any
historical frozen document. `docs/engineering/UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE.md`
(PLMP-UAS-0) and the AGT-0/PAG-0 frozen specs remain the audit baseline and are
not edited. Where this document refines them, the refinement is stated
explicitly and UAS-0's own unedited text is cited by section.

Evidence labels used throughout (defined in `G10-A0-EVIDENCE-MATRIX.md`):

```text
[MACHINE]    mechanically proven by a test / construction / invariant
[OBSERVED]   directly observed in real runs
[STAT]       statistically supported, with the stated limits
[SUPPORTED]  supported by converging evidence, not a single hard result
[OPEN]       not established; unresolved
[REJECTED]   evidence argues against promoting it
```

Language note: PAL-FED reports are in English; this memo follows them so its
labels and citations stay literal. The frozen architecture corpus remains in its
original language and is not restated here.

---

## 0. Discipline: evidence inheritance, not code inheritance

```text
EvidenceInheritance ≠ CodeInheritance
ExperimentalMechanism ≠ CanonicalArchitecture
ObservedBehavior ≠ UniversalInvariant
```

G10-A0 is based on `main` (`59fae6e`), not on any PAL-FED branch. It consumes
the experimental branches **by reference only** (`git show`/`log`/`diff` of their
committed reports and evidence). No PAL-FED federation runtime code, type, tool,
schema or primitive is cherry-picked, copied, or silently promoted. The
experimental branches are evidence provenance, not production lineage.

The PAL-FED-0D…0I evidence campaign is complete; no PAL-FED-0J exists.

---

## 1. What the evidence campaign actually established

Each summary cites the branch, the report, and the branch tip at consumption
time. Full mapping in `G10-A0-EVIDENCE-MATRIX.md`.

### 1.1 PAL-FED-0 / 0D — a persistent peer is a real, separable identity

- A persistent peer can be realized as one DSH root Agent + Session + workspace,
  with agent-scoped tools and a watcher that wakes the Agent's inbox
  (`experiment/pal-fed-0-dsh` @ `c0718c9`, `PAL-FED-0D-DELIVERY.md`). `[MACHINE]`
- `PeerRef ≠ DshAgentId ≠ DshSessionId`: replacing or resuming the runtime
  carrier does not redefine the stable peer (`0D` machine tests). `[MACHINE]`
- Wake is not acknowledgement; a subagent does not inherit project-peer
  authority. `[MACHINE]`

### 1.2 PAL-FED-0E — a dependency criterion is not an automatic selector

- The §41 dependency criterion did **not** selectively induce useful contact;
  contact is policy-sensitive and scenario-dependent
  (`experiment/pal-fed-0e` @ `bae56f9`, `PAL-FED-0E-ANALYSIS.md`). `[REJECTED]`
  as a selector, `[STAT]` for the underlying sensitivity.

### 1.3 PAL-FED-0F — local evidence first, and its limit

- A local-first boundary criterion improved specificity at the cost of recall;
  unnecessary escalation stayed near zero (`experiment/pal-fed-0f` @ `d1bb38c`,
  `PAL-FED-0F-ANALYSIS.md`). `[STAT]`
- It surfaced the distinction `EvidenceExists ≠ EvidenceSufficient`. `[OPEN]`
  for production sufficiency semantics.

### 1.4 PAL-FED-0G — evaluator ground truth is itself an assumption

- A "prompt-only" conflict treatment did not lift outcomes (ceiling,
  underpowered) (`experiment/pal-fed-0g` @ `b310f96`, `PAL-FED-0G-ANALYSIS.md`).
  `[STAT]`
- More importantly, 0H re-audited 0G's C-class ground truth and **withdrew the
  "conflict/provenance is the surviving failure" interpretation**: the labeled
  case was locally resolvable (`PAL-FED-0G-C-REAUDIT.md`). `[MACHINE]` audit.
  Therefore: `EvaluatorAssumption ≠ CanonicalTruth`.

### 1.5 PAL-FED-0H — local adjudication works; structured provenance did not

- V/L specificity 100%; a locally resolvable conflict can legitimately be
  settled by version/temporal scope, explicit supersession, or a valid local
  precedence rule (`experiment/pal-fed-0h` @ `d75b59b`, `PAL-FED-0H-ANALYSIS.md`).
  `[STAT]`, `[OBSERVED]`
- A model-visible structured-provenance sidecar added **no** value over the prose
  criterion (H2−H1 lift 0.00) and irreducible conflicts still collapsed silently
  at high rates. `[REJECTED]` in the tested form.
- A mechanical ground-truth linter was required before runs (`0H` validator).

### 1.6 PAL-FED-0I — governance can induce recovery; admission is not truth

- A deterministic admission gate that refuses an unsupported resolved conclusion
  is implementable without any Ordarium primitive; ticket state is a pure
  **projection** of frozen ground truth + durable events + an append-only attempt
  log (`experiment/pal-fed-0i` @ closure `b4a0334`, `PAL-FED-0I-ANALYSIS.md`).
  `[MACHINE]`
- One-shot epistemic intervention induced behavioural recovery in **9/9** tested
  I runs (contact or abstain) vs 1/9 in pass-through. `[STAT]` in the tested
  scenario family.
- Persistent hard enforcement added **no** contact lift above the already
  saturated soft gate (A2−A1 = 0.00), but is the only arm that mechanically
  guarantees the admission invariant. `[MACHINE]` for the invariant; `[STAT]`
  for the behavioural ceiling.
- Owner participation is **insufficient** for semantic correctness: of the three
  A2 owner-participated resolved admissions, 1 was correct and 2 incorrect.
  `[OBSERVED]`; the causal question is `[OPEN]`.
- Abstention (`unresolved`) was always admissible and was reached in 44%/67% of
  I runs; no dead-ends. `[OBSERVED]`

---

## 2. Candidate semantic planes

Conceptual decomposition only — **not** packages, classes, or frozen schemas.

### A. Definition plane
`ArchitectureDefinition`, `WorkDefinition`, `BindingDefinition`,
`RunConfiguration`, `AgentDefinition`.

### B. Continuity plane
`PersistentPoint`, `PeerRef`, workspace locality, long-lived context/history,
authority locality.

### C. Execution plane
DSH Agent / runtime carrier, Session, `Activation`, `Attempt`, `Invocation`,
`Participation`.

### D. Collaboration plane
`BoundaryEvent`, inbox/delivery, derived Thread/history, runtime collaboration
relation.

### E. Governance / epistemic plane
`Evidence`, candidate conclusion, policy admission, verification policy,
abstention.

### F. Effect plane
Ordarium authority/effect admission, effect receipts, CAS/versioning/idempotency.

---

## 3. Cross-plane non-equivalences (highest-value output)

```text
AgentDefinition        ≠ PersistentPoint
PersistentPoint        ≠ DSH Agent
DSH Agent              ≠ Session
Activation             ≠ Attempt
PeerRef                ≠ runtime identity
WorkGraph              ≠ OrganizationGraph
WorkGraph              ≠ CollaborationGraph
CollaborationEvent     ≠ Evidence
Wake                   ≠ Ack
WorkerReport           ≠ Evidence
AgentConfidence        ≠ PolicyAdmissibility
PolicyAdmission        ≠ TruthVerification
EpistemicAdmission     ≠ EffectAdmission
UserFocus              ≠ AuthorityRoot
Conversation           ≠ Agreement
Assignment             ≠ Commitment
Ownership              ≠ ContactNeed
EvidenceExists         ≠ EvidenceSufficient
Conflict               ≠ AutomaticPeerContact
Unresolved             ≠ Failure
```

These preserve UAS-0's four orthogonal dimensions and `AgentDefinition ≠
TaskDefinition` (UA-INV-1/2/3), and extend them with the continuity,
collaboration and governance distinctions the PAL-FED evidence supports.

---

## 4. Adjudication of the registered G10-A0 questions

The roadmap registered a list of entity/identity/binding questions and six open
questions. Adjudication vocabulary: **PRESERVE** (keep the existing invariant),
**PROPOSE** (direction recommended, not implemented), **OPEN** (left undecided).

| Registered question | Decision | Basis |
|---|---|---|
| `SystemGraph ≠ WorkGraph` (two graph species) | **PRESERVE** | UAS-0; PAL-FED adds that neither is the Organization/Collaboration graph |
| `CanvasDoc v3` = Work authoring canvas (32 §5) | **PRESERVE** | 32; not overridden |
| current `definition_id` = Work/Task Definition identity | **PRESERVE** | REDLINE-UAS-D1; PAL-FED used distinct `PeerRef`, never that field |
| future `AgentDefinitionId` = fresh independent identity | **PRESERVE** as direction | UAS-0; not pre-empted by any field |
| `ArchitectureDefinition` / `WorkDefinition` independent | **PRESERVE** | UAS-0 §3/§19 |
| `BindingDefinition` / `RunDefinition` | **PRESERVE** | `RunDefinition = Architecture + Work + Binding + RunConfiguration` |
| `TaskGraphWork ⊂ WorkDefinition` | **PRESERVE** | 32 §5; AgentGraph ≈ TaskGraphWork |
| `Attempt vs Activation` non-parent-child | **PRESERVE** | UA-INV-3; PAL-FED adds Invocation/Participation, does not collapse them |
| `Invocation / Participation` relation | **OPEN** | question C below; only `PeerRef ≠ carrier` is settled |
| scoped orchestration `RuntimeScope → OrchestrationPolicyInstance` | **OPEN** | needs G10-C |
| `ExecutionPlan` = derived runtime compile target | **PRESERVE** | UAS-0 |

### The six open questions

- **A. Canvas split (Architecture vs Work canvas).** **PROPOSE** the two-surface
  direction (shared renderer/layout/identity substrate, separate semantic
  schemas), matching the `SystemGraph ≠ WorkGraph` split. Do not implement.
- **B. Typed patch targets** (`SystemPatch`/`WorkPatch`/`BindingPatch` on a
  shared typed engine). **PROPOSE**; current `GraphPatch` remains a **Work**
  patch and must not be reinterpreted as a universal patch. Unions stay open.
- **C. Invocation** (AgentActivation / Attempt / Invocation / Session
  intersection). **OPEN**. PAL-FED evidence supports only that
  `PeerRef ≠ DshAgentId ≠ SessionId` and that a subagent does not inherit peer
  authority; it does not define the intersection. Do not fabricate a parent/child
  relation.
- **D. Dynamic agent generation** (AgentTemplate → EphemeralAgentSpec →
  Activation, with explicit promotion into canonical `AgentDefinition`).
  **OPEN** direction: an ephemeral runtime actor does not automatically become a
  `PersistentPoint`; promotion must be explicit. Workflow stays open.
- **E. Capability vocabulary split** into competence / runtime feature / authority
  grant. **PRESERVE/PROMOTE** (already UA-INV-12 boundary); PAL-FED strengthens it
  (`Knowledge ≠ Authority`, `ImplementationState ≠ CommitmentAuthority`).
- **F. Tool/model provider binding.** **PROPOSE** separating logical need
  (`web_search`, model policy) from concrete provider via Binding; schema OPEN.

### `AgentGraph → WorkGraph` terminology

**PROPOSE** terminology-only now: keep the existing API and `definition_id`
semantics; treat current `AgentGraph` as the Work/Task-bearing graph. Any rename
or adaptation, and the introduction of separate Organization/Collaboration graph
names, is a later explicit change — not a reinterpretation in place.

### New: `PersistentPoint` as a distinction

```text
PersistentPoint ≠ AgentDefinition ≠ Activation ≠ DSHSession
```

A PersistentPoint is the durable operational locus that can possess stable
identity, workspace/locality, long-lived context/history, capabilities, an
authority boundary, inbox/collaboration history, and lifecycle continuity.
`AgentDefinition` is a declarative architecture concept; `PersistentPoint` is a
continuity/operational concept. A future design may bind them; G10-A0 does
**not** assert `PersistentPoint = AgentDefinition instance` as a universal law.

---

## 5. Minimal Persistent Peer Core vs optional layers

### 5.1 Minimal Persistent Peer Core (semantic candidate)

```text
Stable PeerRef / persistent collaboration identity
Independent runtime carrier (e.g. DSH Agent + Session)
Own workspace / locality
Own local context/history
Own authority boundary
Local evidence access
Immutable boundary-event capability
Durable delivery / replay
Attention/wake capability
Derived conversation/history projection
```

Exact TypeScript schemas are **not** frozen.

### 5.2 Explicitly excluded from the core

Not supported by evidence as mandatory minimal primitives: `BoundaryContract`;
the 8-kind `CollaborationEvent` ontology; a mandatory Thread entity; a shared
WorkGraph; a central manager; a global planner; an authority registry; a
verification engine; a global provenance schema; an automatic conflict detector.

### 5.3 Optional higher layers

- **Optional collaboration layer:** commitment protocols, contracts, negotiation,
  structured organizational memory. `BoundaryContract` becomes an *optional
  higher-level collaboration mechanism*, not minimal core; its possible future
  use (real negotiation, cross-project commitments, compatibility contracts)
  stays open. It is not deleted from experimental branches.
- **Governance layer (candidate plane):** epistemic admission, verification
  policy, evidence handling.
- **Future organization layer (open):** groups, holons, dynamic discovery,
  interest graphs.

### 5.4 Event taxonomy and Thread

- Favor a **generic immutable boundary event + optional lightweight kind +
  references/provenance** over a canonical 8-kind ontology. Do not code it yet.
- Keep `Thread = View(CollaborationEvents)`: a useful derived contextual
  projection, not foundational canonical state.

---

## 6. Demoted / rejected abstractions

```text
BoundaryContract as Minimal Core              REJECT (optional higher layer)
8-kind event taxonomy as ontology              REJECT
Thread as canonical state                      REJECT (derived view only)
§41 dependency criterion as selector           REJECT
structured provenance sidecar as cure          REJECT in tested form
owner participation as truth proof             REJECT
new Ordarium wake primitive                    NO EVIDENCE (DEFER)
central planner as default federation          REJECT as default
prompt-only conflict adjudication as sufficient REJECT
```

Principle: **do not promote an abstraction merely because experimental code for
it exists** (architecture-by-code-inertia). Negative results are architectural
input and are retained, not buried.

---

## 7. Open semantic problems

```text
automatic conflict detection
verification policy / admission of verified knowledge
authority representation (registry / capability / policy / grant)
production epistemic-admission interface
production provenance schema
organization-memory schema
dynamic peer discovery / N-peer federation
group / Holon realization
attention-scheduler implementation
commitment-protocol schema
```

G10-A0 improves boundaries without pretending these are solved.

---

## 8. Old → new vocabulary mapping

| Term | Current meaning | Dangerous overload | Recommended G10 meaning | Migration note |
|---|---|---|---|---|
| Main Agent | user-facing focal agent | boss / root authority / orchestrator / manager | current focal persistent point; user-facing focus | discourage authority reading; no rename yet |
| `definition_id` | Work/Task Definition identity | `AgentDefinitionId` / `PersistentPointId` / `PeerRef` | unchanged: Work/Task lineage | new identity ⇒ new field/type, never reinterpretation |
| AgentGraph | current task-bearing graph | AgentDefinition graph / organization graph | == TaskGraphWork ⊂ WorkDefinition | rename/adapt decided later item |
| Agent | DSH runtime actor or a person/worker | conflating runtime carrier with persistent point | context-dependent: runtime carrier vs PersistentPoint | disambiguate in text, not by field |
| worker | runtime task executor | durable peer | attempt-level executor | keep scoped |
| peer | persistent collaboration party (`PeerRef`) | DSH agent id / session id | stable persistent collaboration identity | already distinct in 0D |
| session | DSH session | the persistent peer | runtime carrier continuity | runtime-owned, not collaboration identity |
| thread | derived event view | canonical conversation state | `View(CollaborationEvents)` | never a table/state |
| contract | boundary agreement (experimental) | mandatory minimal primitive / truth | optional higher-level collaboration mechanism | demoted, not deleted |

Do not rename production fields unless a later stage requires it.

---

## 9. Design heuristics (not machine-proven)

```text
Never create another durable agent unless the boundary itself has engineering value.
```

Boundary value may be: workspace locality, authority separation, failure
containment, independent lifecycle, evidence independence, resource ownership,
persistent context. Labeled **DESIGN HEURISTIC**, not statistical proof.

Also heuristic: prefer event-driven collaboration semantics (interface changed,
evidence arrived, dependency blocked, commitment changed, assumption
invalidated) over chat/status polling as the semantic model — while the existing
mechanical polling remains transport, not collaboration semantics.

---

## 10. Responsibility boundaries

### DSH (runtime substrate)
Agent lifecycle, Session, model invocation loop, scoped tools,
wake/followup/inbox, runtime disposal/resume. Palimpsest does not duplicate
these. DSH is runtime substrate, not collaboration-semantics owner.

### Palimpsest
Persistent-point semantics, peer identity semantics, collaboration semantics,
local/peer boundary judgment, attention policy, evidence/governance policy,
organization projections, architecture adaptation. Exact modules remain open.

### Ordarium (frozen direction)
Host-neutral deterministic coordination, CAS/revisions, ordered state
observation, authority/effect admission, fencing/idempotency, effect receipts.
**Not** agent/peer semantics, task scheduler, semantic router, organization
planner, or an epistemic truth engine. No new Ordarium work in G10-A0.

```text
EpistemicAdmission ≠ EffectAdmission
```

---

## 11. Consistency audit

| Frozen source | Apparent conflict? | Resolution |
|---|---|---|
| G9 invariants (scheduler purity, event-on-commit, GraphPatch hardening) | none | preserved; G10-A0 adds no runtime |
| PLMP-UAS-0 (`Architecture ≠ Work ≠ Runtime ≠ Continuity`; UA-INV-1..14) | refines, does not contradict | UAS-0 unedited; refinements stated here; `PersistentPoint` added as continuity-plane distinction |
| AGT-0 five objects / PAG-0 five planes | compatible | PAL-FED collaboration is a runtime relation, not a merge of AGT/PAG objects |
| current scheduler semantics (`decide()` pure / `commit()` persists) | none | preserved; no business state leaks into decision purity |
| current GraphPatch semantics | none | kept Work-focused; not reinterpreted |
| `definition_id` semantics | none | preserved; not reused |
| Ordarium boundary | none | preserved; no new primitive |
| DSH boundary | none | preserved; no DSH modification |

### Contradiction audit (none may remain)

```text
owner participation verifies truth          → rejected
hard gate proven necessary                  → not claimed (behavioural ceiling)
BoundaryContract is required                → rejected
Thread is canonical                         → rejected
AgentGraph is organization graph            → rejected
Main Agent is authority root                → rejected
Ordarium owns epistemic admission           → rejected
PersistentPoint = DSH Agent                 → rejected
```

These eight statements were searched for in this document and the matrix; none
is asserted.

---

## 12. Verdict

### A. Promoted semantic distinctions

`PersistentPoint ≠ AgentDefinition ≠ Activation`; `PeerRef ≠ DshAgentId ≠
SessionId`; `UserFocus ≠ AuthorityRoot`; `LocalWorkGraph ≠ OrganizationGraph`
(and `≠ CollaborationGraph`); runtime collaboration may create relations
without a predefined edge; `Ownership ≠ ContactNeed`; local evidence before
boundary crossing; `WorkerReport ≠ Evidence`; `AgentConfidence ≠
PolicyAdmissibility`; `PolicyAdmission ≠ TruthVerification`;
`EpistemicAdmission ≠ EffectAdmission`; `Attention ≠ Collaboration`;
`Wake ≠ Ack`; `Conversation ≠ Agreement`; `Assignment ≠ Commitment`;
`Unresolved ≠ Failure` (abstention is legitimate).

Promotion here means **a distinction worth preserving**, not a finalized
production schema.

### B. Demoted / rejected abstractions

`BoundaryContract` as minimal core; the 8-kind event taxonomy as ontology;
Thread as canonical state; the §41 dependency criterion as selector; structured
provenance sidecar as a cure; owner participation as truth proof; a new Ordarium
wake primitive; central planner as default federation model.

### C. Open semantic problems

Automatic conflict detection; verification/admission of verified knowledge;
authority representation; production epistemic-admission interface; production
provenance schema; organization-memory schema; dynamic peer discovery;
group/Holon realization; attention-scheduling implementation; commitment
semantics.

### D. Implementation consequences (directional only)

- Keep the current runtime, scheduler, CanvasDoc v3, GraphPatch and
  `definition_id` semantics unchanged.
- Reserve a distinct continuity-plane concept (`PersistentPoint`) and keep peer
  identity separate from DSH runtime identity.
- Treat collaboration as an emergent runtime relation, with local-first
  boundary judgment.
- Plan for an epistemic/governance plane **distinct from** Ordarium effect
  admission; do not build it yet.
- Do not inherit any PAL-FED runtime implementation (including
  `decision_submit`, the admission gate, contracts, or event kinds).

---

## 13. Recommended next stage

Recommendation: **A. refine this semantic rebase into a later UAS revision**,
with a narrow **B** follow-up only for the single highest-value open problem
(automatic conflict detection) if a design stage is desired. Do **not** default
to coding; production epistemic admission and the entity/identity questions
above remain subject to explicit later adjudication. This document does not
freeze UAS-1.
