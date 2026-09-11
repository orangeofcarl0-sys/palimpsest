# G10-A0 — Evidence Matrix

Status: **DRAFT · EVIDENCE-GROUNDED · NOT UAS FROZEN · NO PRODUCTION SCHEMA COMMITMENT**

Every PAL-FED-derived claim consumed by
`G10-A0-EVIDENCE-GROUNDED-SEMANTIC-REBASE.md` is mapped here to its source
experiment. Branches are consumed **by reference only**; no runtime code is
inherited.

## Evidence classes

| Label | Meaning |
|---|---|
| `[MACHINE]` | mechanically proven by a test, construction, or invariant |
| `[OBSERVED]` | directly observed in real runs |
| `[STAT]` | statistically supported, within the stated limits |
| `[SUPPORTED]` | converging evidence, not one hard result |
| `[OPEN]` | not established |
| `[REJECTED]` | evidence argues against promoting it |

## Consumed sources (branch tips at consumption time)

| Branch | Tip | Key reports |
|---|---|---|
| `experiment/pal-fed-0` | `2c7a63c` | `PAL-FED-0-DELIVERY.md`, `PAL-FED-0-OPERATING-GUIDE.md` |
| `experiment/pal-fed-0-dsh` | `c0718c9` | `PAL-FED-0D-DELIVERY.md`, `evidence/pal-fed-0d-dogfood*.json` |
| `experiment/pal-fed-0e` | `bae56f9` | `PAL-FED-0E-ANALYSIS.md`, `-DELIVERY.md`, `-G10-A0-INPUT.md` |
| `experiment/pal-fed-0f` | `d1bb38c` | `PAL-FED-0F-ANALYSIS.md`, `-DELIVERY.md`, `-G10-A0-INPUT.md` |
| `experiment/pal-fed-0g` | `b310f96` | `PAL-FED-0G-ANALYSIS.md`, `PAL-FED-0G-C-REAUDIT.md`, `-G10-A0-INPUT.md` |
| `experiment/pal-fed-0h` | `d75b59b` | `PAL-FED-0H-ANALYSIS.md`, `-DELIVERY.md`, `-G10-A0-INPUT.md` |
| `experiment/pal-fed-0i` | `b4a0334` | `PAL-FED-0I-ASSESSMENT.md`, `PAL-FED-0I-ANALYSIS.md`, `-DELIVERY.md`, `-G10-A0-INPUT.md`; `evidence/pal-fed-0i-treatment-isolation.json` |

Reporting PRs: #1–#6 (0–0H), #7 (0I closure). These PRs are evidence provenance
only; G10-A0 does not depend on merging them.

## Principle → evidence → decision

