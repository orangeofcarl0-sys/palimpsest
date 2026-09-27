# Palimpsest Project Production Constitution

**Status:** E0-E draft (not yet ratified)
**Baseline:** `main @ 9ec76ff2657706386d4cfd3e64eff60fd716d604`
**Supersedes:** nothing. This is the first project-production document; it does not rewrite any G10 record.

This is the primary conceptual architecture of post-SR-2 Palimpsest. It describes the system **as it
exists now**, verified against source. It is deliberately **not** a chronology of G10 stages, and it does
not restate slice history.

Evidence grades used throughout the E0 document set:

| grade | meaning |
|---|---|
| **REPO-ARTIFACT-VERIFIED** | asserted by current source/tests in this repository |
| **EXTERNAL-SURVEY-VERIFIED** | from the project's out-of-repository architecture survey |
| **DOCUMENTED** | written in a design record, not independently re-verified here |
| **INFERRED** | reasoned, not verified in either source |

---

## 1. Core identity

> **The project, not the agent session, is the durable unit of intelligence.**

**Project** is not a store. There is no `ProjectStore`, and this constitution does not create one. A
project is a **composed evolving reality over existing canonical owners**:

```
ProjectIR revision series          (intent: goal, requirements, decisions, tasks)
  + project head commit/digest      (the proven effect head)
  + Work history                    (tasks, attempts, evidence, promotions)
  + World basis / OCC records       (append-only, per attempt)
  + Results and continuations       (attempt results, derived candidates, rework lineage)
  + Intellectual assets             (proof, reasoning, verification, empirical)
  + Organizational/institutional    (organization, institution, campaigns)
  + Collaborating loci              (peers, participations, commitments, boundaries)
```

Each of those is owned by exactly one module (see `E0-TRUTH-OWNERSHIP-MATRIX.md`). "Project" is the
*name for their composition*, not another owner.

**Consequence for future work.** Any proposal to introduce a universal `ProjectStore`, `UniversalAsset`,
`GlobalFactGraph`, or a second ProjectIR is rejected by this constitution. The durable unit being a
project does **not** imply one table owns it.

REPO-ARTIFACT-VERIFIED: `src/domain/project_head.ts` states there is deliberately *"NO second ProjectIR,
NO git-head database and NO second promotion ledger"*.

---

## 2. Cognitive labor

Palimpsest admits **plural** forms of cognitive labor, at different semantic levels. They are **not** one
universal `Agent` type, and this constitution forbids collapsing them:

| locus / realization | what it is | durability |
|---|---|---|
| **Human** | an operator/principal; may approve, confirm, authorize | outside semantic kernel (host/product) |
| **Agent** | an `AgentDefinitionId` — a stable *definition* identity | definition, not an instance |
| **PersistentPoint** | a durable cognitive *continuity locus* | durable, identity-only (no authority) |
| **Peer** | an addressable federation endpoint (`PeerRef`) | durable collaboration identity |
| **Activation** | an ephemeral runtime realization | **ephemeral — never persisted** |
| **ReasoningBranch** | an ephemeral parallel reasoning branch | **ephemeral by construction** |
| **RuntimeScope / Holon** | recursive runtime organization | durable topology |

> **Internal plurality ≠ organizational plurality.**

Two agents running in one process, or two `ReasoningBranch`es inside one cell, are internal plurality.
An `OrganizationDefinition` with members and role assignments is organizational plurality. They are
different semantic levels, and one never becomes the other by accident.

**Explicitly rejected:** that Grok-Heavy-style worker naming implies Palimpsest needs worker identities.
`src/reasoning_cell/branch_execution.ts` refuses to mint identity from a branch: *"it creates NO PeerRef
and NO PersistentPoint."*

REPO-ARTIFACT-VERIFIED: `src/runtime/identity.ts` (`AgentDefinition ≠ Activation`, `Activation ≠ Attempt`);
`src/organization/definition.ts` (`OrganizationMemberRef` is a namespaced union of `peer` and
`agent_definition`).

