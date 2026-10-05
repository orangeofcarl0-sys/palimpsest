# R2-VR — FACTORIAL REANALYSIS & UTILITY-BENCHMARK QUALIFICATION

Stage: R2-VR
Branch: `r2-vr-factorial-reanalysis`
Baseline: `845d2a2816abacb0d0ce354057b374bf255cbbef`
Mode: **NO STOCHASTIC RUN**

---

# 1. What this stage corrected

R2-V ran a 2×2 design but interpreted it as a chain of pairs. Its arms are:

```text
              C absent      C present
B absent         V0            V2
B present        V1            V3
```

R2-V's per-bundle "consensus" required `(V1 vs V0)` and `(V3 vs V0)` to agree. The second term is **not** the
marginal effect of B — it is the effect of B **and** C together. Requiring agreement silently assumed
additivity the design never justified.

The corrected estimands:

```text
B | C absent    = V1 - V0        C | B absent    = V2 - V0
B | C present   = V3 - V2        C | B present   = V3 - V1

B main effect   = mean[(V1 - V0), (V3 - V2)]
C main effect   = mean[(V2 - V0), (V3 - V1)]
B×C interaction = V3 - V2 - V1 + V0
```

No p-values; raw counts and rates only at n = 5 per cell.

---

# 2. What the corrected analysis shows

On the preserved R2-V trials, for both `firstCandidateSolved` and `finalAcceptanceSolved`:

```text
cells: V0 3/5   V1 4/5   V2 4/5   V3 3/5

B|C absent +0.20    B|C present -0.20    B main effect 0.00
C|B absent +0.20    C|B present -0.20    C main effect 0.00
B×C interaction -0.40
```

Both factors have `OPPOSITE_SIGNS_ACROSS_CONTEXTS`. The main effects are **exactly zero**, and the only
non-zero term is a descriptive interaction pattern that one trial produces. This is more informative than
R2-V's collapsed `NO_CLEAR_SIGNAL`: it says the conditional effect of each bundle flips sign depending on
whether the other is present, which at n = 5 means one trial moved each way.

---

# 3. The outcome-sensitivity audit

All 20 stored final candidates were re-judged against all 14 hidden cases with the same acceptance module.
No worker ran and no R2-V record was modified.

```text
varying cases:    h14 (14/20)
invariant cases:  13/14
```

`h14` is `rejection-leaves-cache-untouched` with a malformed cache entry (`broken: { deps: [] }`), failing
as `ACCEPTED_INVALID_INPUT`. It is addressed **directly** only by the **D** bundle — which is present in
every arm — and only **generically** by B and C (their clauses state "validate before mutating" about a
different domain object). Since D is the constant, the assay's outcome variation cannot be attributed to the
added capital:

```text
UTILITY_ASSAY_OUTCOME_MISMATCH
```

---

# 4. Corrected calibration status

```text
UTILITY_CALIBRATION_INCONCLUSIVE
```

The retired inference is `R2-S calibration: CONSISTENT — skipped bundles showed no positive utility signal`.
It is retired because its estimator was invalid, not because the opposite was found. `INCONCLUSIVE` is the
honest reading when the outcome measure cannot carry the question.

---

# 5. Schema naming correction

`didItRetrieveBundlesWithNoClearSignal` → `skippedBundlesWithNoClearSignal`. The value was always drawn from
the **skipped** bundles, so the old name described the opposite of the code. Value unchanged; the committed
`analysis.json` is not rewritten.

---

# 6. Benchmark qualification law

See `research-evidence/r2-vr/benchmark-qualification-law.json`. A scenario is utility-qualified only if the
baseline is neither floor nor ceiling, multiple outcome dimensions have headroom, a treatment-relevant
failure class varies, the candidate capital addresses a case that can vary, and success cannot hinge on one
unrelated residual case. Scenario D fails four of the five clauses.

---

# 7. R3 readiness

See `research-evidence/r2-vr/R3-READINESS.md`. R3 should not be another Scenario-D refinement. Its
requirements are stated; its execution is not ready, because no fixture satisfying the qualification law yet
exists and a baseline calibration run is required before any treatment matrix.

---

# 8. What this stage did NOT do

```text
No stochastic run. No worker was launched.
No R2-V raw trial was altered.
No product code changed: src/** and host/** diffs are ZERO.
No metadata productization. No cross-model run. No architecture:write.
No benchmark was created. R3 was not started.
```
