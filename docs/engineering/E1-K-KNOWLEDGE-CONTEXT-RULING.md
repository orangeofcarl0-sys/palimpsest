# E1-K — Governed Knowledge Reuse & Context Capitalization

**Status:** design ruling — **boundaries FROZEN at FB-4B**; **IMPLEMENTED** (see §23 closure evidence).
**Baseline:** `main @ 9ec76ff2657706386d4cfd3e64eff60fd716d604`; implemented from `0042a2e`.
**Targets gap:** G-5 (`admitted knowledge → future ContextManifest`)

---

## 1. Mission

> **Close G-5:**
>
> ```
> admitted, project-relevant knowledge
>         → governed future attempt context
> ```
>
> **without turning knowledge into Work truth, authority, or indiscriminate global memory.**

`E1-K` — **Governed Knowledge Reuse & Context Capitalization**.

---

## 2. Primary invariant

> **Knowledge availability ≠ automatic context inclusion.**

An asset existing in the Proof plane, a `ReasoningCell` frontier, `OrganizationMemory`, or an external
asset library does **not** mean every future worker receives it. Inclusion is a **governed selection**,
with an explicit, inspectable reason per item.

### 2.1 External corroboration (supports, does not dictate)

Enterprise context-engineering practice distinguishes `Context ≠ Memory ≠ Knowledge` and
`Asset availability ≠ Context inclusion`, with a retrieval pattern of `Index → Discover → Retrieve →
Context`. This **corroborates** the direction and the constraint below. E1-K must preserve:

```
Availability → Selection → Binding → Materialization
```

and must **not** become:

```
All Project Assets → Giant Prompt
```

The external pattern does **not** dictate the selection model, representation, or boot/pull split — those
are ruled from Palimpsest's own measured constraints (§4–§6).

### 2.2 Procedural capital is out of scope

Procedural capital (skill, procedure, validated method) is registered as audit candidate **G-16** and is
**explicitly deferred**. E1-K V1 does not cover it and must not grow a `SkillStore` / `ProcedureStore`.
`What we know ≠ How we know how to work`.

---

## 3. Selection policy — FROZEN: A + canonical revalidation

```
A — EXPLICIT SELECTION + CANONICAL REVALIDATION
```

```
host / principal / operator proposes typed knowledge refs
        ↓
Context owner REVALIDATES:  project scope · owner existence ·
                            publication/admission · current standing/activity
        ↓
only then:  bind into THIS attempt's ContextManifest
```

**Caller selection is a REQUEST, never admission.** E1-K V1 does **not** infer automatic Task↔Knowledge
relevance, because no canonical `Task ↔ KnowledgeAsset` relevance relation exists.

- Model **B** (deterministic project/task-derived selection) may be a later slice.
- Model **C** (advisory semantic relevance with fail-closed admission) may be a later slice.

---

## 4. V1 asset scope

```
published / current Proof claims
active admitted Reasoning claims from project-associated ReasoningCells
```

**Already-supported context — remains distinct and is NOT reimplemented:**

```
PriorResultContext               D5's prior ATTEMPT RESULT (rework lineage)
ProjectVerification history      historical runs for one subject
canonical gate evidence          evidence subjects
```

**Deferred:** `OrganizationMemory` experiments · external library assets · raw journal notes · campaign
beliefs · arbitrary messages · **procedural capital (G-16)**.

---

## 5. Eligibility rules

### 5.1 Proof

A requested Proof claim is eligible **only when all four hold**:

```
published
AND explicitly associated with THIS project as assetKind = PROOF_CLAIM
AND resolvable through the Proof owner
AND current  (effectiveStanding ≠ STALE  AND  freshness is current)
```

**Do NOT require `effectiveStanding == SUPPORTED`.** The vocabulary is preserved **verbatim** —
`SUPPORTED | PARTIALLY_SUPPORTED | CONTRADICTED | INCONCLUSIVE` (and `STALE` as the ineligible state) —
because a contradicted or inconclusive claim is frequently *informative* inherited knowledge. Standing is
**never translated to true/false**.

### 5.2 Reasoning

A requested Reasoning claim is eligible **only when all three hold**:

```
its ReasoningCell is explicitly associated with THIS project (assetKind = REASONING_CELL)
AND the claim is admitted
AND the claim is ACTIVE at compile time
```

Preserved: **`ReasoningClaim ≠ Evidence ≠ Truth`**.

---

## 6. Project scoping

