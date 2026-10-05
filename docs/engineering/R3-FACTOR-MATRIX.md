# R3 FACTOR MATRIX

Stage: R3-SPEC
Baseline: `9f7eb188555b18c202e0d6d188546c914c394cb4`
Status: **SPECIFICATION** — the matrix is staged so R3 does not explode into a full Cartesian product

---

# 1. The factors

| Factor | Levels | Notes |
|---|---|---|
| Task family | ≥ 2 (preferred 3) | structurally distinct failure structure, not filenames |
| Model family | ≥ 2 (preferred 3) | must differ in tool-use post-training, reasoning architecture, vendor, or capability level |
| Capital mechanism | 3 | opaque visible index · decision-relevant metadata index · controlled consumed capital |
| Candidate-set size | 3 | small · medium · large, counts chosen before execution from asset shape |
| Context regime | ≥ 2 | low background · high/distracting background, defined by measured occupancy |

The full product of these levels is deliberately **not** run. The staged matrix below spends runs only where
a gate has already justified them.

---

# 2. Staging

```text
R3-A  task × model baseline qualification
      no capital mechanism. Establishes which (fixture, model) pairs are qualified.

R3-B  capital mechanism × qualified (task, model) pairs
      the three R2-justified mechanisms, on qualified pairs only.

R3-C  candidate-set / context pressure
      only on mechanisms that survived R3-B.
```

---

# 3. R3-A — baseline qualification

```text
INPUT       candidate fixtures (≥2 structurally distinct families) × candidate model families (≥2)
TREATMENT   none — the reference is no-capital / baseline agent behaviour
RUNS        repetitions of the reference per (fixture, model) pair, enough to estimate variance
OUTPUT      one qualification record per pair (see BENCHMARK-QUALIFICATION-CONTRACT.md)
GATE A→B    at least TWO (fixture, model) pairs QUALIFIED, spanning at least TWO distinct task families
```

R3-A is **not** a treatment run. Its only job is retain/reject. No capital mechanism is delivered, so no
treatment effect can leak into the qualification decision.

Automatic continuation: if the gate is green, R3-B begins without user approval. If fewer than two pairs
qualify, R3-A reports the rejections and stops — a green gate cannot be manufactured by loosening bounds
after seeing the distribution.

---

# 4. R3-B — capital mechanism on qualified pairs

```text
INPUT       qualified (fixture, model) pairs from R3-A
FACTOR      capital mechanism (3 levels)
DESIGN      randomized blocks; the mechanism is the only variable
RUNS        repetitions per cell, fixed before execution
OUTPUT      per-cell outcome vectors, PERR, retrieval and cost records
GATE B→C    at least one mechanism shows a direction that is (a) stable across the
            qualified task families, and (b) not contradicted across model families
```

If a factorial structure arises inside R3-B — for instance two mechanisms combined against their parts — the
analysis uses conditional contrasts, main effects and interactions, and **never** reads a combined contrast
as a component marginal effect.

---

# 5. R3-C — pressure on survivors

```text
INPUT       mechanisms that survived R3-B
FACTORS     candidate-set size × context regime
DESIGN      randomized blocks within each surviving mechanism
RUNS        repetitions per cell, fixed before execution
OUTPUT      whether the surviving direction persists under cardinality and context pressure
```

R3-C is where the G3 (context robustness) claim becomes available, and where "pull-all is non-trivial"
becomes a real test rather than an assumption.

---

# 6. What is deliberately excluded from the matrix

```text
a new prompt reminder              separate factor/stage, not this matrix
tool-description optimization      separate factor/stage
a relevance ranker                 separate factor/stage
an automatic semantic selector     separate factor/stage
renderer specialization            excluded so the model-family axis is not confounded with rendering
nested indexes                     forbidden; every candidate item is a leaf
```

R2-U already showed what happens when a prose affordance is added to the same matrix as the mechanism it
refers to: the affordance was measured while the index was absent, and the stage's conclusion had to be
retracted. R3 keeps those out.

---

# 7. Randomization and no-adaptive-stopping rules

```text
· every block is a full permutation of the arms in that stage, from a frozen seed
· the plan is written to disk before the first trial of the stage
· no adaptive stopping; the run count is fixed before execution
· no behavioural pilot on the primary fixtures; dummy-fixture plumbing proofs only
· one active confidential worker at a time (sequential)
· one process per trial; no reuse of model sessions across trials
```

---

# 8. Automatic continuation gates

```text
A→B  green when ≥2 (fixture, model) pairs are QUALIFIED across ≥2 task families
B→C  green when ≥1 mechanism shows a family-stable, model-non-contradicted direction
```

Continuation is automatic on a green gate; no user approval is required between green gates. A **red** gate
stops the line and reports, rather than being loosened.

---

# 9. Scale discipline

```text
R3 does not run the full Cartesian product.
R3 runs the smallest matrix that can answer each stage's question.
A stage whose gate is red does not spend the next stage's runs.
```

Concretely: with 2 task families × 2 model families, R3-A is 4 pairs × qualification repetitions. R3-B is
3 mechanisms × the qualified pairs. R3-C is 3 set sizes × 2 regimes × surviving mechanisms. Nothing is run
at the full 2×2×3×3×2 product, because no single question requires all five axes at once.
