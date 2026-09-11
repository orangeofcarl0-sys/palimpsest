# G10-A1 — UAS-0 → UAS-1 Candidate Redline

Status: **DRAFT · NOT FROZEN**

Every material UAS-0 principle is classified against the G10-A0 evidence and
formalized in the candidate. Decisions: `PRESERVE`, `REFINE`, `SUPERSEDE`,
`NEW`, `OPEN`. UAS-0 itself is not edited.

## UAS-0 core dimensions and invariants

| UAS-0 concept / invariant | G10-A0 evidence | UAS-1 candidate decision | Rationale |
|---|---|---|---|
| §2 `Architecture ≠ Work ≠ Runtime ≠ Continuity` | PAL-FED supports carrier/identity splits; no contradiction | **PRESERVE** (`UAS1-CAND-INV-01`) | Orthogonal dimensions remain; concerns cross-cut, not replace |
| §2 four dimensions | G10-A0 six planes | **REFINE** | Planes become cross-cutting **concern domains**; dimensions unchanged |
| UA-INV-1 `AgentDefinition ≠ TaskDefinition` | PAL-FED-0I used distinct `PeerRef`; Work lineage untouched | **PRESERVE** (`INV-02`) | No contradiction |
| UA-INV-2 `Architecture ≠ Work` | — | **PRESERVE** | — |
| UA-INV-3 `Definition ≠ Activation` | — | **PRESERVE** | — |
| UA-INV-4 dynamic runtime must not silently rewrite Definition Graph | PAL-FED ephemeral actors never auto-promoted | **PRESERVE** | Reinforced by explicit-promotion rule |
| UA-INV-5 context exposure explicit | — | **PRESERVE** | — |
| UA-INV-6 state scope explicit | — | **PRESERVE** | — |
| UA-INV-7 scheduler is orchestration policy, not the runtime definition | 0I gate added no scheduler work | **PRESERVE** | Scheduler purity untouched |
| UA-INV-8 profile declares fidelity + lineage | — | **PRESERVE** | — |
| UA-INV-9 approximate ≠ native equivalence | — | **PRESERVE** | — |
| UA-INV-10 foreign runtime wrappable as Holon | Holon left OPEN | **PRESERVE** | — |
| UA-INV-11 synthesis only yields proposal/patch | — | **PRESERVE** | — |
| UA-INV-12 persistence optional and orthogonal | PersistentPoint added without making persistence mandatory | **PRESERVE** | Reinforced |
| UA-INV-13 Ordarium keeps effect authority | 0I required no Ordarium change | **PRESERVE** (`INV-11` boundary) | `EpistemicAdmission ≠ EffectAdmission` added |
| UA-INV-14 free/hand-built graphs stronger than presets | — | **PRESERVE** | — |
| §5 Definition / Runtime / Trace separation | — | **PRESERVE** | — |
| §8 Channels as communication semantics | Collaboration concern reframed cross-cutting | **REFINE** | Collaboration is a concern domain spanning dimensions |
| §9 Context as first-class axis | — | **PRESERVE** | — |
| §10 State scope typed | — | **PRESERVE** | — |
| §11 Orchestration as strategy | Scheduler purity preserved | **PRESERVE** | — |
| §19 AGT-0/PAG-0 as cited constraints | AGT/PAG audited in the memo | **REFINE** | Group/Organization/Holon/RuntimeScope kept distinct from PersistentPoint |

## G10-A0 additions carried into the candidate

| G10-A0 principle | Evidence | UAS-1 candidate decision | Rationale |
|---|---|---|---|
| `PersistentPoint` continuity distinction | PAL-FED-0D machine + G10-A0 | **NEW** (`INV-03/04`) | First-class semantic distinction, no schema |
| `PeerRef ≠ DshAgentId ≠ DshSessionId` | PAL-FED-0D machine tests | **NEW** (`INV-04/06`) | Machine-backed |
| `PeerRef ↔ PersistentPoint` relation | not established | **OPEN** | Decision C; lean B, not adopted |
| `UserFocus ≠ AuthorityRoot` | G10-A0 supported | **NEW** (`INV-07`) | — |
| `WorkGraph ≠ OrganizationGraph ≠ CollaborationGraph` | UAS-0 + PAL-FED | **NEW/REFINE** (`INV-08`) | Extends SystemGraph≠WorkGraph |
| `WorkerReport ≠ Evidence`; `CollaborationEvent ≠ Evidence` | PAL-FED-0I | **NEW** (`INV-09`) | — |
| `PolicyAdmission ≠ TruthVerification` | PAL-FED-0I observed | **NEW** (`INV-10`) | — |
| `EpistemicAdmission ≠ EffectAdmission` | PAL-FED-0I boundary | **NEW** (`INV-11`) | `[MACHINE-BACKED ARCHITECTURAL DISTINCTION]` |
| `Wake ≠ Ack`; `Attention ≠ Collaboration` | PAL-FED-0D machine | **NEW** (`INV-12`) | — |
| `Conversation ≠ Agreement`; `Assignment ≠ Commitment` | PAL-FED-0/0D | **NEW** (`INV-13`) | — |
| `Unresolved` legitimate | PAL-FED-0I observed | **NEW** (`INV-14`) | — |
| Graph species + canonicality | UAS-0/experiments | **NEW** | Five species, one canonicality table |
| Minimal Persistent Peer Core | PAL-FED-0D…0I | **NEW (candidate)** | Classified; not a frozen schema |
| `Invocation`/`Participation` | not established | **OPEN** | Question clarified, not forced |