```
Proof:      ProjectAssetAssociation{ assetKind = PROOF_CLAIM,   canonicalRef.id = requested claim }
Reasoning:  ProjectAssetAssociation{ assetKind = REASONING_CELL, canonicalRef.id = requested cell }
            then active-claim lookup INSIDE that cell
```

> **Physical shared-store visibility grants no eligibility.**

Both kinds already exist in `PROJECT_ASSET_KINDS` — **no new asset kind is required**.

---

## 7. Manifest seam — FROZEN

A **declared additive optional top-level field**:

```
ContextManifest.knowledge?
```

Absent means *"this manifest carries no E1-K knowledge binding"*. Old manifests remain valid. **No second
manifest and no second store.**

### 7.1 `ContextRequirement` is UNCHANGED in V1

- Do **not** repurpose `ContextRequirement.historical` — it is reserved for superseded IR/history semantics.
- Do **not** add `ContextRequirement.knowledge` in V1.
- Selection is a **separate compile request/capability**. The canonical record of what was actually bound
  belongs in the **manifest**.

### 7.2 Binding is a domain-specific discriminated union

**No** `UniversalCanonicalRef`, `UniversalAssetRef`, or `KnowledgeRef {kind:string,id:string}`. Use
context-domain **presentation bindings**:

```
ProofKnowledgeBinding
ReasoningKnowledgeBinding
```

They are **Context representations OF owner facts**. They do not become owner identities themselves.

### 7.3 Compile-time snapshot (what each binding records)

**V1 carries NO preview and NO copied claim content** (FB-4B-R §1). Explicit selection already
establishes relevance; the body stays pull-only; the manifest must remain a historical binding, not a
partial knowledge cache. A deterministic presentation/preview slice may be added only after dogfood
evidence.

Proof binding:

```
kind = "proof"
proofClaimId
standingAtCompile        effectiveStanding, verbatim vocabulary
freshnessAtCompile       fresh | stale | unknown
proofBasisAtCompile      { scopeId, throughSeq, chainDigest }   ← the Proof owner's OWN basis
inclusionReason          "explicit_request"
handle                   @ctx/proof/<claimId>
```

Reasoning binding:

```
kind = "reasoning"
cellId · claimId
frontierBasisAtCompile   ReasoningFrontierBasis { cellId, frontierRevision, frontierDigest }
activeAtCompile          literal true (only active claims are bound)
inclusionReason          "explicit_request"
handle                   @ctx/reasoning/<cellId>/<claimId>
```

> **Basis ≠ DerivedViewDigest.** `ProofBasis` is the canonical plane basis. A derived view digest may be
> retained separately (as `viewDigestAtCompile` if ever needed) but must **never** be named or treated as
> the plane basis.

### 7.4 Explicit selection is atomic and fail-closed

For a **non-empty** explicit knowledge request:

```
ALL requested bindings pass validation
        OR
the ENTIRE context compilation is refused BEFORE CONTEXT_MANIFEST_ADDED
```

**No partial knowledge selection. No silent omission.** Typed refusal reasons:

```
KNOWLEDGE_CAPABILITY_UNAVAILABLE
KNOWLEDGE_NOT_PROJECT_ASSOCIATED
KNOWLEDGE_NOT_FOUND
KNOWLEDGE_NOT_PUBLISHED
KNOWLEDGE_STALE
KNOWLEDGE_REASONING_INACTIVE
KNOWLEDGE_OBSERVATION_RACED
KNOWLEDGE_SELECTION_BUDGET_EXCEEDED
```

If the knowledge request is **absent**, compilation behavior is unchanged and the knowledge ports may be
absent.

### 7.5 Observation race closure

The proof adapter must produce **one self-consistent observation**, using the existing `basis()` read:

```
basisBefore = proof.basis()
view        = proof.proofAssetView(claimId)
basisAfter  = proof.basis()
require basisBefore === basisAfter
```

On mismatch → `KNOWLEDGE_OBSERVATION_RACED`, zero manifest append. **Bounded behavior: exactly one
re-observation is NOT performed — the compile fails and the caller retries.** No unbounded retry loop.

Reasoning needs **no** race closure: `frontier({cellId})` already returns `{ basis, claims }` from a
**single** `requireState` read, so one call is one logically-consistent observation.

### 7.6 Historical reads must survive de-activation

Compilation and historical materialization answer different questions:

