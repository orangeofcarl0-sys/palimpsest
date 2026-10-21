# Trajectory-P2-E2 — CONTROL-only Stochastic Baseline Calibration

**STATUS: CANDIDATE PROTOCOL — NOT AUTHORIZED, NOT EXECUTED.**

This document is a provider-independent protocol draft, revised in E1RG. It records what a future CONTROL-only
calibration *would* require. It authorizes nothing, selects no provider, names no budget, and reports no result.
No stochastic trial and no external model request occurred in E1RF or E1RG.

---

## 1. Why this stage exists

E1 through E1RG established that the measurement chain works: a real first-party DSH turn runs under a verified
confidential boundary, the persisted assistant message is read back by exact SessionId, and the official Oracle
scores it. What none of those stages established is whether the numbers a stochastic model produces are
**informative**.

A deterministic adapter cannot answer that. It emits a configured answer, so its correctness is a property of
the configuration, not of a model. This stage is the first that would use a real model.

## 2. Evaluation units (distinct, never collapsed)

| Unit | What it measures | Not to be confused with |
|---|---|---|
| **Per-trial validity** | did the trial complete the full chain (turn, persistence, extraction, scoring) | a successful *answer* |
| **Per-proposition epistemic correctness** | was each claim in the answer true against frozen truth | the aggregate verdict |
| **Evidence availability** | were the citation handles present in the delivered context | whether the model used them |
| **Evidence uptake** | did the model actually cite the handles it was given | whether the evidence was sufficient |
| **Decision correctness** | was the stated decision defensible given the evidence | historical detail volume |
| **Correct uncertainty / deferral** | did the model say UNKNOWN where the record is silent | a failure |
| **Operational behavior** | measured only where a measurement exists; otherwise `NOT_MEASURED` | a proxy from proposed-action text |
| **Treatment-relevant failure class** | which failures the capsule could plausibly address | every failure |

A correct `UNKNOWN` is **not** automatically a failure. A more specific historical answer is **not**
automatically a better decision. A successful historical interpretation is **not** Canonical Work settlement.

## 3. The five R2-VR qualification concerns

Each is stated **before** any result exists, with a pre-registered evaluation. Thresholds are fixed in advance
and are never lowered after seeing results.

| # | Concern | Pre-registered evaluation |
|---|---|---|
| 1 | Non-floor / non-ceiling | CONTROL must produce at least one outcome strictly between all-pass and all-fail on the Oracle's own dimensions. A uniform result is `NOT_INFORMATIVE`, not a baseline. |
| 2 | Variation in ≥2 relevant dimensions | At least two of {epistemic fidelity, evidence uptake, decision quality} must show non-zero variance across trials. |
| 3 | Variation in treatment-relevant CONTROL failures | At least one CONTROL failure must be classifiable as addressable by the Trajectory content the treatment delivers, recorded with its failure class. |
| 4 | Missing-evidence ↔ available-Treatment relationship | For each such failure, a recorded argument binding the **specific missing fact** to a **specific section** of the treatment capsule. |
| 5 | No artificial qualification | Residual cases whose failure is treatment-irrelevant are excluded from the informativeness argument, with counts reported. |

## 4. Preregistration fields

To be frozen before any trial runs. `UNRESOLVED` entries must be supplied by an authorized decision; they are
not defaults and must not be invented.

| Field | Status |
|---|---|
| Frozen fixture identity | Resolved by the Family A fixture; re-pin at execution time |
| Frozen Oracle version | Resolved: `p2e1rd-internal-citation-closed-1` |
| Frozen evaluation criteria | To be frozen with the fixture |
| Exact CONTROL context boundary | Resolved: CONTROL receives no capsule section |
| Allowed tool set | Resolved by the E1RG-qualified worker profile |
| Work authority | Unchanged: answer is assistant text; Worker Result is non-authoritative |
| Trial identity | Per-trial id, frozen before the turn |
| Run isolation | One test-owned root per trial; the E1RG rig rules apply (outside the repo, absolute) |
| Seed policy | **UNRESOLVED** — provider-dependent |
| Trial count | **UNRESOLVED** — requires a cost bound |
| Maximum cost | **UNRESOLVED — must not be invented** |
| Maximum elapsed time | **UNRESOLVED** |
| Stopping rules | **UNRESOLVED** |
| Failure classifications | Resolved (§2, §3) |
| Exclusion rules | Resolved (§3 concern 5) |
| Statistical / reporting plan | To be frozen with the trial count |
| Data retention | Resolved (§5) |
| Provider and exact model | **UNRESOLVED — requires authorization** |

