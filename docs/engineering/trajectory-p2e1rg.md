# Trajectory-P2-E1RG — Host Admission & Kernel Boundary Closure

**Stage:** `Trajectory-P2-E1RG`
**Parent:** `a168beca156c6cbdc6166d45b73a8189e76b7e0a` on `trajectory-p2e1rf-final-security-evidence-closure`
**Branch:** `trajectory-p2e1rg-host-admission-closure`
**Code Freeze:** `a99868c065e8bf585c492a3f1746d9c4c06f2d76` (tree `595fae49a08619d98d40d1685736b9803db8c6d2`)

---

## A. Final verdicts

| Verdict | Result |
|---|---|
| `RG_A_HOST_PRECREATE_ADMISSION_QUALIFIED` | **QUALIFIED** |
| `RG_B_KERNEL_COVERAGE_AND_TREE_VERIFICATION_QUALIFIED` | **QUALIFIED** |
| `RG_C_CONFIDENTIAL_CAPACITY_ATOMICITY_QUALIFIED` | **QUALIFIED** |
| `RG_D_HOST_ADMISSION_EVIDENCE_QUALIFIED` | **QUALIFIED** |
| `RG_E_HOST_CONFIDENTIAL_EXECUTION_REQUALIFIED` | **QUALIFIED** |
| `TRAJECTORY_DSH_MEASUREMENT_CHAIN_PRESERVED` | **QUALIFIED** |

**Scope.** Node `24.22.0`, `win32`/`x64`, DSH `0.2.1-rc.2`, `dsh-win32-process@0.2.1-rc.2`, `koffi@3.1.1`. These verdicts are scoped to the tested runtime and are **not** generalized to future DSH releases.

**Withheld.** `MODEL_CONSUMED_CAPSULE`, `BENCHMARK_QUALIFIED`, `TRAJECTORY_FIRST_PARTY_ORIGIN_SETTLEMENT_QUALIFIED`, `UTILITY_POSITIVE_SIGNAL`, `UTILITY_NEGATIVE_SIGNAL`, `WORK_UTILITY_IMPROVED`, `AGENT_COOPERATION_IMPROVED` and `CONTROL_BASELINE_TECHNICALLY_READY` all remain **NOT_ESTABLISHED**. No stochastic trial and no external model request occurred.

---

## B. The seven reproduced defects

Each was reproduced against the parent commit before any correction. `rg0-findings.json` holds the records; the baseline falsifier suite drove the real `runWorker`.

### RG-0-F1/F2 — refusals did not stop Agent creation

`runWorker()` assigned `failure` when capacity or alias admission refused, then **continued to `agents.create()`**. Measured: a refused worker created an Agent, attempted a model turn, and printed `READY_FOR_SETTLEMENT` with exit 0.

**Root cause, precisely.** Two separate defects compounded:
1. `failure` was a *value*, not a control-flow decision — nothing branched on it before creation.
2. The reported-result branch was evaluated **before** `failure` was ever consulted, so a success-shaped Worker Result overrode the refusal.

### RG-0-F3 — a rejected world still mutated protected labels

`applyReadFence()` ran unconditionally *after* `admitWorldForFencing()` had refused the world. Measured: `aliasesClean === false` **and** `kernel.outcomes.length > 0`.

### RG-0-F4 — kernel failure was not an admission condition

`admitWorker()`'s required set contained only the three guard layers, the guard scope and the capability surface. Measured: `allowed === true` with **no kernel input at all**.

### RG-0-F5 — a partial traversal reported Verified

`verifyTree()` stopped at `maxEntries`/`maxDepth` and computed `verified` from two arrays only. Measured: `maxEntries: 1` examined the root and nothing else, with no field distinguishing complete from truncated.

### RG-0-F6 — slot acquisition was non-atomic

`acquire()` read the slot file, compared the holder count, then **overwrote** the file. Measured across six synchronized processes: **all six were granted the only slot**. A live holder past `staleAfterMs` was also evicted.

### RG-0-F7 — the ancestor-root exception left durable state unprotected

In the production layout the protected root is skipped because it contains the world. Measured under the real DSH Low token: with **no label** on `durable-state`, the synthetic canary was **readable**; the sandbox write-grant ACL alone did **not** stop the read.

---

## C. RG-A — pre-create admission is now a decision

### The invariant

