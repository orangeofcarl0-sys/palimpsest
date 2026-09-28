# Palimpsest Market & Architecture Position

**Status:** E0-E draft (descriptive — not marketing prose)
**Baseline:** `main @ 9ec76ff2657706386d4cfd3e64eff60fd716d604`

This document positions Palimpsest descriptively against external agentic architectures. It does **not**
rank systems, assign scores, or claim superiority or exclusivity, and it does **not** claim that external
systems cannot evolve after the survey dates.

---

## 0. External evidence categories (frozen)

Two external categories, both kept **separate from repo-verified facts**. Neither is a schema source.

| category | sources | what it tests |
|---|---|---|
| **FRAMEWORK / SYSTEM ARCHETYPE EVIDENCE** | Grok Bot / Heavy / Build · Kimi · Manus · Danus · OpenManus · Magentic · DSH Agent Team · Anthropic orchestrator-worker | **representability** — can Palimpsest express this topology without new ontology? |
| **ENTERPRISE TRAJECTORY EVIDENCE** | Anthropic engineering · JPMorganChase · Microsoft · McKinsey · BCG / MIT SMR · Deloitte · IBM · AWS · Google Cloud · Accenture · OpenAI · Morgan Stanley · Goldman Sachs | **selection pressure** — which architectural directions is enterprise production converging on? |

### Evidence grades

| grade | meaning |
|---|---|
| **REPO-ARTIFACT-VERIFIED** | asserted by current source/tests in this repository |
| **EXTERNAL-SURVEY-VERIFIED** | from a project external research artifact, supplied out-of-repository |
| **DOCUMENTED** | written in a design record, not independently re-verified |
| **INFERRED** | reasoned, not verified in either source |

> **Provenance limitation (both categories):** the external research artifacts live **outside this
> repository** and were **not independently re-read in this execution**. Their claims are therefore
> reported as **supplied-research** evidence and are **not invented or reconstructed** here. Palimpsest
> claims are REPO-ARTIFACT-VERIFIED; DSH host-bundle claims are REPO-ARTIFACT-VERIFIED against
> `host/dsh/lib/*.js`.

---

## 1. Descriptive taxonomy

Five positions, each answering *what does additional agent labor leave behind?*

| position | what it scales / accumulates |
|---|---|
| **parallel cognition** | instantaneous reasoning breadth |
| **execution / orchestration** | parallel execution and workflow throughput |
| **management-state continuity** | enough durable state to finish a long task |
| **admitted intellectual assets** | verified knowledge as reusable capital |
| **durable project production** | governed, compounding project-wide assets **plus** governed co-evolution |

---

## 2. Enterprise trajectory (external selection pressure)

The enterprise evidence supports this **descriptive progression**. It is a market/architecture
**observation**, not a maturity score Palimpsest must mechanically climb, and not an ordered product
roadmap to copy:

```
Multi-Agent Orchestration
        ↓
Agent Infrastructure
    context · identity · protocol · governance · observability · data access
        ↓
Persistent Assets
    artifact · memory · skill · procedure
        ↓
Institutional Learning
```

**What this tells us, read conservatively:**

- The first two bands — orchestration and **agent infrastructure** (context, identity, protocol,
  governance, observability, data access) — are where enterprise attention is concentrated, and they are
  overwhelmingly **platform/host infrastructure**, not canonical semantic kernel.
- The third band, **persistent assets**, is where the trajectory points next: enterprises are moving from
  *running agents* to *keeping what agents produced*. This is the band Palimpsest's knowledge planes
  already occupy.
- The fourth band, **institutional learning**, is where the trajectory is thinnest in practice — and it
  is exactly where Palimpsest's open gaps sit (G-5 reuse, G-12 intent learning, G-11 fulfillment).

**Disposition:** the trajectory **corroborates** the E0 finding that asset capitalization and
institutional learning are the next contested frontier, while creating **no** requirement for new
Palimpsest ontology. It does not authorize expanding E1-K.

