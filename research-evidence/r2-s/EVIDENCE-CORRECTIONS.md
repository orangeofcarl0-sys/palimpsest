# R2-S — APPEND-ONLY EVIDENCE CORRECTIONS (§2–§4)

Stage: R2-S (Capital Selectivity under Choice Pressure)
Status: **APPEND-ONLY** — no prior evidence file is modified or deleted
Baseline: `42b0025b47ec2daba108370fb1a4300997caa7c2`

Every statement below is an **addition**. The R2-M verdict, its 20 trial records, its analysis and its
documents remain exactly as committed. Where a status changes, the new status is stated as a *correction*
and the old status is preserved beside it.

---

# 1. R2-M ceiling interpretation (§2)

## Preserved verdict (unchanged)

```text
R2-M DECISION RELEVANCE: NOT_IMPROVED
```

`research-evidence/r2-m/analysis.json` is unmodified, and all 20 raw trials are preserved.

## Corrected inferential status

```text
R2-M INFERENTIAL STATUS:
  NON-DISCRIMINATING DUE TO CONTROL CEILING
```

The verdict is accurate and, read alone, misleading. Both arms pulled **5/5 in both scenarios**:

```text
M0 opaque     20/20
M1 metadata   20/20
```

A rate of 1.0 in the control leaves the treatment no headroom, so the comparison could not have detected a
metadata effect even if one existed. `NOT_IMPROVED` here means **not distinguishable**, not **no effect**.

## What must NOT be said

```text
DO NOT STATE: metadata has no effect.
```

The data cannot support that. The correct statement is that the metric was saturated in the control.

## The new empirical fact (frozen)

```text
visible opaque 3-handle selected index:
  20/20 voluntary pull
within tested scope
```

This is the substantive result of R2-M, and it is what reframes the earlier line. Under the *intended*
interface — a selected index the model can actually see — the opaque presentation alone produced complete
voluntary uptake. The repaired local evidence therefore no longer supports "opaque visible index → low
uptake"; the missing variable was **visibility / interface delivery**, not semantic metadata.

---

# 2. CIC evidence amendment (§3)

`adf1615` is **NOT amended**. This amendment is appended here and in
`research-evidence/r2-s/cic-amendment.json`.

## Retained

```text
Addressability ≠ Discoverability ≠ Decision Relevance
```

The three-way distinction stands, and the CI-2A law stands as a law about **what an interface must
provide**:

```text
A voluntarily retrievable resource must expose a decision-relevance surface,
unless consultation is mechanically required.
```

## Weakened empirical interpretation

The empirical claim attached to CI-2A is replaced. The prior interpretation was:

```text
decision relevance is required for voluntary retrieval
```

The corrected interpretation is:

```text
visibility + actionable affordance may be sufficient
when pull-all is acceptable.

item-level decision relevance is required to be tested
when selective retrieval among alternatives is expected.
```

The reason is exactly the ceiling: once the index was visible, an opaque 3-handle index achieved 20/20
voluntary pull. Visibility plus an actionable affordance was sufficient **for uptake**. Whether item-level
decision relevance matters is a **different question**, and it is only posed when the worker faces
alternatives and selective retrieval is expected — which is what R2-S measures.

No canonical architecture change accompanies this amendment.

---

# 3. Research-synthesis amendment (§4)

A second correction is appended to the system-prompt research synthesis, in
`research-evidence/r2-s/research-synthesis-amendment.json`.

```text
The repaired local experiment no longer supports
"opaque visible index → low uptake."

Once the index was actually model-visible,
the opaque 3-handle control produced 20/20 pull.

Local evidence therefore supports:
visibility / interface delivery was the dominant missing variable.

The marginal value of semantic metadata remains UNKNOWN.
```

External literature remains untouched: this correction does not rewrite external findings and does not
claim local validation of them.

---

# 4. What R2-S does and does not change

R2-S does **not** re-open any closed governance question. It does not amend `adf1615`, `3a4a3c6` or
`42b0025`. It appends the three corrections above and then runs the selectivity experiment they motivate.

The R2-LR corrections remain in force and are not restated here; this document is the successor stage's
append, not a replacement.
