# R3 CLAIM LADDER

Stage: R3-SPEC
Baseline: `9f7eb188555b18c202e0d6d188546c914c394cb4`
Status: **PRE-DECLARED** — claim strength is fixed before any R3 run, so a result cannot be promoted after the fact

---

# 1. The ladder

A result may claim **only the highest level actually tested**. Nothing below authorizes a level above itself.

| Level | Name | What it requires | What it does NOT establish |
|---|---|---|---|
| **G0** | local | one task × one model | nothing beyond that task/model |
| **G1** | task-family | multiple held-out tasks, same model | nothing about other models |
| **G2** | model-family | direction replicated across ≥2 materially different model families | nothing about context pressure |
| **G3** | context robustness | direction survives context pressure (measured occupancy regimes) | nothing about environment shift |
| **G4** | environment/runtime | direction survives a relevant environment or runtime shift | nothing universal |

---

# 2. Level-by-level requirements

## G0 — local

```text
REQUIRES  a qualified (fixture, model) pair and a completed treatment comparison on it
CLAIM     "on this task, with this model, mechanism M showed direction D"
FORBIDS   any language about generality, reuse, or superiority
```

## G1 — task-family

```text
REQUIRES  the same direction on ≥2 structurally distinct task families, same model
          at least one family held-out relative to the other's construction
CLAIM     "the direction holds across these task families for this model"
FORBIDS   any model-family or context claim
```

## G2 — model-family

```text
REQUIRES  the direction replicated across ≥2 materially different model families
          (differing in tool-use post-training, reasoning architecture, vendor, or capability level)
          with the SAME fixtures, the SAME capital bundles and the SAME outcomes
CLAIM     "the direction replicated across these model families"
FORBIDS   calling two sizes of one family independent replication
FORBIDS   assembling the comparison from different fixtures after the fact
```

## G3 — context robustness

```text
REQUIRES  the direction survives ≥2 context regimes whose ACTUAL prompt/context occupancy was measured
CLAIM     "the direction survived context pressure in these measured regimes"
FORBIDS   treating a nominal window-size change as a regime change
```

## G4 — environment/runtime

```text
REQUIRES  the direction survives a relevant environment or runtime shift, declared before the run
CLAIM     "the direction survived this declared environment shift"
FORBIDS   extrapolating to an undeclared shift
```

---

# 3. The no-universal-skill law

```text
Procedure/Skill success under one model/task/runtime
does not imply general reusable superiority.
```

This is frozen. It is the reason the ladder exists: a single G0 result is a local observation about one
model doing one task, and the distance from there to "this method is better" is exactly the ladder — each
rung requiring its own evidence.

Procedure generalization remains **unproven**. No R3-SPEC artifact establishes any rung; this stage runs
nothing.

---

# 4. Promotion rules

```text
· a level is claimed only when its own requirements are met, not inferred from a lower level
· a partial replication is reported as partial, with the level it actually reached
· a direction that reverses across a level is reported as a reversal, and no level above the reversal is claimed
· a fixture that is NON_COMPLIANT (designed in response to an evaluation model's failures)
  cannot support a claim above G0
· a fixture with SHARED_MODEL_FAMILY contamination cannot support a claim above G1
  without an independent-family replication
```

---

# 5. Reporting form

Every R3 result states its level explicitly and in the same breath as its finding:

```text
finding:  <the direction>
level:    G0 | G1 | G2 | G3 | G4
basis:    the fixtures, models and regimes actually tested
not established: the levels above
```

A finding without a level is not reportable. A level claimed without its basis is not reportable.

---

# 6. Interaction with the anti-overfit law

A `NON_COMPLIANT` fixture may still be run and reported, but its result is capped at G0 and labelled. This
keeps the incentive honest: a fixture tuned to a model can produce a large local number, and the ladder
prevents that number from being read as generality.
