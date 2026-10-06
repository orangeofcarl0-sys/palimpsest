# R3-A2 — SENTINEL PORTFOLIO QUALIFICATION PLAN (FROZEN)

Stage: R3-A2
Baseline: `03a47a44ab12a68e4a6fcfdc52024f6f38929b24`
Status: **FROZEN before the first R3-A2 baseline worker run**

This document is the human-readable form of `research-evidence/r3-a2/plan.json`, which is the authoritative
artifact. The plan is written at the **second commit**, before any primary model run, and the third commit
descends from it. That is the direct remedy for R3-A0's `PREREGISTRATION_CHECKPOINT_MISSING`, carried forward
from the R3-A1 preregistration requirement.

---

# 1. The research ruling, frozen prospectively

```text
Portfolio Qualification != Bridge Hunting
A RED graph is a valid result.
```

No additional fixture may be authored in this stage after the first new baseline worker run. The historical
R3-A/R3-AE verdicts remain unchanged and are carried forward, never rerun.

---

# 2. Model stacks

```text
deepseek-flash   deepseek   route deepseek-direct      provider deepseek-route   api openai-completions
glm-5.3-flash    glm        route glm-via-omnigate     provider omnigate         api openai-completions
EXCLUDED: kimi-k3
```

These are the **only** two stacks scheduled. No additional model was searched for, and Kimi K3 was not run.

DeepSeek and GLM are different model stacks, but this is **not** pure model-architecture isolation: they differ
in vendor, in tool-use post-training lineage and in reasoning formatting, and GLM reaches the harness through a
local gateway. The plan records that caveat per model.

---

# 3. Common cognitive interface

```text
rendererId:      dsh-common-worker
rendererVersion: 1
familySpecific:  false
```

The same renderer every family runs, unchanged from R3-A0. There is no model-specific prompt tuning. Every
trial records the model id/family, the provider route, the renderer id/version, the assembled prompt digest and
the tool-surface digest.

---

# 4. Frozen bounds and Nq — UNCHANGED

```text
aggregate dimension:  classCoverage
lower bound:          0.20   (below this: no room to detect harm)
upper bound:          0.85   (above this the baseline is at the CEILING: no room to detect help)
room required in BOTH directions
Nq:                   5 valid baseline trials per (fixture, model) pair
QC-2 minimum:         2 variable observationally distinct failure-class series groups
pair verdicts:        QUALIFIED | UNQUALIFIED | INFRASTRUCTURE_INVALID
```

Nothing here was altered. The corrected R3-AE qualification engine is reused as-is, and the R3-A2 analysis
calls it rather than reimplementing a clause.

---

# 5. Fixture digests

```text
F-A  r3a-f-a-atomic-transaction   468cfcea8a8e36127ebba9022f21cad1c751f2b18cca7f53867775c6163fc37a  CARRIED FORWARD
F-B  r3a-f-b-versioned-migration  8e290a4be4ba7f2713b621806113a99fc8e15e009b4a75630be9d593757b7611  CARRIED FORWARD
F-C  r3a-f-c-policy-resolution    fbff8c2e19c3c5d12c511ef8618d23452bf0c93c8ba505eecd8974c56c49860d  R3-A2 NEW
F-D  r3a-f-d-rule-resolution      0abbe4524b6bc4d3c404be8a67183b883581b516f0a303fad7eefe12bfa0b26c  R3-A2 NEW
```

---

# 6. Engine digests

The plan digests the code it is frozen against, including the qualification engine, the fixture bytes, the
sentinel routes, the readiness logic, the telemetry reader, the trial harness, the runner, the analysis and the
tee worker. `scripts/r3a2/qualify.mjs` refuses to start if any of them has drifted.

---

# 7. The frozen 20-run schedule

```text
F-C × deepseek-flash × 5
F-C × glm-5.3-flash  × 5
F-D × deepseek-flash × 5
F-D × glm-5.3-flash  × 5
```

**Intended valid primary runs: 20. Hard maximum valid primary runs: 20.**

```text
F_C_POLICY_RESOLUTION-deepseek-direct-q0..q4
F_C_POLICY_RESOLUTION-glm-via-omnigate-q0..q4
F_D_RULE_RESOLUTION-deepseek-direct-q0..q4
F_D_RULE_RESOLUTION-glm-via-omnigate-q0..q4
```

The runner compares the schedule it would execute against the committed plan and **refuses to run** if they
differ, so no primary model run can precede the plan commit and no run can drift from the plan.

---

# 8. Retry policy

```text
a valid bad model outcome is NEVER retried
an infrastructure-invalid attempt remains visible and follows the existing frozen retry rule
infrastructure-invalid = hostFailure or timeout; it is NOT a model outcome and NOT a verdict
```

An infrastructure-invalid attempt is retried only to reach Nq valid runs for its pair. Every attempt — valid or
not — is written to `research-evidence/r3-a2/attempts.json`, so an inflated attempt count is visible rather
than hidden.

---

# 9. Baseline condition

Qualification remains treatment-independent. Every worker receives:

```text
no selected inherited capital
no project-capital index
no M1 preview
no host-mediated capital prework
```

The job starts with `service.start({ expectedTaskId: 't1' })` and no `knowledge` selection. The design tests
assert the harness contains no knowledge selection and no treatment-seam environment variable.

---

# 10. No primary-fixture smoke

No F-C or F-D run on either model before the frozen schedule. Plumbing tests use dummy fixtures only. Any
accidental new-fixture worker run outside the schedule is a **protocol deviation** and does not count toward Nq.

---

# 11. Trial and analysis schemas

The trial record carries: trial id, fixture id/revision, model id/family, provider/route, repetition, renderer,
`capitalDelivered`, the failure-class vector, class coverage, full solve, unclassified failures, final
acceptance, world head, oracle inaccessibility, elapsed time and the infrastructure-invalid flag.

The common-interface record carries: model id/family, provider/route, renderer id/version, assembled prompt
digest and tool-surface digest.

The evidence record carries: the ordered action log, the revision count, provider-reported token usage, and a
cost **only** where a price is declared and the tokens it applies to were reported.

The analysis record carries, per pair: fixture id, model id, verdict, reasons, per-class headroom, class
groups, variable groups, variable DIRECT groups, class coverage, diagnostics, the fixture-audit precondition,
the manifest's anti-overfit classification and the claim ceiling. At stage level it carries: the new pairs, the
carried-forward historical pairs, the extended graph, the readiness report, the continuation recommendation,
the cost accounting and the deviations.

---

# 12. Readiness definitions — four states, NOT one

```text
TASK_READY        at least one model stack is qualified on at least two structurally distinct task families
MODEL_READY       at least one frozen fixture family is qualified on BOTH sentinel model families
LOCAL_PAIR_READY  both sentinel model families have at least one qualified fixture AND at least two task
                  families are represented overall; supports pair-local mechanism replication only, and
                  model/task effects remain CONFOUNDED if the graph is disconnected
BRIDGE_READY      WITHIN ONE CONNECTED qualified component: at least one model spans >=2 task families AND
                  at least one task family spans >=2 model families
```

The four are computed independently and are never collapsed into one GREEN/RED value. The distinction between
`LOCAL_PAIR_READY` and `BRIDGE_READY` is the **connected component**: a graph can have a model on two families
and a family on two models without either fact living in the same component, and that graph is pair-local, not
bridged.

---

# 13. Hard run budget

```text
intended valid primary runs:      20
hard maximum valid primary runs:  20
```

The runner exits non-zero if the valid-run count would exceed the budget.
