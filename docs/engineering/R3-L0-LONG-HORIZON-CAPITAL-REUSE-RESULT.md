# R3-L0 — CONTROLLED LONG-HORIZON DURABLE CAPITAL REUSE: RESULT

Stage: R3-L0
Baseline: `42f1a77c7b13abaa109538ca5f4c6f378eb153fa` (R3-S0, `SYSTEM_VALID = true`)
Status: **COMPLETE**

---

# 1. Headline

The experiment ran to completion: **24/24 valid sessions across 8 trajectories**, zero infrastructure-invalid.
The capital mechanism worked exactly as designed — **`CAPITAL_UPTAKE: CLOSED`**, with every CAPITALIZED
trajectory consuming the governed capital in all three generations. But the **utility verdict is `MIXED`, not
`POSITIVE_SIGNAL`**, and the reason is the honest finding of this stage:

> **The control condition hit the ceiling.** HISTORY_ONLY reached **PERR = 0.000 in all four blocks**. A
> treatment cannot reduce repeated prepaid errors below zero, so C had no room to demonstrate an advantage.

Seven of eight trajectories reached PERR = 0.000. The single prepaid error in the entire experiment occurred in
a **CAPITALIZED** trajectory.

---

# 2. Per-trajectory outcomes (§18)

| trajectory | arm | PERR | repeated / eligible | repeated classes | terminal coverage |
|---|---|---|---|---|---|
| b0-C | CAPITALIZED | **0.091** | 1 / 11 | 1 | 0.667 |
| b0-H | HISTORY_ONLY | 0.000 | 0 / 11 | 0 | 1.000 |
| b1-C | CAPITALIZED | 0.000 | 0 / 11 | 0 | 1.000 |
| b1-H | HISTORY_ONLY | 0.000 | 0 / 11 | 0 | 1.000 |
| b2-H | HISTORY_ONLY | 0.000 | 0 / 11 | 0 | 1.000 |
| b2-C | CAPITALIZED | 0.000 | 0 / 11 | 0 | 1.000 |
| b3-H | HISTORY_ONLY | 0.000 | 0 / 11 | 0 | 1.000 |
| b3-C | CAPITALIZED | 0.000 | 0 / 11 | 0 | 1.000 |

# 3. Matched blocks (§24)

| block | H PERR | C PERR | favours C | quality not worse |
|---|---|---|---|---|
| 0 | 0.000 | 0.091 | **no** | no |
| 1 | 0.000 | 0.000 | no | yes |
| 2 | 0.000 | 0.000 | no | yes |
| 3 | 0.000 | 0.000 | no | yes |

`perrFavoursCBlocks = 0` of 4 — the POSITIVE_SIGNAL rule requires **≥3**. `qualityNotWorseBlocks = 3` of 4,
which alone would have qualified, and `everyCTrajectoryConsumes = true`. So the verdict is `MIXED`: a
directional effect exists (three blocks equal, one adverse) but it does not satisfy the stable criterion.

**No p-values at n=4**, per §24. Cost is reported separately and did not override the PERR verdict.

---

# 4. The one prepaid error, examined

`b0-C-G3` failed **D6** (`composed-atomicity`, lesson L1). Two facts about it matter:

1. **It is a real model outcome, not a harness defect.** The worker's transcript shows it pulled the capital
   (`palimpsest_worker_context_pull` in its action log) but **finished its session without calling the result
   tool** — the worker reported `HOST_FAILURE: the worker finished without reporting an outcome`. The attempt
   therefore correctly stayed `RUNNING` and promotion was correctly refused. The system behaved exactly as
   R3-S0 established it must.
2. **It is the only block where C's G3 did not promote**, and the diagnostic oracle judged the un-promoted
   source: it accepted an invalid migration request (`d6a`) and dropped the tenant's grants on the wrong plan
   transition (`d6b`).

So the adverse direction in block 0 traces to one session in which the model **ran out of turns while holding
the capital**. That is a genuine observation about the executor, and it is recorded rather than explained away.

---

# 5. Capital uptake and mechanism witnesses (§16/§21/§23)

**`CAPITAL_UPTAKE: CLOSED`.** All four CAPITALIZED trajectories consumed capital in **all three generations**:
12 of 12 capitalized generations reached the `CONSUMED` state, each with all six handles visible at the
consumer boundary and all six governed pulls resolving to a canonical owner body.

```text
handles per generation   6  (2 Proof + 2 Reasoning + 2 Procedure)
governed pulls resolved  6/6 in every capitalized generation
capital state            CONSUMED in every capitalized generation
generations with consumption  G1, G2, G3 in every C trajectory
exposed-without-consumption   none
```

The mechanism witness recorded, per generation: asset revision exists, project association exists, selection
attempt-bound, consumer-visible handles, selected-handle digest, governed pull invoked, attempt allowlist
authorized, canonical owner body digest, no bypass.

