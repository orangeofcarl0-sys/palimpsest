# Trajectory-P2-E1R — Assay Validity & Calibration Launch Gate

**Stage:** `Trajectory-P2-E1R`
**Baseline:** `34544335d42ed35aec2724a2a571fcd035901918` (branch `trajectory-p2e1-assay-integrity`)
**Branch:** `trajectory-p2e1r-assay-validity`
**Scope:** close the last deterministic assay-validity defects and establish one real, auditable calibration execution path. This stage runs **no** stochastic calibration and measures **no** Agent utility.

---

## 1. What was wrong after P2-E1

P2-E1 built a source-aware oracle and a per-run ground-truth contract, but a follow-up source review found ten
remaining defects. E1R reproduced them and closed them:

| # | Defect | Fix |
|---|---|---|
| F1/F2 | `ORIGIN_ALL_DSH_EVENTS_OBSERVED = UNKNOWN` hid a **determinable FALSE** (3 of 8 events returned) behind an ambiguous id | split into `ALL_REPORTED_DSH_EVENTS_RETURNED = FALSE`, `OUTCOMES_OF_UNRETURNED_EVENTS = UNKNOWN`, `EVENTS_BEYOND_REPORTED_BOUNDARY = UNKNOWN` |
| F3 | a correct truth with a **missing source** earned full credit (`sourceMatches !== false`) | `sourceMatches === true` is now required |
| F4/F5 | evidence references were validated against one **module-global** allowlist, so another proposition's reference passed | references are validated against the proposition's **own** allowed refs from the trial snapshot |
| F6 | `creditCount >= 1` let **one trivial shared fact** pass the whole dimension | a frozen set of **critical propositions** must be credited, judged against the arm's actual available evidence |
| F7 | the oracle used a module-global allowlist, not the supplied snapshot's refs | `allowedRefsFor(snapshot, proposition)` |
| F8 | `judgeDecisionQuality` ignored the supplied snapshot and used a global `DECISION_CONTRACT` | the contract is read from the trial snapshot |
| F9 | the Ground Truth named static placeholders (`A0`/`A1`/`origin-partial`) | a `FrozenAssayTruth` is **instantiated** from the run's actual canonical Attempt ids, source basis and Git HEAD |
| F10 | `groundTruthDigest()` hashed a constant, so a stable digest proved nothing | SHA-256 over canonicalized JSON of the instantiated snapshot |
| F11 | the active E0 fixture still graded with the **legacy keyword oracle** | one official evaluation seam (`assay-evaluation.mjs`); the legacy oracle is marked `LEGACY_REPRODUCTION_ONLY` and imported lazily |
| F12 | the dry-run never ran the oracle over a fixture-produced answer | the dry-run is now a complete deterministic rehearsal |
| F13/F20 | no tested path extracted a structured answer from a real DSH output surface | a benchmark answer adapter emits the answer as assistant text; the harness extracts it from DSH persistence |
| F14 | the oracle required references the model never saw | internal `EvidenceRef` is separated from a model-visible `CitationHandle` that the harness verifies was delivered |
| F15 | an `executed:true` observation with no actions/commit/test reported operational PASS | five explicit operational states; only `WORK_ACCEPTED` passes |
| F16 | 18 broad failures vs 15 "historical" did not reconcile | exact TestId matrix: 18 = 15 pre-existing + 3 contention + 0 new + 0 unresolved |
| F17 | `finalHead = 96ffeb3` while the stage HEAD was `34544335` | `testedCodeHead` and `finalEvidenceHead` are separate fields |
| F18 | six dry-run checks passed with a literal `true` | every check now measures actual fixture/execution state |
| F19 | treatment relevance was not gated | the dry-run verifies the delivered section communicates partial coverage, counts and unread extent |

## 2. The corrected truth contract