---

## 3. Position matrix

No winner column, no score, no ranking.

| System | Primary durable unit | Main value mechanism | Execution topology | Asset admission | Future-worker inheritance | Bottom-up → intent | Collaboration basis | Authority/truth separation | Palimpsest representability | Residual semantic gap |
|---|---|---|---|---|---|---|---|---|---|---|
| **Grok Heavy** | run | parallel cognition | fan-out → aggregate | none | none | none | planner fan-out | none | **FULLY** — `ReasoningCell` + ephemeral branches | none |
| **Grok Build** | run / workflow | orchestration | DAG, host-scheduled | none | none | none | planner DAG | none | **host/runtime/recipe** | none |
| **Kimi Swarm** | run | parallel compute | swarm fan-out | none | none | none | planner fan-out | none | **host/runtime** | none |
| **Manus** | session / task | management state | single loop + sub-agents | none | file/management memory | run-local replan | single agent | none | **host side** | none (does not solve G-5) |
| **Magentic** | run (ledgers) | management state | orchestrator + ledgers | none | ledger (run-local) | **run-local replanning** | orchestrator decomposition | advisory | **partially** (campaign/management) | sharpens G-12 |
| **Danus** | **admitted fact** | **admitted knowledge assets** | producer/verifier/admitter | **yes** | **admitted facts** | within its fact graph | pipeline roles | yes | **partially** | corroborates **G-5** |
| **DSH Agent Team** | session / team | orchestration + team state | lead + teammates | none | within-team | task reassignment | product-created team | runtime authority | **mostly** | **G-4** only |
| **Enterprise platforms** | agent deployment + artifacts | infrastructure (context/identity/governance/observability) | orchestrated fleets | emerging (artifact/memory/skill) | artifact & memory persistence | not observed at project-intent level | registry + protocol | policy/observability layers | **host/platform** — not canonical | none for Palimpsest |
| **Palimpsest CURRENT** | **durable project** | Work closed; knowledge produced, reuse open | governed Work kernel + planes | **yes** (proof/reasoning/verification/memory) | **narrow governed result reuse** | **broken (G-12)** | primitives present, loop broken | **strong separation** | — | G-5, G-12, G-1/2/8/11 |
| **Palimpsest TARGET** | **durable project** | compounding governed project capital | same, with loops closed | yes | **admitted knowledge → context** | **governed co-evolution** | dependency-driven sovereign collaboration | unchanged | — | — |

---

## 4. Three-axis map

Axes per the frozen model: **I** temporal unit · **II** value accumulation · **III** control/evolution.

| System | I — longest-lived unit | II — what labor leaves behind | III — bottom-up → intent |
|---|---|---|---|
| Grok Heavy / Build / Kimi | run | parallel compute / orchestration state | top-down decomposition |
| Manus | session/task | management state (files/todo) | run-local replan |
| Magentic | run | management state (ledgers) | run-local replanning |
| Danus | durable admitted fact | admitted knowledge assets | within its fact graph |
| DSH Agent Team | session/team | orchestration + team state | task reassignment |
| Enterprise platforms | **agent deployment** | infrastructure + emerging persistent assets | not observed at intent level |
| **Palimpsest CURRENT** | **durable project** | Work closed; knowledge **produced not reused** | **broken (G-12)** |
| **Palimpsest TARGET** | **durable project** | **compounding project capital** | **governed co-evolution** |

---

## 5. Key findings

### 5.1 G-5 — knowledge inheritance

| class | systems |
|---|---|
| **NONE** | Grok Heavy, Grok Build, Kimi Swarm |
| **FILE / MANAGEMENT MEMORY** | Manus, Magentic, DSH Agent Team, enterprise platforms (artifact/memory/skill persistence) |
| **ADMITTED KNOWLEDGE** | **Danus** |
| **PROJECT-WIDE ASSET REUSE** | **nobody** — this is Palimpsest's target |