```
observeFrontier(cellId)          → { basis, activeClaims }
readAdmittedClaim(cellId, claimId) → { claim, currentlyActive, currentFrontierBasis } | null
```

The second read **must still resolve a previously-admitted claim after it becomes inactive.** The
existing `claimGraph({cellId})` already returns `{ basis, nodes: [{ ref, claim, active }] }` covering both
active and inactive admitted claims — so the composition adapter uses `frontier()` for compile and
`claimGraph()` for historical materialization, and **no Reasoning owner extension is required**.

### 7.7 Historical / current fetch shape

```
bindingAtCompile { standingAtCompile, freshnessAtCompile, proofBasisAtCompile }   ← immutable
body
current { effectiveStanding, freshness, currentProofBasis }                        ← where available
```

Compile-time fields are **never** overwritten by the current view. Current activity is shown separately
and explicitly labelled **CURRENT**.

### 7.8 Knowledge index is subject to the context boot budget

Explicit selection must not create an unbounded metadata prompt. The existing boot-budget discipline is
reused: the accounting is `exact-reference boot cost + knowledge-index/handle boot cost` inside the same
bounded calculation.

```
exact references are Contracts  → may always boot (unchanged)
knowledge entries               → are NOT a Work contract → subject to the remaining budget
```

If the minimal explicit knowledge index cannot fit the permitted budget →
`KNOWLEDGE_SELECTION_BUDGET_EXCEEDED`, and the selection fails. **Never silently truncate explicitly
selected knowledge.** No arbitrary max-count constant is invented; the existing byte budget is reused.

### 7.9 Boot index is minimal (no second list)

**FINAL RULING — the minimal representation.** The boot-visible index carries only what identifies the
selected pull handle:

```
kind · ref · handle
```

Standing/activity are **NOT** boot-visible in V1. The full body stays pull-only.

```
ContextManifest.knowledge    = the full HISTORICAL binding metadata
ContextDistribution.handles  = the worker-visible PULL INDEX
```

The worker gets **no second knowledge block** and there is **no shadow manifest in the worker context**.
Generic knowledge metadata is not added to `ContextDistributionEntry` merely to expose standing. A worker
that wants a claim's standing pulls the handle and receives `bindingAtCompile + body + current`.

---

## 8. Historical vs current semantics — FROZEN

```
Manifest binding is HISTORICAL.
Owner standing is CURRENT.
They are not interchangeable.
```

- If a Proof standing changes after compile → **the old manifest does not change.**
- If a Reasoning claim is invalidated after compile → **the old manifest does not change.**
- A later attempt re-evaluates eligibility against **current** owner state.

`fetchContext` **must not** silently replace compile-time standing with current standing. If current
standing is additionally shown it must be labelled explicitly as **CURRENT**, leaving the **COMPILE-TIME**
snapshot intact.

---

## 9. Boot / Pull — FROZEN

```
BOOT:  small typed knowledge INDEX (via ContextDistribution.handles)
PULL:  full owner presentation/body
```

Never automatically boot the complete claim body. Preferred handles:

```
@ctx/proof/<claimId>
@ctx/reasoning/<cellId>/<claimId>
```

**Do not** use a universal `@ctx/knowledge/*` namespace.

### 9.1 Boot index entry — minimal, and the existing `handles` list IS the index

```
kind · ref · handle
```

The typed identity is encoded by the ref according to the closed namespace. **No preview. No
standing/activity in the boot index.**

The worker gets **no second knowledge block**, and the **existing** `ContextDistribution.handles` list
serves as the index — there is no parallel list describing the same binding. Generic knowledge metadata is
**not** added to `ContextDistributionEntry` merely to expose standing.

This is intentional: V1 uses **explicit selection**, so the worker is not *discovering* relevance from the
index. When it pulls, it receives `bindingAtCompile + body + current`.

### 9.2 Full body is never copied into the manifest

The manifest stores binding/presentation metadata only. Canonical content stays in the **Proof owner** and
the **Reasoning owner**; `fetchContext(handle)` materializes through **narrow read ports**. Context remains
a **consumer**, never a second knowledge store.

---

## 10. Consumer-owned port wall — FROZEN

Design E1-K like SR-2's continuation slice. `src/context/**` **MUST NOT** depend directly on:

```
ProofEvidenceService · ReasoningCellService · their stores · their mutation APIs
```

Define **narrow consumer-owned read ports** for exactly what context needs. **Project association truth
belongs to ProjectWorkspace, not to Proof or Reasoning**, so it is its own read capability:

