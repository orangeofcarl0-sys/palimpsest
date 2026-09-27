# E0 — External Archetype Mapping

**Status:** E0-E draft
**Baseline:** `main @ 9ec76ff2657706386d4cfd3e64eff60fd716d604`

External architecture = **evidence / archetype / falsification test**. It is **not** a schema source.
This document records the disposition of each archetype. It does **not** import, copy or paraphrase any
external survey into production code.

### Two external evidence categories

| category | sources | what it tests |
|---|---|---|
| **FRAMEWORK / SYSTEM ARCHETYPE EVIDENCE** | Grok Bot / Heavy / Build · Kimi · Manus · Danus · OpenManus · Magentic · DSH Agent Team · Anthropic orchestrator-worker | **representability** |
| **ENTERPRISE TRAJECTORY EVIDENCE** | Anthropic engineering · JPMorganChase · Microsoft · McKinsey · BCG / MIT SMR · Deloitte · IBM · AWS · Google Cloud · Accenture · OpenAI · Morgan Stanley · Goldman Sachs | **selection pressure** |

Neither is converted into schema. See `PALIMPSEST-MARKET-ARCHITECTURE-POSITION.md` for the enterprise
trajectory analysis; this document covers representability.

### Evidence grades

| grade | meaning |
|---|---|
| **REPO-ARTIFACT-VERIFIED** | asserted by current source/tests in this repository |
| **EXTERNAL-SURVEY-VERIFIED** | from a project external research artifact, supplied out-of-repository |
| **DOCUMENTED** | written in a design record, not independently re-verified |
| **INFERRED** | reasoned, not verified in either source |

Both external research artifacts live **outside this repository** and were **not independently re-read in
this execution**. External-system claims are therefore reported as **supplied-research / INFERRED** and
are **not invented or reconstructed** here. Palimpsest claims are REPO-ARTIFACT-VERIFIED; DSH
host-bundle claims are REPO-ARTIFACT-VERIFIED against `host/dsh/lib/*.js`.

---

## 1. Frozen dispositions

### Grok Heavy [INF]
```
→ maps to ReasoningCell / ephemeral branches
→ NO new ontology
```
REPO-ARTIFACT-VERIFIED on the Palimpsest side: `reasoning_cell` is literally *"frozen accepted frontier →
independent local branches → structured candidates → verification → SEPARATE epistemic admission →
composable accepted frontier"*; `branch_execution.ts` states a branch *"creates NO PeerRef and NO
PersistentPoint"* and owns no admission authority. **FULLY_REPRESENTABLE.** Durable member identity,
Organization, membership, assignment and Project truth are all **not** required.

### Grok Build / Kimi Swarm [INF]
```
→ host / runtime / recipe execution topology
→ NO new canonical ontology
```
Fan-out, workflow DAGs, budgeting and concurrency are host-scheduler concerns; the recipe plane is
explicitly *"descriptive … owns no store"*. Durable project knowledge is not a first-class output of
these systems.

### Manus [INF]
```
→ context / run-management pattern
→ persistent file ≠ governed project asset
```
Maps to `ExecutionWorld` + `ContextManifest` + host bookkeeping. It solves long-run **context
management**, not admitted-asset reuse; a scratchpad file carries no verification, admission or
provenance and cannot be *selected* into a future worker's starting state.

### Magentic [INF]
```
→ run / task management-state feedback
→ run-local replanning ≠ durable Project intent evolution
```
Ledger/progress/replanning is management state, not knowledge capital. It confirms that run-local
replanning is **crowded and solved**, and that durable intent evolution (**G-12**) remains open.

### Danus [INF] — strongest evidence
```
→ strongest evidence for admitted knowledge accumulation
→ validates the G-5 boundary
→ FactGraph must NOT be copied
```
Its chain (candidate → verification → **fact admission** → dependency → **revocation** → future-worker
consumption) is structurally corroborated by Palimpsest's own reasoning plane, which has the same shape
**including revocation** — but whose *consumption* half is severed at G-5. Danus therefore corroborates
G-5 as a genuine capability boundary. Its asset model covers **facts**, not project intent,
requirements, decisions, artifacts, failures, organization, world OCC or stale-result continuation —
so `Danus = domain-specific admitted intellectual asset system` while
`Palimpsest = project-wide governed intellectual production system`.

