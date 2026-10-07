# R3-A2 — SENTINEL PORTFOLIO QUALIFICATION RESULT

Stage: R3-A2
Baseline: `03a47a44ab12a68e4a6fcfdc52024f6f38929b24`
Status: **COMPLETE**

---

# 1. Headline

The portfolio was characterized, and **the graph did not move**. All four new pairs are **UNQUALIFIED**, every
one of them because the baseline sits at the **CEILING** — both sentinel models solved **6/6 failure classes on
every one of the 20 runs**.

```text
TASK_READY:        NO
MODEL_READY:       NO
LOCAL_PAIR_READY:  NO
BRIDGE_READY:      NO
full 2x2 cross:    NO
NEXT:              ARCHITECTURAL REVIEW
```

This is a valid result under the law this stage froze prospectively:

```text
Portfolio Qualification != Bridge Hunting
A RED graph is a valid result.
```

Nothing was revised to move a verdict. F-C and F-D were frozen before execution, the bounds and Nq were not
touched, and no fixture was authored after the first run.

---

# 2. The four new pair verdicts

| fixture | model | coverage | variable groups | verdict |
|---|---|---|---|---|
| F-C policy resolution | deepseek-flash | 1.000 | (none) | **UNQUALIFIED** |
| F-C policy resolution | glm-5.3-flash | 1.000 | (none) | **UNQUALIFIED** |
| F-D rule resolution | deepseek-flash | 1.000 | (none) | **UNQUALIFIED** |
| F-D rule resolution | glm-5.3-flash | 1.000 | (none) | **UNQUALIFIED** |

Every pair fails the same three clauses, and it fails them for the same reason:

```text
QC-1 failed: aggregate class coverage 1.000 is outside (0.2, 0.85) — CEILING (no room to detect help)
QC-2 failed: 0 variable non-redundant failure-class group(s) vary, 2 required
QC-4 failed: 0 variable non-redundant group(s) carry a DIRECT member, 2 required
```

**The class vectors are constant.** All five repetitions of each pair produced `111111` over the fixture's six
classes, so every class collapses into ONE non-redundant group that never varies. QC-2 and QC-4 are not
"nearly met" — they are met zero times over, because there is no variance to count.

This is the **F-B ceiling shape recurring**, and it is the R2-V lesson applied correctly: a fixture whose
baseline is already at the ceiling has **no room to detect help**, so it cannot support a capital-treatment
measurement no matter how many trials are run. The engine refused it, as designed.

---

# 3. The extended qualification graph

```text
[R3-A0/R3-AE] F-A transactional / atomic state update      x deepseek  UNQUALIFIED
[R3-A0/R3-AE] F-A transactional / atomic state update      x glm       QUALIFIED
[R3-A0/R3-AE] F-B versioned schema / API compatibility     x deepseek  UNQUALIFIED
[R3-A0/R3-AE] F-B versioned schema / API compatibility     x glm       UNQUALIFIED
[R3-A2      ] F-C graph policy resolution                  x deepseek  UNQUALIFIED
[R3-A2      ] F-C graph policy resolution                  x glm       UNQUALIFIED
[R3-A2      ] F-D specificity / rule resolution            x deepseek  UNQUALIFIED
[R3-A2      ] F-D specificity / rule resolution            x glm       UNQUALIFIED
```

**Exactly one qualified edge exists in the whole portfolio**: `F-A × glm`. The historical A→B gate is
reproduced from the carried-forward verdicts and remains **RED** — it was not rerun and its result was not
altered.

The historical pairs are marked `carried forward, NOT rerun`, and the result tests assert that no historical
fixture appears anywhere in this stage's executed schedule.

---

# 4. Why the four states are all NO

The four readiness states are computed independently and were never collapsed into one value.

**TASK_READY = NO.** It needs one model stack qualified on at least two structurally distinct task families.
Only `glm` holds a qualified edge at all, and it holds exactly one — on F-A. No stack spans two families.

**MODEL_READY = NO.** It needs one fixture family qualified on **both** sentinel families. The only family with
any qualified edge is F-A, and F-A × deepseek is UNQUALIFIED. So no family is qualified on both.

