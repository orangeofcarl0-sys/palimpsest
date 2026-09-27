# Palimpsest Project Production Loops

**Status:** E0-E draft
**Baseline:** `main @ 9ec76ff2657706386d4cfd3e64eff60fd716d604`

The frozen four-loop model. These loops are **not** redefined by later stages; E0-D and E1+ consume them.

Edge annotation vocabulary (authority direction):

| op | meaning |
|---|---|
| `READ` | consumer reads an owner's fact; creates nothing |
| `DERIVE` | pure computation to a new value; no durable write |
| `PROPOSE` | a recommendation that requires a separate admission to matter |
| `ADMIT` | a governed decision that makes something current |
| `EFFECT` | an authorized durable change |
| `PROJECT` | a derived view over owner facts |

Status vocabulary: `CLOSED` · `PARTIAL` · `MANUAL_ONLY` · `PROJECTION_ONLY` · `ABSENT`.

---

## Loop A — Work

```
Intent → Work → Attempt → Result → Verification → Promotion → Project World
```

**Status: CLOSED end-to-end.**

| edge | op | owner |
|---|---|---|
| Intent → Work declaration | `PROPOSE`→`EFFECT` | `controller.plan` / `start` → `EventStore` |
| Work → Attempt | `EFFECT` | `scheduler.decide/commit` → `ATTEMPT_CREATED` |
| Attempt → Execution world | `EFFECT` | `work/attempt_execution.prepare` → `ExecutionWorldPort` |
| Execution world → Result observation | `EFFECT` | `attempt_execution.settle` (observe→admit→export→report) |
| Result → Verification | `DERIVE` | `project_verification.verifyAttemptResult` |
| Verification → Promotion admission | `DERIVE` | `domain/assessPromotionEligibility` |
| Promotion → Project Head | `EFFECT` | `effects/promotion.PromotionManager` → `PROMOTION_COMMITTED` |
| Head → ProjectIR' | `EFFECT` | `work/head.reconcile` → `PROJECT_REVISED` |
| Concurrent attempt → OCC/conflict | `DERIVE` | `project_world` basis + serialization |
| Stale result → continuation | `PROPOSE`→`EFFECT` | `continuation/service` (D5) |

**Live-gate evidence:** D2-LIVE 15/15 · D4-LIVE 21/21 · D5-LIVE 10/10, on real DSH workers and real git.

### E's position on Loop A

**D1–D5 own its critical guarantees. E must not become a second Work kernel.**

E's only legal contact points:

```
READ    workRef            (taskId / attemptId / envelope digest)
PROPOSE a governed execution request    (still passes the D2-b precondition ladder unfiltered)
READ    resultSubjectRef
```

**Everything else in Loop A is firewalled.** In particular:

- No collaboration artifact may append a canonical Work event. REPO-ARTIFACT-VERIFIED: no file under
  `src/{federation,coordination,interaction,identity,organization,...}` imports `state/event_store`.
- Attempt identity is `(task_id, envelope_id, attempt_no)`; **no canonical Work fact names an actor**.
- `prepareMutatingWork` takes **no actor parameter**. Actor selection stays host-side via
  `deps.workerFor(worldPath)`.

---

## Loop B — Knowledge / Capitalization

```
Cognitive Labor → Candidate → Verification / Admission → Durable Asset → Future Cognition
```

**Status: production/admission CLOSED; future cognition OPEN at G-5.**

### B1 — production (CLOSED)

| sub-loop | owner | store |
|---|---|---|
| reasoning: branch → candidate → verify → **epistemic admission** → frontier | `reasoning_cell` | `reasoning_cell_events` (+`reasoning_cells`) |
| proof: source → evidence → candidate → verify → publication → assessment | `proof_asset` | `proof_events` + content-addressed blob vault |
| verification runs | `project_verification` | `project_verification_event` |
| experiment/evaluation/intervention | `organization_memory` | `organization_memory_events` |
| association + journal | `project_workspace` | `project_asset_association_events`, `project_journal_events` |

Admission is **separated from production** in both knowledge planes, and revocation exists:

- `reasoning_cell`: `CandidateStatus = PENDING | UNRESOLVED | ADMITTED | REJECTED | DEDUPLICATED`;
  `requestInvalidation` cascades through the claim dependency closure.