| # | Principle | Source (branch @ tip · report) | Class | Strength | Counter-evidence / limitation | Decision |
|---:|---|---|---|---|---|---|
| 1 | `PersistentPoint ≠ AgentDefinition ≠ Activation` | `pal-fed-0-dsh` @ `c0718c9` · `0D-DELIVERY` §runtime binding; UAS-0 §2 | MACHINE + conceptual | strong (runtime realization) | `PersistentPoint` is a distinction, not a frozen schema | **PROMOTE (distinction)** |
| 2 | `PeerRef ≠ DshAgentId ≠ DshSessionId` | `pal-fed-0-dsh` @ `c0718c9` · 0D machine tests | MACHINE | strong | none observed | **PROMOTE** |
| 3 | A runtime relation can form without a predefined orchestration edge | `pal-fed-0`…`0i` | OBSERVED | moderate | cause of edge formation not solved | **PROMOTE (direction)** |
| 4 | §41 dependency criterion as contact selector | `pal-fed-0e` @ `bae56f9` · `0E-ANALYSIS` | REJECTED | — | scenario-dependent; over/under-contact | **REJECT** |
| 5 | Local-first boundary judgment improves specificity | `pal-fed-0f` @ `d1bb38c`, `0g` @ `b310f96` · analysis | STAT | moderate (tradeoff) | recall cost; `EvidenceExists ≠ EvidenceSufficient` open | **PROMOTE (default) + leave sufficiency OPEN** |
| 6 | Structured provenance sidecar as the cure | `pal-fed-0h` @ `d75b59b` · `0H-ANALYSIS` | REJECTED in tested form | — | H2−H1 lift 0.00 | **REJECT (tested form)** |
| 7 | One-shot epistemic intervention induces behavioural recovery | `pal-fed-0i` @ `b4a0334` · `0I-ANALYSIS` | STAT | 9/9 in tested family; n=9/arm | single model/provider, oracle conflicts | **CANDIDATE** |
| 8 | Hard gate necessary for behavioural recovery | `pal-fed-0i` @ `b4a0334` · `0I-ANALYSIS` | REJECTED | — | A2−A1 contact lift 0.00; ceiling | **REJECT** |
| 9 | Hard gate provides a stronger admission invariant | `pal-fed-0i` @ `b4a0334` · construction + machine invariants | MACHINE | strong (by construction) | only if a detection oracle exists | **PROMOTE (conceptual)** |
| 10 | `OwnerParticipation = TruthVerification` | `pal-fed-0i` @ `b4a0334` · `0I-G10-A0-INPUT` | REJECTED | — | 1/3 owner-participated resolved correct, 2 incorrect | **REJECT** |
| 11 | Owner participation is *insufficient* for semantic correctness | `pal-fed-0i` @ `b4a0334` · `0I-ANALYSIS` §5 | OBSERVED | small n | causal direction `[OPEN]` | **PROMOTE (insufficiency only)** |
| 12 | Automatic conflict detection | never tested (0I used oracle fixtures) | OPEN | — | prerequisite for production admission | **OPEN** |
| 13 | `EvaluatorAssumption ≠ CanonicalTruth` | `pal-fed-0g` @ `b310f96` · `0G-C-REAUDIT` (by `0h`) | MACHINE (audit) | strong | methodology, not runtime | **PROMOTE (methodology)** |
| 14 | `WorkerReport ≠ Evidence` | `pal-fed-0i` @ `b4a0334` · `0I-G10-A0-INPUT`; A0 admitted 8/9 on the agent's word, later partly wrong | OBSERVED + MACHINE | strong | — | **PROMOTE** |
| 15 | `AgentConfidence ≠ PolicyAdmissibility` | `pal-fed-0i` @ `b4a0334` · ADM-A09, gate design | MACHINE | strong | — | **PROMOTE** |
| 16 | `PolicyAdmission ≠ TruthVerification` | `pal-fed-0i` @ `b4a0334` · `0I-ANALYSIS` §5 | OBSERVED/STAT | moderate | rubric is a deterministic proxy | **PROMOTE** |
| 17 | Abstention (`unresolved`) is legitimate | `pal-fed-0i` @ `b4a0334` · `0I-ANALYSIS` | OBSERVED | 44%/67% of I runs; 0 dead-ends | production representation open | **PROMOTE** |
| 18 | `BoundaryContract` as minimal core | `pal-fed-0` @ `2c7a63c`, `0d` @ `c0718c9` · delivery/operating guide | OBSERVED (weak natural use) | — | not deleted from branches | **DEMOTE (optional layer)** |
| 19 | 8-kind `CollaborationEvent` ontology | `pal-fed-0`/`0d`; several kinds unused | OBSERVED | — | kind set was experimental | **DEMOTE** |
| 20 | `Thread = View(CollaborationEvents)` | `pal-fed-0` @ `2c7a63c` · spec/construction | MACHINE/ conceptual | strong | — | **PRESERVE** |
| 21 | `Wake ≠ Ack` | `pal-fed-0-dsh` @ `c0718c9` · 0D machine tests | MACHINE | strong | — | **PROMOTE** |
| 22 | `Attention ≠ Collaboration` | `pal-fed-0-dsh` @ `c0718c9` · watcher vs durable batch | MACHINE/ conceptual | strong | — | **PROMOTE** |
| 23 | New Ordarium wake primitive | `0d`…`0i` timing (change→wake ≈ 1 s; model work ≫) | OPEN / NO EVIDENCE | — | no measured need | **DEFER** |
| 24 | `LocalWorkGraph ≠ OrganizationGraph` / `≠ CollaborationGraph` | `pal-fed-0`…`0i` (no plan/task sync) | OBSERVED | strong | — | **PROMOTE** |
| 25 | `UserFocus ≠ AuthorityRoot` | `0d` scoping + `0i` no-routing recovery | SUPPORTED | moderate | — | **PROMOTE** |
| 26 | `Conversation ≠ Agreement`; `Assignment ≠ Commitment` | `0`/`0d` contract demotion + construction | SUPPORTED | moderate | future protocols open | **PROMOTE** |
| 27 | `Ownership ≠ ContactNeed` | `0f`/`0g` (locally resolvable V/L) | STAT | moderate | — | **PROMOTE** |
| 28 | `Conflict ≠ AutomaticPeerContact` | `0h` @ `d75b59b` · local adjudication | STAT | moderate | irreducible cases remain | **PROMOTE** |
| 29 | `EpistemicAdmission ≠ EffectAdmission` | `0i` (no Ordarium work) + construction | MACHINE | strong | production interface open | **PROMOTE (boundary)** |
| 30 | Ticket state can be a derived projection | `pal-fed-0i` @ `b4a0334` · restart/projection tests | MACHINE | strong | experiment-only; oracle-fed | **CANDIDATE** |
| 31 | `decision_submit` as production interface | `pal-fed-0i` @ `b4a0334` · Option B instrument | REJECTED | — | DSH-native substrate preferred | **REJECT (as core)** |