**Finding:** most systems scale instantaneous compute; enterprise systems are moving toward persistent
artifacts and memory. **Danus demonstrates admitted intellectual asset accumulation.** **No surveyed
system reaches project-wide governed asset reuse.**

### 5.2 Corrected Palimpsest CURRENT knowledge position

Current Palimpsest is **not** "transcript/context only". D5 already supplies `PriorResultContext` +
durable result lineage + fresh-authority restart discipline. The accurate category is **NARROW GOVERNED
RESULT REUSE**:

```
Prior Attempt Result reuse                        CLOSED
Admitted Reasoning / Proof → future worker ctx    OPEN   (G-5)
```

### 5.3 G-12 — intent evolution

No surveyed system — framework **or** enterprise — was found to reach durable decision, requirement or
goal revision from evidence. The highest rung observed is **task replanning**. **G-12 is an open niche.**

### 5.4 G-11 — fulfillment

No surveyed system was found to model a typed fulfillment of a cross-boundary commitment. Palimpsest's
existing refs provably cannot express it today: commitment terms are a free string with no typed
reference, the lifecycle has no terminal success state, and the one real delivery mechanism
(`external_assets` `*_COMMITTED`) cannot cite a `CommitmentId`.

### 5.5 Artifact coordination (external pattern)

```
Agent A → persistent Artifact ← Agent B
```

with lightweight refs / path / id exchanged between workers. Enterprise practice supports the principle:

> **Shared object > repeated natural-language relay.**

This is **supporting evidence** for the direction of G-11's future analysis (a delivery is better
referenced than narrated). It does **not** justify inferring `Artifact = Fulfillment`: an artifact
existing is not a commitment being satisfied, because satisfaction requires the promise, the deliverable
and the acceptance to be related — which is precisely what G-11 records as missing.

### 5.6 Context engineering (external principle)

```
Context ≠ Memory ≠ Knowledge
Asset availability ≠ Context inclusion
```

with the retrieval pattern:

```
Index → Discover → Retrieve → Context
```

This **supports but does not dictate** E1-K's internal design. It reinforces the frozen pipeline E1-K
must preserve (`Availability → Selection → Binding → Materialization`) and the shape E1-K must **not**
become (`All Project Assets → Giant Prompt`).

### 5.7 Long-running continuity

External pattern:

```
Agent_t → durable environment/artifacts → Agent_t+1
```

supports **`ProjectContinuity > AgentMemory`**. But it must not be read as equivalence:

> **persistent artifact ≠ governed project asset**

Palimpsest's additional requirements on an asset — **provenance, standing, basis, dependency, version,
supersession** — are exactly what a persisted environment does not supply.

### 5.8 The recurring design pattern

E1-K, E1-I and G-11 all require the **same pattern** — a typed canonical reference position — while
requiring **different domain types**. Sharing mechanics must never collapse the types.

### 5.9 Semantic-alignment warning (long-term pressure)

A predictable long-term pressure follows from the above:

```
asset proliferation
    → typed-reference proliferation
    → semantic alignment pressure
```

Enterprise experience with registries and catalogs shows this pressure is real. The E0-E response is and
remains:

```
preserve domain-specific semantic refs
```

**not**

```
UniversalCanonicalRef / AnyRef / UniversalOntology
```

A shared *transport* idiom is acceptable; a shared *semantic type* is not. A universal reference dissolves
exactly the distinctions (`identity`, `owner`, `standing`, `freshness`, authority implications) that make
a reference trustworthy.

---

## 6. Maturity levels (descriptive, deliberately asymmetric)

Where a level distinction is useful, three levels apply:

```
Artifact Persistence            durable outputs exist
Governed Asset Capitalization   outputs are admitted, standing-aware, and reusable
Institutional Learning          assets change how the institution reasons and plans
```

