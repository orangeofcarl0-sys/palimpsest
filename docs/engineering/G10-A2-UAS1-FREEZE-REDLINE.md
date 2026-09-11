# G10-A2 — UAS-1 Freeze Redline (Candidate → Frozen)

Status: **FREEZE RECORD**

Maps `UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE-v1-CANDIDATE.md` (as reviewed at
`experiment/g10-a1-uas-semantic-consolidation` @ `1638a7b`) to
`UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE-v1.md` (PLMP-UAS-1, FROZEN).
Classifications: `UNCHANGED`, `NARROWED`, `RELABELLED`, `SPLIT`, `DEMOTED`,
`REMOVED`, `OPEN-FROZEN`.

## Pre-freeze corrections applied to the reviewed chain

Narrow corrections were applied in this review, docs-only, before freezing:

| Where | Correction | Review ID |
|---|---|---|
| Candidate §3 concern table (Definition row) | "Architecture, Work, Binding" → "primarily Architecture and Work; `BindingDefinition` spans Architecture/Work/Runtime/Continuity" | FR-01 |
| `G10-A1-UAS-SEMANTIC-CONSOLIDATION.md` §3 (same row) | same correction | FR-01 |
| Candidate §7 non-equivalence table | `Invocation ≠ Participation? [OPEN]` → "Invocation / Participation relation model = INTENTIONALLY OPEN" | FR-02 |
| Candidate §13 invariant table | labels narrowed: CAND-INV-03/04/09 relabelled; CAND-INV-12 marked SPLIT | FR-03/04/05/06 |
| Candidate header | additive supersession note pointing at the frozen spec | §118 (additive status note) |

No candidate content was deleted; the candidate remains the audited record.

## Section-by-section mapping

| Candidate item | Frozen item | Classification | Rationale |
|---|---|---|---|
| §1 status header | §1 scope/status | NARROWED | adds "semantic boundaries only" and provenance pointer |
| §2 model shape (`UAS = …`; `Dimensions × ConcernDomains`) | §2 | NARROWED | classification matrix, not Cartesian product (FR-08) |
| §2 dimensions table | §3 frozen dimensions | UNCHANGED | four dimensions only; no Binding/Collaboration/Governance/Effect dimension |
| §3 concern table | §4 concern domains | NARROWED + RELABELLED | Definition row fixed (FR-01); `ConcernDomain ≠ Dimension` and `≠ CanonicalStore` frozen as `UAS1-INV-30` |
| Continuity naming | §4 naming note | UNCHANGED | dimension `Continuity`; concern `Identity & Continuity` |
| §4 dimension × concern matrix | §2 matrix statement | NARROWED | matrix semantics clarified; per-cell instantiation not implied |
| §5 entity table | §5 core entities | UNCHANGED + RELABELLED | canonicality status made explicit per entity (current/candidate/derived/open) |
| §6 relations | §6 relations and open zones | OPEN-FROZEN | frozen relations listed; Invocation/Participation, definition↔point binding, PeerRef↔point, Binding schema marked intentionally open |
| §7 non-equivalence table | §7 invariants `UAS1-INV-01..30` | NARROWED + SPLIT | `?[OPEN]` syntax removed (FR-02); mixed-strength rows split; per-pair statements |
| CAND-INV-01/02/05/15/16/17 | INV-01/02/03/08/05/06 | UNCHANGED | historical invariants preserved verbatim in meaning |
| CAND-INV-03 | INV-10 | RELABELLED | SUPPORTED ARCHITECTURAL DISTINCTION (FR-03) |
| CAND-INV-04 | INV-11 | SPLIT + RELABELLED | per-pair distinctions (FR-04) |
| CAND-INV-06 | INV-12 | UNCHANGED | machine-backed, correctly labelled |
| CAND-INV-07 | INV-28 | UNCHANGED | minimal UserFocus definition added |
| CAND-INV-08 | INV-15 | UNCHANGED | three pairwise claims, one basis |
| CAND-INV-09 | INV-23, INV-24 | SPLIT + RELABELLED | report and event distinctions separated; delivery ≠ truth clause added (FR-05) |
| CAND-INV-10 | INV-25 | UNCHANGED | — |
| CAND-INV-11 | INV-26 | RELABELLED | machine-backed fact separated from ownership decision (FR-07) |
| CAND-INV-12 | INV-17, INV-18 | SPLIT | Wake≠Ack machine-backed; Attention≠Collaboration architectural (FR-06) |
| CAND-INV-13 | INV-19, INV-20 | SPLIT | two single-claim invariants |
| CAND-INV-14 | INV-27 | NARROWED | failure modes enumerated; persistence format not frozen |
| (new) | INV-04, INV-07, INV-09, INV-13, INV-14, INV-16, INV-21, INV-22, INV-30 | NEW (promoted from prose) | close gaps found by review; each single-claim |
| §8 graph species | §8 | RELABELLED | explicit canonicality vocabulary (`CURRENT CANONICAL` … `SEMANTIC ONLY`) |
| §9 PersistentPoint | §9 | NARROWED | minimal definition frozen; properties demoted to possible/typical; `= instantiate(AgentDefinition)` not frozen |
| §9 PeerRef↔PersistentPoint | §9 + §14 | OPEN-FROZEN | decision C retained: boundary frozen, relation open; no invariant depends on it |
| §10 Invocation/Participation | §6 + §14 | OPEN-FROZEN | question clarified; no schema/cardinality/ownership tree |
| §11 cross-cutting formalizations | §10 | UNCHANGED + NARROWED | epistemic admission defined minimally; no API/gate/ticket frozen |
| §12 minimal core | §12 (informative) | DEMOTED | informative reference profile with per-element status; not a frozen tuple |
| §12.2 rejected core | §14 exclusions | UNCHANGED | negative decisions retained |
| §13 candidate invariants | §7 | renumbered | frozen numbering describes final semantics (UAS1-INV-01..30) |
| §14 heuristics | §13 | UNCHANGED | explicitly non-normative; three multi-agent forms demoted to informative taxonomy |
| §15 responsibility table | §11 | UNCHANGED | conceptual-responsibility caveat added |
| §16 data flow | (dropped) | REMOVED | informative diagram not needed in the frozen spec; CURRENT/FUTURE labelling discipline retained in review |
| §17 open questions | §14 | OPEN-FROZEN | restructured as open-point table with frozen surrounding boundary |
| §18 readiness | review verdict | SUPERSEDED | replaced by `FREEZE REVIEW: PASS` |

## Evidence-label scheme (audit provenance)

Carried by the freeze review and redline, **not** normative in the frozen spec:
`[HISTORICAL INVARIANT]`, `[MACHINE-BACKED]`,
`[MACHINE-BACKED ARCHITECTURAL DISTINCTION]`,
`[SUPPORTED ARCHITECTURAL DISTINCTION / BOUNDARY]`,
`[EVIDENCE-GROUNDED ARCHITECTURAL INVARIANT]`, `[SUPPORTED DIRECTION]`,
`[DESIGN PROPOSAL]`, `[OPEN]`.

## Net effect

Nothing was removed from the semantic content except the ambiguous `≠?` syntax
and an informative diagram; two mixed-strength invariants were split; four labels
were tightened; one table error (Binding-as-dimension) was corrected; the
Minimal Persistent Peer Core and the multi-agent taxonomy were demoted to
informative status. No UAS-0 invariant was revoked; PLMP-UAS-0, AGT-0 and PAG-0
remain untouched.