**LOCAL_PAIR_READY = NO.** It needs both sentinel families to have at least one qualified fixture AND at least
two task families represented overall. `deepseek` has **zero** qualified fixtures, and only one task family is
represented. Both halves fail.

**BRIDGE_READY = NO.** There is no connected component carrying the L-shape, because there is no component
with more than a single task family. The graph is not merely disconnected — it is a single isolated edge.

**Full 2×2 cross = NO.** No two task families and two model families are jointly qualified anywhere.

---

# 5. Run accounting

```text
planned valid primary runs:       20
attempts made:                    20
valid runs:                       20
infrastructure-invalid attempts:   0
hard maximum valid primary runs:  20
```

Every scheduled run produced a valid model outcome on the first attempt. No retry was needed, and **no valid
bad outcome was retried** — the rule never came into play, because every outcome was valid and final.

Per pair: `F-C × deepseek` 5, `F-C × glm` 5, `F-D × deepseek` 5, `F-D × glm` 5.

---

# 6. Treatment independence, proven per trial

Every one of the 20 trials ran the **baseline condition**, read from the worker's own telemetry rather than
asserted:

```text
efficacy seam:      off      (PALIMPSEST_R2E_EFFICACY)
index seam:         off      (PALIMPSEST_R2M_INDEX)
affordance:         off
capitalDelivered:   false
compiled handles:   0
index handles:      0
```

No selected inherited capital, no project-capital index, no M1 preview, no host-mediated prework. The job was
started with `expectedTaskId` only. The analysis records **zero** deviations of kind `TREATMENT_SEAM_ENABLED`
or `CAPITAL_DELIVERED`.

---

# 7. Common cognitive interface

```text
renderer:                     dsh-common-worker v1, familySpecific = false
distinct assembled prompt digests across all 20 trials:  1
distinct tool-surface digests across all 20 trials:       1
model families:               deepseek, glm
```

The prompt and the tool surface did **not** vary by family — there was no model-specific tuning. Each trial
records its model id/family, provider route, renderer id, assembled prompt digest and tool-surface digest.

DeepSeek and GLM remain **different model stacks**, and this stage claims no pure model-architecture isolation:
the routes differ in vendor, tool-use post-training lineage and reasoning formatting, and GLM reaches the
harness through a local gateway.

---

# 8. Experiment economics

```text
trials with provider-reported usage:  20 / 20
input tokens:                          204,606
output tokens:                         552,945
cached tokens (reported separately): 8,541,184
provider-reported monetary cost:       none — no price was declared, and none was invented

per valid trial:        10,230 input / 27,647 output
per fixture-model pair: 51,152 input / 138,236 output
```

**No cost value was invented.** Neither sentinel route exposes a provider-reported monetary cost, so `cost` is
`null` for every trial and the stage's currency is tokens. The three cost kinds are kept conceptually separate:
owner-side is the provider's input+output counts, model-side is the cached tokens (never folded into input),
and tool-interaction is counted as action-log length and revision count rather than priced.

The qualification verdict was **not** optimized using cost. A qualified edge here is a *qualification* edge,
not a capital-treatment edge.

---

# 9. Protocol deviations

Three entries are on the record in `research-evidence/r3-a2/protocol-deviations.json`.

**1. `PRE_EXECUTION_HARNESS_DEFECTS`** — the first launch of the matrix aborted 2,395 times without ever
starting a worker. Two defects were found and fixed:

* `scripts/r3a2/trial.mjs` imported `MODEL_ROUTES` from `./models.mjs`, which exports
  `MODEL_ROUTES_SENTINEL`; every launch died at module link time.
* The retry loop's bound was keyed on `validByPair.size === 0 || attemptsHere < MAX_ATTEMPTS_PER_PAIR`, which
  for the first pair is **always true** and therefore spun without limit.

Neither created a worker process or a model session — the run directory held no `trial.json`, no worker
transcript and no session artifact. **Nq impact: none.** Both fixes were made **before primary trial 1**, so
the engine-immutability clause was never engaged.