### DSH Agent Team [INF; host bundle REPO-ARTIFACT-VERIFIED]
```
→ product / runtime collaboration profile
→ current semantics largely representable
→ does NOT justify Team / Member / Assignment ontology
```
REPO-ARTIFACT-VERIFIED: this repository's DSH bundle injects
`['agents','sessions','agentDefaultModel','palimpsestStartup','palimpsestHost']` — **no team service**.
Every proposed feature maps onto existing owners: member addressing → `PeerRef`; durable mailbox →
coordination store + `inboxView`/`threadView` + transport cursor; shared task coordination → canonical
Work; continuity → `PersistentPoint` + `RuntimeAttachment` + `agents.resume()`; lateral communication →
`sendMessage`; lifecycle → `RuntimeScope` / `OrganizationDefinition`.

**Residual: G-4 only** (the governed `PeerRef ↔ PersistentPoint` binding). And a team's task status is a
runtime/product view that must **not** be copied into canonical semantics (`HostJobState ≠ AttemptState`).

### Anthropic orchestrator-worker / OpenAI handoff [DOCUMENTED]
```
→ host orchestration patterns; representable in the recipe/host planes
→ no canonical semantic requirement
```

---

## 1bis. Enterprise trajectory dispositions

These are **selection-pressure** observations, not representability tests. None creates ontology.

| concern | disposition |
|---|---|
| **Runtime abstraction** — Session / Harness / Sandbox / runtime / identity / policy / observability | **Host / platform infrastructure.** Not pulled into canonical ontology merely because enterprise systems require it. Models remain **replaceable cognitive executors** (`AgentDefinition ≠ Activation`; the carrier is host-owned). |
| **Producer / judge separation** — Planner / Generator / Evaluator | Reinforces `Producer ≠ Judge ≠ Admission`. Already expressed: `project_verification` (independent runs), `proof_asset` (publication decision), `reasoning_cell` (separate epistemic admission). **No new ontology.** |
| **Agent marketplace / registry** — owner, version, permissions, validation, duplication, maintenance | Real concerns, but the registry object is primarily the **Agent/runtime deployment artifact**. **No Palimpsest `AgentRegistry`.** |
| **Artifact coordination** — `Agent A → persistent Artifact ← Agent B`, lightweight refs exchanged | Supports **shared object > repeated natural-language relay**. Supporting evidence for future **G-11** analysis only; **`Artifact ≠ Fulfillment`** must not be inferred. |
| **Persistent memory / skill / procedure** | See the Constitution §3.1: **procedural capital** is a separate class and is registered as audit candidate **G-16**, not implemented. |
| **Orchestration & workflow tooling** | Host/runtime/recipe plane; already representable. |

---

## 2. Cross-archetype findings

| finding | detail |
|---|---|
| **No new-owner requirement** | No archetype exposed a durable invariant Palimpsest cannot express with existing owners. |
| **No constitution stop triggered** | No archetype required `Message = Evidence`, `Commitment = Work assignment`, `Team = Organization`, `Branch = durable Agent`, `PeerRef = effect authority`, `ReasoningClaim = Project truth`, or `ArchitectureRecommendation = Organization mutation command`. |
| **Two proposed edges falsified** | `Commitment → Work execution` and `ArchitectureRecommendation → OrganizationDynamicsProposal` were withdrawn as `WRONG EDGE`. |
| **Two niches remain open** | Knowledge inheritance (**G-5**) and evidence→intent revision (**G-12**) are not solved by any surveyed system. |
| **One recurring pattern** | E1-K, E1-I and G-11 all need a *typed canonical reference position* — the same pattern, deliberately **not** the same domain type. |
