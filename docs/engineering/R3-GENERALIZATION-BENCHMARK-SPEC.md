# R3 — GENERALIZATION BENCHMARK SPECIFICATION

Stage: R3-SPEC
Baseline: `9f7eb188555b18c202e0d6d188546c914c394cb4`
Status: **SPECIFICATION** — no stochastic treatment matrix, no metadata productization, no new canonical owner

---

# 1. Why R3 exists

The R2 line established routing (`R2-S: REPLICATED`) and closed utility calibration as `INCONCLUSIVE`
(`R2-VR: CLOSED`). Its binding limitation is now identified rather than guessed:

```text
the R2 fixtures were calibrated for a failure distribution the current
model family has largely stopped producing.
```

Every R2 utility conclusion inherits that limit. R3 exists to test whether governed cognitive capital
produces **useful, cost-effective behaviour across meaningful distribution shifts** — and to do so on
fixtures built to have measurable headroom for the models that will actually run them.

---

# 2. The eight things R3 must keep separate

R3 must distinguish, and never collapse into one "success rate":

```text
availability     the capital exists and is bound to the attempt
visibility       the index naming it reaches the model's prompt
selectivity      the model retrieves what it needs and not the rest
consumption      the body is actually materialized and delivered
error avoidance  a historically characterized failure class does not recur
task utility     the delivered capital changes measurable task outcomes
cost             what was spent: tokens, bytes, calls, time, revisions
generalization   the direction survives a declared distribution shift
```

A single "success rate" would let a fixture that saturates on availability masquerade as evidence about
utility, which is precisely the R2-V error.

---

# 3. Anti-overfit law (§4)

```text
Benchmark Qualification ≠ Benchmark Tuning
```

Fixtures MUST be designed from **mechanism requirements first**.

Forbidden process:

```text
inspect evaluation model failures
→ add hidden cases that model happens to miss
→ rerun same evaluation model
→ declare headroom
```

Allowed process:

```text
define mechanism
→ define failure classes
→ freeze fixture
→ qualification cohort tests floor/ceiling
→ retain or reject fixture
```

Qualification **may reject** a fixture. It must not rewrite it after treatment results exist. A fixture
revised in response to treatment results is a new fixture requiring a new qualification record, and the
prior record stays in history as the record of the rejected one.

---

# 4. Construction / evaluation separation (§5)

R3 distinguishes three phases with different actors:

```text
benchmark construction     the fixture, its failure classes and its oracle are authored
qualification              the frozen fixture is retained or rejected per model
primary evaluation         the retained fixture is used to measure a treatment
```

Preferred:

```text
construction models / humans  ≠  primary evaluation model families
```

Where the same model family is unavoidable, the contamination is **declared** in the qualification record,
and the benchmark is **not** called held-out. The word "held-out" is reserved for a fixture whose failure
classes were frozen without reference to the evaluation model's observed failures.

---

# 5. Minimum task-family requirement (§6)

R3 execution may not start with one task family.

```text
minimum:  2 genuinely different task families
preferred: 3
```

They must differ in **underlying failure structure**, not in filenames or domain nouns. Structurally
distinct families include:

```text
state transformation / ordering
graph dependency / closure
schema / API compatibility
concurrency or transactional state
information synthesis with evidence
```

Exact scenarios are **not** frozen in this stage; they are frozen only after qualification passes. What this
stage freezes is the *requirement* that the families be structurally distinct and the *rule* that a family
counts only once its failure structure differs from every other family's.

---

# 6. Failure-class-first design (§7)

Each fixture defines a vector of independent or partially independent failure classes:

```text
F1, F2, …, Fk
```

Each class must carry:

```text
mechanical oracle        a check that decides the class without a model's judgement
semantic description     what the class means, in one sentence
known relationship       to candidate capital: which capital is ABOUT this class
```

R3 explicitly forbids the R2-V shape:

```text
a fixture where 13/14 cases are always passed
and one unrelated case carries all variance
```

The qualification gate (§19) rejects such a fixture rather than analysing it.

---

# 7. Primary task outcome (§8)

Binary full-solve is **not** the sole primary outcome. The primary task-quality surface is:

```text
failure-class pass vector          the F1..Fk vector per trial
weighted/unweighted class coverage the fraction of exposed classes passed
pre-paid mistake recurrence        the §9 metric
```

Full solve remains **secondary**, or co-primary where a fixture's classes are not equally weighted. A
fixture must state its class weights before execution; unweighted is the default and must be stated
explicitly rather than assumed.

---

# 8. The "textbook effect" metric (§9)

A first-class metric:

```text
Prepaid Error Recurrence Rate (PERR)
= number of historically characterized failure classes repeated
  ─────────────────────────────────────────────────────────────
  number of historically relevant failure classes exposed by the task
```

This measures whether a future worker repays a cognitive cost the project already paid.

**Discipline.** A historical error class may **not** be inferred from an arbitrary test failure. The
correspondence between an observed failure and a declared historical class must be **declared before
evaluation**, in the fixture's class table. A failure that matches no declared class is recorded as
`UNCLASSIFIED_FAILURE` and is counted in the raw vector but **not** in PERR.

---

# 9. Retrieval and cost metrics (§10, §11)

Record per trial, where measurable:

