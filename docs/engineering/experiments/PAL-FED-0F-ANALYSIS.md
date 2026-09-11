# PAL-FED-0F Analysis

Status: EXPERIMENTAL / BEHAVIORAL EVIDENCE / NOT UAS FROZEN.

Pre-registered design: 11 primary scenarios (3 R peer-required, 3 L local-sufficient,
3 P pinned-contract-sufficient, 2 A ambiguous) × 2 treatment arms (F0 = mechanism
guidance only; F1 = mechanism + local-first boundary criterion) × 3 replicates
(2 for A) = **62 primary runs**, plus 4 symmetry runs (O focal) = **70 runs,
70 valid, 0 invalid**. Treatment isolation mechanically verified; real
read-only repository tools enabled in both arms; run order randomized (seed
20260911) and frozen before outcomes.

## Primary table (autonomous contact)

| Class | Treatment | n | contact | rate | Wilson 95% CI |
| --- | --- | ---: | ---: | ---: | --- |
| R | F0 | 9 | 9 | 100% | 100% [70%, 100%] |
| R | F1 | 9 | 5 | 56% | 56% [27%, 81%] |
| L | F0 | 9 | 2 | 22% | 22% [6%, 55%] |
| L | F1 | 9 | 0 | 0% | 0% [0%, 30%] |
| P | F0 | 9 | 2 | 22% | 22% [6%, 55%] |
| P | F1 | 9 | 0 | 0% | 0% [0%, 30%] |
| A | F0 | 4 | 3 | 75% | 75% [30%, 95%] |
| A | F1 | 4 | 1 | 25% | 25% [5%, 70%] |

## Selection metrics

| Arm | R recall | L specificity | P specificity | L+P specificity | precision | balanced acc |
| --- | --- | --- | --- | --- | --- | --- |
| F0 | 100% (9/9) | 78% | 78% | 78% | 69% | 0.89 |
| F1 | 56% (5/9) | 100% | 100% | 100% | 100% | 0.78 |

**Δ specificity(L+P) = +0.22; Δ recall(R) = −0.44**; exploratory Fisher exact on
R contact p = 0.082 (n=9/arm — wide, not decisive alone).

Inspection before contact (relevant `repo_*` tool use) and premature contact:

| Arm | inspect R | inspect L | inspect P | premature R/L/P |
| --- | --- | --- | --- | --- |
| F0 | 100% | 100% | 100% | 0% / 0% / 0% |
| F1 | 100% | 100% | 100% | 0% / 0% / 0% |

## Scenario-level contact vectors

| Scenario | Class | Focal | F0 | F1 |
| --- | --- | --- | --- | --- |
| R-future-compat | R | palimpsest.main | 1,1,1 | 1,1,1 |
| R-deployed-error | R | palimpsest.main | 1,1,1 | 1,0,1 |
| R-new-primitive | R | palimpsest.main | 1,1,1 | **0,0,0** |
| L-canvas-freshness | L | palimpsest.main | 0,0,0 | 0,0,0 |
| L-parse-strictness | L | palimpsest.main | 0,0,0 | 0,0,0 |
| L-test-layout | L | palimpsest.main | 1,0,1 | 0,0,0 |
| P-cursor-semantics | P | palimpsest.main | 0,0,0 | 0,0,0 |
| P-error-code | P | palimpsest.main | 1,0,0 | 0,0,0 |
| P-host-contract | P | palimpsest.main | 1,0,0 | 0,0,0 |
| A-freshness | A | palimpsest.main | 0,1 | 1,0 |
| A-ownership | A | palimpsest.main | 1,1 | 0,0 |
| S-O-R-consumer | R | ordarium.main | 1,1 | 1,1 |
| S-O-L-ordering | L | ordarium.main | 0,0 | 0,0 |

Symmetry (pooled arms): R contact 4/4; L contact 0/4.

## Secondary metrics (contacted runs, n=26)

| Metric | value |
| --- | --- |
| autonomous receipt / response / reply delivery | 100% / 100% / 100% |
| ack rate | **85%** (22/26) |
| pending after idle | **8%** (2/26) |
| contract touched / bilaterally agreed | 0% / 0% |
| `collab_thread` usage | 27% (7/26) |
| event kinds | decision 19, question 17, evidence 11, proposal 3, need 2; **constraint / change_ready / blocker = 0** |
| event count mean / median | 0.74 / 0 (max 2) |
| largest event | 7 606 chars (36 events > 2000 chars) |

Latency (durable timestamps): change→wake median **903 ms**, wake→inbox median
**1 096 ms**, change→response median **59 s** (24.7–122.6 s). Polling remains
adequate; latency is model-dominated.

