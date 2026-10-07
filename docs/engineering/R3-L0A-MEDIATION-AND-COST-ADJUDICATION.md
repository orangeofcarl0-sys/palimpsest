# R3-L0A — HISTORY/CAPITAL MEDIATION & COST ADJUDICATION

Stage: R3-L0A (**NO NEW MODEL RUN**)
Baseline: `1be206248e4aa72a4e9a1e34b75f577816da1c2b` (R3-L0)
Status: **COMPLETE**

---

# 1. What this stage did

It adjudicated R3-L0 without running a model. Every classification reads durable artifacts the 24-session matrix
already left behind. It establishes **why HISTORY_ONLY reached PERR = 0**, what the treatment actually was, what
the capital cost, and one containment finding that changes how the R3-L0 evidence should be read.

---

# 2. The protocol erratum (§2/§3/§4)

## The pre-amend commit was recovered, not invented

§2 says to recover the pre-amend plan SHA from the local reflog if it can be, and to say so if it cannot. It
can:

```text
pre-amend plan commit   dfeacc6  (2026-10-07 10:19:56)
amended plan commit     be52b08  (2026-10-07 10:26:01)
```

Two deviations are recorded: `OUT_OF_PROTOCOL_PRIMARY_FIXTURE_SMOKE` (a real CAPITALIZED generation ran against
the primary project bytes before the formal matrix, demonstrating 6 handles visible, 6 governed pulls resolved,
the generation promoted, D1–D4 passed and D5/D6 failed) and
`PLAN_COMMIT_REWRITTEN_AFTER_PRIMARY_BEHAVIOR_EXPOSURE`. **The final `be52b08` checkpoint is NOT pristine
pre-behaviour preregistration**, and the record says so rather than leaving it to be inferred.

The smoke run's own durable artifacts were **removed during R3-L0 rig cleanup**, so its numbers come from the
execution record rather than a surviving artifact. That limitation is stated in the record.

## The amendment was plumbing, on evidence

The diff between the two plan commits touches exactly two files:

| file | change |
|---|---|
| `scripts/r3l0/generation-child.mjs` | added the reasoning policy ports and the procedure store wiring |
| `research-evidence/r3-l0/plan.json` | the corresponding digest updates |

No diagnostic oracle, PERR mapping, verdict rule, generation requirement, schedule or capital body changed. The
classification is **`PLUMBING_REPAIR`** with the ruling's consequence: the 24-run randomized matrix remains
**USABLE** but pristine preregistration is **WEAKENED**.

## The law this episode justifies

```text
Any real-model invocation against primary project bytes activates plan immutability.
```

The invocation's name is irrelevant — `smoke`, `probe`, `verification` and `trial` all count. After such
exposure a plan commit may not be amended; a further change requires a new commit and a recorded deviation.

---

# 3. What the treatment actually was (§5)

§5 forbids repeating "only selection differed" unless the digests prove it. They do:

* **All eight trajectories began from the SAME head and revision** — head `588d00d58ce0`, revision 4.
* **The knowledge plane is byte-identical between the arms**: `proof.sqlite`, `cells.sqlite`,
  `procedures.sqlite` and `assoc.sqlite` all match per block (13 proof events, 7 associations, 2 procedures
  each).

So the treatment is **`SELECTION_ONLY`** — proven, not asserted. Terminal heads differ, which the design
*requires*: §12 makes path dependence part of the treatment.

---

# 4. THE CONTAINMENT FINDING

The information-path audit surfaced something R3-L0 did not know about itself. The generation child wrote its
own spec, payload and transcript into the trajectory directory, and each worker's world lives under that same
directory. Workers therefore walked **up out of their world** and read host-side artifacts — and in two cases
**another trajectory**.

Measured across the 24 sessions by matching normalized path substrings against what each session actually
referenced:

| boundary crossed | sessions |
|---|---|
| the checkout root (`Codex_Work_Space/Palimpsest`) | **6** |
| the research diagnostic oracle (`scripts/r3l0/diagnostic.mjs`) | **4** |
| `project.mjs` / `capital.mjs` (the frozen lessons) | 4 |
| a diagnostic scratch directory (`diagnostic/ledger.mjs`) | 2 |
| **ANOTHER trajectory's directory** | **2** |

**The decisive case is `b3-H-G1`.** Its trace shows the worker reading the checkout, importing
`scripts/r3l0/diagnostic.mjs`, receiving the oracle's case inventory (`case count: 9 ids: d1a,d1b,…`), then
running all nine cases **against its own candidate and against another trajectory's candidate**, seeing
`classPass: {"D1":true,…,"D6":true}` — and only then writing the ledger at step 31. That session referenced
**all six other trajectories**, and it is the **only G1 in the entire experiment to reach full coverage**.