```ts
interface ContextKnowledgePorts {
  readonly projectAssets?: {
    associated(projectId: string, kind: "PROOF_CLAIM" | "REASONING_CELL", id: string): Promise<boolean>;
  };

  readonly proofAssets?: {
    observeClaim(claimId: string): Promise<{ effectiveStanding; freshness } | null>;   // COMPILE read
    readClaim(claimId: string): Promise<{ body; effectiveStanding; freshness } | null>; // PULL read
  };

  readonly reasoningCells?: {
    observeFrontier(cellId: string): Promise<{ basis; activeClaims }>;                          // COMPILE read
    readAdmittedClaim(cellId: string, claimId: string): Promise<{ claim; currentlyActive; currentFrontierBasis } | null>; // PULL read
  };
}
```

> **Project association ≠ Proof fact ≠ Reasoning fact.**

Exact TypeScript may differ; the **ownership semantics may not**. The dedicated composition adapter may
combine all three owners, but the consumer-owned port must preserve that distinction.

### 10.1 Observation and materialization are different reads

Compilation asks *"what was this claim's eligible current standing at ONE stable Proof basis?"* — that is
`observeClaim` plus the `basisBefore / observeClaim / basisAfter` race rule. Pull asks *"what canonical
claim body exists now, and what is its current view?"* — that is `readClaim`. **One ambiguous `view()` is
not used for both.** This mirrors the frozen Reasoning split `observeFrontier ≠ readAdmittedClaim`.

The Context owner still returns `bindingAtCompile + body + current` without mutating the manifest.

**Composition** adapts the canonical owners into those ports; **context** owns all eligibility reasoning.

> **composition knows wiring; context knows context semantics.**

### 10.2 Composition location — `KnowledgeContext ≠ ResultContinuation`

The E1-K knowledge wiring is **not** owned by `src/composition/continuation.ts`. A narrow dedicated
module owns it:

```
src/composition/context_knowledge.ts
```

It may **only** adapt `ProjectWorkspace` READ · `Proof` READ · `Reasoning` READ into
`ContextKnowledgePorts`, and nothing else.

### 10.3 Late composition — a stable provider from birth + one-time binding

`ProjectController` — and therefore the Context owner — is constructed inside `composeCore`, **before**
the collaboration (proof) and organization (reasoning) clusters exist. This is resolved with the
repository's **existing explicit late-bind idiom** (`worldOwner = { current: null }` + read-through), not
with an install-scoped naked mutable closure:

```ts
// core: ONE stable holder, created before the Context owner
const contextKnowledge: { current: ContextKnowledgePorts | null } = { current: null };

// the Context service receives a stable READ-THROUGH provider, not a value
contextKnowledge: () => contextKnowledge.current

// CoreComposition exposes a narrow binding capability
contextKnowledge: { bind(ports: ContextKnowledgePorts): void }
```

Binding rules — **fail closed**:

```
unbound            → undefined capability
first bind         → accepted
second bind        → fail closed
```

After the collaboration cluster (Proof), the organization cluster (Reasoning), and the
cognition/governance cluster (ProjectWorkspace) are available, `install.ts` composes
`src/composition/context_knowledge.ts` and binds the resulting ports **ONCE**.

> **stable provider from birth; one-time composition binding; read-through at compile/fetch time.**

**No global registry. No mutable service locator. No semantic policy in the binder.**

Resolution outcome is defined: **unbound + absent request** → compile unchanged; **unbound + explicit
request** → `KNOWLEDGE_CAPABILITY_UNAVAILABLE`.

---

## 11. Authority firewall — FROZEN

Knowledge binding gives **ZERO**: Work mutation authority · verification authority · promotion authority ·
commitment authority · organization authority · effect authority.

**No E1-K path may feed a Proof/Reasoning standing into Promotion eligibility.** Knowledge informs
cognition only. Concretely, a bound item enters no `ProjectWorldBasis`, no `TaskEnvelope`, does not touch
`semanticProjectionDigestOf`, and can never satisfy a `CompletionContract` or a declared gate.

---

## 12. Determinism invariant

```
same:  attempt basis
     + explicit knowledge selection request
     + owner observations/bases
⇒  byte-identical ContextManifest
```

Explicit selection is **part of compilation input**. A changed owner basis must not masquerade as the same
compile.

---

## 13. Selection-request identity

