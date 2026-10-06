# R3-A1 — PREREGISTRATION REQUIREMENTS

Stage: R3-AE (prepared here; **not executed**)
Status: **REQUIREMENTS ONLY** — no R3-A1 trial has run

---

# 1. Why R3-A1 exists

R3-A qualified **one** of four (fixture, model) pairs, so the A→B gate is RED. The gate needs a second
qualified task family and a second qualified model family, with an L-shaped bridge between them.

R3-A1's job is to obtain those pairs **without** violating the anti-overfit law. That constraint is the whole
difficulty: F-B is known to be a ceiling fixture for both tested models, and adding a class those models
happen to miss would be exactly the forbidden process.

---

# 2. The anti-overfit constraint on R3-A1

```text
FORBIDDEN
  inspect the qualification failures of deepseek-flash and glm-5.3-flash
  → author a failure class those models happen to miss
  → requalify
  → declare headroom

ALLOWED
  define a mechanism requirement from the domain
  → derive its failure classes from that requirement
  → freeze the fixture revision
  → qualify it, whatever the outcome
```

A new fixture may be *harder* than F-B. It may not be *harder in the specific place the current models fail*.
The distinction is testable: the fixture's classes must each be traceable to a stated obligation of the
mechanism, and that traceability must be recorded before qualification.

---

# 3. The mandatory plan commit (§18)

R3-A1 MUST begin with a dedicated Git commit containing all of the following, **before any primary
fixture/model trial**:

```text
model route                 provider id, model id, family, route, API surface
fixture digests             content digest per fixture revision
bounds                      the aggregate lower/upper bounds and the class-headroom minimum
Nq                          the qualification repetition count
schedule                    the exact (fixture, model, repetition) run list
analysis digest             the digest of the analysis code that will judge the runs
qualification schema        the record schema the runs will produce
```

The subsequent results commit MUST descend from that plan commit. This is now a hard evidence rule, and it
is the direct remedy for R3-A0's `PREREGISTRATION_CHECKPOINT_MISSING`.

A copy of the plan must also be written to `research-evidence/r3-a1/plan.json` at commit time, so the
committed plan and the executed plan can be compared byte-for-byte.

---

# 4. What R3-A1 must obtain

```text
>= 2 qualified task families
>= 2 qualified model families
>= 1 model qualified on >= 2 task families
>= 1 task family qualified on >= 2 model families
```

The cheapest legitimate route is:

1. a **new task family** (F-C) designed from a different mechanism obligation, qualified against the existing
   models — if it qualifies for both, the L-shaped bridge is immediately satisfied through F-A/F-C;
2. and/or the **kimi-k3 route** (already plumbing-verified) qualified on F-A and/or a new F-C.

R3-A1 may NOT:
```text
· revise F-A or F-B
· change the bounds or Nq
· re-run any already-valid qualification outcome
· loosen a QC clause
```

---

# 5. Candidate new family: mechanism requirements only

Any F-C must state its mechanism BEFORE its classes. A candidate obligation that is structurally different
from F-A (atomic commit) and F-B (forward-compatible migration):

```text
F-C candidate:  a RESOURCE-BOUNDED SCHEDULER
core obligation: admit work only when it fits the remaining budget,
                 and release exactly what was reserved
failure classes would follow from: over-admission, leaked reservation,
                 double-release, starvation of a fitting job, ordering under exhaustion
```

That list is a *starting point from the mechanism*, not a response to any model's failures. Whether F-C
qualifies is unknown and must be measured.

---

# 6. Entry checklist for R3-A1

```text
[ ] the plan commit exists and contains all eight required items
[ ] the plan commit is an ancestor of the results commit
[ ] each new fixture's failure classes are traceable to a stated obligation, recorded BEFORE qualification
[ ] the fixture manifest declares antiOverfitProcess, contamination and heldOut honestly
[ ] the deterministic fixture-audit precondition is satisfied for every new fixture
[ ] the bounds, Nq and QC clauses are unchanged from R3-A0
[ ] no existing fixture revision is modified
```

When every box is checked, R3-A1 may run. None is checked by this stage.
