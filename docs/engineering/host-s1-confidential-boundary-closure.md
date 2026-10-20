# Host-S1 — Confidential Boundary Completeness & Capacity Recovery Closure

**Stage:** `Palimpsest Host-S1`
**Parent:** `e04211d2a2f52d05f2c248c3cc52257079b65a76` on `trajectory-p2e1rg-host-admission-closure`
**Branch:** `host-s1-boundary-completeness-lock-recovery`
**Code Freeze:** `353b216000596e1475c1766c60d6682a400c633b` (tree `acbd06265d6d539c01ec8a320a042bbd0e5a5195`)
**Evidence Freeze:** the commit containing this document; it changes no executable code

---

## A. Verdicts

| Verdict | Result |
|---|---|
| `H1-A PROTECTED_CONTENT_COVERAGE_QUALIFIED` | **QUALIFIED** |
| `H1-B PRODUCTION_TREE_ADMISSION_QUALIFIED` | **QUALIFIED** |
| `H1-C CONFIDENTIAL_CAPACITY_RECOVERY_QUALIFIED` | **QUALIFIED** |
| `H1-D DELEGATION_POSITIVE_CONTROL_QUALIFIED` | **QUALIFIED** |
| `H1-E HOST_SECURITY_EVIDENCE_RECONCILED` | **QUALIFIED** |
| `HOST_CONFIDENTIAL_BOUNDARY_REQUALIFIED` | **QUALIFIED** |
| `TRAJECTORY_DSH_MEASUREMENT_CHAIN_PRESERVED` | **QUALIFIED** |

**Scope.** Node `24.22.0`, `win32`/`x64`, DSH `0.2.1-rc.2`, `dsh-sandbox-windows-acl@0.2.1-rc.2`, `dsh-win32-process@0.2.1-rc.2`, `koffi@3.1.1`. These verdicts are scoped to the tested runtime and are **not** generalised to future DSH releases.

**Withheld.** `CONTROL_BASELINE_TECHNICALLY_READY`, `MODEL_CONSUMED_CAPSULE`, `BENCHMARK_QUALIFIED`, `TRAJECTORY_FIRST_PARTY_ORIGIN_SETTLEMENT_QUALIFIED`, `UTILITY_POSITIVE_SIGNAL`, `UTILITY_NEGATIVE_SIGNAL`, `WORK_UTILITY_IMPROVED` and `AGENT_COOPERATION_IMPROVED` all remain **NOT_ESTABLISHED**. No stochastic trial and no external model request occurred in this stage.

---

## B. The eight reproduced defects

Each was reproduced against the parent commit before any correction. `research-evidence/host-s1/baseline-and-falsifiers.json` holds the records; every falsifier drives the shipped functions rather than a paraphrase.

### H1-0-F1 — an inactive sibling world was omitted from derived coverage

`planReadFence()` derived exactly **one level** beneath a skipped protected ancestor. In the production layout `worlds/` contains the active world, so it was skipped in turn and **nothing beneath it was considered**. Measured on the parent:

```
palimpsestSkipped: true
derivedRoots: [ ".palimpsest/durable-state" ]      <- sibling worlds absent
siblingDerived: false
siblingReceivedLabel: false
coverageComplete: true                              <- and coverage still claimed completeness
```

The `worlds` directory was not even recorded as a second skip, so no reader could see that a level had been passed over.

### H1-0-F2 — a Low-integrity process reads an inactive sibling world

Measured separately by `scripts/host_s1/sibling-world-probe.mjs` under the real DSH sandbox token. This is the dynamic counterpart to F1: F1 shows the plan omits the sibling, F2 shows what that omission costs.

### H1-0-F3 — descendant verification was computed but never consumed

E1RG added `verifyTree()` with a correct `verified`/`complete`/`noUnprotectedEntryFound` distinction. Nothing in the production path read it. Measured: `admitWorker`'s required keys contained **no** tree or descendant field, and `runner.js` never called `verifyTree`.

