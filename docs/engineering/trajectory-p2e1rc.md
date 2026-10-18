# Trajectory-P2-E1RC — Measurement Integrity & Evidence Closure

**Stage:** `Trajectory-P2-E1RC`
**Baseline:** `f78e7672441b1a970ed21f66435feb595c9401a3` (branch `trajectory-p2e1r-assay-validity`)
**Branch:** `trajectory-p2e1rc-measurement-integrity`
**Code Freeze:** `50ae7fe1f482b9f28d09b649d60dd62e9ff63b9e` (tree `7f453038e4452da9414a3ae12eecc1e95f995e95`)

---

## 1. Initial and final Git state

FB-0 verified the exact parent `f78e767`, a clean worktree and index including untracked files, local == remote
for the E1R branch, an absent E1RC branch, and **52/52 protected research-evidence trees byte-identical**.

Environment: Windows 10.0.26200 (MINGW64), Node `24.14.1`, pnpm `11.21.0`, Git `2.53.0.windows.2`, built `dist`
present, first-party DSH present at `~/.dsh`. **`package.json` requires Node `>=24.15.0` and no conforming
runtime was available.** No global runtime was modified; the mismatch is reported as a non-conformance.

## 2. The E1R defects (C1)

Ten defects were reproduced against the exact E1R parent source: **5 dynamically** (the parent modules were read
from Git and executed) and **5 by source demonstration** of script control flow. **None was detected by E1R's
own tests.**

| ID | Defect | Evidence |
|---|---|---|
| C1-F1 | The controlled origin session id was the literal `origin-partial`, so every trial produced the SAME internal EvidenceRef and CitationHandle. Trial B accepted Trial A's DSH citation. | dynamic |
| C1-F2 | CONTROL was credited for `ORIGIN_DSH_PAGE_FULL` — an objectively true DSH fact it never received — because availability gated only the critical set. | dynamic |
| C1-F3 | `instantiateAssayTruth` accepted contradictory facts (known=8, returned=8, coverage=PARTIAL) and produced a self-contradictory truth: `PARTIAL=TRUE` **and** `ALL_REPORTED_DSH_EVENTS_RETURNED=TRUE`. Missing identities and negative counts were also accepted. | dynamic |
| C1-F4 | `generate-evidence.mjs` wrote `realFirstPartyDshHostRan: true`, `answerEmittedByRealDshTurn: true`, `realDshAssistantMessageInspected: true` unconditionally. `calibrate --dry-run` passes a locally constructed answer and never reads DSH persistence. | source |
| C1-F5 | The harness set GO from the oracle verdict alone; arm, section digest, source basis, citation availability, leak, cleanup and dependency-root results were recorded but never gated. | source |
| C1-F6 | `hasFirstPartyDsh() === false` wrote `NOT_ESTABLISHED` and then `process.exit(0)`. | source |
| C1-F7 | `findSessionFile` used `path.includes(sessionId)` — a substring test. Two near-colliding ids returned null; a longer id containing the searched id matched. | dynamic |
| C1-F8 | The reconciler classified every HEAD failure `PRE_EXISTING_SAME_FAILURE` by construction, initialised `newlyIntroduced = 0` and `unresolved = 0`, hard-coded the contention list, and "proved" uniqueness with `preExisting === matrix.length`. | source |
| C1-F9 | Three evidence files recorded **two different** `testedCodeHead` values (`046c4a4` and `34544335`) while the actual last code-touching commit was `8779e48`. | dynamic |
| C1-F10 | The deterministic adapter receives its answer from `config.answerPath`; it never reads the Capsule. | source |

### 2.1 A defect E1R did not know it had

While closing C1-F7 the exact-session reader was found to be **unconditionally broken**: the installed
`dsh-session-persistence-jsonl` exports the plugin as a **named `apply`**, not a `default`. E1R passed
`.default` (`undefined`) to `ctx.plugin`, which threw on **every** read. E1R's extraction path therefore never
worked, which is consistent with its fabricated `answerEmittedByRealDshTurn: true`.

## 3. Source changes

