# R2-VR — APPEND-ONLY ERRATUM, ESTIMAND CORRECTION AND BENCHMARK LAW

Stage: R2-VR (Factorial Reanalysis & Utility-Benchmark Qualification)
Status: **APPEND-ONLY** — no prior evidence file is modified or deleted
Baseline: `845d2a2816abacb0d0ce354057b374bf255cbbef`

`845d2a2` is **not amended**. The R2-V raw trials, its `trial-manifest.json` and its
`normalized-results.json` are byte-unchanged. The original predeclared classification remains historical
protocol output. The corrected analysis is written beside it in `research-evidence/r2-vr/`.

---

# 1. R2-V erratum (§9)

```text
The R2-V execution and randomized treatments remain valid.

The original per-arm raw results remain valid.

The original predeclared POSITIVE_SIGNAL / NO_CLEAR_SIGNAL
classification remains historical protocol output.

However, the per-bundle "consensus" was not a valid factorial
marginal-effect estimator because V3-vs-V0 is a combined treatment,
not the marginal effect of B or C.

Utility calibration is therefore re-adjudicated using the
factorial contrasts.
```

## 1.1 The estimand error, stated precisely

R2-V's arms are a 2×2 factorial:

```text
              C absent      C present
B absent         V0            V2
B present        V1            V3
```

R2-V computed, for each bundle, the pair `(V1 vs V0)` and `(V3 vs V0)` and required them to agree. The second
term is **not** the marginal effect of B: it is the effect of B **and** C together, measured against neither.
Because B and C were both present in `V3`, `V3 vs V0` conflates the two factors, and requiring it to agree
with `V1 vs V0` silently imposed an additivity assumption the design never justified.

The corrected estimands are the **conditional contrasts**:

```text
B | C absent    = V1 - V0        C | B absent    = V2 - V0
B | C present   = V3 - V2        C | B present   = V3 - V1

B main effect   = mean[(V1 - V0), (V3 - V2)]
C main effect   = mean[(V2 - V0), (V3 - V1)]
B×C interaction = V3 - V2 - V1 + V0
```

## 1.2 What the correction changes

The retired inference:

```text
R2-S calibration:
CONSISTENT — skipped bundles showed no positive utility signal
```

is **retired**. Its replacement is recorded in §3 below. Note that the R2-V *report* already flagged the
collapse as suspicious ("`NO_CLEAR_SIGNAL` because V3-vs-V0 disagreed"); the correction makes the reason
explicit and preserves the conditional structure that the collapse discarded.

---

# 2. Analysis-schema naming correction (§8)

In `scripts/r2v/analyse.mjs`, the field

```text
didItRetrieveBundlesWithNoClearSignal
```

was drawn from the **skipped** bundles — the implementation has only ever examined `skipped` — so its name
described the opposite of its value. It is renamed:

```text
skippedBundlesWithNoClearSignal
```

The value is unchanged. This is analysis/harness code only. The committed `analysis.json` is **not**
rewritten; the corrected schema appears in this stage's evidence. The superseded estimator is now also
marked `SUPERSEDED_BY_R2VR_FACTORIAL_CONTRASTS` so a future reader cannot mistake it for a valid marginal
estimator.

---

# 3. Corrected utility-calibration status (§7)

The corrected status is recorded in `research-evidence/r2-vr/factorial-analysis.json`:

```text
UTILITY_CALIBRATION_INCONCLUSIVE
```

The reasons, mechanically produced:

- `UTILITY_ASSAY_OUTCOME_MISMATCH` — the only **varying** hidden case is addressed by the **D** bundle,
  which is present in every arm, so the assay's outcome variation cannot be attributed to the added capital;
- one outcome dimension (`knownFailureRecurred`) is saturated at the floor (0/5 in every arm);
- the primary dimension carries a non-zero **descriptive** interaction pattern;
- no factor shows a stable marginal signal in both contexts.

`INCONCLUSIVE` is a fully valid result (§7). It is the honest reading when the outcome measure cannot carry
the question.

---

# 4. Utility-benchmark qualification law (§10)

A scenario is **utility-qualified** only if ALL of the following hold. This is a requirement on future
benchmarks; no benchmark is created in this stage.

```text
1. BASELINE IS NEITHER FLOOR NOR CEILING
   The control arm must sit strictly between the worst and best attainable
   outcomes, with room to move in BOTH directions.

2. MULTIPLE OUTCOME DIMENSIONS HAVE STOCHASTIC HEADROOM
   At least two outcome dimensions must vary under repetition of the control,
   so one saturated dimension cannot carry the whole assay.

3. AT LEAST ONE TREATMENT-RELEVANT FAILURE CLASS VARIES
   A failure class the candidate capital is ABOUT must vary across runs.
   Variation in an unrelated class cannot measure the capital's utility.

4. THE CANDIDATE CAPITAL ACTUALLY ADDRESSES AN OUTCOME THAT CAN VARY
   The bundle's own recorded method must mechanically cover a case that varies.
   Coverage of an INVARIANT case contributes nothing to a marginal estimate.

5. SUCCESS CANNOT HINGE ENTIRELY ON ONE UNRELATED RESIDUAL CASE
   If all arm-level variation traces to a single case that no added capital
   addresses, the assay is not measuring the capital.
```

## 4.1 Why Scenario D fails this law

Scenario D's R2-V assay violates requirements 1, 3, 4 and 5:

```text
· every trial scored 13/14 or 14/14 — the baseline is at the ceiling (1);
· 13 of 14 hidden cases are invariant across all 20 candidates (2, 3);
· the one varying case (h14) is addressed only by D, which is in every arm,
  and only GENERICALLY by B and C (4);
· all arm-level variation traces to that single unrelated residual case (5).
```

The ruling recorded for this assay is therefore:

```text
UTILITY_ASSAY_OUTCOME_MISMATCH
```

---

# 5. R3 readiness (§11)

R3 should **not** be another Scenario-D refinement. Scenario D is now understood: it is a saturated
near-ceiling fixture whose remaining variance is a single input-shape case. More runs on it would buy
precision about nothing.

R3 is ready to be *specified* when the requirements in `R3-READINESS.md` are met. It is not started here.
