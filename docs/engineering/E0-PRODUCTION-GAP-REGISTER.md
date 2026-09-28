# E0 — Production Gap Register

**Status:** E0-E draft
**Baseline:** `main @ 9ec76ff2657706386d4cfd3e64eff60fd716d604`
**Evidence:** FB-1 (E0-B), FB-2R (E0-C), FB-3 (E0-D).

Rejected edges are recorded as first-class architecture evidence. They are **not** deleted.

---

## 1. Gap taxonomy (frozen)

Four classes. The older binary "composition only vs new owner" was too coarse.

| class | meaning | still a canonical change? |
|---|---|---|
| **DERIVATION_ONLY** | both owners exist; only an `A → B` derivation is missing | no — pure function over existing facts |
| **PROJECTION_OR_COMPOSITION** | the primitive/fact exists; only exposure, wiring or a view is missing | no |
| **EXISTING_OWNER_SEMANTIC_EXTENSION** | an existing owner must learn a new fact/state/ref position | **YES — requires its own migration/compatibility review** |
| **NEW_CANONICAL_OWNER** | no existing owner holds the fact's identity, lifecycle **and** mutation | **YES — requires strict proof** |

A semantic extension inside an existing owner is a serious canonical change even though it creates no new
module. It must not be smuggled in as "just wiring".

---

## 2. Open gaps

| id | loop | edge | class | criticality | evidence |
|---|---|---|---|---|---|
| **G-1** | C2 | `ProjectReality → NeedCandidate` | **DERIVATION_ONLY** | BLOCKS E CORE | `federation_service.ts` §50 guard: *"explicit creation only — never auto-derived from blocked tasks, dependencies, or worker failures"*; a test asserts no `deriveNeedFromTask`/`autoDerive`/`onBlocked` symbol exists |
| **G-2** | C2 | accepted `ContactNeed` durability | **EXISTING_OWNER_SEMANTIC_EXTENSION** | BLOCKS E CORE (crash window) | `materializeContactNeed` writes nothing; only `CONTACT_REQUESTED{contactNeedId, from, to}` persists — origin/tags/reason lost |
| **G-4** | X | `PeerRef ↔ PersistentPoint` governed binding | **EXISTING_OWNER_SEMANTIC_EXTENSION** | BLOCKS E CORE (Audit X layer B only) | `PeerContinuityAssociation` sourced from `profile.persistentPoint` — deployment config, no history/change control |
| **G-5** | B | admitted knowledge → future `ContextManifest` | **PROJECTION_OR_COMPOSITION** *(binding + selection policy)* | **BLOCKS FUTURE INTELLIGENCE COMPOUNDING** | `context/service.ts` has no proof/reasoning port; `ContextRequirement` has no asset slot; zero imports from the knowledge planes |
| **G-8** | C2 | `ContactNeed → scoped Commitment` | **DERIVATION_ONLY** | BLOCKS E CORE | `contact_need` is a declared `CommitmentScope` kind with **no producer** anywhere in `src/` |
| **G-11** | C2 | `Commitment → Fulfillment observation` | **EXISTING_OWNER_SEMANTIC_EXTENSION** | BLOCKS E CORE | no `FULFILLED` state; zero contribution/fulfillment concepts in `src/`; commitment terms are a free string with no typed ref; handoff transfers responsibility rather than satisfying it. External *artifact coordination* (`Agent A → artifact ← Agent B`) supports referencing over narration, but see §4.2 |
| **G-12** | D3 | `Evidence → Project Intent revision proposal` | **DERIVATION_ONLY** | BLOCKS E CORE (largest gap) | no proposal type; `PlanInput` has no evidence-ref field; management refuses goal/requirements; only `OPPORTUNITY` promotable and caller-authored |
| **G-14** | D4 | intervention ↔ proposal/evolution linkage ↔ later empirical evaluation | **EXISTING_OWNER_SEMANTIC_EXTENSION** | BLOCKS FUTURE INTELLIGENCE COMPOUNDING | `InterventionRecord.proposalDigest`/`evolutionCaseRef` exist and **nothing populates them**; no later evaluation link |
| **G-15** | C1 | Participation product exposure | **PROJECTION_OR_COMPOSITION** | BLOCKS E CORE | `beginParticipation` absent from `application/surfaces/federation.ts`; unreachable from any surface |
| **G-16** | B | `Experience → reusable procedural asset` | **AUDIT CANDIDATE** — not a confirmed gap | UNKNOWN | enterprise trajectory evidence points at "persistent assets (artifact · memory · skill · procedure)"; Palimpsest's procedural capital (recipes, host skills) is **descriptive only**. See §3.1 |
| **G-6** | — | `Campaign → Work admission` | **PROJECTION_OR_COMPOSITION** | OUT OF E | `campaign/compiler.ts`: *"no CampaignWorkAdmissionPort is configured"*; no production implementer |
| **G-7** | — | session conversation durability | **EXISTING_OWNER_SEMANTIC_EXTENSION** | OPTIONAL | `SessionRef` is host-owned and *"never synthesized"*; nothing persists a conversation |

