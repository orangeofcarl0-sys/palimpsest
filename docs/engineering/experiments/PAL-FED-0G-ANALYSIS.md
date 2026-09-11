# PAL-FED-0G Analysis

Status: EXPERIMENTAL / BEHAVIORAL EVIDENCE / NOT UAS FROZEN.

Pre-registered: 10 primary scenarios (2 each S local-sufficient, P pinned-sufficient,
F freshness gap, U authority gap, C conflict) × 3 arms (G0 mechanism-only,
G1 local-first, G2 qualified sufficiency) × 3 replicates = **90 primary runs**,
plus 2 symmetry scenarios × 3 arms = 6 → **96 runs, 96 valid, 0 invalid**.
Run order randomized (seed 20260911) and frozen before outcomes; fixtures
audited coherent before execution; treatment isolation proven (only the compiled
guidance file differs; prompt capture shows identical tools with only the
`pal-fed:peer-collaboration` section differing — three distinct section hashes).

## Primary table (autonomous contact)

| Class | Arm | n | contact | rate | Wilson 95% CI |
| --- | --- | ---: | ---: | ---: | --- |
| S | G0 | 6 | 0 | 0% | 0% [0%, 39%] |
| S | G1 | 6 | 0 | 0% | 0% [0%, 39%] |
| S | G2 | 6 | 0 | 0% | 0% [0%, 39%] |
| P | G0 | 6 | 2 | 33% | 33% [10%, 70%] |
| P | G1 | 6 | 0 | 0% | 0% [0%, 39%] |
| P | G2 | 6 | 0 | 0% | 0% [0%, 39%] |
| F | G0 | 6 | 6 | 100% | 100% [61%, 100%] |
| F | G1 | 6 | 6 | 100% | 100% [61%, 100%] |
| F | G2 | 6 | 6 | 100% | 100% [61%, 100%] |
| U | G0 | 6 | 6 | 100% | 100% [61%, 100%] |
| U | G1 | 6 | 6 | 100% | 100% [61%, 100%] |
| U | G2 | 6 | 6 | 100% | 100% [61%, 100%] |
| C | G0 | 6 | 3 | 50% | 50% [19%, 81%] |
| C | G1 | 6 | 3 | 50% | 50% [19%, 81%] |
| C | G2 | 6 | 3 | 50% | 50% [19%, 81%] |

## Selection metrics

| Arm | S spec | P spec | S+P spec | F recall | U recall | C recall | required recall | precision | balanced acc |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G0 | 100% | 67% | 83% | 100% | 100% | 50% | 83% | 88% | 0.83 |
| G1 | 100% | 100% | 100% | 100% | 100% | 50% | 83% | 100% | 0.92 |
| G2 | 100% | 100% | 100% | 100% | 100% | 50% | 83% | 100% | 0.92 |

**Recovery metrics — all exactly zero:**

```
AuthorityRecovery  (U: G2 − G1) = 0.00
FreshnessRecovery  (F: G2 − G1) = 0.00
ConflictRecovery   (C: G2 − G1) = 0.00
SpecificityRetention (S+P: G2 − G1) = 0.00
```

G2 and G1 are behaviorally indistinguishable on every measured dimension.

## Scenario-level contact vectors

| Scenario | Class | Focal | G0 | G1 | G2 |
| --- | --- | --- | --- | --- | --- |
| S-canvas-policy | S | palimpsest.main | 0,0,0 | 0,0,0 | 0,0,0 |
| S-parse-strictness | S | palimpsest.main | 0,0,0 | 0,0,0 | 0,0,0 |
| P-pinned-cursor | P | palimpsest.main | 1,0,1 | 0,0,0 | 0,0,0 |
| P-pinned-host-contract | P | palimpsest.main | 0,0,0 | 0,0,0 | 0,0,0 |
| F-published-cursor | F | palimpsest.main | 1,1,1 | 1,1,1 | 1,1,1 |
| F-published-feed | F | palimpsest.main | 1,1,1 | 1,1,1 | 1,1,1 |
| U-stable-invariant | U | palimpsest.main | 1,1,1 | 1,1,1 | 1,1,1 |
| U-compat-commitment | U | palimpsest.main | 1,1,1 | 1,1,1 | 1,1,1 |
| C-release-authority | C | palimpsest.main | 1,1,1 | 1,1,1 | 1,1,1 |
| C-behavior-conflict | C | palimpsest.main | 0,0,0 | 0,0,0 | 0,0,0 |
| S-O-ordering | S | ordarium.main | 0 | 0 | 0 |
| U-O-consumer-authority | U | ordarium.main | 1 | 1 | 1 |

## Interpretation

1. **The 0F recall collapse did not reproduce.** 0F's F1 dropped required-contact
   recall to 56% (missing authority/intent questions). Here F and U recall were
   **100% in every arm, including G0**. With scenarios whose prompts name the
   temporal/authority frame ("currently published release", "future releases",
   "assurance"), the gap is salient enough that even the mechanism-only arm
   contacts. So 0F's misses were at least partly a **scenario-salience artifact**
   of its prompts, not an inherent local-first failure. (This also means the 0F
   R-recall figure should not be read as a stable capability limit.)
2. **Qualified sufficiency (G2) is not demonstrated to add anything.** Every
   recovery metric is exactly 0.00 because F/U were already at a 100% ceiling in
   G0/G1: the design had **no headroom** to detect G2's incremental value.
   Reporting this as "G2 unsupported" would overclaim; it is **inconclusive /
   underpowered for G2**, and a stronger design would need harder F/U scenarios
   where G0/G1 actually fail.
