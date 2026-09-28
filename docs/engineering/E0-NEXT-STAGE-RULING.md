# E0 — Next Stage Ruling

**Status:** E0-E draft — **roadmap ruling only; no implementation authorized**
**Baseline:** `main @ 9ec76ff2657706386d4cfd3e64eff60fd716d604`

This ruling selects the next implementation slice from the gap register. It authorizes **nothing**: each
stage below requires its own design ruling, and E1-K in particular requires `FB-4A` and `FB-4B` approval
first.

---

## 1. Dependency analysis (evidence-based)

```
E1-K  Governed Knowledge Reuse & Context Capitalization      (closes G-5)
  │   independent of G-12, G-1 and G-11 — disjoint planes, disjoint refs
  │   establishes the typed-reference idiom
  ▼
E1-I  Evidence → Intent Reconciliation                        (begins G-12)
  │   benefits from E1-K: binding canonical evidence refs to a proposal
  ▼
E1-R  Production Relation Observation                         (prepares G-1)
  │   DERIVE-only; closes no loop by itself
  ▼
E4-N  Need derivation + accepted ContactNeed durability       (G-1, G-2)
  ▼
E5-C  Need → Commitment / Boundary                            (G-8)
  ▼
E6-F  Commitment Fulfillment / Contribution observation       (G-11)
```

**Independence result:** G-5 does **not** have to precede G-12; they are disjoint. But E1-K, E1-I and
G-11 share one underlying missing capability — **a typed canonical reference position** (a context slot,
a proposal evidence slot, a commitment terms ref). Settling that idiom once in E1-K is the cheapest path
for all three. G-1 must precede G-11 (no fulfillment without a need). G-12 is orthogonal to the whole
Loop C chain.

`G-14` (empirical organization closure) is **not** on this critical path; it is a later evolution slice.
`G-6` (Campaign → Work admission) is **OUT OF E** and belongs to long-horizon integration.

---

## 2. Recommended order

```
1. E1-K   Governed Knowledge Reuse & Context Capitalization   ← recommended FIRST
2. E1-I   Evidence → Intent Reconciliation Foundation
3. E1-R   Production Relation Observation
```

**Why E1-K first** (and this is a recommendation, not a ranking of importance):

- It closes the **highest-value** gap — the only one that produces actual intellectual compounding.
- It is the **only** gap where Palimpsest's own asset plane is already complete and merely unconnected,
  so it needs **no new ontology and no new store**.
- Its risk is bounded and known: the `ContextManifest` wire is a closed contract, so a new reference
  block is a declared additive optional — the same shape `semantic?` and `continuation?` already used.
- It establishes the typed-reference idiom that E1-I and G-11 will both need.

`E1-I` carries the highest conceptual risk (it touches intent revision semantics) and benefits from a
settled reference discipline, so it goes second. `E1-R` is read-only and may be folded into a later
foundation if the projection falls out cheaply.

---

## 3. Explicitly deferred

| stage | gap | disposition |
|---|---|---|
| **E1-I / E2** | G-12 `Evidence → Intent Reconciliation` | deferred; do **not** implement in E0-E |
| **E1-R / later** | G-1 precondition | deferred; **do not** let E1-K grow `ContactNeed` derivation |
| **G-14** | organization empirical closure | later evolution slice |
| **G-6** | Campaign → Work admission | OUT OF E |

**E1-K must not grow a `ProjectChangeProposal`** (that is E1-I / G-12) and **must not grow `ContactNeed`
derivation** (that is E3-R / G-1).

---

## 4. Still not justified

From the owner-candidate test run across all of E0:

```
CollaborationMember       NOT NEEDED
CollaborationGroup        NOT JUSTIFIED
WorkAssignment            NOT JUSTIFIED
Contribution              NOT NEEDED
UniversalCanonicalRef     FORBIDDEN
SkillStore/ProcedureStore NOT JUSTIFIED (audit candidate G-16 only)
AgentRegistry             NOT JUSTIFIED (host deployment artifact)
```

`Fulfillment`, `ContactNeed persistence`, `ProjectChangeProposal` and `KnowledgeContextBinding` are each
classified `EXISTING_OWNER_SEMANTIC_EXTENSION` or `DERIVATION_ONLY` / `PROJECTION_OR_COMPOSITION` — none
is a new canonical owner. **No `NEW_CANONICAL_OWNER` is justified by any evidence E0 collected.**

### 4.1 Registered audit candidate — G-16

```
G-16 — Experience → reusable procedural asset
AUDIT CANDIDATE · NOT A CONFIRMED GAP · NOT A NEW OWNER
```

The Constitution now distinguishes **epistemic capital** (what the project knows) from **procedural
capital** (how it knows how to work). Procedural capital is presently descriptive (`recipes` owns no
store; host skills live outside the kernel). Before any implementation, a future audit must inspect
whether `RecipeDefinition` / `RecipeRegistry`, host skills, `ExternalAsset`, `ProducedArtifact` and
`OrganizationMemory` already express the required semantics. **No `SkillStore` / `ProcedureStore` is
created in E0.** G-16 is **not** in E1-K V1 scope.

### 4.2 Long-term pressure to watch

```
asset proliferation → typed-reference proliferation → semantic alignment pressure
```

The E0-E response is to **preserve domain-specific semantic refs**, never to introduce a
`UniversalCanonicalRef` / universal ontology. A shared *transport* idiom is acceptable; a shared
*semantic type* would dissolve the identity/owner/standing/freshness distinctions that make a reference
trustworthy.

---

## 5. Guardrails for whatever comes next

```
Do not optimize for more agents.
Optimize for a higher intellectual floor for the next worker.
```

Every proposal must answer: *does this increase the project's ability to preserve, reuse, challenge and
build upon prior cognitive labor, or is it merely another way to spawn and coordinate agents?* If the
answer is only the latter, it does not belong in the semantic kernel.
