# R3-L0C-R — TREATMENT REALIZATION AND REPAIR REPLICATION

**Stage:** R3-L0C-R · **Branch:** `r3-l0c-project-specific-reconstruction` · **Start:** `cb504b208ba75fb6a18d994bd426783b58303784`

**OUTCOME: BLOCKED.** Every pre-exposure repair is complete, committed and proven deterministically, and the
reconstruction-pressure gate is GREEN. The replication could not execute because the frozen sentinel route returns
**HTTP 402 Insufficient Balance** — a billing state, verified by calling the provider directly.

No primary project byte was exposed to a model. The plan is committed, unamended, and unspent.

---

## 1. Run 1 is `TREATMENT_NOT_APPLIED` (§1)

Run 1's eight intended CAPITALIZED sessions are **treatment-realization failures**, not failed capital-uptake
observations. A selection was requested and zero handles were compiled. The corrected verdicts are appended while
the historical protocol report is preserved and unrewritten:

| | |
|---|---|
| `SYSTEM_VALID` | YES |
| `EXPERIMENT_ENVIRONMENT_VALID` | YES |
| `TREATMENT_REALIZATION_VALID` | **NO** |
| `CAUSAL_EXPERIMENT_VALID` | **NO** |
| `CAPITAL_UPTAKE` | NOT_EVALUABLE |
| `RECONSTRUCTION_COMPRESSION` | NOT_EVALUABLE |
| `NET_COGNITIVE_COST` | NOT_EVALUABLE |

---

## 2. Why one boolean was not enough (§2)

Run 1 had a **sound environment** and an **absent treatment**. A single `EXPERIMENT_VALID` would have reported
`YES` — the environment *was* valid — and a reader would have concluded the experiment was sound while the
treatment was missing. The dimension is now three:

| Dimension | Question |
|---|---|
| `EXPERIMENT_ENVIRONMENT_VALID` | was the environment sound? |
| `TREATMENT_REALIZATION_VALID` | did the treatment actually reach the consumer? |
| `ANALYSIS_PLAN_VALID` | was the analysis fixed before execution, and is it still the one running? |

Their conjunction with `SYSTEM_VALID` is `CAUSAL_EXPERIMENT_VALID`. The task outcome is not an input, in either
direction.

## 3. Telemetry: `knowledgeSelected` is not delivery (§3)

Five fields, each measured where it is actually observable:

| Field | Measured from |
|---|---|
| `selectionRequested` | the delegation input |
| `selectionCompiled` | the consumer-boundary payload |
| `selectionVisible` | the consumer-boundary payload |
| `pullInvoked` | the governed pull records |
| `bodyResolved` | the pull response digest |

The rule this stage freezes: **`selectionRequested = true` with zero compiled handles is a DELIVERY failure, not
an uptake failure.** Per-kind requested and compiled counts are recorded separately.

## 4. The selection contract: the harness bypassed a typed API (§4)

§4 asks for a determination, and it is **`HARNESS_BYPASSED_TYPED_API`** — established by evidence, not assertion:

- the boundary is **in-process**; `work_delegation` passes the object straight to the controller, with no
  serialization step;
- the contract is a **typed interface**, `KnowledgeSelectionRequest`, whose fields are exactly
  `proof`/`reasoning`/`procedure`;
- **TypeScript rejects the escaped shape** with `TS2353` — verified by compiling it;
- the harness is **plain JavaScript** and `scripts/` is outside `tsconfig.include`, so the type never ran;
- `knowledge` is **absent from the sealed public API**, so no typed caller can produce the shape.

§4 says explicitly that when the type already enforces the contract, **do not change product behaviour**. No
product file was modified. The repair is a canonical harness builder.

## 5. The repair is fail-closed, and permanent (§4, §5)

The builder rejects an unknown key, rejects a malformed value shape, and **never converts a malformed non-empty
selection into an empty one**. The escaped `{ handles: [...] }` shape now yields:

```
INVALID_SELECTION_SHAPE   TREATMENT_REALIZATION_GATE = FAIL   REAL_MODEL_LAUNCH_COUNT = 0
```

Two positive controls prove the gate discriminates: the correct C owner-kind selection passes with exactly the
expected handles, and the H empty selection passes with zero.

## 6. The expectation is frozen, not inferred (§6)

Per generation, before execution: `expectedSelectionByKind` and `expectedConsumerVisibleHandles`. The rule is
`requested == compiled == consumer-visible == expected`, compared by exact identity, kind and count. A mismatch is
`TREATMENT_NOT_APPLIED` and the launch is forbidden. An expectation read off the run could never disagree with the
run — which is precisely why Run 1's defect was invisible.

## 7. The boundary is proven on the REAL prehistory (§7)