3. **The local-first criterion's measurable benefit replicates: P specificity.**
   G0 contacted the peer on 2/6 pinned-contract cases (33%) that the local
   pinned artifact fully answered; G1 and G2 contacted 0/6 (100% specificity).
   That is the one clean, reproducible effect across 0E/0F/0G.
4. **Conflict resolution is the genuine, treatment-resistant failure.** The C
   class split cleanly by scenario: `C-release-authority` contacted 3/3 in every
   arm; `C-behavior-conflict` contacted **0/9 in every arm**. When two local
   documents disagree about behavior, agents resolve the conflict by local
   preference instead of treating provenance/authority as the missing element.
   No prose criterion fixed it — this is the residual that would need structured
   provenance or authority representation (§66), not more prompt text.
5. **Inspection is universal and non-diagnostic.** 100% of runs inspected local
   evidence in every class and arm; premature contact was 0% everywhere. As in
   0F, inspection capability does not by itself produce selective contact.
6. **Direction symmetry holds.** O-focal local case 0/1 contact in every arm;
   O-focal authority case 1/1 contact in every arm — no fixed
   Palimpsest-asks-Ordarium direction.

## Secondary mechanics (contacted runs, n=50)

| Metric | value |
| --- | --- |
| autonomous receipt / response / reply delivery | 100% / 100% / 98% |
| ack rate | 70% |
| pending after idle | 24% |
| contract touched / bilaterally agreed | 14% / 2% |
| `collab_thread` usage | 52% |
| event kinds | question 37, decision 29, evidence 22, need 11, proposal 2; **constraint / change_ready / blocker = 0** |
| event count mean / median | 1.05 / 2 |
| message size | 66 events > 2 KB, 35 > 4 KB, max 6 742 chars |

Latency: change→wake median **953 ms**, wake→inbox **924 ms**, change→response
**56.3 s** (model-dominated). 2 s polling adequate.

## §64 Confound audit

| Confound | Status |
| --- | --- |
| Tool-description collaboration priming | Same six collab tools in all arms; only the criterion section differs. |
| Repository evidence asymmetry | Fixtures audited coherent (declared == installed) before runs; class F uses a genuine published 1.2.0 install vs the current published 1.3.1. |
| Prompt ownership cues | Non-directive, no "record"; **residual and material**: F/U prompts state the temporal/authority frame, which likely drove the 100% recall and the G2 ceiling. |
| Scenario difficulty imbalance | Real: F/U proved easy (100% recall all arms); C split by scenario. This is the main limitation. |
| Model stochasticity | Real DeepSeek, no honored seed; 3 replicates per class per arm. |
| Provider drift | Single route; no upgrades. |
| Read-tool failures | None observed; inspection 100%. |
| Fixture coverage | No genuine unreleased Ordarium HEAD exists (repo tip is 1.3.1), so F uses the real published-release gap; documented, not fabricated. |

## §64–§69 outcome and verdict

- Not **Outcome A** (G2 works): no recovery, because there was nothing to recover.
- Not **Outcome B** (inspection alone): G0 had lower P specificity (67%), so the
  criterion does add specificity.
- Not **Outcome C** (G2 over-contacts): G2 specificity stayed at 100%.
- Partially **Outcome D** for the conflict class: required contact was missed,
  but only for `C-behavior-conflict`, in every arm.
- **Outcome E (authority and freshness behave differently):** not observed —
  both were at 100%; the dimension that failed was **conflict/provenance**.

**Verdict: keep experimental.** The local-first criterion's specificity benefit
is replicated and should be carried forward; the qualified-sufficiency wording
(G2) is **not evidenced** and must not be promoted; F/U recall is
scenario-salience dependent and needs harder scenarios before any recall claim;
conflict/provenance resolution is the one genuine unsolved dimension and points
to structure, not prose.

## Gates implied by this study

- **Polling (§75):** adequate; do not request a new Ordarium primitive.
- **Ack guard (§52):** ack 70%, pending 24% — still acceptable, no guard.
- **BoundaryContract (§72):** touched 14%, agreed 2% → recommend **not**
  promoting it as a fundamental primitive; keep as optional.
- **Event taxonomy (§73):** the same 3 kinds (`constraint`, `change_ready`,
  `blocker`) are unused a third time → collapse in future design.
- **Thread (§74):** 52% usage, still only a derived convenience view.


---

## Addendum (2026-09-11) — C-class ground-truth correction

See `PAL-FED-0G-C-REAUDIT.md`. The frozen raw results are unchanged:
`C-release-authority` 9/9 contact and `C-behavior-conflict` 0/9 contact in every
arm. However, the re-audit shows `C-behavior-conflict` should have been
classified **V (version/temporal-scope resolvable)**, not `I` (irreducible):
the "historical record" is an authority/alignment document rather than a
competing behavioural claim, the decision concerns the *current pinned*
integration, and the repo's own recorded dependency-truth rule makes the pinned
1.3.1 contract applicable. (The 1.2.0 release contains no cursor-invalidation
error at all, so the prompt's premise was also factually unsupported.)

Consequently the interpretation **"conflict/provenance resolution is the
surviving failure" is no longer considered established**: the single scenario
supporting it had incorrect contact ground truth, and 0G contained **no valid
`I`-class case** at all. The statement in §"Interpretation" item 4 and in the
verdict is hereby downgraded to *not established*; all other 0G findings
(specificity, F/U ceiling, G2≈G1, secondary mechanics) are unaffected.