---

## 3. Rejected edges (WRONG EDGE / NOT A GAP)

Recorded deliberately. Each is evidence about the architecture, not a mistake to erase.

| edge | why rejected |
|---|---|
| `Commitment → Work execution` | violates `Commitment ≠ Assignment` and `Commitment ≠ Work ownership` (both pinned in `federation/commitment.ts`), plus `Remote Peer ≠ local Work owner`. No such path exists; none should. The real missing edge is **G-11**. |
| `Participation → Work execution` | an Attempt executes with **zero** participation (`grep -c participation src/interaction/work_delegation.ts` = 0). Participation is observational metadata. The real finding is **G-15**. |
| `ArchitectureRecommendation → OrganizationDynamicsProposal` (old G-13) | different vocabularies answering different questions: the advisor recommends a **recipe plan**; Dynamics diagnoses **structure**. Dynamics observes no `organization_memory` today, and its intended content seam (`OrganizationDynamicsAdvisorPort`) is deliberately host-supplied. |
| `Message → Evidence` | pinned: *"`body ≠ Evidence` — always"*. |
| `Team / Member / Assignment` ontology | every DSH feature maps onto existing owners (`PeerRef`, `Activation`, `PersistentPoint`, Message, Participation, Commitment, Work, RuntimeScope). Team is a **product/runtime composition**, not a semantic owner. |
| `CollaborationGroup` | no closed loop requires it. Organization and RuntimeScope each supply **half** of the semantics; the burden of proof is unmet. |
| `WorkAssignment` | no closed loop requires it. `RoleAssignment` is organizational position; `Commitment` is a cross-peer promise; `Participation` explicitly denies ownership/assignment. |
| `FactGraph` / `UniversalAsset` | `reasoning_cell` already provides candidate → verify → admit → revoke. The missing edge is reuse (**G-5**), not the asset model. |
| `CollaborationMemberId` | `PeerRef` is already a durable collaboration identity (Audit X layer A **CLOSED**). Only the *binding* (G-4) is ungoverned. |
| `UniversalCanonicalRef` / `AnyRef` / `SemanticObjectRef` / `GlobalEvidenceRef` | see §4. |
| `persistent file = governed project asset` | `ProjectWorkspace ≠ CanonicalStore`. |
| run-local replanning = durable intent evolution | different rungs of the §5 ladder. |

---

## 4. Reference discipline (frozen)

Three separate gaps share one **design pattern** — a typed canonical reference position:

```
E1-K : knowledge asset    → context reference position
E1-I : evidence asset     → project-change proposal support position
G-11 : commitment         → fulfillment reference position
```

> **SAME DESIGN PATTERN ≠ SAME DOMAIN TYPE.**

Introducing `UniversalCanonicalRef`, `UniversalAssetRef`, `AnyRef`, `SemanticObjectRef` or
`GlobalEvidenceRef` merely to share mechanics is **forbidden**. Domain-specific typed references must
preserve **identity, owner, standing, freshness and authority implications**. A `ProofClaimRef` and a
`ReasoningClaimRef` are not interchangeable merely because both are assets.