- `proof_asset`: `PUBLISH | REJECT | UNRESOLVED`; `effectiveStandingOf` can move to `STALE` **by
  derivation only** (never by editing a record).

### B2 — future cognition (**OPEN — G-5**)

```
admitted knowledge asset  ──────✕──────►  future ContextManifest
```

REPO-ARTIFACT-VERIFIED: `src/context/service.ts` declares only four fact inputs — `originResult`,
`evidenceBody`, `verificationHistory`, rework lineage. `ContextRequirement` has exactly
`exact | codePaths | evidenceSubjects | historical | forbiddenStale`, where `historical` is a declared V0
placeholder. `grep` for `proof_asset` / `reasoning_cell` in `context/`, `work/`, `domain/`, `state/`,
`scheduler/` returns **zero hits**.

What *does* compound today is narrow and explicitly distinct:

```
PriorResultContext       D5: a prior ATTEMPT RESULT, per rework lineage — not admitted knowledge
ProjectVerification      historical runs for one subject — never a qualification of a new attempt
canonical gate evidence  linked evidence subjects
```

**G-5 is a CAPABILITY GAP**, not a truth-owner gap: both asset owners exist and are authoritative; what
is missing is a governed *selection + binding* capability into context. `E1-K` targets this edge.

---

## Loop C — Collaboration

Two paths, with **different** semantics. They must not be merged.

### C1 — intra-project execution participation

```
Work → Attempt → host/runtime activation → optional Participation provenance → execution → Result
```

**Participation remains optional observational metadata.**

| question | answer (repo-artifact-verified) |
|---|---|
| Can Participation be recorded without changing Work authority? | **Yes** — it is a coordination-store event; the canonical Work log is untouched |
| Is a semantic primitive missing? | **No.** The primitive is complete (lifecycle, parsers, store, fail-closed admissibility read). Only its *product exposure* is missing → **G-15, PROJECTION_OR_COMPOSITION** |
| Is Participation strictly provenance? | **Yes, by its own text:** *"does NOT mean ownership, assignment, commitment to completion, authority over the Attempt, success, or evidence"* |
| Can an Attempt execute with zero Participation? | **Yes, proven** — `grep -c participation src/interaction/work_delegation.ts` = 0 |

Therefore: **`Participation → Work execution` is a WRONG EDGE.** There is none, and none should exist.

### C2 — inter-project sovereign collaboration

```
Project Reality → Need → Contact → Negotiation → Commitment / Boundary
   → remote sovereign work/cognition → Fulfillment / Contribution
   → local evaluation/adoption → local Work/Asset continuation
```

| edge | status |
|---|---|
| ProjectReality → NeedCandidate | **DERIVATION GAP (G-1)** — `declareContactNeed` is explicit-creation-only by design |
| NeedCandidate → accepted ContactNeed | **ABSENT** — no admission boundary exists |
| ContactNeed → discovery | CLOSED (`discoverContactCandidates`) |
| discovery → contact request | CLOSED (`requestContact` → `CONTACT_REQUESTED`) |
| contact → message/thread | CLOSED (coordination store; `inboxView`/`threadView`) |
| message → negotiation → Commitment | CLOSED (`offerCommitment`/`acceptCommitment`, holder-authenticated) |
| ContactNeed → scoped Commitment | **DERIVATION GAP (G-8)** — `contact_need` is a declared `CommitmentScope` kind with **no producer** |
| Commitment → remote peer's own work | **OUT OF SCOPE, correctly** — the peer's Work is the peer's canonical log |
| Peer → returned contribution | **DERIVATION GAP (G-11)** — no fulfillment concept exists |
| local evaluation/adoption of a contribution | **ABSENT** as such (the `external_assets` path is library-scoped, not peer-scoped) |

**Explicitly forbidden:**

```
Commitment      → local Work authority
Participation   → Work authority
```

`Commitment ≠ Assignment` and `Commitment ≠ Work ownership` are pinned in `src/federation/commitment.ts`.
A direct `Commitment → prepareMutatingWork()` path would violate both, plus `Remote Peer ≠ local Work
owner`.

**Accepted ContactNeed durability is a CAPABILITY GAP (G-2):** `materializeContactNeed` writes nothing;
only `CONTACT_REQUESTED{contactNeedId, from, to}` persists. Origin, competence tags and reason are lost
across a crash even though contact activity began.

---