The explicit request must not be an ephemeral argument whose content disappears after compile. The
**selected bindings themselves are sufficient historical evidence** (they record identity + standing +
basis + reason per item), so **no `SelectionStore` and no separate request digest are created**. Chosen
minimal representation: **the bindings are the record.**

---

## 14. Adversarial test suite (designed, not implemented)

| id | assertion |
|---|---|
| **K-N01** | an unassociated Proof request → `KNOWLEDGE_NOT_PROJECT_ASSOCIATED` → **zero manifest write** |
| **K-N02** | an inactive Reasoning request → `KNOWLEDGE_REASONING_INACTIVE` → **zero manifest write** |
| **K-N03** | a reasoning claim is never labelled Evidence/Truth |
| **K-N04** | stale proof standing remains visible, not silently current |
| **K-N05** | a later standing change does not rewrite an old `ContextManifest` |
| **K-N06** | selected knowledge grants zero Work/Promotion authority |
| **K-N07** | same attempt basis + same request + same owner bases ⇒ byte-identical manifest |
| **K-N08** | bounded context does not inject all project assets |
| **K-N09a** | **no** knowledge request + no owner ports → ordinary compile succeeds |
| **K-N09b** | explicit knowledge request + required port absent → `KNOWLEDGE_CAPABILITY_UNAVAILABLE` → zero manifest write |
| **K-N10** | D5 `PriorResultContext` remains semantically distinct |
| **K-N11** | project A cannot see project B assets merely because a physical store is shared |
| **K-N12** | no external/global asset is auto-contextualized |
| **K-N13** | an attempt that already owns manifest `M0`, recompiled with a **different** explicit request, returns `M0` byte-for-byte — zero new event, zero knowledge refresh, zero mutation |
| **K-N14** | the Proof basis changes between before/after observation → `KNOWLEDGE_OBSERVATION_RACED` → zero `CONTEXT_MANIFEST_ADDED` |

**No Reasoning race test is required**: `frontier()` alone returns one self-consistent
basis+claims result from a single state read (§7.5).

Full-body materialization, the atomicity rule, and the budget rule (§7.4, §7.8) are each covered by
K-N01/N02/N09b, K-N13 and the budget case respectively. The corpus is **not** a claim that these are
exhaustive — they are the minimum defensible V1 set.

---

## 15. Live gate (`gate:e1-k-live`) — conceptual

```
Project P
  ↓  a ReasoningCell produces admitted claim C   (or the Proof plane publishes P1)
  ↓  the claim becomes explicitly project-associated
  ↓  cold restart / new attempt
  ↓  the context compiler selects it under the explicit request + revalidation
  ↓  the new Attempt's ContextManifest references it
  ↓  the worker receives the boot index entry and PULLS the body
```

**Must prove:** the new worker did **not** need the previous session · the asset identity/provenance
survived · the asset remained **non-authoritative**.

**Negative companion:** an unassociated, inactive, or stale-as-current asset must **not** silently enter.

---

## 16. Explicit non-goals

E1-K must **not** grow a `ProjectChangeProposal` (E1-I / G-12), must **not** grow `ContactNeed` derivation
(E3-R / G-1), and must **not** grow procedural capital (G-16). It introduces **no** new canonical owner and
**no** new store.

---

## 17. Semantic-extension classification

| owner | extension |
|---|---|
| Proof owner | **NONE** |
| Reasoning owner | **NONE** |
| ProjectWorkspace owner | **NONE** — `PROOF_CLAIM` and `REASONING_CELL` are already `ProjectAssetKind` values |
| **Context owner** | **YES — additive** (`EXISTING_OWNER_SEMANTIC_EXTENSION`) |

The Context extension comprises: `ContextManifest.knowledge?` · the strict per-kind binding parsers · the
`proof`/`reasoning` handle namespaces · distribution/fetch behavior.

**This is NOT a new canonical owner.**

---

## 18. Selection request is non-persistent

```
manifest bindings are the durable record of what this Attempt was actually given.
```

No `SelectionStore`. Rejected requests do **not** need canonical persistence in E1-K V1, and request
intent is **not** recorded separately.

---

## 20. Frozen decision summary (no open options)

```
selection             explicit + canonical revalidation (A); B and C are later slices
manifest seam         additive optional top-level ContextManifest.knowledge?
ContextRequirement    unchanged
preview               none — removed from the V1 binding schema
boot                  handles/index only; no second knowledge block
body                  pull-only
selection             atomic (all bindings validate, or the compile is refused)
Proof basis           the real ProofBasis { scopeId, throughSeq, chainDigest }
late binding          stable provider from birth + one-time binder
new canonical owner   none
```