| File | Change | Why |
|---|---|---|
| `scripts/trajectory_p2e1/experimental-truth.mjs` | `validateAssayTruthFacts()` — a Truth Admission Guard; `instantiateAssayTruth()` refuses malformed facts | C1-F3: corrupted input must not become credible truth; UNKNOWN is reserved for facts the source cannot establish |
| `scripts/trajectory_p2e0/benchmark-fixture.mjs` | controlled origin session id derived from the actual Origin Attempt + per-run nonce | C1-F1: the citation handle must be genuinely trial-scoped, not a global literal |
| `scripts/trajectory_p2e1/source-aware-oracle.mjs` | arm-wide availability; `unsupportedCertainty`; internal-only reference rejection; version → `p2e1rc-arm-wide-admission-1` | C1-F2: correct guessing is not evidence-grounded reasoning |
| `scripts/trajectory_p2e1r/answer-extraction.mjs` | exact path-segment session match; named-`apply` persistence plugin | C1-F7 + the broken reader |
| `scripts/trajectory_p2e1r/assay-harness.mjs` | execution attributes derived from observations; integrity-gated GO; exit 2 on a missing dependency; leak checked before the verdict | C1-F4/F5/F6 |
| `scripts/trajectory_p2e1r/benchmark-answer-adapter.mjs` | answer read from a file path (not inline YAML JSON) | the inline flow mapping broke the patch parse |
| `scripts/trajectory_p2e1rc/closure-gate.mjs` | **new** — one derived verdict from child receipts | C1-F4/F5/F6 |
| `scripts/trajectory_p2e1rc/regression-reconcile.mjs` | **new** — computed classification from actual reports | C1-F8 |
| `scripts/trajectory_p2e1rc/measurement-falsifiers.mjs` | **new** — the C1 reproductions | C1 |
| `test/trajectory_p2e1rc_negative_controls.test.ts` | **new** — 17 dynamic negative controls | C6 |

The oracle version was bumped rather than reusing `p2e1r-proposition-admission-1`, so no historical E1/E1R score
is relabelled under the new semantics.

## 4. Authority boundaries preserved

No production `src/trajectory/` semantics, Work Settlement contract, canonical Work event model, public API,
or DSH Host behaviour was modified. No new Trajectory service, Event Store, citation-governance service, causal
graph runtime, second Oracle, or orchestration layer was introduced. `palimpsest_worker_result` was **not**
widened — the benchmark answer remains assistant text, never a Work Result. No external or paid model request
was made; `modelCallsMade = 0`.

## 5. Dynamic versus source-demonstrated

- **DYNAMICALLY_VERIFIED (17 tests):** truth admission refusal; cross-trial DSH and canonical citation
  rejection; missing/wrong source; cross-proposition reference; CONTROL honest UNKNOWN; CONTROL hidden-fact
  guess; TREATMENT critical evasion; internal-only citation; session id exactness; malformed/missing answer;
  wrong-trial scoring; missing per-run truth; nonzero-exit-with-success-payload; Git identity.
- **SOURCE_DEMONSTRATED:** C1-F4, C1-F5, C1-F6, C1-F8, C1-F10 — script control flow read from the exact parent.
- **NOT_ESTABLISHED:** any claim that a first-party DSH turn completed.

## 6. Real DSH versus controlled historical source

The controlled origin page is served by a **controlled reader** (`DSH_QUERY_PORT_FIXTURE`) and is classified
`CONTROLLED_DSH_PAGE` in the frozen truth. It is never relabelled as first-party persisted origin evidence. The
consumer turn would be a real first-party DSH session — but see §7.

## 7. Acceptance results

| Gate | Result |
|---|---|
| `npx tsc -b` | **PASS** |
| `module-architecture.mjs --check` | **PASS** — 0 violations, 9 accepted exceptions |
| `--check-public-api` | **PASS** — 0 missing, 0 changed, 0 added |
| Focused suites | **113/113 passed** across 28 files |
| E1RC negative controls | **17/17 passed** |
| Closure gate | **CLOSURE_NOT_ESTABLISHED** — 38 of 50 gates pass, 12 fail |
| Regression reconciliation | **SCOPED_RECONCILED** — 17 pre-existing, 0 new, 0 unresolved |
| Protected research evidence | **52/52 byte-identical** |
| Runtime conformance | **NOT CONFORMING** — Node 24.14.1 < required 24.15.0 |

