# E0 — Project Production Assessment

**Status:** E0-E draft
**Baseline:** `main @ 9ec76ff2657706386d4cfd3e64eff60fd716d604`

The E0 audit's own record: what was measured, with what method, and what it concluded. This is the
*assessment*; the normative result lives in `PROJECT-PRODUCTION-CONSTITUTION.md`.

---

## 1. What E0 was and was not

E0 is **not** a feature campaign. It introduced **no** canonical store, identity, authority type,
agent/team ontology, or production behaviour change. Its only mission:

> **Recover the actual system model before adding another semantic noun.**

It was executed as four slices with feedback gates:

| slice | question | gate |
|---|---|---|
| **E0-A** | is the baseline what we think it is? | FB-0 |
| **E0-B** | who owns each fact today? | FB-1 |
| **E0-C** | which production-loop edges are closed? | FB-2 → FB-2R |
| **E0-D** | what do external archetypes actually prove? | FB-3 |
| **E0-E** | write it down | FB-4A/B/Final |

---

## 2. Baseline (FB-0)

```
HEAD            9ec76ff2657706386d4cfd3e64eff60fd716d604
status          clean
drift           none (tree hash identical to origin/main)
unit            2733 / 2733
e2e             38 / 38
architecture    0 violations · 9 accepted exceptions
public API      0 missing / 0 changed / 0 added
D2-LIVE         PASS 15/15
D4-LIVE         PASS 21/21
D5-LIVE         PASS 10/10
```

Metrics: 398 files · 114 025 LOC · 1 644 edges · **5 SCCs** · 9 accepted exceptions · 5 firewalls ·
4 ratchets · 2 allowlists · `UNCLASSIFIED = 0`.

Provenance note: the committed baseline's `capturedFrom` is `e699450` (the SR-2d3 head), not `9ec76ff`.
That is **provenance metadata, not drift** — SR-2e and sr2-closure changed no architecture rule and did
not re-stamp, and the checker is green against that baseline at `9ec76ff`. §三十一 forbids rewriting the
baseline early, so it was left untouched.

---

## 3. Truth ownership (FB-1)

**Method:** audit *current source and current tests only*; historical `G10-*` specs were explicitly
excluded as evidence. Four parallel plane audits (kernel / knowledge / collaboration-organization /
host-management), each claim cited to `file:line`, with the load-bearing claims independently re-verified
against the repo.

**Conclusion:** *Every currently existing semantic fact has a named owner.* The single decisive
structural fact: the `events` table has exactly **one** writer (`EventStore.#insertEvent`), and every
projection table has exactly **one** writer (`CoreProjector`).

Two capabilities have **no single owner** and are recorded as unjustified, not as candidates:
`CollaborationGroup` (Organization and RuntimeScope each supply half) and `WorkAssignment`
(RoleAssignment, Commitment, Participation are each provably not it).

The one confirmed gap this slice predicted and verified: `declareContactNeed` is explicit-creation-only,
so **`ProjectReality → ContactNeed` is absent** — and it is a *derivation* gap, not an owner gap.

---

## 4. Four-loop closure (FB-2 / FB-2R)

**Method:** edge-by-edge audit with each edge annotated by authority operation
(`READ / DERIVE / PROPOSE / ADMIT / EFFECT / PROJECT`), plus a crash-window audit and a negative control.

| loop | status |
|---|---|
| **A — Work** | **CLOSED** end-to-end (negative control: E has no reason to enter it) |
| **B — Knowledge** | production/admission **CLOSED**; future cognition **OPEN (G-5)** |
| **C — Collaboration** | components present, **loop not composed** (G-1/2/8/11) |
| **D — Evolution** | D1/D2 substantially closed; **D3 Project Intent ABSENT (G-12)**; D4 ABSENT (G-14) |

### Method corrections made during the slice

Two material corrections were required, and both are recorded rather than hidden:

1. **The frozen four-loop constitution was restored.** An earlier pass substituted a
   "Durable Collaborator" loop for the frozen **Loop D — Evolution**. The collaborator analysis was
   reclassified as **Cross-cutting Audit X** and the missing Evolution audit was performed — which is
   where the largest gap (G-12) was found.
2. **Two causal edges were withdrawn.** `Commitment → Work execution` and
   `Participation → Work execution` were rejected as `WRONG EDGE`: a direct commitment→work path would
   violate `Commitment ≠ Assignment` and `Remote Peer ≠ local Work owner`, and an Attempt provably
   executes with **zero** participation. The real missing edge is `Commitment → Fulfillment` (**G-11**).

This is the E0 method working: a plausible-looking edge was falsified by grep evidence before any design
was built on it.

---

## 5. External archetypes (FB-3)