**§16's attribution rule held**: because consumption is demonstrated, a behavioural difference *could* have been
attributed to capital content. There simply was no favourable difference to attribute.

## HISTORY_ONLY negative witness (§17)

Every one of the 12 H generations: ordinary project history **exists**, selected capital set **empty**,
model-visible capital index **absent**, no capital body in the prompt, no leaked handles. §17's point is
recorded in the witness itself: project history is **not** leakage, it is the control condition — and it is
precisely why the control reached the ceiling.

---

# 6. Cost (§20)

Provider-reported tokens were **recovered post hoc** from the 24 durable session artifacts and are recorded as
such (see §8).

```text
input tokens    2,338,671
output tokens   1,819,398
cached tokens  49,743,360
context-pull calls, body bytes, elapsed time, transcript bytes: per trajectory
monetary cost   none recorded — the route declares no price, and none was invented
```

---

# 7. System validity before and after (§1/§22)

Every load-bearing gate was **run** before the matrix and again after it, and both runs were green:

```text
S1 graph integrity 10/10 · event audit 5/5 · anti-vacuity clean
R1-L consumer boundary PASS · R1-H PASS · R1-HR PASS · R1-HC PASS
SYSTEM_VALID: YES  (pre and post)
HISTORICAL_EVIDENCE_IMMUTABLE: PASS  (309 protected files, tree digest unchanged)
```

`mechanismClaimValid = true`. No behavioural result was used to repair a system-validity failure, and none was
needed.

---

# 8. Protocol deviations and the drift adjudication (§26/§28)

**One deviation, adjudicated and recorded as `NOT_LOAD_BEARING`.** Three analysis files
(`generation-child.mjs`, `matrix.mjs`, `analyse.mjs`) drifted from the commit-2 digests **after** trial 1,
because §20's token counts were not wired into the in-trial record before the matrix ran and were added
afterwards.

§26 requires a post-trial-1 harness defect to STOP and be adjudicated separately rather than patched. So it was
adjudicated by **evidence, not assertion**: the analysis code *as committed at commit 2* was extracted with
`git show be52b08:…` and replayed against the **same matrix**. The frozen replay produced **identical**
per-trajectory PERR, identical matched-block comparisons, and identical `CAPITAL_UPTAKE` and
`TRAJECTORY_UTILITY` verdicts. The drift touched a secondary outcome only, so it is `NOT_LOAD_BEARING` and the
stage proceeds. The full record is in `research-evidence/r3-l0/drift-adjudication.json`.

**No historical evidence was mutated.** The immutability guard reported `PASS` at plan time and after all
regression, and it is designed to RECORD rather than silently restore.

---

# 9. Regression (§29)

```text
build PASS · unit 3453/3453 across 265 files · architecture 0 violations
public API 0/0/0 · anti-vacuity clean · R3-S0 load-bearing suite green
historical-evidence immutability PASS
```

No historical stochastic benchmark matrix was rerun.

---

# 10. Interpretation, strictly bounded (§25)

The result establishes only this:

> Under the tested executor and runtime, across three-generation Project trajectories, **frozen historical
> cognitive capital was fully consumed through the governed path in every generation, but did not reduce
> repeated prepaid errors — because the control condition already made none.**

It does **not** establish, and this stage does not claim:

* organic self-generated capital compounding;
* cross-model portability;
* Procedure marginal efficacy (the bundle was consumed as a whole, so no component effect is identifiable);
* universal project intelligence;
* cost reduction;
* Fusion value.

**The load-bearing limitation is a ceiling, not a null.** HISTORY_ONLY hit PERR = 0.000 in all four blocks, so
this design cannot discriminate a treatment benefit at this difficulty. The three-generation, two-lesson
trajectory was **too easy for this executor** with ordinary project history alone — the prehistory's own
incident record and prior-art code were sufficient for the model to carry both lessons forward unaided. That is
a **measurement-headroom failure**, and it is the same class of finding R3-A2 reached on its fixtures: a
benchmark that the baseline already solves cannot measure a treatment.

Two further limits are structural: the executor is a **single low-cost sentinel**, and the peer-to-peer scope of
R3-S0's envelope means nothing here speaks to concurrency or distribution.

---

# 11. Continuation (§30)

`TRAJECTORY_UTILITY` is `MIXED`, and the cause is identified as a control ceiling rather than a treatment
effect. The ruling's options are `R3-L1 ORGANIC COMPOUNDING`, `ADJUDICATE`, or `STOP`. Because the observed
`MIXED` verdict is explained by a design limitation that the next stage would have to fix before any organic
test could mean anything, the honest continuation is **`ADJUDICATE`**: the question to settle is whether a
long-horizon capital experiment needs a **harder trajectory** (one where ordinary project history is not
sufficient) before organic compounding is worth testing.

**`NEXT: ADJUDICATE`.** No further stage was begun.