```text
retrieval   candidate items visible · target items retrieved · non-target items retrieved
            pull order · tool-call count · body bytes delivered to model · preview/index bytes delivered
cost        input tokens · output tokens · cached tokens · tool calls · retrieval bytes
            wall time · oracle/test invocations · implementation revisions
```

And keep three costs **separate**, because R2-S showed they are not the same thing:

```text
owner-side materialization cost   what the owner had to fetch to build the index
model-context cost                what the model's context had to hold
tool-interaction cost             what the model spent deciding and calling
```

Unavailable dimensions are marked `UNAVAILABLE` with a reason. They are **never** replaced by an invented
score. A composite cost index is forbidden in R3's primary analysis.

---

# 10. Factors

## 10.1 Candidate-set size (§12)

R3 tests cardinality pressure explicitly:

```text
small · medium · large
```

Exact counts are chosen **before execution** from the actual asset shape. At least one condition must make
pull-all non-trivial — a set small enough to pull exhaustively measures nothing about selectivity. Nested
indexes are forbidden; each candidate item is a leaf.

## 10.2 Context regime (§13)

At least two regimes:

```text
low background context
high / distracting background context
```

The intent is whether capital behaviour survives context pressure. A regime is defined by **measured actual
prompt/context occupancy**, not by nominal window size: changing the window while keeping used context tiny
is not a regime change.

## 10.3 Model family (§14)

A model-family axis is predeclared.

```text
minimum primary replication target: 2 materially different model families
preferred: 3
```

Families must differ in at least one of:

```text
tool-use post-training · reasoning architecture · vendor/model family · capability level
```

Two sizes of one family are **not** independent replication, and R3 must not report them as such.

---

# 11. Treatment design (§16)

R3 compares only mechanisms already justified by R2:

```text
opaque visible index             (R2-M's M0 / R2-S's S0)
decision-relevant metadata index (R2-M's M1 / R2-S's S1)
controlled consumed capital      (R2-E / R2-V's host-mediated prework)
```

R3 does **not** add, in the same matrix:

```text
a new prompt reminder
tool-description optimization
a relevance ranker
an automatic semantic selector
```

Those are separate factors or separate stages. Bundling them would repeat R2-U's confound, where a prose
affordance was measured while the index it referred to was absent.

---

# 12. Utility calibration (§17)

TARGET is **not** defined merely as "same provenance". For each candidate capital item or bundle, R3
declares three separate things:

```text
provenance relationship      where the capital came from
hypothesized utility relationship   why it is expected to help, stated before running
empirically measured utility status  what the run actually showed, or UNMEASURED
```

These three are never silently equated. `PROVENANCE_RELEVANT` does not imply `HYPOTHESIZED_USEFUL`, and
neither implies `MEASURED_USEFUL`.

---

# 13. Factorial discipline (§18)

Whenever the treatment matrix is factorial, the analysis produces:

```text
conditional contrasts
main effects
interactions
```

and **never** interprets a combined-treatment contrast as a component marginal effect. This rule is
protected by a deterministic test (§18 of the ruling; see `test/r3spec_contract.test.ts`), so a future
analysis that reintroduces the R2-V error fails a test rather than passing review.

---

# 14. Generalization claim ladder (§22)

Claim strength is predeclared. A result may claim **only** the highest level actually tested.

```text
G0  local          one task × one model
G1  task-family    multiple held-out tasks, same model
G2  model-family   direction replicated across model families
G3  context robustness   survives context pressure
G4  environment/runtime  survives relevant environment shift
```

---

# 15. No universal skill claim (§23)

```text
Procedure/Skill success under one model/task/runtime
does not imply general reusable superiority.
```

Procedure generalization remains **unproven** until R3 evidence supports it. A single G0 result is not
evidence for G1, and no result in this stage is evidence for any level, because this stage runs nothing.

---

# 16. Prompt / model rendering (§24)

R3 records per trial:

```text
modelId · model family · rendererId/version · assembled prompt digest · tool-surface digest
```

If model-family-specific renderers do not yet exist, the **common renderer** is used and that fact is stated
explicitly. Renderer specialization is **not** introduced in the same primary experiment; it would confound
the model-family axis with the rendering axis.

---

# 17. Staged execution (§21)

R3 does not explode into a full Cartesian product. See `R3-FACTOR-MATRIX.md` for the staged matrix
(R3-A / R3-B / R3-C) and its automatic continuation gates.

---

# 18. What R3-SPEC freezes, and what it does not

```text
FROZEN BY THIS STAGE
  the eight separated concepts
  the anti-overfit law and the allowed/forbidden processes
  the construction/qualification/evaluation separation
  the minimum task-family count and the structural-diversity rule
  the failure-class-first design and the rejection of the R2-V shape
  the primary outcome surface and the PERR definition with its declaration rule
  the retrieval/cost metric list and the three-way cost separation
  the three factor axes and their minimum levels
  the treatment set (only R2-justified mechanisms)
  the three-way utility declaration
  the factorial-analysis rule and its protecting test
  the claim ladder and the no-universal-skill law
  the rendering-record requirement
  the staged matrix and its gates

NOT FROZEN BY THIS STAGE
  the exact scenarios
  the exact candidate-set counts
  the exact model families
  the exact qualification bounds
```

The unfrozen items are deliberately left open because they depend on qualification results that do not yet
exist. Freezing them now would be guessing.