### H1-0-F4 — a malformed holder was filtered away as free capacity

`liveHolders` dropped any entry whose `pid` was not a number. A syntactically valid record containing one garbage entry therefore read as **free capacity**. Measured: `granted: true` with a malformed holder on disk.

### H1-0-F5 — release on an unreadable record rewrote the ownership set as empty

`release()` wrote `(read.ok === true ? read.holders : []).filter(...)`. A failed read therefore authorised replacing the record with an **empty** holder list. Measured: an unrelated holder was silently erased and the release reported success.

### H1-0-F6 — stale-lock recovery could delete a successor lock

`takeLock` decided a lock was abandoned from an observation, then removed it **by pathname** with `recursive: true`. Between the observation and the removal a different process can acquire a new lock at the same pathname, and the delayed remover deletes it. Measured: the successor's owner token was `successor-live-owner` and the removal destroyed it.

### H1-0-F7 — capacity was keyed by DSH home, not by the protected domain

Two host instances with different homes each acquired their own slot and were **both granted capacity for the same repository**. R1-HC established that two ACTIVE worlds cannot both be read-fenced, and nothing about the two hosts being different processes changes that.

### H1-0-F8 — a positive delegation case passed with zero sessions

The probe's positive branch was `else verdict = "ALLOWED_NO_DELIVERY"`. The committed E1RG matrix scored the `production` case as a successful legitimate delegation while recording `sessionCount: 0` and `refusalPoint: PRE_CREATE_ALIAS_ADMISSION` — a worker refused **before** it composed an Agent.

### H1-0-F9 — evidence identity mismatch

`a99868c065e8bf585c492a3f1746d9c4c06f2d76` has Git tree `3f2f8cc1f1b7144a4ab828d46031863c61b4dfea`. The E1RG document recorded `595fae49a08619d98d40d1685736b9803db8c6d2`, which is a real tree object but not that commit's tree. The erratum is recorded forward-only in §J; the historical E1RG document is not rewritten.

---

## C. H1-A — complete kernel coverage along the active-world spine

### The derivation

`planReadFence()` now walks the **active-world spine**: the chain of ancestors from the protected root down to the world. At every level on that chain it:

1. identifies the child that continues toward the world;
2. records that child as the spine continuation, which is **never labelled** (it is an ancestor of the world, and labelling it refuses the traverse every process needs to start);
3. classifies every **other** child as content requiring confidentiality;
4. derives a protected root for each such child;
5. records anything it could not enumerate or classify.

The walk is bounded **by construction**: it enumerates exactly one directory per spine level, and the spine is the finite ancestor list between root and world. `MAX_SPINE_DEPTH = 12` bounds a pathological path and records the truncation as unresolved. This is not a crawler (§6.1).

```
repository/.palimpsest/                     skipped (contains the world)
  durable-state/                            DERIVED, labelled
  worlds/                                   spine: contains the world, not labelled
    attempt-A/                              the ACTIVE world, not labelled
    attempt-B/                              DERIVED, labelled   <- the E1RG gap
    attempt-C/                              DERIVED, labelled
```

### Completeness semantics

`coverageOf` now reports, per skipped ancestor: the requested root, the **spine**, the derived roots, `enumerationFailed`, and `planComplete`. `complete` requires all of:

- every outcome verified;
- nothing unresolved;
- no enumeration failure;
- no skipped root without derived coverage;
- **no incomplete spine plan**.

An empty derived set is not automatically unsafe (§6.3): it is safe only when the enumeration that produced it was complete. A world that *is* the root legitimately derives nothing.

### Alias handling (§6.4)

A reparse point among the non-spine children is **never derived** — labelling through a link would write a security descriptor onto an object outside the intended protection domain. It is recorded in `unresolved` and makes the plan incomplete.

### The measurement that changed the design