Resolved items are **no longer options**. The future items below remain future items and E1-K does **not**
expand to solve them:

```
G-12  Evidence → Project Intent revision proposal
G-1   ProjectReality → NeedCandidate
G-11  Commitment → Fulfillment observation
G-14  empirical structural feedback / longitudinal evaluation
G-16  procedural-capital inheritance (audit candidate)
```

---

## 21. Expected E1-K implementation source files

```
NEW   src/context/knowledge.ts                  the union, strict per-kind parsers, eligibility revalidation, typed refusal error
EDIT  src/context/service.ts                    ports + stable provider, request input, atomic selection, fetch dispatch
EDIT  src/context/manifest.ts                   ContextManifest.knowledge? + build passthrough
EDIT  src/context/distribution.ts               kind union + contextHandle prefixes (pull-only) + budget accounting
EDIT  src/schema/models.ts                      EVENT_PAYLOAD_FIELDS + manifest key list + per-binding closed validation
EDIT  src/composition/core.ts                   stable contextKnowledge holder + narrow bind() on CoreComposition
NEW   src/composition/context_knowledge.ts      the three read adapters (projectAssets / proofAssets / reasoningCells)
EDIT  src/install.ts                            one-time bind after collaboration/organization/cognition clusters
NEW   test/e1k_knowledge_context.test.ts        K-N01…K-N14 (+ capability honesty)
NEW   scripts/gates/e1k-live-gate.mjs           the live scenario
EDIT  tools/architecture/baseline-reasons.ts    the two firewall reasons
EDIT  architecture/module-architecture.json     hand-appended firewall entries (NOT via architecture:write)
EDIT  test/architecture/sr2e_architecture_ratchets.test.ts   firewall count pins 5 → 7
```

`architecture:write` is **not** run, and no baseline regeneration is expected.

---

## 22. Architecture ratchets — how they are added (without re-stamping)

The negative firewalls are accepted. **`architecture:write` must NOT be run** to add them, because that
command regenerates the whole baseline including accepted debt.

The tooling permits this: `--write` is the *only* mode that consumes the code-level rule tables
(`DEPENDENCY_FIREWALLS` etc.), while `--check` reads rules from the **committed JSON**. So the new rules are
added by **hand-editing `architecture/module-architecture.json`**, appending exactly two firewall entries,
with reasons in `baseline-reasons.ts` for reviewability. The hand addition is legitimate because the
committed baseline is **not** asserted to equal generated output — the parity tests call `baselineFrom(...)`
on **synthetic** graphs, and the live-repository test only checks that no *forbidden/cycle* violation is
unrecorded.

Two consequences to handle at implementation time, both mechanical:

1. `test/architecture/sr2e_architecture_ratchets.test.ts` pins the firewall count (`toHaveLength(5)`,
`DEPENDENCY_FIREWALLS.length === 5`). These must be updated to 7 **deliberately**, so the count change is
visible in the diff rather than incidental.
2. The committed baseline's `capturedFrom`/`capturedTree` stay untouched — the additions are declared rules,
   not a re-capture.

After adding: run `architecture:check` and `architecture:check-public-api`. If any tooling step appears to
require `architecture:write`:

```
STOP — ARCHITECTURE RATCHET TOOLING REVIEW REQUIRED
```

---

## 23. Closure evidence — what was implemented

The design above is frozen; this section records the implementation that satisfies it. It adds no new
decision.

### 23.1 Source files, as built

```
NEW   src/context/knowledge.ts              the union, the strict per-kind binding parsers' shape, the
                                            eligibility revalidation, the typed refusal
EDIT  src/context/service.ts                ports + stable provider, request input, atomic selection,
                                            pull dispatch for the two knowledge namespaces
EDIT  src/context/manifest.ts               ContextManifest.knowledge? + build passthrough
EDIT  src/context/distribution.ts           kind union + proof/reasoning pull handles + budget accounting
EDIT  src/context/index.ts                  the new public names
EDIT  src/schema/models.ts                  manifest key list + closed per-kind knowledge validation
EDIT  src/tools/controller.ts               contextKnowledge provider passthrough + additive optional
                                            `knowledge` on compile/workWorkerAttemptContext + fetch typing
EDIT  src/composition/core.ts               the stable contextKnowledge holder + one-time bind()
NEW   src/composition/context_knowledge.ts  the three read adapters (projectAssets/proofAssets/reasoningCells)
EDIT  src/install.ts                        one-time bind after collaboration/organization/cognition clusters
EDIT  src/interaction/work_delegation.ts    the selection rides the standard worker path
NEW   test/e1k_knowledge_context.test.ts    K-N01…K-N16 + K-P01…K-P05
NEW   scripts/gates/e1k-live-gate.mjs       the packaged end-to-end live scenario
EDIT  package.json                          gate:e1-k-live
```

