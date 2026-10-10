# R3-L0C-G1 — Host-Origin Execution Evidence Foundation

**Stage:** R3-L0C-G1
**Baseline:** `fe18441de2ac40921ac4dcabe112a7670363b24a` (branch `r3-l0c-g0-execution-readiness`)
**Branch:** `r3-l0c-g1-host-origin-evidence`

This memorandum is the human-readable companion to the machine-readable records in
`research-evidence/r3-l0c-g1/`.

---

## 1. What this stage built

One architectural prerequisite, and nothing else: **the existing Work and Deployment Host can now produce a
non-model, host-origin process observation, bind it to the correct Work Attempt and host-local job, and preserve
it durably so a later consumer can distinguish an authentic local observation from a caller declaration.**

No experimental model call was made. No worker was launched. No PRIMARY path was enabled. The scientific design
is untouched.

---

## 2. Producer architecture

| Fact | Producer | Canonical? | Durable? |
|---|---|---|---|
| Work AttemptId | Work owner (`prepareMutatingWork`) | **yes** | yes |
| Host-local JobId | Work Delegation host service (`wdj-<uuid>`) | no | **no** |
| Execution world path | Work owner via the Git world port (`.palimpsest/worlds/<attemptId>`) | **yes** | yes |
| Direct-child pid | Deployment port (`spawn`) | no | no |
| Worker outcome | Worker process, re-read by the host | no | yes (testimony) |
| Attempt terminal state | Work owner (`settleMutatingWork`) | **yes** | yes |
| Research RunId | Run journal `RUN_STARTED` + the run-root claim | no | yes |

**G1 owns none of these.** It adds no canonical owner, no evidence store and no scheduler.

---

## 3. The observation seam

The vocabulary lives in `src/interaction/work_delegation.ts` — the module that already owns the
`WorkWorkerRunPort` contract. That placement is what keeps the dependency direction legal: L3 cannot import L5,
and the L5 deployment port imports L3 (a direction `src/deployment/launch.ts` already uses).

The port gains an optional `observe` sink; the delegation service gains an optional
`onCorrelatedObservation` sink and builds the AttemptId correlation from `prepared.attemptId`, which no caller
can forge. The model never sees an attempt id.

Event kinds: `DIRECT_CHILD_SPAWN_ATTEMPTED`, `DIRECT_CHILD_SPAWN_OBSERVED`, `DIRECT_CHILD_SPAWN_ERROR`,
`DIRECT_CHILD_EXIT_OBSERVED`, `DIRECT_CHILD_EXIT_UNCONFIRMED`, `DIRECT_CHILD_TIMEOUT_REQUESTED`,
`DIRECT_CHILD_ABORT_REQUESTED`.

**A direct child is never promoted.** `processRole` stays `DIRECT_CHILD`, and every observation carries both a
`proves` list and a `doesNotProve` list naming the wrapper, the provider route, the remote request, the
descendant exit and the canonical completion it cannot attest.

An observer that throws cannot change the outcome. The worker payload is byte-identical with observation
enabled and disabled. The executable identity is sanitized to digests plus the worker bin's basename.

---

## 4. Non-model runtime proof

Driven through the **real** stack — `installPalimpsest` → the real controller → the real
`makeWorkDelegationService` → the real `dshSubprocessWorkWorkerPort` — with a local, non-model Node child that
commits inside the execution world it was handed:

- observed a **real OS pid** with role `DIRECT_CHILD`;
- observed a **real close event** with exit code 0;
- the observation set is correlated to **exactly the AttemptId the product minted** (`attempt-<32hex>`);
- the record is written, **re-read and content-verified**;
- two runs share no pid, AttemptId or job.

`modelCallsMade: 0`. The stub never invokes `@deepseek-ai/dsh`, a provider route or any remote service.

---

## 5. Evidence provenance

A caller-built JSON object is a **declaration**, whatever its schema says. Only the G1 recorder stamps the
origin marker, and a record without it can only ever reach `DECLARATION_ONLY`. The durable writer refuses a
duplicate and re-reads the bytes it wrote.

**Disclosed limitation:** the record is trusted only to the extent the local host process that produced it is
trusted. G1 adds **no cryptographic signature**, because a key generated and trusted by the same test would
prove nothing.

---

## 6. Artifact locator

Verified read-only against a **palimpsest-controlled** DSH home (not a personal history), the real layout is:

```
<dshHome>/sessions/--<cwd-slug>--/worker-<uuid>/session.v4.jsonl.zstd
```

The worker's cwd is `.palimpsest/worlds/<attemptId>`, so the canonical AttemptId is embedded **inside the slug**
and terminated by the slug's closing delimiter — which is exactly why the existing segment-anchored parser
returns `null` while the substring parser returns the hex.

