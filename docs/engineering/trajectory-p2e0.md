# Trajectory-P2-E0 — Treatment Integrity & Utility Benchmark Qualification

**Stage:** `Trajectory-P2-E0`
**Baseline:** `8ba9ca3df4399eabc686fd23c24c7c0b2ba61290` (branch `trajectory-p2d2-model-visible-delivery`)
**Branch:** `trajectory-p2e0-treatment-and-benchmark-readiness`
**Status:** complete; no stochastic trial, no model request, no PRIMARY, no automatic Handoff.

## What this stage is for

P2-D2 proved three things INDEPENDENTLY: a qualified Capsule can be built, a model-visible Section can be
rendered, and a real DSH `user/message` can carry an operator-authored section. It did not prove that a
PRODUCT-MATERIALIZED Capsule, resolved from a GENUINE governed origin, reaches that boundary; and its utility
"fixtures" were specifications, not runnable artifacts. P2-E0 closes those gaps and repairs the test-runtime
hazard the previous stage's incident exposed.

## Results at a glance

| Gate | Verdict |
|---|---|
| E0-A | `TEST_RUNTIME_SAFETY_QUALIFIED` |
| E0-B | `TREATMENT_ASSIGNMENT_QUALIFIED` |
| E0-C (controlled) | `TRAJECTORY_CONTROLLED_SOURCE_TO_INPUT_QUALIFIED` (E0-L1) |
| E0-C (first-party origin) | NOT ESTABLISHED (E0-L2) |
| E0-D | `BENCHMARK_FIXTURE_EXECUTABLE` |
| E0-E | `TRAJECTORY_UTILITY_BENCHMARK_CANDIDATE_READY` |

## E0-A — the test runtime is safe and repeatable

The P2-D2 incident: a recursive cleanup followed a `node_modules` junction and damaged the main worktree's
dependencies. The audit found the mechanism precisely. On this platform a recursive delete does **not**
traverse a junction — **except when the path carries a trailing separator**. `rm -rf <dir>/<link>/` followed
the link and destroyed the external sentinel; every other form (`rmSync`, `rm -rf <dir>`, `Remove-Item`) was
safe. That is why the lifecycle removes descendant links **by name** before any recursive removal.

`scripts/trajectory_p2e0/owned-root.mjs` implements the lifecycle: allocate with a canonical-path containment
proof and a written ownership marker, inspect descendants with `lstat` without ever descending a link, remove
links by name, then remove the root — and PRESERVE the root on any doubt. `withOwnedRoot` wraps
allocate → compose → execute → read → dispose → clean → report with the cleanup in `finally`.

`scripts/trajectory_p2e0/dsh-test-home.mjs` replaces the 518 MB dereferenced copy per profile with per-entry
junctions: measured **289 KB** for the same 125 modules — a 1791× reduction — with a controlled full-copy
fallback and a disk preflight that uses the MEASURED copy cost.

Evidence: `test-runtime-safety.json`, `junction-sentinel.json`, `cleanup-repeatability.json`,
`disk-and-resource-budget.json`, `test-home-construction.json`. Tests: 12 in
`test/trajectory_p2e0_test_runtime_safety.test.ts`.

## E0-B — assignment survives eligibility and delivery failures

P2-D2's delivery provider returned bare `null` for EVERY refusal, so a TREATMENT whose origin was unavailable
was indistinguishable from OFF, and the worker payload still shipped the raw historical Capsule body to a
CONTROL arm. E0 makes the three dimensions independent: **assigned arm** (trusted configuration), **source
eligibility** (derived from the refusal state, judged identically for both arms before delivery) and **delivery
outcome** (what actually happened). `null` is now returned ONLY for OFF; CONTROL renders its fixed no-history
boundary without needing a materialized Capsule; and `workerContextWithoutCapsuleBody` strips the raw body
from the CHILD payload.

Evidence: `trial-assignment.json`, `eligibility-and-delivery.json`, `control-payload-isolation.json`,
`treatment-failure-propagation.json`. Tests: 9 in `test/trajectory_p2e0_trial_integrity.test.ts`.

## E0-C — the controlled source-to-input chain, in one run

`scripts/trajectory_p2e0/source-to-dsh-gate.mjs` establishes, in ONE attributable run:

```
real canonical A0 → real governed Rework → real canonical A1
  → Context Owner authorization → real Association Qualification
  → capsuleForConsumer(A1) → qualified Capsule (18 real events)
  → product Presentation → trusted TREATMENT assignment
  → first-party DSH Worker Host → actual DSH user/message → digest reconciliation
```