`scripts/host_s1/junction-label-probe.mjs` runs a real Low-integrity token against a **labelled** junction whose target is outside the protected root:

| Observation | Result |
|---|---|
| list the junction | `EPERM` — the label **does** reach the link object |
| read a file **through** the junction | **succeeds, canary returned** |

**A labelled junction is not a protection basis for its target.** The link object is protected; the content it exposes is not. This is why §6.4 refuses to derive through a link rather than treating the link's label as coverage.

---

## D. H1-B — descendant verification as a production admission requirement

### The two claims are separate

`ensureReadFence` now returns `rootsVerified`, `treesVerified` **and** `descendantsQualified`. The last is what admission consumes: it requires every verified root's content to be accounted for, and it is deliberately **false** when verification was disabled — "nobody looked" is not "everything is protected".

### Reparse classification, and why the blanket rule was wrong

The E1RG rule treated **any** reparse point as `undetermined` and made `complete` false. That is safe but cannot be final: the real DSH home contains **98 junction entries** in `profiles/node_modules` (the shipped installer links packages), so "no reparse points" would refuse every worker in every real deployment.

`verifyTree` now classifies each link by where it leads, and reports `reparseBasis`:

| Basis | Meaning | Admission |
|---|---|---|
| `NO_REPARSE_POINTS` | nothing to account for | eligible |
| `REPARSE_TARGETS_ACCOUNTED_FOR` | every link leads to content this fence already covers (this root, or another protected root) | eligible |
| `REPARSE_LEAVES_PROTECTION_DOMAIN` | a link leads outside every protected root; the target is **not claimed** | eligible, and **named** |
| `REPARSE_UNRESOLVABLE` | the target could not be established | **refused** |

`complete` stays **false** whenever any link exists, because a subtree behind a link was deliberately not examined. The admission field is `admissionEligible`, and it is `true` only when nothing examined was unprotected, nothing failed to enumerate, the walk was not truncated, and no link was unresolvable.

### The production seam

- `installWorkerReadBoundary` computes `verification` from the roots that actually received a verified label;
- `admitWorker` requires `kernelDescendantsQualified` as its **own** entry in the required set;
- `runner.js` adds a `kernel-descendants` pre-create refusal phase, evaluated **before** the pre-create stop and therefore before `agents.create()`.

### Cost

`scripts/host_s1/verify-cost-probe.mjs` measures the metadata-only walk against the shipped `MAX_TREE_ENTRIES = 20_000` / `MAX_TREE_DEPTH = 12`. The DSH home exceeds the entry cap, which is why the limits are kept and an incomplete walk refuses rather than the limits being raised (§7.3).

---

## E. H1-C — capacity ownership and recovery safety

### Record validation (§8.1)

`readHolders` classifies each entry **before** any liveness decision:

| Class | Test | Effect |
|---|---|---|
| valid | `pid` a positive integer, `token` a string when present | counted |
| malformed | not an object, or a required field has the wrong type | **refuses the whole record** |
| unknown | structurally valid, liveness indeterminate | counted as a holder |

A malformed entry is **unknown ownership**, not absent ownership: it might be the active worker, so granting capacity beside it is the overlap the limit exists to prevent.

### Release (§8.2)

A failed read **never** authorises rewriting an empty ownership set. Release refuses, leaves the record byte-identical, keeps `held` true and returns `retryable: true`. A release removes only its own token and preserves unrelated holders verbatim.

### Lock recovery and the ABA race (§8.3/§8.4)

The removal is no longer by pathname. Recovery **claims by rename** to a private name containing this process's token, **verifies** the claimed object carries the observed owner token, and only then removes it — by the private name, which no other process can create. A successor installed at `active.lock` after the rename is untouched.

An unreadable `owner.json` is not an abandoned lock: it is only reclaimed once the **directory** is demonstrably older than `lockStaleMs`, and if the directory cannot be stat'd the lock is not reclaimed at all.