`architecture:write` was **not** run; `capturedFrom`/`capturedTree` and every accepted exception are
untouched. The controller hotspot ratchet was **not** raised — the controller additions were reduced until
both the LOC and fan-out ceilings held, because raising a ceiling would re-stamp accepted debt.

### 23.2 Two implementation decisions the design left to the code

Both are consequences of the frozen rules, not new ones:

1. **Project-scope refusal fails closed.** `projectScopedAssets` REFUSES a project id that is not the
   workspace's project. The adapter converts that refusal to `false` rather than propagating it: a
   refusal is not an answer, and "not associated with the project you asked about" is the only safe
   reading (§9/§10, `Project association ≠ Proof standing ≠ Reasoning standing`).

2. **`NOT_FOUND` vs `NOT_PUBLISHED` is read from the owner, not guessed.** The Proof owner mints
   `pcc-` candidate ids and `pc-` claim ids in separate namespaces, so the adapter asks the owner's own
   `replay` whether a candidate was ever recorded under the requested id. A published-but-unresolvable
   claim is never silently reported as "never existed" (§5's refusal taxonomy requires the distinction).

### 23.3 Boundary proofs

The two E0 firewalls are asserted to **bite**: `test/architecture/e0e_knowledge_boundary.test.ts` clones
the live graph, injects the ONE forbidden import into each boundary, and requires exactly that breach to
be reported — plus the unmodified graph to report neither. The pre-implementation stage guard in the same
file was replaced by the post-implementation invariants (the modules exist; the ports expose only reads;
no universal reference), because E0's absence proof is no longer true once E1-K is authorized.

### 23.4 Verdict

```
E1-K GOVERNED KNOWLEDGE REUSE: CLOSED
G-5: CLOSED
```

`gate:e1-k-live` proves, on a real packaged install across a genuine session replacement, that durable
project knowledge reached a new worker through the standard delegation path as a pull handle, that the
body resolved only on pull, that the historical binding stayed immutable while the current standing was
re-derived, that now-ineligible knowledge was refused with its typed reason and zero manifest write, and
that the selection granted no promotion authority.

---

## 24. ADDENDUM (R1-L, 2026-09-28) — what the E1-K evidence did and did not cover

**This section is additive. Nothing above is rewritten, and the §23 verdict stands as it was recorded.**

R1 (`38ead3f`) then measured something the E1-K gate could not see, because that gate drives an
**in-process** worker:

| what | E1-K proved | R1 measured | R1-L closes |
|---|---|---|---|
| compile / bind / distribute | ✅ proven | — | — |
| generic worker payload carries the handles | ✅ proven | — | — |
| canonical host pull (`fetchContext`) | ✅ proven | — | — |
| **first-party DSH model-visible pull index** | **not covered** | **absent** | ✅ |
| **first-party DSH governed worker pull** | **not covered** | **absent** | ✅ |

The distinction matters and is worth stating plainly, because it is easy to read §23 as broader than it
is. `gate:e1-k-live`'s worker is a JavaScript fixture **inside the gate process** that calls
`controller.fetchContext(...)` directly. Such a worker can pull, because it is not a sandboxed
subprocess. A real DSH worker is a separate process that composes no deployment and no store, has every
inherited `palimpsest_*` tool denied, and therefore could not see the index or pull a body at all.

So E1-K's claim is exact and remains true: **durable project knowledge reached a new worker through the
standard delegation path as a pull handle, and the body resolved only on pull.** What it did not claim —
and what R1's probe showed was missing — is that a *real* worker could do so. R1-L supplies that last
mile: the index is rendered into the worker's task text, and `palimpsest_worker_context_pull` gives the
worker a governed, attempt-bound read. See `docs/engineering/R1-L-WORKER-CONTEXT-PULL.md` and
`research-evidence/r1-l/`.