The consumer A1 is a real canonical attempt from the real governed rework admission. The ORIGIN session is a
real first-party DSH session: the origin turn ran through the real subprocess port, its SessionId was captured
from the host's OWN child-IPC identity report, and the product's DSH reader read 18 real events from it. The
Capsule and Section are real product artifacts, and the persisted `user/message` section hashes to the
product-rendered section digest.

**E0-L2 is NOT established.** The origin's Work Result is not genuinely admitted, because the deterministic
adapter performs no Git work. §9.5 forbids fabricating a settlement to merge the rigs, so the origin execution
association is reported as a CONTROLLED FIXTURE.

Evidence: `source-to-dsh-input.json`, `governed-origin-chain.json`, `real-first-party-origin-feasibility.json`,
`deterministic-provider-activity.json`. Tests: 5 in `test/trajectory_p2e0_source_to_dsh.test.ts`.

### Two real defects the real run found

1. **A TDZ bug the controlled L1 harness could not see.** The runner declared `const presentation` in a scope
   that already had `let presentation` for the R2-U arm, which threw "Cannot access 'presentation' before
   initialization" only under a real DSH boot.
2. **A measured DSH 0.2.0-rc.2 loader behaviour.** Adding an OPTIONAL adapter method named
   `providerRetryPolicy` caused the cordis plugin to FAIL ACTIVATION ("1 entry did not activate"), so the agent
   never reached a model turn. A controlled A/B on the shipped P2-D2 gate confirmed it: with the method
   present the gate returns NOT_ESTABLISHED; absent, it PASSes.

## E0-D — an executable benchmark candidate

`scripts/trajectory_p2e0/benchmark-fixture.mjs` builds FIX-A-GOVERNED-PARTIAL-CONTINUATION: a real governed
A0→A1 chain whose origin page is GENUINELY PARTIAL (the source reports 8 known events while only 3 are
admitted), the real product Capsule, and real CONTROL and TREATMENT inputs. CONTROL and TREATMENT share the
same frozen initial git state, task, tools, write scope, budget, completion checks and oracle; the ONLY
difference is whether the qualified Section is delivered.

`scripts/trajectory_p2e0/mechanical-oracle.mjs` is a pure function over a frozen ground-truth key. It reports
three independent dimensions and flags a GENERIC REFUSAL as a failing decision rather than correct
uncertainty. On the real fixture: the positive vector passes all three; the negative vector fails history and
decision with both forbidden claims flagged; the vacuous refusal is flagged and fails decision.

**Deliverability through the real consumer API:** Family A is `DELIVERABLE`; Family B
(Multi-Invocation Reconstruction) is `ORIGIN_NOT_SELECTED` — the ambiguity is reproduced and deliberately NOT
relaxed, because the strict selection rule is a safety property. Family B is reported NOT_DELIVERABLE as a
multi-invocation benchmark, with the trusted-preselection option recorded for a future stage.

**Information sufficiency:** Target A (coverage / unread extent / observed-vs-unobserved) is SUPPORTED and
survives the renderer. Target B (a specific command failure cause) is NOT supported — the sanitizer excludes
raw tool results and the `tool/result` error status — and the sanitizer was NOT broadened to manufacture an
effect.

Evidence: `utility-candidate-fixtures.json`, `mechanical-oracle.json`, `benchmark-deliverability.json`,
`information-sufficiency.json`. Tests: 10 in `test/trajectory_p2e0_benchmark_fixture.test.ts`.

## E0-E — calibration prepared, not run

`research-evidence/trajectory-p2e0/baseline-calibration-protocol.json` specifies the incremental estimand,
carries the R2-VR qualification law forward as a requirement, declares every future parameter without a
hard-coded credential, keeps delivery attrition in the assigned-arm denominator, and requires explicit
provider/model/budget/trial-count authorization before any model trial. No stochastic trial ran. Tests: 7 in
`test/trajectory_p2e0_calibration_protocol.test.ts`.

## Honest limitations

- **E0-L2 is NOT established.** The origin Result is not genuinely admitted.
- **No utility was measured.** The deterministic adapter cannot produce the run-to-run variation an assay
  requires, and no external or paid model was called.
- **`BENCHMARK_QUALIFIED` was NOT granted.** The R2-VR law requires stochastic baseline repetitions.
- **Node is v24.14.1**, below the repository's declared `>=24.15.0`; no alternative runtime was installed
  (the ruling forbids modifying global user runtime configuration without authorization).
- **The global test-hygiene sweep still has no reparse-point check**; its `palimpsest-` prefix rule bounds the
  risk, and changing global hygiene is broader than this stage's scope.