## Demotions / rejections (from G10-A0)

| Abstraction | Evidence | Decision | Rationale |
|---|---|---|---|
| `BoundaryContract` as minimal core | weak natural use | **SUPERSEDE** (remain optional) | Not core; not deleted experimentally |
| 8-kind `CollaborationEvent` ontology | several kinds unused | **SUPERSEDE** | Generic event + optional kind + refs |
| `Thread` as canonical state | construction | **PRESERVE as derived** | `Thread = View(CollaborationEvents)` |
| §41 dependency criterion as selector | PAL-FED-0E | **SUPERSEDE** (rejected) | Not a selector |
| structured provenance sidecar | PAL-FED-0H | **SUPERSEDE** (rejected in tested form) | H2−H1 lift 0.00 |
| owner participation as truth | PAL-FED-0I | **SUPERSEDE** (rejected) | 1/3 owner-participated resolved correct, 2 incorrect |
| hard gate as necessary | PAL-FED-0I | **SUPERSEDE** (rejected) | Behavioural ceiling; invariant worth preserving |
| `decision_submit` as production interface | Option B instrument | **SUPERSEDE** (excluded) | Principle retained, API not |
| new Ordarium wake primitive | timing evidence | **OPEN / DEFER** | No measured need |
| central planner as default federation | PAL-FED-0D…0I | **SUPERSEDE** (rejected) | Peer sovereignty |

## Historical-preservation redlines (must not change)

| Item | Decision |
|---|---|
| `docs/engineering/UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE.md` (PLMP-UAS-0) | **PRESERVE unedited** |
| AGT-0 / PAG-0 frozen specs | **PRESERVE unedited** |
| current `definition_id` = Work/Task lineage | **PRESERVE** (`INV-16`); no in-place reuse |
| current `AgentGraph v1` = WorkGraph/task-bearing | **PRESERVE** (`INV-17`); no rename in this batch |
| current GraphPatch = Work patch | **PRESERVE**; typed unions OPEN |
| CanvasDoc v3 = Work authoring surface | **PRESERVE**; shared renderer, separate truth |
| G9 scheduler invariants (`decide()` pure / `commit()`) | **PRESERVE** |

## Net redline

```text
PRESERVE : all four dimensions; UA-INV-1..14; three-graph separation;
           definition_id and AgentGraph semantics; GraphPatch/Canvas/scheduler;
           Ordarium and DSH boundaries; AGT/PAG frozen docs.
REFINE   : G10-A0 planes → cross-cutting concern domains; Continuity dimension
           vs Identity & Continuity concern; AGT/PAG plane re-reading; Binding
           as the definition↔continuity seam; evidence-label scheme.
NEW      : PersistentPoint; PeerRef/runtime split; graph species + canonicality;
           epistemic/effect admission distinctions; abstention; minimal core.
SUPERSEDE: "plane/layer" label for the six concerns; BoundaryContract-as-core;
           strong event ontology; §41 criterion; provenance sidecar; owner
           participation as truth; hard-gate-as-necessary; decision_submit-as-API;
           central-planner default.
OPEN     : Invocation/Participation; PeerRef↔PersistentPoint; conflict
           detection; verification; authority representation; admission API;
           provenance/org-memory schema; Binding schema; typed patches; dynamic
           promotion/discovery; Holon; attention scheduling; commitments.
```

No UAS-0 invariant is superseded. The only `SUPERSEDE` rows are either the
"plane/layer" label or experimentally-demoted mechanisms that were never UAS-0
invariants.