**Method:** each system placed descriptively on three axes (temporal unit / value accumulation /
control-evolution), with no ranking. Two testable hypotheses were run: *Grok Heavy ≈ ephemeral parallel
cognition* and *does any archetype expose a durable invariant Palimpsest cannot express?*

| result | finding |
|---|---|
| Grok Heavy | **FULLY_REPRESENTABLE, NO NEW ONTOLOGY** — `ReasoningCell` + ephemeral branches already model it; branches explicitly create no identity |
| Grok Build / Kimi | host/runtime/recipe topology — **no canonical ontology** |
| Manus | context/run management; **persistent file ≠ governed asset** |
| Magentic | run-local replanning **≠** durable intent evolution (sharpens G-12) |
| Danus | reaches **ADMITTED KNOWLEDGE**; corroborates **G-5** as a real capability boundary; **FactGraph must not be copied** |
| DSH Agent Team | representable as a product composition; residual **G-4** only; **no Team/Member/Assignment ontology** |

**Two hypotheses were falsified or withdrawn:** the proposed `Commitment → Work` edge, and
`ArchitectureRecommendation → OrganizationDynamicsProposal` (old G-13). The latter was corrected by
asking the reframed question, which showed Dynamics observes *structure* while the advisor recommends
*recipe plans* — different questions, so **`OrganizationMemory ≠ OrganizationDynamics`** is frozen and
the proposed seam is recorded as not-yet-proven.

**No §23 constitution stop condition was triggered**, and **no archetype exposed a new-owner
requirement.**

### 5.1 Enterprise trajectory evidence (second external category)

A second external research artifact — an enterprise/production agentic-systems survey covering
`Anthropic engineering · JPMorganChase · Microsoft · McKinsey · BCG / MIT SMR · Deloitte · IBM · AWS ·
Google Cloud · Accenture · OpenAI · Morgan Stanley · Goldman Sachs` — was registered as
**ENTERPRISE TRAJECTORY EVIDENCE**, a category distinct from **FRAMEWORK / SYSTEM ARCHETYPE EVIDENCE**:
the first tests *representability*, the second identifies *selection pressure*. Neither becomes schema.

The supported descriptive progression is:

```
Multi-Agent Orchestration → Agent Infrastructure → Persistent Assets → Institutional Learning
```

Read conservatively, this **corroborates** E0's finding rather than redirecting it: the earlier bands
(orchestration, agent infrastructure) are where enterprise attention concentrates and are overwhelmingly
**host/platform** concerns; the trajectory points toward **persistent assets**, which Palimpsest's
knowledge planes already own; and **institutional learning** is where the trajectory is thinnest — which
is exactly where Palimpsest's open gaps sit (G-5, G-12, G-11).

Three further external observations were integrated as **supporting** evidence only:

- **Artifact coordination** (`Agent A → persistent Artifact ← Agent B`) supports *shared object >
  repeated natural-language relay* and informs future G-11 analysis — while explicitly **not** licensing
  `Artifact = Fulfillment`.
- **Context engineering** (`Context ≠ Memory ≠ Knowledge`; `Asset availability ≠ Context inclusion`)
  corroborates E1-K's pipeline without dictating its design.
- **Continuity** (`Agent_t → durable environment → Agent_t+1`) supports `ProjectContinuity > AgentMemory`
  while preserving `persistent artifact ≠ governed project asset`.

**No enterprise evidence authorized expanding E1-K V1, and none required a new canonical owner.**

---

## 6. Carried corrections into the Constitution

Three corrections the assessment produced that the normative documents must carry:

1. Current Palimpsest is **NARROW GOVERNED RESULT REUSE**, not "transcript/context only" — D5 already
   supplies `PriorResultContext` + durable lineage + fresh-authority restart.
2. Facts are recorded **per-owner**, not as one row — Work Evidence, `ProjectVerificationRun`,
   ProofEvidence and reasoning admission are four separate owners with four separate standings.
3. Gap classes are four (`DERIVATION_ONLY`, `PROJECTION_OR_COMPOSITION`,
   `EXISTING_OWNER_SEMANTIC_EXTENSION`, `NEW_CANONICAL_OWNER`), and a semantic extension inside an
   existing owner is still a serious canonical change requiring its own review.

---

## 7. E0 verdict

Per the acceptance statement: Palimpsest is centred on a durable project rather than an agent topology;
its Work kernel governs how concurrent cognition may change project reality; its knowledge planes govern
how candidate cognition becomes admitted reusable assets; its collaboration planes let independent
cognitive loci communicate and commit without turning communication into truth or responsibility into
Work authority; and its evolution planes separate project-intent, organization and runtime-structure
change. The remaining development goal is to close the production loops — not to add more agent
abstractions.

`Provisional: E0 PROJECT PRODUCTION LOOP REBASE — PASS` (ratified at FB-4).
