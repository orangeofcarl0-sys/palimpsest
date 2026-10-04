# R2-V — APPEND-ONLY R2-S INTERPRETATION RECORD (§2–§3)

Stage: R2-V (Utility-Calibrated Capital Value)
Status: **APPEND-ONLY** — no prior evidence file is modified or deleted
Baseline: `bcfae7efcb217b300623706216a637a124b97a64`

R2-S is **not amended**. Every statement below is an addition. The R2-S verdict, its 20 trial records, its
analysis and its documents remain exactly as committed.

---

# 1. R2-S interpretation clarification (§2)

## Preserved verdict (unchanged)

```text
R2-S protocol verdict:
REPLICATED
```

`research-evidence/r2-s/analysis.json` is unmodified, and all 20 raw trials are preserved.

## What R2-S proved

```text
R2-S PROVEN CLAIM:
metadata improves retrieval selectivity
against the predeclared provenance-based labels
```

The labels were **provenance** labels: `TARGET` = the capital of the same task lineage, `DISTRACTOR` = an
independent bundle from a different domain. R2-S showed that adding item-level decision metadata changed
**which** of the six visible items the worker retrieved, lowering the distractor retrieval rate in both
scenarios while holding target recall at 100%.

## What R2-S did NOT prove

```text
R2-S NOT PROVEN:
that every skipped DISTRACTOR has zero or negative task utility
```

A lower retrieval rate for an item is a statement about **routing**, not about **value**. Nothing in R2-S
measured whether consuming a skipped distractor bundle would have helped, harmed, or made no difference to
the task. Provenance relevance (`the capital came from the same task lineage`) does not imply empirical
utility (`consuming the capital changes measurable task behaviour`). R2-V exists to test that implication
rather than assume it.

---

# 2. Randomized-arm wording correction (§2)

## Prior wording (preserved as written)

```text
D  S0 3/5 solved
   S1 0/5 solved
```

## Corrected reading

The correct description is:

```text
D S0 3/5 vs S1 0/5
is a RANDOMIZED-ARM secondary difference,
not a self-selected association.
```

R2-S assigned each trial to an arm by the frozen randomized block order, so the comparison between arms is a
randomized-arm comparison. An earlier framing that described it as an association between pullers and
non-pullers was the wrong frame for this number: in R2-S's D arm every analysed trial retrieved its targets,
so there was no self-selected split to associate over.

It is also **too small and too secondary to support a harm claim**:

```text
· n = 5 per arm, so 3/5 vs 0/5 is 3 trials;
· task success was declared SECONDARY before the run and was never consulted by the verdict;
· the primary outcomes were Target Recall and Distractor Pull Rate, and BOTH favoured S1;
· no mechanism was identified that would make consuming a distractor bundle harmful.
```

Recording it as evidence that metadata harms task performance would be an over-read of three trials in a
secondary measure.

---

# 3. Aborted pre-primary run (§3)

Before the final 20-run R2-S matrix, the first two scheduled executions exposed an **implementation bug**:

```text
pull EVENTS rather than DISTINCT handles were counted,
allowing Target Recall > 1.
```

This contradicted the frozen definition:

```text
target_pulls ∈ [0,3]
```

A worker that pulled one handle twice was counted as having recalled two items, which no denominator in the
frozen definition can support. The observed value was `target=4/3`.

```text
The run was discarded.
The implementation was corrected to count distinct handles.
The entire primary matrix was restarted from scratch.
```

What did **not** change:

```text
No treatment wording, preview, candidate set,
verdict criteria or task definition changed.
```

The correction was confined to the outcome counter: distinct handles are now counted for the primary
outcomes, while the raw pull-event sequence is preserved separately for the ordering facts and the repeat
count is recorded as its own number. The discarded run's records were never analysed, never published, and
never used to tune anything; the restarted matrix ran in a fresh run directory so no stale record could be
read back.

This correction is recorded for **evidence completeness**: the R2-S report describes the matrix that
produced the verdict, and this document records that an earlier attempt existed and why it was discarded.

---

# 4. What this record does and does not do

It does **not** re-open R2-S's verdict, relabel its items, or amend any commit. It appends the
interpretation boundary that R2-V needs in order to ask its own question honestly.