**Test exclusion:** `test/r3l0ciarlcf_gates.test.ts` remains excluded as a known unsafe isolated-mutation test
against the shared Windows workspace. Its result is not counted as green.

### 7.1 Why the closure gate refuses

The first-party worker turn cannot complete. The measured result is:

```text
PALIMPSEST_WORK_RESULT {"kind":"HOST_FAILURE","detail":"refusing to run this worker:
UNCLASSIFIED worker-visible capability(ies): working_directory — an unknown capability is not
assumed safe, so the worker must not start"}
```

The read-boundary contract reports `resolvedVersion: 0.2.1-rc.2`, `qualifiedVersion: 0.2.0-rc.2`,
`drifted: true`. The installed release adds a `working_directory` capability supplied by
`@deepseek-ai/dsh-working-directory@0.2.1-rc.2` (a dependency of `dsh-agent-instructions`), which is absent from
`host/deployment/runtime/capability_classes.js`.

**This is the capability gate working correctly** — an unknown capability is refused rather than assumed safe.
It is an environment drift, not an assay defect, and classifying a new capability would change production
security semantics, which this stage forbids without a separate stop-and-report.

The 12 failing gates are exactly the answer-extraction chain: `assay-{control,treatment}-{exit-zero,
outcome-go, answer-extracted, answer-matches-emitted, oracle-ok, operational-not-measured}`. All 38 other gates
pass, including both arms' assignment, presentation mode, section bytes and digest, real DSH session identity,
exact session file, per-run frozen truth and digest, no-leak, cleanup, dependency preservation, official-oracle
use, treatment relevance, and independent instantiation.

## 8. Residual limitations

**Verified facts.** Truth admission now refuses malformed input; citations are trial-scoped and
proposition-specific; arm-wide availability denies credit for guessed hidden facts; the closure verdict is
fail-closed and nonzero on failure; the reconciler computes from real reports; both arms' context delivery and
session creation work end to end up to the worker start.

**Hypotheses, not verified.** Whether `working_directory` is a filesystem disclosure route is unknown and is a
product-level decision. Whether the assay would produce GO under a conforming DSH release is untested.

**Not established.** No first-party DSH turn completed, so no persisted answer was extracted, no Oracle verdict
was produced from real execution, and no execution-derived evidence chain exists.

## 9. Next-stage entry conditions

**Trajectory-P2 baseline-only stochastic CONTROL calibration is NOT authorized.** E1RC-B and E1RC-C are
`NOT_ESTABLISHED`.

The minimum remaining technical blockers, in order:

1. **Resolve the capability drift.** Either decide at product level whether `working_directory` is a filesystem
   disclosure route and classify it in `capability_classes.js`, or qualify the assay against the exact
   `0.2.0-rc.2` first-party DSH release. No assay code change is required for that decision.
2. **Use a conforming runtime.** Node `>=24.15.0` is required; `24.14.1` was used throughout.
3. Re-run `closure-gate.mjs`; it must report `CLOSURE_ESTABLISHED` with exit 0 before E1RC-B can be awarded.

Once those pass, the future stochastic stage still requires separate authorization of: provider, exact model
version, repetition count, cost budget, runtime limit, frozen fixture, tool set, initial Git state, Work
authority, Oracle version (`p2e1rc-arm-wide-admission-1`), and failure/stop rules. **E1RC did not execute that
calibration.**

## 10. Evidence

`research-evidence/trajectory-p2e1rc/`:

- `measurement-falsifiers.json` — C1-F1…F10 with classifications
- `execution-blocker.json` — the measured capability refusal and why it was not worked around
- `regression-reconciliation.json`, `baseline-test-report.json`, `head-test-report.json` — the reconciliation and its raw inputs
- `closure-gate.json` — 50 gates, 12 failures, all receipts
- `identity-manifest.json`, `final-verdicts.json` — the explicit identities and the three verdicts