## Consolidated strength table (§74 form)

| Principle | Evidence | Strength | Promote? |
|---|---|---|---|
| PeerRef ≠ DSH identity | 0D machine tests | MACHINE | yes |
| Runtime relation can emerge | 0D–0I | OBSERVED | yes |
| §41 dependency criterion | 0E | REJECTED | no |
| local-first pinned specificity | 0F/0G | STAT | yes |
| structured provenance metadata | 0H | REJECTED in tested form | no |
| one-shot epistemic intervention | 0I | STAT / scenario-limited | candidate |
| hard gate necessary for behaviour | 0I | REJECTED | no |
| hard gate stronger invariant | 0I construction | MACHINE | conceptual |
| owner participation = truth | 0I | REJECTED | no |
| owner participation sufficient | 0I | REJECTED (1 correct / 2 incorrect) | no |
| automatic conflict detection | never tested | OPEN | no |
| Evaluator assumption = truth | 0G re-audit | REJECTED | no |
| WorkerReport = Evidence | 0I + construction | REJECTED | no |
| Thread = canonical state | 0 construction | REJECTED | no |
| BoundaryContract = minimal core | 0/0D weak use | REJECTED as core | no |

## Decision ledger

**PROMOTE (semantic distinction / boundary worth preserving)**

```text
PersistentPoint ≠ AgentDefinition ≠ Activation
PeerRef ≠ DshAgentId ≠ SessionId
UserFocus ≠ AuthorityRoot
LocalWorkGraph ≠ OrganizationGraph ≠ CollaborationGraph
Runtime collaboration may form relations without a predefined edge
Ownership ≠ ContactNeed; Conflict ≠ AutomaticPeerContact
LocalEvidenceBeforeBoundaryCrossing (default; sufficiency OPEN)
WorkerReport ≠ Evidence; AgentConfidence ≠ PolicyAdmissibility
PolicyAdmission ≠ TruthVerification; EvaluatorAssumption ≠ CanonicalTruth
EpistemicAdmission ≠ EffectAdmission
Attention ≠ Collaboration; Wake ≠ Ack
Conversation ≠ Agreement; Assignment ≠ Commitment
Unresolved ≠ Failure (abstention legitimate)
Thread = View(CollaborationEvents)
Hard gate provides a stronger invariant (conceptual, by construction)
```

**DEFER**

```text
new Ordarium wake primitive (no measured need)
one-shot intervention as production policy (candidate, scenario-limited)
ticket-as-projection as production design (candidate, oracle-fed)
```

**REJECT**

```text
BoundaryContract as minimal core
8-kind event taxonomy as canonical ontology
Thread as canonical state
§41 dependency criterion as selector
structured provenance sidecar as the cure (tested form)
owner participation as truth proof / as sufficient for correctness
hard gate as necessary for behavioural recovery
decision_submit as a production interface
central planner as the default federation model
```

## Strength language rules

Use only: `machine-proven`, `observed`, `replicated`, `supported in the tested
scenario family`, `not established`, `open`, `rejected`. Do not write
"universally proven" or "guaranteed law". Every PAL-FED claim above is traceable
to a branch, report and tip; nothing is attributed vaguely.

