# Trajectory-P2-E1 — Assay Integrity Closeout & Baseline Calibration Entry

**Stage:** `Trajectory-P2-E1`
**Baseline:** `beec3cc488dfbd97dd929bea73a19c99703a9dbe` (branch `trajectory-p2e0-treatment-and-benchmark-readiness`)
**Branch:** `trajectory-p2e1-assay-integrity`
**Status:** complete; no stochastic trial, no model request, no paid call, no PRIMARY, no automatic Handoff.

## What this stage is for

P2-E0 built the machinery and then measured nothing with it: its benchmark answer key encoded a cross-owner
error, its "mechanical oracle" graded load-bearing judgments by keyword co-occurrence, and its combined gate
hand-built the consumer context it claimed to qualify. A benchmark that can run is not a benchmark that is
qualified, and a misclassifying Oracle is worse than none — it produces confident wrong numbers. P2-E1 makes
the evaluation system as trustworthy as the historical evidence it evaluates.

## Results at a glance

| Target | Verdict |
|---|---|
| E1-A | `TRAJECTORY_ASSAY_SEMANTICS_QUALIFIED` |
| E1-B | `TRAJECTORY_NORMAL_CONSUMER_DELIVERY_QUALIFIED` (controlled origin) |
| E1-C | `TRAJECTORY_BASELINE_CALIBRATION_READY` |
| First-party origin settlement | NOT ESTABLISHED (not awarded) |

## E1-A — source-correct experimental semantics

### The cross-owner error, corrected

The E0 answer key forbade the claim "A0 completed" on the grounds that the origin's DSH page is PARTIAL. But
the fixture drives A0 to a real `ATTEMPT_COMPLETED` through the governed chain, so **canonical Work positively
establishes completion** while the DSH Session independently reports partial coverage. The key encoded exactly
the inference §2 forbids: letting one owner's incomplete evidence negate another owner's fact.

`scripts/trajectory_p2e1/experimental-truth.mjs` replaces the key with **propositions**, each carrying an
explicit truth value, an **authoritative source**, and an evidence reference. The two critical entries now
coexist:

| Proposition | Truth | Owner |
|---|---|---|
| `ORIGIN_CANONICAL_COMPLETED` | TRUE | CANONICAL_WORK |
| `ORIGIN_DSH_PAGE_PARTIAL` | TRUE | DSH_SESSION |
| `ORIGIN_ALL_DSH_EVENTS_OBSERVED` | UNKNOWN | DSH_SESSION |
| `ORIGIN_CURRENT_VERIFICATION_ESTABLISHED` | UNKNOWN | VERIFICATION |
| `CONSUMER_CAN_SETTLE` | FALSE | CURRENT_WORK |

`UNKNOWN` is distinct from `FALSE`: unobserved events are unknown, and a missing Verification owner yields
UNKNOWN rather than a fabricated FALSE. A frozen digest makes the snapshot detectable if edited.

### The keyword Oracle, replaced

`scripts/trajectory_p2e1/source-aware-oracle.mjs` grades a **structured** answer. Load-bearing claims are
finite propositions with a truth value, a source and an evidence reference — no second model is introduced,
and no free-text co-occurrence decides a load-bearing outcome. Three things are scored separately per claim:
the truth value, the **authority** (a correct truth with the wrong owner is not full credit), and the
**evidence reference** (validated against a frozen allowlist, so a fabricated reference is not support).

This removes the E0 false positives and negatives, all measured against the baseline:

- `"the whole history was not observed"` is no longer scored as claiming the whole history was observed;
- `"do not settle"` is no longer scored as an attempt to settle;
- `"A0 completed according to Work, but its page is PARTIAL"` no longer invents a contradiction;
- a fabricated evidence reference is rejected;
- **operational behavior is `NOT_MEASURED` when no execution occurred** — the E0 dimension passed on the
  proposed-action *string*, which is a statement about intent, not behavior.

Negation is handled structurally (finite action classes, explicit truth values), and a **justified deferral**
is distinguished from a **vacuous refusal**: a deferral that names at least one proposition UNKNOWN with its
source passes; an answer that commits to nothing and proposes nothing does not.

## E1-B — normal governed Consumer delivery

The E0 gate hand-built the consumer's `compiled` object — including `trajectoryCapsule` — and called
`recordIdentity()` itself. `scripts/trajectory_p2e1/normal-consumer-gate.mjs` does neither. The consumer
context comes from the product's own Context Owner:

