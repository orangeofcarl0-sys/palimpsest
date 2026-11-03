# R2-VR — R3 READINESS REQUIREMENTS

Stage: R2-VR
Status: **ASSESSMENT ONLY** — R3 is not started here
Baseline: `845d2a2816abacb0d0ce354057b374bf255cbbef`

---

# 1. Why the R2 line is finished

The R2 line produced four results and one methodological failure:

```text
R2-U  voluntary uptake was NOT_IMPROVED — later invalidated by a delivery defect
R2-M  voluntary uptake NOT_IMPROVED — because the metric was at a CEILING (20/20 both arms)
R2-S  metadata improves SELECTIVITY against provenance labels — REPLICATED
R2-V  bundle-level marginal utility — INCONCLUSIVE (assay outcome mismatch)
```

The R2 line's binding limitation is now identified rather than guessed: **its scenarios were calibrated for
a pre-2020-style failure signal, not for a modern stochastic worker's actual failure distribution.** By the
time R2-S and R2-V ran, the workers solved nearly everything; what variance remained came from a single
unrelated residual case. R2-VR's factorial correction shows what that did to the analysis: the marginal
effects are exactly zero, the conditional contrasts point opposite ways, and the only non-zero term is a
descriptive interaction that one trial produces.

Continuing to refine Scenario D cannot fix this, because the problem is the fixture, not the analysis.

---

# 2. R3 should NOT be another Scenario-D refinement

```text
R3 ≠ more Scenario-D trials
R3 ≠ a wider Scenario-D candidate set
R3 ≠ another metadata variant on D
```

Scenario D is understood. Its remaining variance is one input-shape case (`h14`), and no added capital
addresses it. Any further D work measures the fixture's residual, not the capital.

---

# 3. R3 candidate mission

```text
Test cognitive-capital behaviour across:
  · multiple task families
  · multiple model families
  · broader candidate-set sizes
  · context regimes
  · retrieval cost
  · task quality
```

---

# 4. R3 entry requirements

R3 may be specified only when ALL of the following hold.

## 4.1 Benchmark qualification (§10 law)

At least two scenario families must satisfy every clause of the utility-benchmark qualification law:

```text
1. baseline neither floor nor ceiling
2. multiple outcome dimensions have stochastic headroom
3. at least one treatment-relevant failure class varies
4. the candidate capital addresses an outcome that can vary
5. success cannot hinge entirely on one unrelated residual case
```

This requires **new fixtures**, calibrated against the CURRENT model's failure distribution — the existing
R1-R/R2-U fixtures are saturated for this model family.

## 4.2 A measured baseline distribution before any treatment

R3 must begin with a **baseline-only** calibration run on each new fixture: enough stochastic repetitions of
the control arm to establish that the baseline sits strictly between floor and ceiling, and to identify
which failure classes actually vary. Without this, R3 would repeat R2-V's error of discovering saturation
only after the treatment matrix was spent.

## 4.3 Model-family axis declared before running

The model-family comparison must be declared as part of the frozen protocol, with the same fixtures, the
same capital bundles and the same outcomes across families. A cross-model claim assembled after the fact
from different fixtures would not be a comparison.

## 4.4 Candidate-set size as an explicit factor

R2-S varied the candidate set only through distractor selection, because canonical compile order is fixed.
R3 should make candidate-set size a declared factor, which requires deciding — architecturally, before the
run — whether the index may be ordered by anything other than content-addressed identity. That decision is
a CIC question, not a harness question, and it is the reason this requirement is listed here rather than
assumed.

## 4.5 Retrieval cost made measurable

R2-S and R2-V both record the host-prefetch cost caveat: R2-S's metadata preview required host-side body
materialization for all candidate items, so no owner-side retrieval-cost saving was established. R3 must
either measure the host-side cost explicitly (bytes materialized, bodies fetched) or drop the cost claim.

## 4.6 The estimand discipline carried forward

R3's analysis must use the factorial/conditional-contrast discipline this stage established wherever a
design has more than one factor, and must report raw counts with no p-values below the power the design
actually has.

---

# 5. What R3 must NOT inherit

```text
· the Scenario-C and Scenario-D fixtures as primary measures (saturated for this model family)
· the "consensus across contrasts" estimator (superseded by conditional contrasts)
· any claim of retrieval-cost benefit (unestablished)
· any claim of cross-model generality assembled post hoc
```

---

# 6. Readiness verdict

```text
R3 SPECIFICATION: READY
R3 EXECUTION:    NOT READY
```

The requirements are now known and are stated above. Execution is not ready because no fixture satisfying
§4.1 yet exists, and §4.2 requires a baseline calibration run before any treatment matrix. Creating those
fixtures is R3's own first task, not this stage's.

This stage does not start R3, does not create a benchmark, and does not run any stochastic trial.