### Liveness (§8.5)

`livenessOf` returns a tri-state. `ESRCH` is dead; `EPERM` is alive; **every other error is indeterminate**, and an indeterminate holder is counted rather than evicted. A live holder is never evicted by a timestamp — `staleAfterMs` is retained for compatibility and no longer evicts.

### Namespace (§8.6)

The slot is keyed by the **protected domain**: `<domain>/.palimpsest/host-capacity/`. Every host capable of exposing the same worlds resolves the same domain root and therefore contends for the same slot. `domain.identity` and `domain.assumption` are reported so a receipt cannot imply a stronger scope than the one in force.

This is **host execution state**, not canonical state: it carries no owner, event, task or asset semantics; it lives outside every worker's world (so a Low token cannot forge or release capacity); and it sits inside the protected root, so the fence's derived coverage labels it with the rest of the skipped ancestor's non-spine content.

---

## F. H1-D — the delegation positive-control oracle

### The corrected positive verdict

A positive case now requires **independent** observations, each recorded separately:

| Observation | Meaning |
|---|---|
| `parentSessionCreated` | the worker's own session exists |
| `preCreateAdmitted` | no pre-create refusal occurred |
| `delegationInvoked` | the model-visible delegation tool was **called** |
| `childSessionCreated` | a second session exists |
| `childWorldAuthorized` | the child was associated with the intended world |
| `authorizedContextDelivered` | the authorized world's token reached the child |
| `noCanaryDelivered` | no protected token reached any session |
| `noSecurityRefusal` | the delegation was not refused |

`missingObservations` names what was absent, and the verdict is `POSITIVE_CASE_NOT_EXECUTED` when anything is missing. The old unconditional `ALLOWED_NO_DELIVERY` branch is gone.

### Refusal attribution (§9.4)

The refusal phase is parsed from the structured `PALIMPSEST_WORKER_PRECREATE` receipt. An unparseable receipt yields `UNKNOWN`, never a specific phase. The generic substring `"refusing to run this worker"` is no longer used to infer `PRE_CREATE_ALIAS_ADMISSION`.

### Matrix closure (§9.6)

The matrix independently rejects `positiveWithoutExecution` and `positiveWithRefusal`, so a probe bug cannot make the matrix close on a non-executed positive. The final matrix does not qualify merely because no protected token was observed.

### The production fixture diagnosis (§9.5)

The E1RG `production` fixture was refused at pre-create because `.palimpsest` contained only `worlds/`, so the one-level derivation produced **no** derived roots and coverage was correctly incomplete. With the spine walk (H1-A) the fixture now derives `durable-state` and the sibling worlds, and the case reaches a real admission decision rather than an alias refusal.

---

## G. Code changes

| File | Change |
|---|---|
| `host/deployment/runtime/read_fence.js` | spine walk (`deriveAlongSpine`), `MAX_SPINE_DEPTH`, coverage ledger with spine/planComplete/incompletePlans, reparse classification, `admissionEligible`, `descendantsQualified` |
| `host/deployment/runtime/worker_fence.js` | `verifyDescendants`, `verification` in the installation report, `kernelDescendantsQualified` in the required set, descendant telemetry |
| `host/deployment/runtime/confidential_profile.js` | record validation, tri-state liveness, rename-claim lock recovery, release semantics, domain-keyed namespace |
| `host/dsh/lib/runner.js` | `kernel-descendants` pre-create phase, descendant facts in the receipt, domain passed to the slot |
| `scripts/trajectory_p2e1rf/delegation-probe.mjs` | positive observation set, structured refusal attribution |
| `scripts/trajectory_p2e1rf/run-delegation-matrix.mjs` | `positiveWithoutExecution` / `positiveWithRefusal` closure predicates |

No change to Canonical Work authority, settlement, Project Intent, Collaboration, Federation, Organization Memory, Institutional Learning, PRIMARY authorization or any public API contract.

