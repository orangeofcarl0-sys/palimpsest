# Trajectory-P2-E2 — CONTROL-only Stochastic Baseline Calibration

**STATUS: CANDIDATE PROTOCOL — NOT AUTHORIZED, NOT EXECUTED.**

This document is a provider-independent protocol draft. It records what a future CONTROL-only calibration
*would* require. It authorizes nothing, selects no provider, names no budget, and reports no result. No
stochastic trial and no external model request occurred in Trajectory-P2-E1RF.

---

## 1. Why this stage exists

E1 through E1RF established that the measurement chain works: a real first-party DSH turn runs under a verified
confidential boundary, the persisted assistant message is read back by exact SessionId, and the official Oracle
scores it. What none of those stages established is whether the numbers a stochastic model produces are
**informative** — whether outcomes vary, whether the variation is in dimensions the treatment could plausibly
move, and whether the CONTROL arm fails for reasons Trajectory content could address.

A deterministic adapter cannot answer that. It emits a configured answer, so its correctness is a property of
the configuration, not of a model. This stage is the first that would use a real model.

## 2. The five R2-VR qualification concerns

Each concern is stated here, **before** any result exists, together with how it would be evaluated. Thresholds
are fixed in advance and are not lowered after observing results.

| # | Concern | Pre-registered evaluation |
|---|---|---|
| 1 | Non-floor / non-ceiling outcomes | CONTROL must produce at least one outcome strictly between all-pass and all-fail on the Oracle's own dimensions. A uniform result is `NOT_INFORMATIVE`, not a baseline. |
| 2 | Variation in at least two relevant dimensions | At least two of {epistemic fidelity, evidence uptake, decision quality} must show non-zero variance across trials. |
| 3 | Variation in treatment-relevant CONTROL failures | At least one CONTROL failure must be classifiable as addressable by the Trajectory content the treatment delivers — recorded with the failure class, not merely counted. |
| 4 | Evidence that Trajectory content could address those failures | For each such failure, a recorded argument binding the specific missing fact to a specific section of the treatment capsule. |
| 5 | No artificial qualification | Residual cases whose failure is treatment-irrelevant are excluded from the informativeness argument, and the exclusion is reported with counts. |

## 3. Measurement dimensions, kept separate

- **Epistemic fidelity** — does the answer match the frozen truth.
- **Evidence availability and uptake** — were the citation handles present, and did the model use them.
- **Decision quality** — was the stated decision defensible given the evidence.
- **Operational behavior** — only where actually measured; otherwise `NOT_MEASURED`.
- **Treatment-relevant failure classification** — which failures the capsule could plausibly address.
- **Uncertainty and deferral** — a correct `UNKNOWN` is not automatically a failure, and a more detailed
  historical answer is not automatically a better decision.

A successful historical interpretation is **not** Canonical Work settlement.

## 4. Candidate execution specification

Fields to be frozen before any trial runs. Entries marked `UNRESOLVED` must be supplied by an authorized
decision; they are not defaults and must not be invented.

| Field | Status |
|---|---|
| Frozen fixture identity | Resolved by the existing Family A fixture; to be re-pinned at execution time |
| Frozen Oracle version | Resolved: `p2e1rd-internal-citation-closed-1` |
| Frozen evaluation criteria | To be frozen with the fixture |
| Exact CONTROL context boundary | Resolved by the existing harness (CONTROL receives no capsule section) |
| Allowed tool set | Resolved by the E1RF-qualified worker profile |
| Work authority | Unchanged: answer is assistant text; Worker Result is non-authoritative |
| Trial identity | Per-trial id, frozen before the turn |
| Run isolation | One test-owned root per trial; the E1RF rig rules apply (outside the repo, absolute) |
| Seed policy | `UNRESOLVED` — provider-dependent |
| Repetition plan | `UNRESOLVED` — requires a cost bound |
| Outcome dimensions | Resolved (§3) |
| Exclusion rules | Resolved (§2 concern 5) |
| Stopping rules | `UNRESOLVED` — requires a cost bound |
| Failure adjudication | Resolved by the E1RF admission rules |
| Treatment relevance audit | Resolved (§2 concern 4) |
| Data retention | Digests and classifications only; no raw answer text beyond the digest |
| Maximum execution time | `UNRESOLVED` |
| Provider and model identity | **UNRESOLVED — requires authorization** |
| Maximum cost budget | **UNRESOLVED — requires authorization; must not be invented** |

## 5. What this stage must not do

- It must not design a new benchmark in order to produce a positive treatment effect.
- It must not lower a threshold after seeing a result.
- It must not select a TREATMENT effect estimate.
- It must not tune prompts against imagined results.
- It must not award `CONTROL_BASELINE_TECHNICALLY_READY` merely because this draft exists.
- It must not run TREATMENT trials. This is CONTROL-only.

## 6. Preconditions for starting

1. An authorized decision naming provider, exact model version, and a maximum cost budget.
2. A frozen fixture + evaluation criteria commit.
3. Confirmation that the E1RF-qualified runtime is still the installed runtime, or a fresh qualification.
4. A stated stopping rule.

Until all four exist, `CONTROL_BASELINE_TECHNICALLY_READY` remains **NOT_ESTABLISHED**.