---

## 3. Intellectual compounding

The architectural motivation of the whole system:

```
Past Cognitive Labor
        ↓
Governed Project Assets
        ↓
Higher Starting Floor For Future Labor
```

> **Do not make the next worker become Newton again.**

**This is architectural motivation, not a machine invariant.** It cannot be asserted by a checker; it can
only be *approximated* by closing production loops, which is why the gap register
(`E0-PRODUCTION-GAP-REGISTER.md`) exists. Machine-testable implications of this principle belong to E1+
slices, not to this document.

**Current status (honest, repo-artifact-verified):**

```
Prior Attempt Result reuse                 CLOSED     (D5: PriorResultContext + durable lineage)
ProjectVerification history reuse          CLOSED     (narrow, per-project runs)
canonical gate evidence reuse              CLOSED     (evidence subject links)
Admitted Reasoning / Proof
        → future worker context            OPEN       (G-5)
```

Note the correction this table encodes: current Palimpsest is **not** "transcript/context only". D5
already supplies narrow governed result reuse. The real boundary is that **admitted knowledge** — proof
claims and reasoning claims — cannot reach a future worker's starting state.

### 3.1 Two kinds of capital

Intellectual capital is not one thing. This constitution distinguishes two classes, and freezes the
distinction:

| class | what it is | examples | Palimpsest owner today |
|---|---|---|---|
| **Epistemic Capital** | what the project **knows** | claims · proof / evidence · experiment · decision rationale · negative result | `proof_asset`, `reasoning_cell`, `project_verification`, `organization_memory`, `project_workspace` |
| **Procedural Capital** | how the project **knows how to work** | skill · procedure · validated method · workflow pattern · tooling pattern | **partially** — `recipes` (descriptive plans), host skills; **not** a governed asset class |

> **What we know ≠ How we know how to work.**

Epistemic capital has durable producers and an admission discipline. Procedural capital is presently
**descriptive**: `recipes` declares plans and explicitly *"owns no store and no mutator"*, and host
skills live outside the kernel. Whether procedural capital needs a governed asset class is recorded as
audit candidate **G-16** in the gap register — **not** a confirmed gap and **not** a new owner.

### 3.2 Context, memory, knowledge

Three things that are routinely conflated and must not be:

```
Context   ≠   Memory   ≠   Knowledge
```

and, decisively for any reuse design:

> **Asset availability ≠ Context inclusion.**

Availability of an asset in a store never implies automatic inclusion in a context. The governed pipeline
is `Availability → Selection → Binding → Materialization`, and the failure mode to avoid is
`All Project Assets → Giant Prompt`.

### 3.3 Continuity is not memory

External practice around long-running agents describes `Agent_t → durable environment/artifacts →
Agent_t+1`. This supports **`ProjectContinuity > AgentMemory`** — but it does **not** license the
equivalence:

> **persistent artifact ≠ governed project asset**

A persisted environment carries no provenance, standing, basis, dependency, version or supersession. Those
are exactly the properties that make an artifact *governed*, and they are why the project — not the
agent's environment — is the durable unit.

---

## 4. Bidirectional project learning

```
Top-down:
    Goal → Requirements → Decisions → Work

Bottom-up:
    Observation → Result → Evidence → Asset → Diagnosis

Governed reconciliation:
    Bottom-up reality may PROPOSE changes to top-down intent.
```

> **bottom-up ≠ unrestricted self-organization**
> **top-down ≠ immutable central planning**

The target is **governed co-evolution**.

**Current status:** the top-down direction is fully closed (Loop A). The bottom-up direction exists as
observation and diagnosis (`organization_dynamics` is read-only by construction) and as a narrow
opportunity path (`Journal OPPORTUNITY → task`), but a **structured proposal to revise project intent
from evidence does not exist** (G-12). Bottom-up today cannot reach goal, requirement, or decision
revision through any governed path.