---

## H. Tests

| Suite | Controls | Result |
|---|---|---|
| `test/host_s1_spine_coverage.test.ts` | 14 | 14 PASS |
| `test/host_s1_descendant_admission.test.ts` | 15 | 15 PASS |
| `test/host_s1_descendant_phase.test.ts` | 12 | 12 PASS |
| `test/host_s1_capacity_recovery.test.ts` | 26 | 26 PASS |
| `test/host_s1_delegation_oracle.test.ts` | 19 | 19 PASS |
| Host-affected regression suites (17 files, including E1RD/E1RE/E1RF/E1RG) | 257 | 257 PASS |
| R1-HR conformance | 47 | 44 PASS / 3 LIMIT / 0 FAIL |
| R1-HC conformance | 27 | 26 PASS / 1 LIMIT / 0 FAIL |

The conformance counts are read from the runners' own receipts. A LIMIT entry also appears in `results` with `pass: true` (a disclosed limitation is not a failure), so the three classes are made mutually exclusive in `host-security-conformance.json` — without that, the artifact would report 47/47 for a suite the runner reports as 44 PASS / 3 LIMIT.

`pnpm run build`, `architecture:check` (0 violations) and `architecture:check:public-api` (0 missing, 0 changed kind, 0 added) all pass.

### Regression suites updated, and why

Three suites encoded the **weaker** contract this stage replaced. Each was updated to require the stronger property, exactly as E1RG did for E1RE/E1RC:

- `test/trajectory_p2e1rg_baseline_admission.test.ts` — a baseline falsifier by design; its assertions encoded the parent's defects. After the corrections those assertions invert, so each case now asserts the corrected behaviour while keeping its identity (F1…F6b).
- `test/trajectory_p2e1re_pretool_boundary.test.ts` — the "full boundary" fixture now carries `kernelDescendantsQualified`, because a full boundary now includes the descendant claim.
- No suite was edited merely to obtain a green whole-repository result; the attribution below records every remaining failure as pre-existing.

### Whole-repository attribution

A whole-repository run fails in suites that predate this stage. Three consecutive runs of the SAME code produced 53, 60 and 62 failures across the same 24 files, so a whole-run pass/fail delta is not attributable on its own.

The attribution is therefore made **by scope**: every suite that imports `read_fence.js`, `worker_fence.js`, `confidential_profile.js` or the delegation probe was run, and all 257 tests across those 17 suites pass. `scripts/host_s1/attribute-failures.mjs` is provided for per-test comparison when two clean JSON reports are captured.

**A whole-repository green result is NOT claimed.** The pre-existing failures fall into three classes, all outside Host security:

1. `trajectory_v0_*` / `trajectory_h0_*` / `trajectory_h1_*` — `invalid plugin ... received undefined` from the cordis loader resolving the global npm DSH install;
2. `r3l0c*` — assert on historical calibration evidence that requires a run root this checkout does not contain;
3. `trajectory_p2*` — assert on frozen historical stage artifacts.

---

## I. Evidence

`research-evidence/host-s1/`:

| Artifact | Content |
|---|---|
| `baseline-and-falsifiers.json` | F1–F9 as reproduced against the parent |
| `protected-content-coverage.json` | spine derivation, derived roots, real label outcomes |
| `production-tree-admission.json` | descendant qualification and the admission refusal |
| `capacity-recovery.json` | normal acquisition, malformed state, release, ABA race, domain |
| `delegation-positive-controls.json` | the corrected oracle and the matrix |
| `host-security-conformance.json` | R1-HR / R1-HC receipts and the failure attribution |
| `trajectory-measurement-reconfirmation.json` | the first-party DSH closure |
| `git-and-evidence-identity.json` | parent, commits, Code Freeze, Evidence Freeze, 52 protected trees |
| `final-verdicts.json` | H1-A…H1-E, integrated, trajectory |