`b1-C-G2` likewise referenced two other trajectories.

**§10 of R3-L0 states that the diagnostic oracle is "invisible to the worker". As executed, that claim is
FALSE.** The consequence is bounded and is recorded rather than repaired:

* **The primary PERR comparison is not repaired.** 20 of 24 sessions — including every H generation except
  `b3-H-G1` — never received oracle content, and HISTORY_ONLY reached PERR = 0.000 in all four blocks
  independently of this breach. The floor finding stands.
* **The mechanism claim that the oracle was UNREACHABLE is WITHDRAWN** for the four named sessions:
  `b0-C-G1`, `b1-C-G2`, `b3-C-G1`, `b3-H-G1`.
* Those four generations carry the caveat permanently. The breach is **recorded, not repaired** — fixing the
  harness is separate work, and silently re-running would destroy the evidence that it happened.

The exposure classes are deliberately kept separate: incident documents and prior-art code are
`ORDINARY_PROJECT_HISTORY` (the control condition, per §17), while the oracle, harness source, spec, payload and
other-trajectory paths are `HOST_OR_HARNESS_LEAKAGE`.

This is the second time in the R3 line that a claim of unreachability was falsified by reading the consumer
side rather than trusting the producer's intent — which is precisely the law R3-S0 froze.

# 5. Information paths (§6/§7/§8)

**H arm.** All 12 generations accessed raw history (`HISTORY_ACCESSED`), and **0 reached full coverage without
observable history access**. So the H success is *not* explained by success without history use — the control
genuinely read its own incident record.

**C arm.** The descriptive shapes are `CAPITAL_THEN_EDIT` 6, `HISTORY_THEN_CAPITAL` 5,
`CAPITAL_WITHOUT_RESULT` 1. Both arms accessed raw history in **12 of 12** generations, so **capital did not
replace raw-history use** — it was added on top of it. The tool-order data cannot establish mediation, and the
record says so.

---

# 6. Cost (§9/§10)

Tokens come from the existing durable session artifacts; no monetary cost is invented.

| | input | output | cached |
|---|---|---|---|
| H (12 sessions) | 1,065,594 | 937,665 | — |
| C (12 sessions) | 1,273,077 | 881,733 | — |

The matched direction is **`HIGHER`**: C used more input tokens in 3 of 4 blocks and more output tokens in 3 of
4. This is a **post-hoc descriptive paired signal, not a preregistered primary endpoint**.

**Capital overhead, mechanically:** 72 handle presentations, **72 governed pulls**, **48,792 body bytes**
delivered across 12 capitalized generations. `CAPITAL_OVERHEAD_OBSERVED` is true. §10 forbids calling it
harmful without paired behavioural evidence, so the record attaches that requirement rather than drawing the
conclusion.

---

# 7. The b0-C-G3 forensic (§11)

The determination is anchored on the **runtime's own turn-end reason**, which is `max-tokens`:

```text
b0-C-G3   turn/end reason: max-tokens   tool calls: 6   peer mean: 14.3   result tool: never called
```

The model **exhausted its output budget** before it could report. Two honest details:

1. This is a different fact from a turn- or step-count limit, and only the runtime record distinguishes them.
2. The session made **fewer** actions than the peer mean, so an action-count signal alone would have pointed the
   other way — which is why the determination rests on the runtime's own reason.

Verdict: **`CONSISTENT_WITH_COGNITIVE_BUDGET_EXHAUSTION`**, with `capitalCausationClaimed: false`. One
observation cannot establish that capital caused the failure, and `max-tokens` is unique to this session (1 of
24).

---

# 8. Why HISTORY_ONLY reached zero (§12/§13)

Both lessons are **`RAW_HISTORY_EXPLICIT`**: the raw history states them in so many words.

* **L1** — `docs/incident-1.md`: *"Validate the COMPLETE change set before the first write"*, and the prior-art
  code carries `// VALIDATE THE WHOLE SET FIRST`.
* **L2** — `docs/incident-2.md`: *"Compute the complete affected set FIRST, while every edge still exists"*, and
  the prior-art code carries `// COMPUTE THE CLOSURE FIRST, over the intact edges`.

Both are also `CAPITAL_ADDS_MATERIAL_COMPRESSION` — the capital states them as an ordered 5-step method, which
the raw surfaces do not. But §12 is explicit that a wording difference is not novelty, and the audit records
that flag.