```
Canonical A1 -> controller.workWorkerAttemptContext(A1)   (the REAL Context Owner)
             -> capsuleForConsumer(A1)                     (REAL admission, AUTHORIZED)
             -> buildTrajectoryPresentation(TREATMENT)     (REAL product renderer)
             -> workWorkerEnvironmentPayload(context)      (the PRODUCT's serializer)
             -> dshSubprocessWorkWorkerPort                (the existing worker port)
             -> real first-party DSH Host                  -> persisted user/message
```

Measured: admission `AUTHORIZED`, arm `TREATMENT`, eligibility `QUALIFIED`, delivery `SECTION_RENDERED`; the
child payload carries the trial record and **withholds the raw Capsule body**; the persisted `user/message`
contains the section and its digest reconciles with the product-rendered one.

The ORIGIN execution is a **real first-party DSH turn** (so its Session is genuine and the deployment's own
reader admits it) whose Result is **not** settled through Work. The evidence level is therefore
`CONTROLLED_ORIGIN_NORMAL_CONSUMER_DELIVERY` — the consumer half is the normal path; the origin is not a
settled first-party Work Result, and the gate says so.

### The Worker Result protocol, measured

P2-E0 recorded that the first-party origin turn failed because of an "optional `providerRetryPolicy`". That
explanation was **wrong**, and this stage measured four real defects by running the worker and reading the
persisted session:

1. `providerRetryPolicy` is **required** — `LlmRuntime.prepareRoutes()` calls it unconditionally, so omitting
   it throws a `TypeError` and the cordis entry fails to activate;
2. the adapter's method signatures and return shapes did not match `normalizeModelInfo`/`prepareCall`;
3. the worker scope presents **PTC**, so only `run_code` is directly callable — a direct tool call is refused
   with `unknown tool ...: only run_code is callable directly` (read from the session's own `tool/result`);
4. the adapter emitted the tool call on **every** stream, so the turn never concluded.

With all four corrected the real origin turn reports `READY_FOR_SETTLEMENT`. The strict parent parser is **not
widened**; instead it no longer reads the HOST's own `HOST_FAILURE` diagnostic as a worker outcome.

## E1-C — baseline calibration entry

`scripts/trajectory_p2e1/calibrate.mjs --dry-run` verifies the fixture, Ground Truth, Oracle version, real Git
basis, CONTROL input, TREATMENT eligibility, digests, isolation and budgets, and reports **GO**. It builds no
provider client, reads no credential, starts no trial. The benchmark fixture now reads the **real commit** of
its own test-owned repository instead of a synthetic `"c".repeat(40)` id.

The R2-VR qualification law is carried forward as five **requirements**, none marked completed. A future
authorized stage supplies the eleven parameters (provider, model/version, repetitions, cost budget, runtime
limit, fixture, tool set, Git state, Work authority, Oracle, stop rules) and runs **CONTROL only** first.

## Resource safety and trial state

Five residual E0 gaps are closed against the same owned-root lifecycle: an incomplete descendant scan now
**blocks** deletion; the `refuseOnLinkFailure` escape hatch is **removed**; a failed junction batch performs a
real preflighted, verified **copy** (or returns BLOCKED); `installed.dispose()` is **awaited** before filesystem
cleanup; and `prepareFixture()` releases its root on **any** preparation failure. The global temp sweep now
lists with `lstatSync` and refuses reparse points. Separately, the delivery-exception path reads the **trusted**
arm instead of hard-coding `TREATMENT`, and `ORIGIN_NOT_SELECTED` now carries a structured refusal reason, so
an ambiguous or unbound origin is `NOT_QUALIFIED` rather than a manufactured `RACED`.

## What this stage does NOT establish

No utility was measured. `BENCHMARK_QUALIFIED`, `UTILITY_POSITIVE_SIGNAL`, `UTILITY_NEGATIVE_SIGNAL`,
`MODEL_CONSUMED_CAPSULE` and `AGENT_COOPERATION_IMPROVED` are **not** grantable here. A genuinely admitted
first-party Origin Work Result — an origin driven through the existing Work settlement with a real permitted
Git change — remains **NOT ESTABLISHED**, so `TRAJECTORY_FIRST_PARTY_ORIGIN_SETTLEMENT_QUALIFIED` is not
awarded. Node `24.14.1` is below the repository's declared minimum `>=24.15.0`; the caveat is retained.
