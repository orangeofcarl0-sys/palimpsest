# BENCHMARK QUALIFICATION CONTRACT

Stage: R3-SPEC
Baseline: `9f7eb188555b18c202e0d6d188546c914c394cb4`
Status: **CONTRACT** — this document defines what must be recorded and what must hold before any primary R3 treatment run

---

# 1. What qualification is for

```text
Qualification is RETAIN / REJECT. It is NOT tuning.
```

A qualification record answers one question: **may this fixture be used to measure utility for this model?**
It does not answer how the fixture should be changed, and it does not contribute a treatment measurement.

Qualification runs are **not** primary trials and their results are never pooled with treatment results.

---

# 2. The unit of qualification

The unit is a **(fixture, model) pair**, not a fixture alone.

```text
a fixture may be QUALIFIED for model A
and UNQUALIFIED for model B
```

Analysis must respect that. The benchmark is never modified to make an unqualified model qualified; the
pair is simply not used for that model, and the rejection is recorded.

---

# 3. Required qualification record

Every (fixture, model) pair receives a record containing at minimum:

```text
fixtureId
fixtureRevision            the frozen revision identifier
fixtureContentDigest       digest of the fixture's oracle and class table
modelId
modelFamily
rendererId                 the renderer used (see §24 of the spec)
qualificationReference     the treatment-independent reference used (see §6 below)

baselineScoreDistribution  the outcome distribution under the reference
perClassBaseline           per-failure-class pass/fail distribution
failureClassHeadroom       for each class: does it vary, is it floor, is it ceiling
floorCeilingStatus         per outcome dimension
treatmentRelevantClasses   which classes the candidate capital is ABOUT
outcomeDimensionsWithVariance   the dimensions that actually varied

verdict                    QUALIFIED | UNQUALIFIED
verdictReasons             the clauses that passed and the clauses that failed
declaredBeforeTreatment    true — the record is frozen before any primary treatment run
contaminationDeclaration   whether construction and evaluation share a model family
```

---

# 4. Qualification clauses

A (fixture, model) pair is `QUALIFIED` only if **all** of the following hold.

## QC-1 — baseline is neither floor nor ceiling

The reference outcome must sit **strictly between** the worst and best attainable values on at least the
primary dimension, with room in **both** directions.

```text
reject if baseline == floor
reject if baseline == ceiling
```

The bounds themselves are declared **before** qualification, per fixture, and are not moved after seeing the
distribution.

## QC-2 — multiple outcome dimensions have variance

At least **two** outcome dimensions must show variance under repetition of the reference, so a single
saturated dimension cannot carry the whole assay.

## QC-3 — at least one treatment-relevant failure class varies

A failure class the candidate capital is **about** must vary across reference repetitions. Variation
confined to a class no candidate capital addresses cannot measure that capital.

## QC-4 — the candidate capital addresses a class that can vary

For at least one class that varies, some candidate bundle's own recorded method must mechanically cover it,
**and that bundle must not be present in every arm** — a constant cannot have a marginal effect.

## QC-5 — success does not hinge on one unrelated residual case

If all outcome variation traces to a single class that no added capital addresses, the pair is rejected:

```text
UTILITY_ASSAY_OUTCOME_MISMATCH
```

## QC-6 — the classes are mechanically decidable

Every declared failure class must have an oracle that decides it without a model's judgement. A class whose
oracle is a model's self-report is not a class.

---

# 5. Floor / ceiling rules (§15)

```text
FLOOR     the reference fails essentially everything → no room to detect harm, no room to detect help
CEILING   the reference passes essentially everything → no room to detect help
```

Both are rejections. The specific numeric bounds are declared per fixture before qualification, recorded in
the fixture's own metadata, and are **not** tuned per model. If a bound turns out to be wrong, the fixture
is revised and **requalified from scratch**, with the prior record retained as the record of the rejected
revision.

A fixture may be qualified for one model and unqualified for another; that asymmetry is a result, not a
defect to be smoothed away.

---

# 6. Qualification independence (§20)

Qualification **must not** use the eventual treatment arm.

Allowed references:

```text
no-capital / baseline agent behaviour
another treatment-independent reference declared before qualification
```

Forbidden:

```text
using a capital treatment arm to establish that the fixture has headroom
```

The qualification verdict is **frozen before** primary treatment execution. A treatment run that discovers
its fixture was unqualified is discarded as a qualification failure, not reported as a treatment result.

---

# 7. Anti-overfit compliance (§4)

Each qualification record states which process produced the fixture:

```text
COMPLIANT        the fixture was designed from mechanism requirements, then qualified
NON_COMPLIANT    the fixture was designed or revised in response to an evaluation model's observed failures
```

A `NON_COMPLIANT` fixture may still be run, but it is labelled as such everywhere its results appear, and it
cannot support a claim above G0.

---

# 8. Contamination declaration (§5)

If construction and primary evaluation share a model family, the record says so:

```text
contamination: SHARED_MODEL_FAMILY
heldOut: false
```

A fixture with `SHARED_MODEL_FAMILY` may not be described as held-out, and its results cannot support a
claim above G1 without an independent-family replication.

---

# 9. Qualification gate (§19)

```text
NO PRIMARY R3 TREATMENT RUN MAY EXECUTE
ON AN UNQUALIFIED (fixture, model) PAIR.
```

This is a hard gate, enforced before the run, not after. The staged matrix (`R3-FACTOR-MATRIX.md`) places
qualification in R3-A, before any capital mechanism is compared in R3-B.

---

# 10. The qualification record template

```yaml
fixtureId:
fixtureRevision:
fixtureContentDigest:
modelId:
modelFamily:
rendererId:
qualificationReference:            # treatment-independent
declaredBounds:                    # floor/ceiling bounds, declared before qualification
qualificationRuns:                 # repetitions of the reference
baselineScoreDistribution:
perClassBaseline:
failureClassHeadroom:
floorCeilingStatus:
treatmentRelevantClasses:
outcomeDimensionsWithVariance:
antiOverfitProcess: COMPLIANT | NON_COMPLIANT
contamination: INDEPENDENT | SHARED_MODEL_FAMILY
heldOut: true | false
verdict: QUALIFIED | UNQUALIFIED
verdictReasons:
frozenAt:
```

---

# 11. Worked rejection: Scenario D under the current model family

Recorded here as the reference example of a rejection, from the R2-VR audit:

```text
fixtureId:                 scenario-d (r2u)
verdict:                   UNQUALIFIED
QC-1 fail   every trial scored 13/14 or 14/14 — the baseline is at the ceiling
QC-2 fail   13 of 14 hidden classes are invariant across all 20 candidates
QC-3 fail   the single varying class is not one the added capital is about
QC-4 fail   the varying class is addressed directly only by D, which is in every arm
QC-5 fail   all arm-level variation traces to that one unrelated residual class
ruling:     UTILITY_ASSAY_OUTCOME_MISMATCH
```

This is what the contract is for: it would have rejected Scenario D **before** the R2-V treatment matrix was
spent, instead of after.