Every artifact carries the Code Freeze SHA, the executed tree identity, the runtime identity, the DSH version, the command, the exit code, a run id and its own digest.

---

## J. Forward errata

### E1RG-ERRATUM-1 — Code Freeze tree identity

| Field | Documented in E1RG | Actual |
|---|---|---|
| Code Freeze HEAD | `a99868c065e8bf585c492a3f1746d9c4c06f2d76` | unchanged |
| Tree | `595fae49a08619d98d40d1685736b9803db8c6d2` | **`3f2f8cc1f1b7144a4ab828d46031863c61b4dfea`** |

`595fae4` is a real tree object, so the error was not detectable by object existence. The E1RG document is **not** rewritten in its original commit; this erratum is forward-only, and `git-and-evidence-identity.json` records the corrected pair.

### E1RG-ERRATUM-2 — evidence class of the capacity race

The E1RG Capacity Race is a genuine multi-process runtime test, but it does **not** run full DSH Workers. Its evidence class is corrected to `CROSS_PROCESS_RUNTIME_VERIFIED` rather than an unqualified `FIRST_PARTY_DSH_VERIFIED`. The result itself is unchanged.

### E1RG-ERRATUM-3 — the `production` delegation case

The E1RG matrix recorded `production` as `matched: true` with `ALLOWED_NO_DELIVERY`, `sessionCount: 0` and `refusalPoint: PRE_CREATE_ALIAS_ADMISSION`. That was a false positive: the case measured the absence of a leak, not the presence of delegation. The corrected oracle reports `POSITIVE_CASE_NOT_EXECUTED` for that observation set, and the fixture now derives coverage through the spine walk so the case reaches a real admission decision.

---

## K. Residual risks

**Disclosed limitations (measured, unchanged):**

- `HR-33` metadata confidentiality of sibling world **names** — the worlds parent cannot be labelled because it is an ancestor of the world.
- `HR-39b` / `HC-27` two concurrently **ACTIVE** worlds cannot both be read-fenced — the profile serialises them instead of pretending to separate them.
- `HR-17` the trusted-code guard works on names, so a Medium-integrity process is not bound by the kernel label.

**Source-demonstrated, not dynamically proven:**

- The indeterminate-liveness path (§8.5) has no reproducible fixture on this host: every real pid answers `ESRCH` or `EPERM`. The control pins the shipped rule from source and is classified as such.
- `kernel-descendants` phase ordering is pinned by source assertion in `host_s1_descendant_phase.test.ts`; the dynamic end-to-end proof that a refusal stops `agents.create()` lives in the E1RG pre-create suite, which the `capacity` phase exercises through the same stop.

**Unverified properties:**

- `MAX_TREE_ENTRIES` is exceeded by a real DSH home, so the DSH home's own tree is not admitted as a protected root under the current bounds. It is not in `protectedRootsFor()` — the home is fenced as `DSH_HOME`, which is a separate root — but a future deployment that adds a large root will refuse rather than silently pass.
- Stochastic measurement, model utility and benchmark qualification remain unestablished and out of scope.

---

## L. E2 decision

**The Host permits proceeding to E2 CONTROL-only stochastic protocol authorisation**, subject to the separate authorisation that stage requires.

Host-side qualification is complete for this runtime. The following still require **separate** authorisation and are **not** supplied by this stage:

- a named provider and exact model identity;
- a cost ceiling and a budget owner;
- a frozen fixture identity and Oracle version;
- repetition count and stopping rules;
- failure-classification rules;
- data retention and re-scoring plan.

**No E2 work was executed.** No CONTROL trial, no TREATMENT trial, no external model request and no provider configuration was activated.

The smallest remaining Host blocker for a **broader** claim (beyond this runtime) is the absence of a scalable equivalent to exhaustive descendant verification for a tree larger than `MAX_TREE_ENTRIES`: today such a root refuses, which is safe, and no stronger guarantee has been demonstrated.