**2. `OUT_OF_PROTOCOL_PREQUALIFICATION_SMOKE`** — one F-C × deepseek-flash run was executed directly against the
real fixture to verify the harness end to end before committing the 20-run budget. The ruling classifies this
as a protocol deviation. Its evidence is preserved (class vector `FC1..FC6` all pass, coverage 1.000, 14/14,
elapsed 309,598 ms, revision count 2, source sha256
`562f1690122637c68a489aa21901d41fe1f8d6624eb3e2885283c5c55edfb5c6`), it is **not** one of the 20 scheduled valid
runs, and it **does not count toward Nq**. It scored the same ceiling the scheduled pairs reached, so it is
recorded as a deviation and not as evidence of anything.

**3. `ENGINE_IMMUTABILITY_VERIFICATION`** — after trial 20, every digested artifact was re-hashed: **zero
drifted**. The post-outcome implementation correction R3-AE had to record does **not** recur here.

---

# 10. Regression

**Before primary execution:**

```text
deterministic fixture/oracle tests    PASS  (71 design-contract tests)
qualification-engine tests            PASS
build                                 PASS
architecture:check                    PASS  0 violations, 9 accepted baseline exceptions
public-api:check                      PASS  missing 0 / changedKind 0 / added 0
anti-vacuity                          PASS  0 unconditional forms
confidential-host readiness           PASS  26 PASS, 1 disclosed limit (HC-27), 0 FAIL
```

**After the matrix:**

```text
build                                 PASS
unit                                  PASS  3420/3420 across 264 files
qualification tests                   PASS
architecture:check                    PASS  0 violations
public-api:check                      PASS  0 / 0 / 0
```

Unit tests rose from 3348 to 3420 — the 72 new tests are this stage's design-contract and result suites.

No historical R2 stochastic matrix was rerun.

---

# 11. Product and canonical semantics

```text
src/**  diff:            ZERO
host/** diff:            ZERO
architecture baseline:   ZERO  (no canonical owner added, architecture:write never run)
```

Everything this stage added is experimental harness, fixture and evidence code under `scripts/r3a2/`,
`scripts/r3a/`, `fixtures/r3a2/`, `test/` and `research-evidence/r3-a2/`.

**Fusion remains out of scope**, recorded only as:
`Fusion is a future host/runtime policy over Attempts, not a canonical owner or authority mechanism.`
No Council, SupervisorAgent or FusionAgent ontology was introduced, and a design test asserts that.

The capital blueprints are experimental research metadata. They are not canonical owner types and they were
not productized.

---

# 12. What this stage established, and what it did not

**Established.** Two structurally distinct fixture families can be authored, frozen, audited and qualified
deterministically; the corrected engine rejects ceiling fixtures exactly as designed; the treatment seams can
be proven off per trial; and the readiness decomposition distinguishes "no edge", "pair-local" and "bridged"
without collapsing them.

**Not established — and this is the load-bearing finding.** The two sentinel stacks are simply too strong for
these two mechanisms at this difficulty. Both new families are ceiling fixtures for both models. A
qualification benchmark built from mechanisms these models already solve cannot measure a capital treatment,
because there is nothing left to help with.

**The honest reading of the four new pairs is therefore a measurement-headroom failure, not a model failure.**
The models did not fail the fixtures; the fixtures failed to be hard enough to be useful, and the engine said
so rather than inventing variance.

---

# 13. Continuation

`LOCAL_PAIR_READY` and `BRIDGE_READY` are **both false**, so the continuation ruling applies directly:

> If both LOCAL_PAIR_READY and BRIDGE_READY are false: STOP. Do not author another fixture in this stage. Do not
> add Kimi. Return for architectural adjudication.

This stage **STOPPED**. It did not author an F-E, did not run Kimi K3, did not search for additional models,
and did not begin a capital-treatment matrix or Fusion.

**Next: ARCHITECTURAL REVIEW.**

The question that adjudication must answer is not "which fixture shall we add next" — authoring another fixture
in this stage is forbidden, and authoring one *because* the current models happen to miss it is the anti-overfit
violation the whole R3 line exists to prevent. The question is whether a **ceiling-limited mechanism** can
support a generalization benchmark at all, and if so what the difficulty calibration procedure is. The
evidence for that discussion is now on the record: eight qualified pairs across four families and two model
stacks, of which exactly one — `F-A × glm` — has usable headroom.