**Palimpsest does not sit uniformly at one level.** Its honest, current reality is asymmetric:

| capability | level / status |
|---|---|
| Work governance | **strong** (Loop A CLOSED, D1–D5) |
| Reasoning asset production | **strong** (separate epistemic admission + revocation) |
| Proof asset production | **strong** (candidate → verify → publish → reassess) |
| Knowledge reuse | **open at G-5** |
| Intent learning | **open at G-12** |
| Collaboration fulfillment | **open at G-11** |
| Organization/runtime evolution | **substantially present** (D1/D2 mostly closed) |

So Palimpsest is **strong at governed asset production** and **incomplete at governed asset reuse and
institutional learning**. Stating this asymmetry is the point: it prevents aspirational positioning from
being mistaken for implemented capability.

---

## 7. External dispositions (no new ontology from any of them)

| external concern | disposition |
|---|---|
| **Runtime abstraction** — Session / Harness / Sandbox / runtime / identity / policy / observability | **Host / platform infrastructure.** Not pulled into Palimpsest canonical ontology merely because enterprise systems require it. Models remain **replaceable cognitive executors**. |
| **Producer / judge separation** — Planner / Generator / Evaluator patterns | Reinforces `Producer ≠ Judge ≠ Admission`. Maps onto the **existing** verification/admission separation (`project_verification`, `proof_asset` publication, `reasoning_cell` epistemic admission). **No new ontology.** |
| **Agent marketplace / registry** — owner, version, permissions, validation, duplication, maintenance | Real concerns, but the registry object is primarily the **Agent/runtime deployment artifact**. **No Palimpsest `AgentRegistry` is created from this evidence.** |
| **Persistent memory / artifacts** | See §5.5, §5.7 — supporting evidence, not schema. |
| **Orchestration and workflow tooling** | Host/runtime/recipe plane; already representable. |

---

## 8. Ecological position

**1. Crowded niches.** Parallel cognition (Grok Heavy); execution/orchestration and workflow authoring
(Grok Build, Kimi Swarm); long-run context management and filesystem-as-memory (Manus); **and now the
whole agent-infrastructure band** — context, identity, protocol, governance, observability, data access —
where enterprise platforms are converging hard.

**2. Convergent organs Palimpsest should support/host, not compete with.** Branch fan-out and aggregation;
workflow DAG scheduling, budgeting, concurrency and rate limits; filesystem scratchpads and todo loops;
retrieval execution; model selection; worker process lifecycle; **team runtime, teammate sessions and
mailbox transport**; **session/harness/sandbox/runtime/observability infrastructure**.

**3. Below Palimpsest — Ordarium.** Effect authorization and receipts for all of the above: Safe Actions,
ledger, effect admission, external transport.

**4. Above Palimpsest — host/runtime UX.** Product surfaces (CLI, TUI, HTTP, DSH tools), operator
confirmation and management posture, attention delivery, campaign monitor ticks, agent registries and
marketplace catalogs.

**5. Smallest defensible unique position.**

> **Palimpsest targets project-wide governed intellectual compounding plus governed project
> co-evolution** — a durable project whose admitted knowledge raises the next worker's starting floor,
> whose evidence can propose governed changes to its own intent, and whose real dependencies may form
> sovereign collaboration.

**6. Does "durable project intellectual production" survive contact with the external archetypes?**

**Yes**, and the enterprise trajectory **strengthens** rather than dissolves it: the market is moving
*through* infrastructure toward persistent assets, while Palimpsest already owns governed asset
production and is differentiated precisely at the two edges nobody has closed (reuse, intent learning).

**7. Closest system per niche.**

- **a. parallel cognitive compute** — Grok Heavy
- **b. durable collaboration** — DSH Agent Team; enterprise registry/protocol work
- **c. admitted intellectual assets** — **Danus**
- **d. governed project co-evolution** — **none**

*These are not combined into a "best system".*