## Loop D — Evolution

```
Reality / Assets → Observation → Diagnosis → Proposal → Governance
   → Intent / Organization / Runtime revision → New Work
```

**Three distinct branches. They must not be collapsed.**

### D1 — Organization evolution — **substantially CLOSED**

```
dynamics.observe → diagnose → propose → OrganizationEvolution → authority+governance
   → OrganizationDefinition revision
```

Freshness and authority both hold: every stage carries basis digests and returns `stale`/`raced` rather
than acting on a moved basis; the authority is an explicit install option, and unconfigured authority
yields a read-only-absent surface, never a stub. The one PARTIAL edge is `propose()`, which takes a
caller-supplied `OrganizationDynamicsAdvisorPort` with no in-tree implementer — **by design**, since
proposal synthesis is a host/model job.

### D2 — Runtime topology evolution — **substantially CLOSED**

Same shape with a **separate** vocabulary and mechanism: `ENCAPSULATE | COLLAPSE | RETIRE_SCOPE`,
deliberately never expressed as a `CompleteEvolutionCandidate`. Authority denial is a first-class
persisted state (`RUNTIME_EVOLUTION_AUTHORITY_UNRESOLVED`), so an unconfigured authority cannot be
mistaken for a grant. Activation is atomic and all-or-none across scopes.

### D3 — Project Intent evolution — **ABSENT (G-12, the largest gap)**

| bottom-up source | can it reach a revision? |
|---|---|
| `NEGATIVE_RESULT` | **NO** — only `OPPORTUNITY` is promotable, and `promoteOpportunity` refuses others |
| Proof contradiction / stale proof | **NO** — `proof_asset` is unreachable from `controller.plan` |
| Failed Attempt | **NO** — drives `TASK_STALE`/`EVIDENCE_STALE`, never intent |
| Experiment / Evaluation | **NO** — reaches the advisor (a leaf) only |
| Reasoning unresolved/invalidated | **NO** |
| Boundary conflict | **NO** |
| Journal `OPPORTUNITY` | **YES, but caller-authored** — the caller supplies the whole `TaskSpec` |

```
Observation / Evidence → ProjectIR intent revision proposal      ABSENT
```

`PlanInput.goal` and `.requirements` are caller-only, and `ProjectManagement` explicitly refuses them:
*"the management layer never changes the project goal"* / *"…never changes requirements"*. There is no
structured change-proposal type, and `PlanInput` has no evidence-reference field.

### D4 — Empirical organization learning — **ABSENT at two edges (G-14)**

```
OrganizationMemory → Advisor recommendation → ✕ → OrganizationDynamicsProposal
intervention → ✕ → proposal/evolution linkage → ✕ → later evaluation
```

REPO-ARTIFACT-VERIFIED: `organization_dynamics` does **not** import `organization_memory`; its deps are
`runtimeScopes`, `organizations`, `collaboration`, `campaignActivity`, `boundary`. The advisor reads
memory and emits **recipe plans** — a different vocabulary from `OrganizationDynamicsProposal`.

`InterventionRecord` already declares `proposalDigest?` and `evolutionCaseRef?`, and **nothing populates
them**; no producer of `recordIntervention` exists outside its own definition.

```
OrganizationMemory ≠ OrganizationDynamics
ArchitectureAdvisor ≠ OrganizationDynamicsAdvisor
```

Frozen. A future empirical seam may exist; it is **not yet proven necessary** (old G-13 is withdrawn).

---

## Cross-cutting X — continuity model

```
PeerRef        = durable collaboration identity          CLOSED
PersistentPoint = durable cognitive continuity locus
Activation     = ephemeral runtime realization           (never persisted)
```

| layer | question | status |
|---|---|---|
| A. collaboration identity continuity | can `PeerRef` remain the same collaborator? | **CLOSED** — messages/commitments/participations persist against it |
| B. identity ↔ persistent locus binding | is the peer↔`PersistentPoint` link governed? | **CAPABILITY GAP (G-4)** — source is `profile.persistentPoint` (deployment config) |
| C. persistent locus ↔ runtime activation | is the binding owned? | **CLOSED** — `RuntimeAttachment.continuityTarget` |

**Do not introduce `CollaborationMemberId`.** `PeerRef` already anchors collaboration identity, and
`manpowerPointView` deliberately creates no new id for exactly that reason.