`scripts/trajectory_p2e1/experimental-truth.mjs` keeps the §7.1 invariant (one owner's incomplete evidence must
not negate another owner's established fact) and adds:

- **Nine propositions, each asking exactly one question** (`ALL_REPORTED_DSH_EVENTS_RETURNED` is determinable
  FALSE; `OUTCOMES_OF_UNRETURNED_EVENTS` and `EVENTS_BEYOND_REPORTED_BOUNDARY` are genuinely UNKNOWN).
- **`instantiateAssayTruth(facts)`** — a `FrozenAssayTruth` built from the run's real identities.
- **`assayTruthDigest`** — SHA-256 over canonicalized JSON; a different run yields a different digest.
- **`allowedRefsFor`** — the internal `EvidenceRef` plus the model-visible `CitationHandle`, per proposition.
- **`criticalRequirementsForArm`** — which critical propositions an arm must credit and must not falsely assert.
- **`ASSAY_TRUTH_TEMPLATE`** and **`REFERENCE_ASSAY_TRUTH`** — the scenario template and its stable reference
  instantiation (used by pure-function tests and the static proof; never as a real trial's truth).

## 3. The corrected oracle

`scripts/trajectory_p2e1/source-aware-oracle.mjs`, version **`p2e1r-proposition-admission-1`**:

- a credited assertion needs the **right truth**, the **right named owner** and a **proposition-specific,
  trial-scoped reference**;
- **arm-aware uncertainty**: a proposition the arm's evidence could not establish may be honestly UNKNOWN
  (no penalty, no credit); asserting a definite value for it is unsupported certainty;
- **structural refusals**: unknown proposition ids and contradictory duplicate judgments fail validation;
- **explicit operational states**: `NOT_MEASURED`, `MEASURED_NO_REPETITION`, `MEASURED_REPETITION`,
  `WORK_ACCEPTED`, `WORK_NOT_ACCEPTED` — only `WORK_ACCEPTED` passes.

## 4. One official evaluation path

`scripts/trajectory_p2e1/assay-evaluation.mjs` exports `evaluateAssayResult({ frozenTruth, structuredAnswer,
observedActions, arm })`. It **refuses** when no per-run truth is supplied, so the evaluated agent can never
supply its own answer key. The legacy keyword oracle is `LEGACY_REPRODUCTION_ONLY`, retained only to reproduce
the P2-E0 records; the E0 fixture imports it lazily and no active module imports it.

## 5. Real answer collection

- `scripts/trajectory_p2e1r/benchmark-answer-adapter.mjs` — a test-owned deterministic local `LlmAdapter` that
  emits the benchmark answer as the **final visible assistant message** of a real first-party DSH turn. It does
  **not** widen the strict `palimpsest_worker_result` tool.
- `scripts/trajectory_p2e1r/answer-extraction.mjs` — reads ONE session by **exact SessionId** through DSH's own
  `JsonlSessionPersistence`, selects the LAST `assistant/message`, and parses its text as the answer.
- `scripts/trajectory_p2e1r/assay-harness.mjs` — drives the whole chain end to end and reports GO/NO-GO.

## 6. Calibration launch gate

`scripts/trajectory_p2e1/calibrate.mjs --dry-run` is now a **complete deterministic rehearsal** of the future
trial's chain: fixture → per-run truth → CONTROL/TREATMENT inputs → controlled answer → extraction → official
oracle → positive/negative controls → cleanup → GO/NO-GO. It passes **GO** with 27 checks, every one measuring
actual state, and it rejects every incorrect vector.

## 7. Regression reconciliation

`scripts/trajectory_p2e1r/regression-reconcile.mjs` produces an exact TestId matrix and verifies
`totalFailed = preExisting + environmental + newlyIntroduced + unresolved`. Result: **18 = 15 + 3 + 0 + 0**,
`unresolved = 0`, `newRegressions = 0`. The 15 stable failures are the pre-existing `r3l0c`-family failures
(proved at the exact baseline by P2-E1); the 3 environmental failures (`r3l0ci_gates` 17/17,
`p2b_canonical_correlation` 4/4, `p2b_first_party_gate` 5/5) all pass in isolation and are shared-DSH-root
contention under bounded parallel workers.

## 8. Verdicts

| Target | Status |
|---|---|
| E1R-A | `ASSAY_TRUTH_AND_EVIDENCE_QUALIFIED` |
| E1R-B | `ASSAY_EXECUTION_PATH_QUALIFIED` |
| E1R-C | `BASELINE_CALIBRATION_LAUNCH_ADMITTED` |

**Not awarded:** `TRAJECTORY_FIRST_PARTY_ORIGIN_SETTLEMENT_QUALIFIED` (the origin is not driven through the
existing settlement mechanism), and — requiring future stochastic model evidence — `BENCHMARK_QUALIFIED`,
`UTILITY_POSITIVE_SIGNAL`, `UTILITY_NEGATIVE_SIGNAL`, `MODEL_CONSUMED_CAPSULE`, `WORK_UTILITY_IMPROVED`,
`AGENT_COOPERATION_IMPROVED`.

## 9. What this stage does NOT establish

- No stochastic calibration was run; no Agent utility was measured.
- No paid or external model request was made; `modelCallsMade = 0`.
- The controlled answer is a canned deterministic response, **not** evidence of model reasoning.
- `TRAJECTORY_FIRST_PARTY_ORIGIN_SETTLEMENT_QUALIFIED` remains **NOT_ESTABLISHED**.
- Runtime caveat retained: Node 24.14.1 is below the declared minimum `>=24.15.0`.

## 10. Evidence

`research-evidence/trajectory-p2e1r/` — 21 artifacts, including `git-baseline.json`, `baseline-falsifiers.json`,
`p2e1-forward-erratum.json`, `truth-semantics.json`, `per-run-owner-snapshot.json`, `source-basis-digest.json`,
`proposition-evidence-admission.json`, `oracle-negative-controls.json`, `critical-proposition-coverage.json`,
`evidence-availability.json`, `agent-answer-contract.json`, `dsh-answer-extraction.json`,
`legacy-oracle-isolation.json`, `assay-end-to-end.json`, `calibration-launch-gate.json`,
`treatment-relevance.json`, `regression-reconciliation.json`, `regression.json`, `final-verdicts.json`.
