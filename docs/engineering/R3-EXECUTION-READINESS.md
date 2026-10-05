# R3 EXECUTION READINESS

Stage: R3-SPEC
Baseline: `9f7eb188555b18c202e0d6d188546c914c394cb4`
Status: **ASSESSMENT** — nothing in R3 is executed by this stage

---

# 1. Verdict

```text
R3 SPECIFICATION:  FROZEN
R3-A BASELINE QUALIFICATION:  NOT READY
```

The specification is complete and frozen. Execution of R3-A is not ready, because the artifacts R3-A needs
do not yet exist. This document says exactly what is missing, so R3-A can begin without re-deriving the
requirements.

---

# 2. What is frozen

```text
· the eight separated concepts (availability … generalization)
· the anti-overfit law and its allowed/forbidden processes
· the construction / qualification / evaluation separation
· the minimum task-family count and the structural-diversity rule
· the failure-class-first design, and the rejection of the R2-V fixture shape
· the primary outcome surface and the PERR definition with its declaration rule
· the retrieval and cost metric lists, and the three-way cost separation
· the three factor axes and their minimum levels
· the treatment set (only R2-justified mechanisms)
· the three-way utility declaration (provenance / hypothesized / measured)
· the factorial-analysis rule, protected by a deterministic test
· the claim ladder and the no-universal-skill law
· the rendering-record requirement
· the staged matrix (R3-A / R3-B / R3-C) and its automatic continuation gates
· the qualification contract, its six clauses and its hard gate
```

---

# 3. What is NOT frozen, and why

```text
the exact scenarios              depends on qualification results that do not exist yet
the exact candidate-set counts   depends on the actual asset shape
the exact model families         depends on availability and on which families are materially distinct
the exact qualification bounds   declared per fixture, before qualification
```

Freezing these now would be guessing. The spec fixes the **requirements**; qualification fixes the
**instances**.

---

# 4. What R3-A requires that does not yet exist

## 4.1 At least two structurally distinct fixture families

The existing R1-R / R2-U / R2-V fixtures are **rejected** by the qualification contract for the current
model family (see `BENCHMARK-QUALIFICATION-CONTRACT.md` §11). New fixtures are required, each with:

```text
a mechanical oracle
a declared failure-class table F1..Fk, each with a semantic description
and a declared relationship to candidate capital
a declared floor/ceiling bound, set before qualification
a declared class weighting (unweighted by default, stated explicitly)
```

## 4.2 A baseline qualification harness

The harness must run the **no-capital reference** on each (fixture, model) pair, enough repetitions to
estimate variance, and emit one qualification record per pair. It must not deliver any capital mechanism.

## 4.3 A frozen qualification bound per fixture

Declared before qualification and not moved afterward. If a bound is wrong, the fixture is revised and
requalified from scratch, with the prior record retained as the rejected revision's record.

## 4.4 At least two candidate model families

Materially different in at least one of: tool-use post-training, reasoning architecture, vendor/model
family, or capability level. Two sizes of one family do not qualify.

## 4.5 A rendering record

`modelId`, `model family`, `rendererId/version`, assembled prompt digest, tool-surface digest — per trial.
If no family-specific renderers exist, the common renderer is used and that is stated explicitly.

---

# 5. R3-A entry checklist

```text
[ ] ≥2 fixture families with mechanically decidable, declared failure-class tables
[ ] each fixture's oracle is deterministic and does not consult a model's self-report
[ ] each fixture's floor/ceiling bound declared before qualification
[ ] a qualification harness that runs the no-capital reference only
[ ] ≥2 materially distinct candidate model families identified
[ ] a rendering record produced per trial
[ ] the qualification record template (contract §10) instantiated
[ ] the R3-A plan (pairs × repetitions) frozen and written before the first run
[ ] the factorial-analysis protecting test present and passing
```

When every box is checked, R3-A is ready. None is checked by this stage.

---

# 6. Carried-forward risks

```text
R1  fixture saturation
    The R2 line's fixtures were calibrated for a failure distribution the current
    model family has largely stopped producing. New fixtures must be designed from
    mechanism requirements and then QUALIFIED — not tuned to the model.

R2  construction/evaluation contamination
    If the same model family both builds and evaluates a fixture, the result is not
    held-out. Declare it; cap the claim at G1 without independent replication.

R3  cost-measurement honesty
    R2-S's metadata preview required host-side body materialization, so no owner-side
    retrieval-cost saving was ever established. R3 must either measure cost dimensions
    or mark them UNAVAILABLE. No composite cost score.

R4  cardinality realism
    A candidate set small enough to pull exhaustively measures nothing about
    selectivity. At least one R3-C condition must make pull-all non-trivial.

R5  estimand discipline
    R2-V read a combined-treatment contrast as a component marginal effect. The rule
    is frozen and protected by a test, but the protection only covers the analysis
    code that uses it.
```

---

# 7. What this stage did not do

```text
No primary stochastic treatment matrix.
No stochastic run of any kind.
No metadata productization.
No new canonical owner.
No product code change (src/** and host/** diffs are ZERO).
No fixture was created, and no scenario was frozen.
R3-A was not started.
```

---

# 8. Closing statement

The R2 line is closed: `R2-VR REANALYSIS: CLOSED`, `UTILITY CALIBRATION: INCONCLUSIVE`, and the 20
stochastic trials are not reopened.

R3's specification is frozen. Its first executable stage, R3-A baseline qualification, is blocked only on
artifacts this stage deliberately did not create: two structurally distinct qualified fixtures, a
qualification harness, and a declared model-family axis. Those are R3-A's own first tasks.
