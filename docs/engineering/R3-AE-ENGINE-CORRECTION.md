# R3-AE — QUALIFICATION ENGINE CORRECTION & EVIDENCE ADJUDICATION

Stage: R3-AE
Baseline: `e0cb13a55f2c039580bc0f76451dc8c97fb99cb8`
Mode: **NO PRIMARY STOCHASTIC RUN** — no worker was launched in this stage

---

# 1. What was wrong

The R3-A0 qualification engine read the per-class outcome from the wrong place:

```js
trial[classId]              // what the engine read  → undefined for every class
trial.classPass[classId]    // where the values live
```

Every failure class therefore produced the **same all-undefined series**, so
`groupClassesBySeries` collapsed all six or seven classes into ONE group. QC-2 and QC-4 then counted
one dimension where the data had several.

The defect is visible in the committed R3-A0 analysis:

```text
nonRedundant groups: ["classCoverage","fullSolve","FA1+FA2+FA3+FA4+FA5+FA6"]
```

That single `FA1+…+FA6` group is the bug's signature. It did **not** change the pair verdicts, because
QC-1 (the ceiling) was independently decisive for F-B and QC-4 was decisive for F-A × deepseek — but the
reported evidence was wrong about **why**, and a future fixture whose verdict hinged on QC-2 would have been
judged on a fabricated grouping.

---

# 2. The corrected grouping

Failure classes are grouped by their **identical observed series**, read from `trial.classPass`:

```text
classSeries[classId] = trials.map(trial => trial.classPass[classId])
group classes by identical series
```

On the preserved 20 trials the corrected groups are exactly:

| pair | variable groups |
|---|---|
| F-A × deepseek | `{FA4}` |
| F-A × glm | `{FA1, FA2}` and `{FA4}` |
| F-B × deepseek | `{FB6}` and `{FB7}` |
| F-B × glm | `{FB6}` |

`{FA1, FA2}` is a real group rather than two dimensions: both classes flip **only** on the fifth GLM run, so
they carry one underlying behaviour between them.

---

# 3. The corrected clauses

```text
QC-2   >= 2 variable non-redundant failure-class GROUPS
QC-4   >= 2 variable non-redundant groups carrying >=1 DIRECT member each
QC-6   the deterministic fixture-audit precondition must be present and fully satisfied
```

`classCoverage` and `fullSolve` remain **diagnostics**. They are reported and explicitly excluded from the
QC-2 count, because an aggregate that moves with every class is not independent evidence.

QC-6 was `classIds.length > 0`, which is not a property of the fixture at all. It is now four mechanically
proven facts, computed from the fixture bytes by `scripts/r3a/fixture-audit.mjs`:

```text
mechanicalOracleProven              the oracle judges every case without a model
allHiddenCasesDeclareFailureClass   every case names a declared class
allDeclaredClassesAreExercised      every declared class has a case
oracleUsesNoModelSelfReport         the oracle consults no model output
```

Both fixtures satisfy all four. The analysis **reads** this value; it does not manufacture it.

---

# 4. Compliance is now manifest data, not a literal

`analyse.mjs` previously contained `compliant: true`. That is gone. `fixture-manifest.mjs` carries, per
fixture:

```text
antiOverfitProcess                        COMPLIANT | NON_COMPLIANT
constructionActor / ModelId / ModelFamily
evaluationModelFamiliesKnownAtConstruction
contamination                             INDEPENDENT | SHARED_MODEL_FAMILY | UNKNOWN
heldOut                                   true | false
```

`aToBGate()` consumes `antiOverfitProcess` and **fails closed**: a pair that omits the field is excluded
rather than admitted.

## 4.1 Construction provenance

The local coding agent authored both fixtures. Its model identity is **not invented** here:

```text
constructionActor        LOCAL_CODING_AGENT
constructionModelId      UNKNOWN
constructionModelFamily  UNKNOWN
contamination            UNKNOWN
heldOut                  false
```

`antiOverfitProcess = COMPLIANT` is supported by an explicit evidentiary basis: the failure classes were
authored from each mechanism's obligations **before** any qualification run, and were **not revised** after
the outcomes were seen — F-B's ceiling result was recorded rather than repaired, which is the strongest
available evidence that the fixture was not tuned.

## 4.2 COMPLIANT ≠ held-out