### 4.1 Why this pressure intensifies

Enterprise experience with registries and catalogs shows the pressure grows with asset count:

```
asset proliferation → typed-reference proliferation → semantic alignment pressure
```

The response remains **preserve domain-specific semantic refs** — never a universal reference or a
universal ontology. A shared *transport* idiom is acceptable; a shared *semantic type* would dissolve the
distinctions above.

### 4.2 Artifact coordination — what it does and does not support

External pattern:

```
Agent A → persistent Artifact ← Agent B
```

with lightweight refs / path / id exchanged between workers. It supports **shared object > repeated
natural-language relay**, and it is supporting evidence for the *direction* of G-11's future analysis (a
delivery is better referenced than narrated).

It does **not** license `Artifact = Fulfillment`. An artifact existing is not a promise being satisfied:
satisfaction requires the promise, the deliverable and the acceptance to be related — which is exactly
what G-11 records as missing.

---

## 5. Gap criticality ladder (G-5 / G-12 market test)
```
run-local replanning
task replanning                    ← most external systems stop here
durable decision revision
requirement revision
goal revision                      ← nobody reaches these from evidence
organization revision              ← Palimpsest D1/D2 reach this, but from observation not evidence
```

Current Palimpsest: **task replanning** plus a caller-authored opportunity path. G-12 is an open niche,
not a solved commodity.

---

## 6. Owner-candidate dispositions

| candidate | verdict |
|---|---|
| `CollaborationMember` | **NOT NEEDED** |
| `CollaborationGroup` | **NOT JUSTIFIED** |
| `WorkAssignment` | **NOT JUSTIFIED** |
| `Contribution` | **NOT NEEDED** |
| `Fulfillment` | **EXISTING_OWNER_SEMANTIC_EXTENSION** (commitment needs a typed ref position + a terminal fact) |
| `ContactNeed persistence` | **EXISTING_OWNER_SEMANTIC_EXTENSION** (extend the federation owner; do not invent an owner) |
| `ProjectChangeProposal` | **DERIVATION_ONLY** (no store proven necessary) |
| `KnowledgeContextBinding` | **PROJECTION_OR_COMPOSITION** (a manifest slot + a selection policy) |
| `SkillStore` / `ProcedureStore` (procedural capital) | **NOT JUSTIFIED — audit candidate G-16 only** |

**No `NEW_CANONICAL_OWNER` is justified by any evidence collected in E0.**

---

## 7. G-16 — audit candidate (registered, NOT confirmed)

```
G-16 — Experience → reusable procedural asset
Status: AUDIT CANDIDATE · NOT A CONFIRMED GAP · NOT A NEW OWNER
```

**Why it is registered.** The enterprise trajectory evidence (§1 of the market document) describes a
progression through "persistent assets — artifact · memory · skill · procedure", and the Constitution
now distinguishes **epistemic capital** from **procedural capital** (§3.1). Palimpsest's procedural
capital today is descriptive, not governed: `recipes` declares plans and *"owns no store and no mutator
beyond the injected services"*, and host skills live outside the kernel.

**What a future audit must inspect before any implementation** — whether the required semantics are
already expressible:

```
RecipeDefinition / RecipeRegistry     descriptive plan + immutable in-code registry
host skills                           deployment/host-side capability loading
ExternalAsset                         externally-owned asset reference/import
ProducedArtifact                      a result's declared outputs
OrganizationMemory                    empirical record (what was measured, how)
```

**Constraints on that future work:**

- **Do not create a `SkillStore` or `ProcedureStore` in E0-E.**
- G-16 is **not** part of E1-K V1 scope; procedural assets remain deferred pending this audit.
- If the audit concludes a governed class is required, it must pass the four-condition new-owner test
  **and** be classified `EXISTING_OWNER_SEMANTIC_EXTENSION` vs `NEW_CANONICAL_OWNER` explicitly.
- Whatever the outcome, `What we know ≠ How we know how to work` stays frozen: procedural capital must
  not be merged into the epistemic asset planes merely because both are "assets".