## 5. Auditable output retention (§10.4)

The E1RF draft proposed retaining only digests and classifications. That is **insufficient** for independent
re-scoring: a reviewer cannot reconstruct the structured answer or verify a per-proposition score from a hash.

**Retention plan:**

| Tier | Content | Location | Committed to research evidence? |
|---|---|---|---|
| **Published** | redacted structured results, digests, adjudication metadata, per-proposition verdicts without free text | research evidence | **yes** |
| **Restricted** | the raw structured model answer (JSON), per trial | test-owned restricted directory, not in the repository | **no** |
| **Never persisted** | provider credentials, personal information, anything the fixture did not authorize | — | **no** |

An authorized reviewer can therefore reconstruct the original structured answer and its per-proposition score
from the restricted tier, while the published tier carries no free text. This is a retention plan for one
experiment, not a general data-retention product.

## 6. What this stage must not do

- Design a new benchmark to produce a positive treatment effect.
- Lower a threshold after seeing a result.
- Select a TREATMENT effect estimate.
- Tune prompts against imagined results.
- Award `CONTROL_BASELINE_TECHNICALLY_READY` merely because this draft exists.
- Run TREATMENT trials. This is CONTROL-only.
- Make any external model call or activate a paid-provider configuration.

## 7. Preconditions for starting

1. An authorized decision naming provider, exact model, and a maximum cost budget.
2. A frozen fixture + evaluation criteria commit.
3. Confirmation that the E1RG-qualified runtime is still the installed runtime, or a fresh qualification.
4. A stated stopping rule and trial count.

Until all four exist, `CONTROL_BASELINE_TECHNICALLY_READY` remains **NOT_ESTABLISHED**.

## 8. Host-S1R handoff (nonexecuting)

Host-S1R re-qualified the Host boundary for the exact runtime in §4. Nothing here was executed.

### 8.1 Precondition 3 is now satisfied, with a stated scope

`S1R-E HOST_S1_SECURITY_RATIFIED` holds for **Windows x64 10.0.26200, Node 24.22.0, DSH 0.2.1-rc.2, koffi 3.1.1**.
It is not a claim about any other version. Before the first CONTROL trial, confirm the installed runtime still
matches; if it does not, precondition 3 fails again and the Host boundary must be re-measured.

### 8.2 The five R2-VR informativeness conditions, restated as untested

These remain conditions on the *experiment*, not on the Host, and none has been evaluated:

1. CONTROL outcomes are not entirely at floor or ceiling.
2. At least two relevant outcome dimensions vary.
3. At least one treatment-relevant CONTROL failure varies.
4. The missing CONTROL fact is specifically addressable by the proposed Trajectory Treatment.
5. Treatment-irrelevant failures cannot manufacture benchmark qualification.

No threshold may be relaxed after observing model results.

### 8.3 Frozen now

| Field | State |
|---|---|
| Evaluation units | Frozen (§2): trial validity, per-proposition epistemic correctness, source correctness, evidence availability, evidence uptake, decision quality, correct uncertainty/deferral, treatment-relevant failure, operational behaviour |
| Oracle version | Frozen: `p2e1rd-internal-citation-closed-1` |
| CONTROL context boundary | Frozen: no capsule section |
| Allowed tools | Frozen by the E1RG-qualified worker profile, re-verified by S1R |
| Work authority | Frozen: the answer is assistant text; a Worker Result is non-authoritative |
| Trial validity | Frozen (§2/§3) |
| Failure taxonomy | Frozen |
| Re-scoring procedure | Frozen (§5) |
| Exclusion rules | Frozen (§3 concern 5) |
| Data retention | Frozen (§5): published / restricted / never-persisted tiers |
| Fixture identity | **Candidate** — re-pin at execution time |

### 8.4 Unresolved and not to be invented

Provider · exact model identifier · maximum cost · trial count · maximum elapsed time · seed/temperature policy ·
the actual stochastic adapter · stopping rule · raw structured answer retention controls.

No external model call is authorized. `CONTROL_BASELINE_TECHNICALLY_READY` remains **NOT_ESTABLISHED** until
every §7 precondition exists.

### 8.5 The alternative epistemic-only study

If tool-capable Host execution were blocked for security reasons, a tool-free read-only epistemic study could be
considered separately. It would be a **different experimental condition**, must not claim equivalence to the
normal Work Worker Port, must not measure Work Utility or Cooperation Utility through proxies, and would require
its own provider/model/cost authorization. It is not created or executed by this stage.