Authority direction is part of the model, not an afterthought. Every loop edge later in this document set
is annotated with one of: `READ`, `DERIVE`, `PROPOSE`, `ADMIT`, `EFFECT`, `PROJECT`. A `PROPOSE` edge
never silently becomes an `EFFECT` edge.

---

## 5. Orthogonal semantic planes

The system is **planes**, not a call tree:

```
Product / Host                  CLI · TUI · serve · DSH tools · adapters
Project / Intent                ProjectIR, goal, requirements, decisions, tasks, head
Organization                    organization, institution, campaigns
Collaboration                   peers, coordination, federation, boundary memory
Intellectual Assets             proof, reasoning, verification, empirical memory, workspace
Work / World / Result           tasks, attempts, evidence, promotions, basis, OCC, results
Runtime / Cognitive Loci        activation, persistent points, runtime scopes, binding
Effect Safety / Ordarium        Safe Actions, ledger, effect authorization
```

> **These are orthogonal semantic planes, not a manager→worker call hierarchy.**

`ProjectController` is the **Work orchestration façade**. It does **not** own the semantics of
organization, collaboration, intellectual assets, or runtime. It composes the Work plane and delegates to
SR-2 owners (`work/read_model`, `work/head`, `work/attempt_execution`, `context/service`,
`continuation/service`).

---

## 6. Semantic firewalls (frozen)

These hold today and any E1+ proposal violating one is an architecture regression:

```
Agent ≠ Role
Activation ≠ PersistentIdentity
Branch ≠ DurableAgent
Peer ≠ Activation
Message ≠ Evidence
Ack ≠ Agreement
Commitment ≠ WorkOwnership
Commitment ≠ Participation
Participation ≠ Authority
Candidate ≠ AcceptedAsset
ReasoningClaim ≠ ProofClaim
AcceptedReasoningClaim ≠ Truth
Result ≠ Verification
Verification ≠ Admission
ResultIdentity ≠ PromotionAuthority
HistoricalKnowledge ≠ CurrentAuthority
ProjectWorkspace ≠ CanonicalStore
ProjectAssetAssociation ≠ AssetContent
ManagementMode ≠ Authority
Organization ≠ RuntimeScope
OrganizationTransformation ≠ RuntimeTransformation
UserFocus ≠ AuthorityRoot
HostActivation ≠ AttemptState
Coalition ≠ Organization
```

Each is machine-pinned today; the pinning test or source comment is cited per row in
`E0-TRUTH-OWNERSHIP-MATRIX.md`.

---

## 7. What this constitution does not authorize

It does not authorize: a new canonical owner, a new canonical event, a new store, a Team/Member/
Assignment ontology, a universal reference type, or any change to D1–D5 semantics. It is a
**descriptive** document. The next implementation step it implies is `E1-K`, and only via its own design
ruling (`E1-K-KNOWLEDGE-CONTEXT-RULING.md`).

---

## 8. Current maturity is asymmetric

Palimpsest does **not** uniformly occupy one maturity level. This must be stated plainly so that
aspirational positioning is never mistaken for implemented capability:

```
Work mutation / governance            strong / CLOSED

Reasoning asset production            strong
Proof asset production                strong
Result historical reuse               narrow but governed   (D5)

Admitted-knowledge inheritance        OPEN at G-5
Project-intent learning               OPEN at G-12
Sovereign collaboration fulfillment   OPEN at G-11
Procedural-capital inheritance        unconfirmed           (G-16 audit candidate)
```

> **Palimpsest does not currently have cumulative institutional intelligence.**
> Its **target** is cumulative governed project intelligence.

The system is today **strong at governed asset production** and **incomplete at governed asset reuse and
institutional learning**. That asymmetry is the honest description, and closing it — not adding more agent
abstractions — is the remaining development goal.