```
PreCreateAdmissionRefused => NoAgentCreation => NoModelTurn
                          => NoSuccessfulWorkerOutcome => HOST_FAILURE
ScopedCapabilityRefused   => NoModelTurn => AgentDisposed => HOST_FAILURE
```

### How it is enforced

Refusals are collected **per phase** (`boundary-module`, `capacity`, `alias`, `kernel`, `kernel-coverage`, `kernel-drift`) rather than overwriting one string, so a receipt names every guarantee that failed. When any phase refuses, a `PreCreateRefusal` is thrown **before** `agents.create()`.

The refusal-precedence defect is fixed at the consumer: the reported-result branch is now evaluated **after** `failure`. A reported result describes work that must never have started.

### Missing dependencies fail closed (§4.3)

An absent `openConfidentialSlot` refuses (capacity is a security requirement, not a preference). An absent `admitWorker` refuses rather than skipping the classification — the previous shape ran an unclassified surface.

### Ordering (§4.4)

The alias verdict is now consulted before any label write, so a rejected world produces `kernel.applied === false` and `coverage.complete === false` — both of which the admission gate refuses. Capacity is released exactly once on every path.

### Tests

13 controls drive the real `runWorker` and the real `admitWorker`: capacity refusal, alias refusal, no label mutation, missing boundary module, missing required method, kernel unsupported, roots unverified, ABI drift, scoped refusal, success-shaped override, legitimate worker, and release-once on both paths.

---

## D. RG-B — kernel coverage and tree completeness

### Tree verification (§5.1/§5.2)

`verifyTree()` now reports **two distinct facts**:

- `noUnprotectedEntryFound` — nothing *examined* was unprotected. True even for a truncated walk.
- `verified` — every required entry was examined **and** nothing examined was unprotected.

It also reports `complete`, `stopReason` (`COMPLETE`/`ENTRY_LIMIT`/`DEPTH_LIMIT`/`INVALID_LIMIT`/`UNSUPPORTED`), `undetermined`, `enumerationFailures` and `reparsePoints`. Resource bounds are **kept**: a safe system may refuse a large tree; it may not call a truncated scan complete.

### The ancestor-root exception (§5.5)

`planReadFence()` now derives the **non-world children** of a skipped ancestor. In the production shape:

```
<repository>/.palimpsest/                 skipped (contains the world)
<repository>/.palimpsest/worlds/          also skipped (contains the world)
<repository>/.palimpsest/durable-state/   DERIVED and labelled
```

The derivation is one level and bounded — a label is inheritable, so labelling `durable-state` covers everything beneath it. `coverage.complete` is the single admission field, and it is false when a skipped root produced no derived coverage, when enumeration failed, or when any root is unverified.

### The Low-integrity probe

Two arms, and the second is the point:

| Arm | Durable readable by Low token | Canary leaked |
|---|---|---|
| Production path (derived coverage) | **no (EPERM)** | no |
| **Label removed (causation control)** | **yes** | **yes** |

Verdict: `PROTECTED_ONLY_BY_THE_LABEL`. This proves the Kernel label is what protects the content — the sandbox ACL alone does not. That is why derived coverage is load-bearing rather than cosmetic.

### Admission (§5.6)

`admitWorker()` now requires `kernelSupported`, `kernelRootsVerified`, `kernelCoverageComplete` and `kernelContractNotDrifted`, computed from the installation report.

---

## E. RG-C — atomic capacity ownership

### The mechanism

`mkdir` as the exclusive primitive. Creating a directory is atomic on NTFS — exactly one caller succeeds, every other receives `EEXIST` — with no dependency, no service and no per-platform lock API.

```
mkdir(lock) -> read holders -> decide -> write holders -> rmdir(lock)
```

The holder record is written to a temp file and **renamed**, so a reader never sees a partial record.

### Measured, both arms

| Arm | Grants out of 6 synchronized processes |
|---|---|
| Parent commit | **6** |
| Corrected | **1** |

Both arms run the same harness. The parent arm is required: a single-winner result alone would also be produced by a sequential implementation.

### Liveness, release, recovery

- A holder is evicted **only** when its process is gone. A timestamp never evicts a live holder.
- Release is bound to the owner token this handle recorded, so a non-owner cannot remove an entry.
- A lock is removed only when its recorded owner is dead **and** it is older than `lockStaleMs`.
- An unreadable or malformed record does **not** grant capacity.

---

## F. RG-D — evidence and errata

### E1RF errata (forward-only, §7.3)

E1RF's committed evidence is **not rewritten**. Three bounded limitations are recorded with their observed corrections:

| ID | Field | Recorded | Corrected |
|---|---|---|---|
| E1RF-ERRATUM-1 | `dsh.koffi` | `null` | `3.1.1` |
| E1RF-ERRATUM-2 | identity manifest | 6 artifact digests | 13 artifacts |
| E1RF-ERRATUM-3 | provenance table | written from an earlier run | verified against the committed artifact |

None changed a verdict. The ABI/FFI identity now comes from `dshCompatibilityReport()` — the module that actually binds the seam — rather than a second package-path search that missed the copy the seam resolves.

### Freshness

Every artifact carries a run identity (code HEAD, tree, command, exit code, runtime, DSH, selection, runId) and is admitted through the E1RF admission functions. Every artifact this stage commits is hashed, not only the inputs.

---

## G. RG-E — integrated acceptance

| Check | Result |
|---|---|
| `pnpm run build` | PASS |
| `pnpm run architecture:check` | PASS (0 violations) |
| `pnpm run architecture:check-public-api` | PASS (0 missing, 0 changed, 0 added) |
| Focused suites (10 files) | **158/158** |
| R1-HR | 44 PASS · 3 LIMIT · 0 FAIL |
| R1-HC | 26 PASS · 1 LIMIT · 0 FAIL |
| Real DSH delegation matrix | 8/8 matched, 0 leaks |
| Closure gate | **61/61, exit 0** |
| Protected evidence trees | 52/52 byte-identical |
| External model requests | 0 |

**Excluded:** `test/r3l0ciarlcf_gates.test.ts` — known unsafe against a shared working tree; the exclusion predates this stage.

### A behavior change worth naming

The E1RF delegation probe built both alias junctions for **every** case. That was harmless while an alias did not stop a worker. RG-A made a rejected world a pre-create refusal, so a leftover junction refused five cases **before the delegation probe ran** — they would have reported "no leak" while measuring nothing about delegation. The probe now builds only the fixture each case needs. The `aliasToProtected` case now refuses at pre-create rather than at the delegation guard: earlier, stronger, and accepted by the case rather than reported as a mismatch.

---

## H. Code-level changes

| File | Change |
|---|---|
| `host/dsh/lib/runner.js` | `PreCreateRefusal`; per-phase refusal collection; hard stop before `agents.create()`; refusal evaluated before the reported result; kernel facts passed to `admitWorker`; `PALIMPSEST_WORKER_PRECREATE` receipt |
| `host/deployment/runtime/worker_fence.js` | `applyReadFence` reached only when the alias verdict allows it; `admitWorker` requires the four kernel facts |
| `host/deployment/runtime/read_fence.js` | `planReadFence` derives non-world children of a skipped ancestor; `coverageOf`; `verifyTree` completeness semantics |
| `host/deployment/runtime/confidential_profile.js` | `mkdir` exclusive lock; temp+rename write; liveness-only eviction; token-bound release; explicit crash recovery |

---

## I. Residual risks

**Active security risk** — none newly introduced. The four corrected admission/coverage defects are closed with negative controls, and the two strongest claims are backed by before/after pairs.

**Disclosed limitations** (carried forward verbatim, **not** relabelled as solved): HR-17, HR-39b, HR-33, HC-27.

**Dynamically unverified** — the ancestor-root probe establishes protection for one production-shaped fixture. It does not enumerate every layout a deployment might create, and it does not test a stochastic model attempting aliasing or traversal in combinations no deterministic adapter produces.

**Historical evidence limitation** — E1RF's transcribed `beforeFix` rows remain unavailable in original form; this stage records errata rather than rewriting them.

**Source-only hypothesis** — none left open. Every RG-0 finding reached `DYNAMIC_UNIT_VERIFIED` or `FIRST_PARTY_DSH_VERIFIED`.

---

## J. Next-stage decision

The Host side is qualified to proceed to E2 CONTROL-only stochastic baseline setup. The revised candidate protocol is at `docs/engineering/trajectory-p2e2-control-protocol-draft.md`.

Remaining requirements are **protocol and authorization**, not Host engineering: a frozen fixture, a frozen Oracle version, a named provider and exact model, a seed policy, a trial count, a maximum cost, a maximum elapsed time, stopping rules and a retention plan.

`CONTROL_BASELINE_TECHNICALLY_READY` remains **NOT_ESTABLISHED** because a protocol draft is not a frozen specification and no external-model authorization exists.
