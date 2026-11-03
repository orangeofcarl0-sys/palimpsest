# R3-A0 / R3-A — BASELINE QUALIFICATION RESULT

Stage: R3-A0 (fixture construction, qualification contract v0.1, baseline qualification)
Baseline: `096008d7b005096ec83526b6c5fcb3e54ba4d12f`
Treatment: **NONE** — treatment-independent baseline (§10/§20)

---

# 1. Result

```text
R3-A QUALIFICATION: COMPLETE
A→B: RED
R3-B: NOT READY
```

Twenty baseline runs completed across four (fixture, model) pairs. **One pair qualified.** The contract
rejected three, and per §17 the thresholds were not loosened.

| pair | verdict | class coverage | failed clauses |
|---|---|---|---|
| F-A × deepseek-flash | UNQUALIFIED | 0.633 | QC-2 (1 varying dimension), QC-4 (1 varying DIRECT class) |
| F-A × glm-5.3-flash | **QUALIFIED** | 0.700 | — |
| F-B × deepseek-flash | UNQUALIFIED | 0.857 | QC-1 (CEILING) |
| F-B × glm-5.3-flash | UNQUALIFIED | 0.914 | QC-1 (CEILING), QC-4 (1 varying DIRECT class) |

---

# 2. What this means

The fixtures **do** have the headroom R2 lacked. F-A's baseline class coverage ranges 0.50–1.00 across runs
and both models show real per-class variance (FA1, FA2, FA4 vary for GLM; FA4 varies for DeepSeek). That is
the opposite of the R2-V saturation, where 13 of 14 cases were invariant.

But the A→B gate is RED, and correctly so. §2.1 requires a qualified **bipartite bridge** — one model
qualified on two task families AND one task family qualified on two model families — and the result is:

```text
qualified pairs:        1   (F-A × glm only)
qualified task families: 1
qualified model families: 1
full 2×2 cross:          no
```

A single qualified pair cannot support any generalization claim. The gate refuses to let one lucky cell stand
in for a benchmark.

---

# 3. Why each pair was rejected

## 3.1 F-A × deepseek-flash — QC-2 and QC-4

```text
FA1 0/5  FA2 0/5  FA3 5/5  FA4 4/5  FA5 5/5  FA6 5/5
coverage per run: 0.500 0.667 0.667 0.667 0.667
```

Only FA4 varies. DeepSeek's baseline either validates the batch or it does not, and it does not — the two
classes that measure validation ordering (FA1, FA2) are failures in all five runs. With one varying DIRECT
class, QC-4 fails, and with the aggregate nearly constant, QC-2 fails.

This is a genuine, informative negative: **for this fixture and model, the atomicity obligation is
all-or-nothing, not stochastic.** The fixture is not defective; this model simply does not sometimes get it
right.

## 3.2 F-B — QC-1 (CEILING) for both models

```text
deepseek: 0.857 1.000 0.714 0.857 0.857   → coverage 0.857
glm:      0.857 0.857 1.000 0.857 1.000   → coverage 0.914
```

F-B's baseline sits at or above the frozen upper bound of 0.85 for both models. Six of seven classes are
invariant for DeepSeek and six of seven for GLM. This is precisely the R2-V failure mode re-appearing on a
fixture this stage authored to avoid it: the cumulative-schema family turned out to be **easy** for both
models, because each individual class is independently satisfiable and a model that handles one tends to
handle the rest.

Recorded honestly: **F-B revision 1 is a ceiling fixture for this model cohort.** It is not revised in place
(§2.5).

---

# 4. What the rejection does NOT mean

```text
· it does NOT mean the fixtures are worthless — F-A × glm qualified, and F-A's variance is real;
· it does NOT mean the models are bad — this is assay headroom, not model ranking (§11);
· it does NOT mean the contract is too strict — it means one bridge leg is missing;
· it is NOT a reason to revise the fixtures now (see §5).
```

---

# 5. Why the fixtures were NOT revised

§3's anti-overfit law forbids exactly the move the current result invites:

```text
inspect evaluation model failures → add cases that model happens to miss → rerun → declare headroom
```

F-B is now known to be ceiling for these two models. Adding a harder class to it *because* these models pass
it would make the fixture a measurement of those models' specific weaknesses rather than of the mechanism's
obligations. That is the forbidden process, and it is forbidden even when the intent is to obtain a green
gate.

The correct next step is a **new fixture revision designed from mechanism requirements first** (a harder
forward-compatibility obligation, not a harder-to-guess case), then qualified from scratch — and its
qualification record would be a genuinely new measurement. That work belongs to a subsequent stage.

---

# 6. What is ready

```text
· the qualification contract v0.1 is frozen and executable (33 deterministic gate checks)
· two COMPLIANT, structurally distinct fixture families exist at revision 1, both with frozen digests
· the failure-class tables, oracles and capital relationship maps are frozen
· the treatment-independent baseline harness works end-to-end against a real worker, with no capital
· two materially distinct model families are verified end-to-end in the DSH worker profile
· the common renderer is frozen and family-independent
· the frozen bounds and Nq were declared BEFORE any model ran and were not moved afterwards
```

The remaining blocker is a **second and third qualified pair**, which requires new fixtures rather than
adjustments to these.

---

# 7. Treatment independence (§10/§20)

Every one of the 20 runs recorded:

```text
capitalDelivered:   false
compiledHandleCount: 0
indexHandleCount:   0
```

No capital was selected, no index was composed, no metadata preview was delivered, and no prework ran. The
qualification reference is therefore the **no-capital baseline**, exactly as §20 requires, and no treatment
result could have leaked into a qualification decision.