The G1 locator resolves the real path to `a07384dd03aa9f5c4597b61e8f929771` and **refuses** prefix collisions,
wrong hex lengths, wrong worker directories, ambiguity, absence, symlink/traversal escapes, and recency
selection. It does not touch the frozen cost bridge or the existing R3 parser.

**`ARTIFACT_LOCATOR_GRAMMAR = PASS_SOURCE_GROUNDED`; `REAL_DSH_ARTIFACT_COMPATIBILITY = NOT_ESTABLISHED`** —
synthetic and source-grounded tests prove the grammar, not real compatibility.

---

## 7. Product compatibility

Unchanged: Work Attempt preparation, the worker outcome vocabulary, host failure classification, settlement
authority, promotion, model-visible context, context-pull authorization, replay/retry policy and fail-stop
behaviour. Architecture PASS (0 violations), public API PASS (0 added — the seam is internal), immutability PASS
(21 protected namespaces, 0 changed, 0 removed). All 80 work/delegation/context-pull tests pass unchanged.

---

## 8. Regression

`tsc` clean; G1 tests **55/55**; architecture PASS; public API PASS; immutability PASS; work suites unchanged.

Full suite: **307 files / 4334 tests — 4321 passed, 13 failed** across 4 files, **all of them archived-plan
closure-binding tests**. These are **pre-existing**: with every G1 change removed and `dist` rebuilt, the same
13 tests fail on the same 4 files. The closure digest is computed over working-tree bytes and depends on
line-ending state and the built `dist/**` — the same sensitivity G0 recorded. The closure guard was **not**
weakened and the archived plan was **not** regenerated.

`test/r3l0ciarlcf_gates.test.ts` remains **`BLOCKED_FOR_SAFETY`** (the legacy junction-following cleanup path).
Browser E2E and the D2/D4/D5 live gates are **NOT_RUN**.

---

## 9. Verdicts

```
HOST_OBSERVATION_PRODUCER              = PASS_LOCAL_NONMODEL
DIRECT_CHILD_PID_OBSERVED              = PASS_LOCAL_NONMODEL
DIRECT_CHILD_EXIT_OBSERVED             = PASS_LOCAL_NONMODEL
DIRECT_CHILD_EXIT_UNCERTAINTY_PRESERVED= PASS_LOCAL_NONMODEL
WORK_ATTEMPT_CORRELATION               = PASS_LOCAL_NONMODEL
HOST_LOCAL_JOB_CORRELATION             = PASS_LOCAL_NONMODEL
RUN_JOURNAL_BINDING                    = PASS_LOCAL_NONMODEL
OBSERVATION_DURABILITY                 = PASS_LOCAL_NONMODEL
OBSERVATION_ORIGIN_BOUNDARY            = PASS_LOCAL_NONMODEL
MODEL_VISIBLE_CONTEXT_UNCHANGED        = PASS
WORK_SEMANTICS_UNCHANGED               = PASS
ARTIFACT_LOCATOR_GRAMMAR               = PASS_SOURCE_GROUNDED
REAL_DSH_ARTIFACT_COMPATIBILITY        = NOT_ESTABLISHED
REAL_DSH_WORKER_PROCESS_ATTESTED       = NOT_ESTABLISHED
ACTUAL_ROUTE_ATTESTED                  = NOT_ESTABLISHED
LIVE_PRIMARY_PROVENANCE                = NOT_ESTABLISHED
EXTERNAL_AUTHORITY                     = NOT_ESTABLISHED
HOST_SPEND_ENFORCEMENT                 = NOT_ESTABLISHED
CURRENT_LAUNCH_PERMISSION              = FALSE
PAID_EXECUTION                         = NOT_RUN
CAUSAL_RESULT                          = NOT_EVALUABLE
HISTORICAL_EVIDENCE_IMMUTABILITY       = PASS
```

`ARCHIVED_PLAN_PRESERVED = true` · `CURRENT_G1_EXECUTION_CLOSURE = NEW_CODE_STATE` ·
`G1_PRIMARY_PLAN_FROZEN = false` · `G1_PRIMARY_EXECUTION_AUTHORIZED = false`

---

## 10. Final stop

Zero genuine DSH model launches. Zero paid model calls. No new PRIMARY observations. No R3-L1. No Fusion. No
historical research rewrite. No merge to `main`.

**Final acceptance question — YES, measured:** the existing Work and Deployment Host can produce a non-model,
host-origin process observation, bind it to the correct Work Attempt and host-local job without exposing
authority to the Worker, and preserve it so later consumers can distinguish authentic local observations from
caller declarations. `LIVE_PRIMARY` does **not** depend on passing this local-stub test.
