# R3-A0 — QUALIFICATION CONTRACT v0.1 AMENDMENT

Stage: R3-A0
Baseline: `096008d7b005096ec83526b6c5fcb3e54ba4d12f`
Status: **APPEND-ONLY AMENDMENT** — `096008d` is not rewritten

This amendment turns `BENCHMARK-QUALIFICATION-CONTRACT.md` (R3-SPEC) into an executable contract. It
corrects six things the R3-SPEC text left too loose to run.

---

# 1. §2.1 — the A→B gate becomes a bipartite-graph requirement

## Was (R3-SPEC)

```text
>=2 qualified pairs across >=2 task families
```

## Is (v0.1)

```text
>=2 qualified task families
>=2 qualified model families
```

AND the qualified bipartite graph must contain the minimum **L-shaped bridge**:

```text
at least one model qualified on >=2 task families
AND
at least one task family qualified on >=2 model families
```

**Why.** The earlier form was satisfiable by a graph with two families and two models but no bridge — for
example model A on family 1 and model B on family 2, which cannot support any claim about either axis. The
L-shaped bridge is the smallest graph that can support a G1 (task-family) claim and a G2 (model-family)
claim at the same time.

Whether a full 2×2 qualified cross exists is **recorded**, not required.

§2.6: **only COMPLIANT fixtures count** toward this gate. A `NON_COMPLIANT` fixture may be run
diagnostically and may not contribute to A→B, B→C, G1, G2, G3 or G4.

---

# 2. §2.2 — QC-1 becomes an explicit bidirectional-headroom contract

## Was

```text
baseline != floor && baseline != ceiling
```

## Is

```text
aggregate lower bound      0.20
aggregate upper bound      0.85
dimension                  class coverage (fraction of declared failure classes passed)
minimum class-level headroom  2 non-redundant DIRECT-treatment-relevant classes that vary
qualification repetitions  Nq = 5
```

The bounds and Nq are **frozen in this stage, before any baseline model run**, and are not changed after
seeing qualification data. A pair qualifies only when its baseline class coverage is **strictly inside**
`(0.20, 0.85)` — R3 requires room in **both** directions.

## Corrected semantics (the earlier text could be read backwards)

```text
floor    = no room to detect HARM
ceiling  = no room to detect HELP
```

---

# 3. §2.3 — QC-2 counts non-redundant dimensions only

## Was

```text
>=2 outcome dimensions vary
```

## Is

```text
>=2 non-redundant treatment-relevant outcome/failure dimensions have headroom
```

`firstCandidateSolved` and `finalSolved` are **not** two dimensions when they are deterministically
identical. R2-V demonstrated exactly that failure — every trial's first candidate WAS its final candidate —
so the v0.1 contract computes the dimension count from the **observed vectors**: two dimensions that never
differ are one dimension. Declared failure-class dimensions are preferred.

---

# 4. §2.4 — capital relevance is DECLARED, not inferred

## Was

Capital relevance was to be established post hoc.

## Is

Every fixture revision carries a frozen **experimental manifest**:

```yaml
failureClasses:
  - id:
    semanticDescription:
    oracleId:
    candidateCapitalRelationships:
      <capital-id>: DIRECT | TRANSFER_HYPOTHESIS | NONE
```

This mapping is **experiment metadata, not canonical project truth**, and it is frozen **before**
qualification. Qualification may use `DIRECT` as treatment-relevant. `TRANSFER_HYPOTHESIS` remains visible
but **does not satisfy QC-4 by itself**.

This removes the R2-VR practice of inferring relevance with a regex over clause text: the relationship is
now declared data with a provenance record, and the deterministic gate checks the map covers every class.

---

# 5. §2.5 — the fixture lifecycle is frozen

```text
DESIGN
→ FREEZE fixture revision
→ QUALIFY frozen revision
→ QUALIFIED / REJECTED
```

A rejected revision is **never edited in place**. A change creates:

```text
fixture revision + 1
new digest
new qualification record
```

The prior record stays in history as the record of the rejected revision.

---

# 6. §2.6 — NON_COMPLIANT exclusion

A `NON_COMPLIANT` fixture (one designed or revised in response to an evaluation model's observed failures)
may be run diagnostically. It may **not** contribute to `A→B`, `B→C`, `G1`, `G2`, `G3` or `G4`.

Only COMPLIANT fixtures count toward the R3 generalization line. This is enforced in the gate code, not
merely stated: `aToBGate` filters on `compliant === true` before computing any clause.

---

# 7. What v0.1 does NOT change

```text
· the claim ladder (G0…G4) and the no-universal-skill law
· the anti-overfit law and the construction/qualification/evaluation separation
· the requirement that qualification is treatment-independent (§20)
· the requirement that a fixture may be qualified for one model and not another
· the prohibition on tuning a fixture per model
```

---

# 8. Implementation

The contract is executable in `scripts/r3a/qualification.mjs`:

```text
QUALIFICATION_BOUNDS     the frozen (0.20, 0.85) bounds and the corrected floor/ceiling semantics
MIN_CLASS_HEADROOM       Nq = 5, minimum 2 varying non-redundant DIRECT classes
PAIR_VERDICTS            QUALIFIED | UNQUALIFIED | INFRASTRUCTURE_INVALID (no "almost qualified")
nonRedundantDimensions   the observed-vector dimension grouping
qualifyPair              the six QC clauses and the pair verdict
aToBGate                 the bipartite-graph gate with the L-shaped bridge, COMPLIANT-only
```

`scripts/r3a/gate-c.mjs` checks all of the above deterministically before any model run, and includes
negative fixtures (a near-ceiling single-class pair, a bridgeless graph, a non-compliant-only graph) so the
gate is proven to REJECT the shapes it is meant to reject.