The two are separate axes. Because construction provenance is UNKNOWN, `heldOut = false` and the claim
ceiling is **G1** for both fixtures. This does **not** invalidate baseline qualification; it limits future
generalization claims.

---

# 5. Corrected verdicts

Recomputed from the preserved 20 trials, with no model call:

| pair | original R3-A0 | corrected R3-AE | decisive clause |
|---|---|---|---|
| F-A × deepseek | UNQUALIFIED | **UNQUALIFIED** | QC-2 and QC-4, group `{FA4}` |
| F-A × glm | QUALIFIED | **QUALIFIED** | — |
| F-B × deepseek | UNQUALIFIED | **UNQUALIFIED** | QC-1 CEILING (0.857) |
| F-B × glm | UNQUALIFIED | **UNQUALIFIED** | QC-1 CEILING (0.914), QC-2, QC-4 |

**The verdicts are unchanged**, and the corrected reasons are now grounded in the real grouping rather than
in a fabricated one.

## 5.1 Corrected A→B gate

```text
qualified pairs:                      1
qualified task families:              1
qualified model families:             1
L-shaped bridge:                      absent
full 2x2 cross:                       no
```

**RED**, computed mechanically from the corrected verdicts and manifest-derived compliance. Thresholds were
not loosened.

---

# 6. Protocol deviations

Recorded in `research-evidence/r3-ae/protocol-deviations.json`. Summarised:

## 6.1 `PREREGISTRATION_CHECKPOINT_MISSING`

R3-A0 was required to commit the frozen plan (digests, models, renderer, bounds, Nq, schedule, schema)
**before** the first baseline run. It did not: there is one commit after the entire stage. The plan file was
written to disk before the run and its contents are consistent with pre-run preparation, but the **durable
Git checkpoint is absent**, and this stage does not retroactively claim one.

Future R3 runs MUST have a dedicated plan/freeze commit before trial 1, and the results commit must descend
from it.

## 6.2 `OUT_OF_PROTOCOL_PREQUALIFICATION_SMOKE`

One real-worker smoke trial ran on **F-A** before the 20-run matrix. It was recovered from the local rig:

```text
trialId             F_A_ATOMIC_TRANSACTION-deepseek-direct-q0
fixtureId           r3a-f-a-atomic-transaction r1
modelId             deepseek-flash
classPass           FA1:F FA2:F FA3:T FA4:T FA5:T FA6:T
classCoverage       0.667
finalAcceptance     6/8 (fa1b, fa2a)
finalSourceSha256   47a823151475ba939d1bbe326cd88d80cd751c6628a906996a61a6a921e89ec1
capitalDelivered    false
```

It is **not** part of Nq and **not** part of the 20 primary records, and it was not deleted. The prior claim
"No behavioural pilot on primary fixtures" is corrected: it is false as written.

## 6.3 `POST_OUTCOME_IMPLEMENTATION_CORRECTION`

QC-2's implementation was changed after the 20-run matrix completed. The governing textual requirement
already existed and the change attempted to align code with it, and the verdicts did not change — but the
executable analysis was **not** fully frozen before trial 1, and this record says so.

---

# 7. Model stack

`research-evidence/r3-ae/model-stack.json` records each route: model id, family, provider id, provider route,
API surface, renderer and tool-surface digest.

Frozen interpretation: **cross-model-family replication with different provider routes is also
cross-model-stack replication.** The two tested families differ in model family *and* provider path
simultaneously (direct vendor API vs a local gateway), so no pure model-architecture isolation is claimed.
No runtime change is needed.

---

# 8. Kimi readiness (§17, optional)

The `kimi-k3` route was exercised on a **dummy plumbing/tool fixture** — read a file, write a token through
the DSH tool surface — and succeeded:

```text
KIMI_ROUTE_E2E_READY
```

It was **not** run on F-A or F-B, and this is not R3-A qualification. A plumbing-verified route with no
qualification runs is deliberately **not** emitted as a pair, because doing so would report a spurious
INFRASTRUCTURE_INVALID cell and inflate the pair count the gate reads.

---

# 9. What this stage did not do

```text
No primary fixture stochastic run.
No R3-B.
No fixture revision — F-A and F-B are byte-identical to their R3-A0 revisions.
No change to the qualification bounds or Nq.
No re-run of any valid qualification outcome.
No additional model-family search merely because the gate is red.
```