§7 forbids a dummy Project, and this stage's own history shows why: R3-L0C's preflight drove a dummy, and a dummy
has no capital associations, so a selection **cannot resolve against it**. The preflight passed while the real
delivery path was broken, because what it exercised was not what runs.

The probe drives the **exact real prehistory and association state** with a scripted actor and no LLM:

**`BOUNDARY_PROBE: PASS`** — 2 handles at the consumer boundary, matching the frozen expectation exactly, both
governed pulls resolved with canonical body digests (257 and 2136 bytes).

## 8. Containment is derived from the schedule (§8)

No sibling root is enumerated by hand. For every unit `Ui`: worker-readable is `Ui`'s world; protected is every
other unit's world, plus oracle, control, evidence, reference, sibling-unit root, runner/analysis, and `Ui`'s own
durable state. A unit the schedule adds is protected **because it is in the schedule**. The units root is never
protected, because it is an ancestor of the world.

Canaries run against the **actual** topology: `EXPERIMENT_CONTAINMENT: PASS`, 32 probes, liveness LIVE.

## 9. The closure is frozen and matches (§9)

`ExecutionClosureDigest` over all ten load-bearing categories: `73be9963ee13b282`, recomputed immediately before
trial 1 and **MATCHING**.

One pre-exposure repair was needed — the runner's expectation lookup used the source stage's session-id prefix —
and §9 required it to produce a **new plan commit** rather than leave an older plan whose closure had drifted. It
did.

## 10. Run 1 as baseline calibration (§10, §11)

Proven mechanically first: the model-visible capital surface was **empty for all 16 sessions** (0 compiled
handles; 8 requested-but-not-compiled). No H/C label comparison is made, because the C label describes an intent
that was not realized.

| Metric | min | median | max |
|---|---|---|---|
| raw-history artifacts read | 26 | 26 | 26 |
| distinct history categories | 7 | 7 | 7 |
| raw-history bytes returned | 33,297 | 33,297 | 86,365 |
| actions before first result | 47 | 73 | 153 |

**`RECONSTRUCTION_PRESSURE_PRESENT: YES`** — 16/16 sessions read ≥1 declared artifact (required 12), median 26
(required ≥2), 16/16 read ≥2 categories (required 8). The uniform artifact count is real: each session performs
26 individual `read` dispatches, verified by inspecting the dispatches.

The gate is economic/readiness, not a treatment-effect result, and correctness at ceiling does not fail it.

## 11. The blocker (§14)

| | |
|---|---|
| Route | `deepseek-direct` → `https://api.deepseek.com` |
| Observed | **HTTP 402**, `Insufficient Balance` |
| Verified by | a **direct** request to the provider, not inferred from a worker failure |
| Transient | **no** — a billing state, does not clear on retry |
| Contrast | all 16 R3-L0C sessions completed on this same route earlier in the session |

**Why the fallback is not taken.** R3-L0C permitted GLM when the primary sentinel was unavailable before trial 1.
This stage's ruling forbids it outright: `Do NOT run GLM/Kimi`. The prohibition is explicit and specific to this
stage, so it governs. Substituting a different route to the same model would silently change the frozen model stack
that §12 requires preserved.

**What the stage stops with**, which is what matters for a later attempt: all pre-exposure repairs complete and
committed, the plan committed and unamended, and **no primary byte exposed to a model**.

## 12. Regression

| Gate | Result |
|---|---|
| build | clean |
| unit | **3767 / 3767** across 275 files |
| architecture | 0 violations |
| public API | 0 / 0 / 0 |
| anti-vacuity | PASS |
| historical evidence immutability | PASS over 340 files |
| R1-H / R1-HR / R1-HC / R1-L | all PASS |
| R3-L0C-R tests | 54 (contract 47, boundary 7) |
| **SYSTEM_VALID** | **YES** |
| **EXPERIMENT_ENVIRONMENT_VALID** | **YES** |

## 13. Canonical / product / runtime diff

**`src/` and `host/` diffs are ZERO.** §4's determination was `HARNESS_BYPASSED_TYPED_API`, which requires the
harness to obey the existing type rather than the product to change. One prior-stage file was touched —
`scripts/r3l0c/plumbing.mjs`, the dummy fixture, to repair a variable collision in its own embedded child script.

## 14. Unresolved risks

- **The replication is unexecuted.** The design, the repairs and the gates are all in place; what is missing is a
  funded model route.
- **`TREATMENT_REALIZATION_VALID` is `NO` for this stage**, and the reason is precise: the realization *gate* is
  proven green deterministically, but realization *validity* is a property of executed trials and none executed.
  Reporting `YES` from the gate alone would repeat the very conflation this stage corrects.
- **The DeepSeek balance is an external dependency** that no harness change can address. A later attempt needs the
  account funded, or an explicit authorization to change the frozen model stack.
- **The frozen expectation manifest is committed and unused**, which is the correct state to resume from.