## Hypothesis outcomes

- **Specificity improved; recall degraded.** The local-first criterion removed
  false contact entirely (L 22%→0%, P 22%→0%, precision 69%→100%) but also
  suppressed genuine required contact (R 100%→56%). Balanced accuracy was
  slightly better *without* the criterion (0.89 vs 0.78).
- **§66 Outcome B rejected: inspection alone does not solve selectivity.** Both
  arms inspected in 100% of runs and never contacted prematurely, yet F0 still
  over-contacted on 22% of L and P runs. Having read-only repository access is
  not sufficient; the decision rule matters.
- **§68 Outcome D present: over-localization.** The missed R runs are exactly
  those where the peer's *authority/intent* (not a documentable fact) is
  required: `R-new-primitive` went 0/3 under F1, and `R-deployed-error` lost one
  replicate. Agents treated "local evidence exists" as "local evidence is
  sufficient/authoritative".
- **The effect is scenario-specific, not uniform.** `R-future-compat` retained
  3/3 under F1; L/P were perfectly selective; A dropped 75%→25%.
- **Ack discipline is context-dependent.** With realistic inspection-era work,
  ack rose from 0E's 24% to **85%** and pending-after-idle fell from 72% to 8%.
  The ack gap was largely an artifact of the thin 0E host, weakening (not
  eliminating) the case for a turn-stopping guard.
- **Contracts: no natural use.** Touched in 0% of contacted runs (0E: 59%).
  With real repository evidence, agents never reached for structured shared
  agreement — the strongest evidence yet against promoting the current
  `BoundaryContract` schema.
- **Thread: reduced use** (27%, down from 86%).
- **Taxonomy erosion confirmed:** only 5 of 8 kinds used; `constraint`,
  `change_ready`, `blocker` unused again.

## §64 Confound audit

| Confound | Status |
| --- | --- |
| Tool-description collaboration priming | Both arms expose the same six collab tools (unavoidable capability visibility); F1 adds only the criterion. No extra checkpoint/“collaborate often” text in either arm. |
| Repository evidence asymmetry | Fixed: the Palimpsest fixture declares the same Ordarium 1.3.1 it installs; the smoke run that exposed the 1.2.0/1.3.1 mismatch led to a coherent fixture (recorded, scenarios unchanged). |
| Prompt ownership cues | Prompts are non-directive and avoid "record". Residual: R prompts mention "deployed today"/"next release", which may themselves cue peer ownership more than L/P prompts — a difficulty imbalance, not solved. |
| Scenario difficulty imbalance | Present: R spans documentable current-state facts and pure future-intent/authority questions; F1's misses cluster on the latter. Reported per scenario rather than pooled away. |
| Model stochasticity | Real DeepSeek model, no honored seed; single provider/model; replication 3 per R/L/P cell. |
| Provider drift | Single model route throughout; no upgrades. |
| Read-tool failures | None observed; `repo_*` tools were used in every run (up to 30+ calls), no tool errors recorded. |

## §65–68 outcome classification and verdict

The evidence does not match a single pre-declared outcome cleanly:

- **Outcome A (policy works) — partially:** F1 achieved perfect L/P specificity
  and precision, and cut premature contact to 0% (already 0% in F0).
- **Outcome B (inspection alone) — rejected:** F0 inspected fully yet still
  over-contacted.
- **Outcome C (both arms over-contact) — only F0:** F1 eliminated over-contact.
- **Outcome D (required contact missed) — present in F1:** recall fell to 56%,
  concentrated on authority/intent questions.

**Verdict: keep experimental (Verdict 2), with a specific, non-promotable
finding.** The local-first boundary test is a *real* lever: it is necessary for
specificity and it does not degrade delivery. But as written it is too blunt —
it converts over-contact into under-contact rather than resolving the boundary,
because it gives the model no way to distinguish "no local evidence" from
"local evidence that cannot settle a question of the peer's authority or future
intent". The exact wording must not be promoted; the *principle* (inspect
local authoritative evidence first; `ownership != information need`) is
supported, while the *sufficiency* clause needs explicit freshness/authority
semantics.

## §56 / §68 polling and primitive decisions

2 s polling remains **adequate** (change→wake ≈0.9 s; end-to-end ≈59 s,
model-dominated). Do not request a new Ordarium primitive.

## §49 ack guard

Handled-but-unacked fell to 8%; keep explicit-ack semantics unchanged. The
turn-stopping pending-batch guard stays a *deferred candidate*, now with weaker
justification.