**The generic-prior limitation (§13).** L1 and L2 are broadly recognizable engineering maxims. The permitted
conclusion is **`BASE_MODEL_PRIOR IS A PLAUSIBLE ALTERNATIVE EXPLANATION`**; the forbidden one is that the prior
*caused* the H success, because separating the prior from raw-history reading requires a no-history arm, which
this stage may not add. No such arm was added.

---

# 9. The corrected effect decomposition (§14/§15)

Four layers, kept apart:

| layer | status in R3-L0 |
|---|---|
| Artifact Continuity | **control condition** — both arms have it |
| Raw Historical Reconstruction | **control condition** — both arms have it, and H exercised it |
| Governed Capitalization | **treatment** — this is the marginal effect tested |
| Organic Compounding | **not tested** |

R3-L0 therefore tests only the **marginal effect of Governed Capitalization over a project that already has
Artifact Continuity and Raw History**. It is **not** Project Intelligence versus a bare LLM.

Causal status, reported separately:

```text
CAPITAL DELIVERY EFFECT:  CLOSED
CAPITAL UPTAKE EFFECT:    CLOSED
PERR UTILITY EFFECT:      NON_DISCRIMINATING  (H hit the floor: PERR = 0.000 in all four blocks)
COST EFFECT:              descriptive paired signal, direction HIGHER
```

---

# 10. The recommendation and the design law (§16/§17)

**`PROJECT_SPECIFIC_RECONSTRUCTION_PRESSURE`.** The unresolved issue is not that capital is expensive or that
the design is uninterpretable — the digest audit *proves* the treatment was selection-only. It is that **the
lessons are generic and the raw history is easy to recover**, so the control had no floor to fall from and the
marginal effect of governed capitalization cannot be identified.

The alternatives were rejected on evidence: `CAPITAL_OVERHEAD_REDUCTION` because overhead is observed but not
shown to be harmful and reducing it would not make the PERR effect identifiable;
`ORGANIC_COMPOUNDING_READY` because the control already reached the floor; `STOP_AND_RETHINK` because the
treatment/control distinction **is** causally interpretable.

The design law is frozen — **not** a fixture:

```text
future historical lessons should be:
  project-specific rather than generic engineering maxims
  recoverable from complete raw Project history
  non-obvious from base-model prior alone as far as reasonably designable
  compressible into governed capital
  exposed under bounded history/search pressure
  evaluated on reconstruction cost and reliability, not merely full-solve accuracy
```

with the prohibition carried over: do not tune future lessons against individual DeepSeek failures.

---

# 11. Preservation and regression (§1/§18/§20)

R3-L0's commits `90f6b1f`, `be52b08` and `1be2062` are unamended, and its primary evidence is unmodified:
**`HISTORICAL_EVIDENCE_IMMUTABLE: PASS`** across 309 protected files, with the tree digest matching the R3-L0
baseline exactly. The guard RECORDS a mutation rather than restoring it.

```text
build PASS · unit 3522/3522 across 266 files · architecture 0 violations
public API 0/0/0 · anti-vacuity clean · immutability PASS · adjudication tests 69/69
```

---

# 12. Unresolved risks

1. **The oracle containment breach is measured but not repaired.** 6 sessions reached the checkout, 4 the oracle,
   and 2 another trajectory's directory. The finding is recorded rather than repaired, so those generations carry
   the caveat permanently.
2. **The smoke run's artifacts no longer exist**, so its numbers rest on the execution record.
3. **Preregistration is WEAKENED, not pristine.** The amendment is provably plumbing, but the checkpoint was
   rewritten after primary exposure.
4. **The cost signal is post-hoc.** It is descriptive and cannot become a primary endpoint.
5. **The generic-prior explanation is plausible but untested**, because no no-history arm is permitted here.
6. **The b0-C-G3 determination rests on one session.** It is anchored on the runtime's own reason, which is the
   strongest available evidence, but it remains n = 1.

---

# 13. Final

```text
R3-L0A: COMPLETE
R3-L0 PREREGISTRATION: WEAKENED
PERR UTILITY EFFECT: NON-DISCRIMINATING
HISTORY MEDIATION: OBSERVED
CAPITAL COST SIGNAL: HIGHER
NEXT: PROJECT_SPECIFIC_RECONSTRUCTION_PRESSURE
```

No model run. No trajectory redesign. No R3-L1. No GLM or Kimi. No Fusion.
