# R3-L0C-G0 — Safety Maintenance & Live Execution Readiness Decision

**Stage:** R3-L0C-G0
**Baseline:** `751f2e2257dc00e4a5a289afa1bdd38a14f7d422` (branch `r3-l0c-iar-lcfsh-terminal-hotfix`)
**Branch:** `r3-l0c-g0-execution-readiness`
**Kind:** readiness and maintenance record — **not** a new frozen causal experiment

This memorandum is the human-readable companion to the machine-readable records in
`research-evidence/r3-l0c-g0/`. Every claim below is backed by a cited source location in those records.

---

## 1. What this stage did

Two bounded things, and nothing else:

1. **Closed two verified residual failure paths** in the latest disposable-worktree cleanup helper
   (`scripts/r3l0ciarlcfsh/safe-cleanup.mjs`).
2. **Audited, read-only, what actually prevents a verified `LIVE_PRIMARY` execution** — provenance,
   route, authority and spending — and produced an evidence-backed Go/No-Go decision.

No experimental model call was made. No worker was launched. No authorization was created. The scientific
design is untouched.

---

## 2. Safety maintenance

### S1-A — depth-limit exhaustion did not fail closed

`enumerateLinks()` bounded its traversal at `MAX_ENUMERATION_DEPTH = 12` but, at the boundary, silently
skipped any further directory while still returning success. A link nested below the bound was therefore
never inspected, and `destroyDisposableCheckout()` received no signal to stop before the Git removal
decision.

Measured on the unpatched baseline: an over-deep tree returned `ok: true` with **zero** links found while a
junction existed below the boundary.

Correction: a named `DEPTH_LIMIT_EXCEEDED` condition is recorded, `enumerateLinks()` returns `ok: false`,
and cleanup blocks with `ENUMERATION_COMPLETE: false` and the worktree preserved. The resource bound is
kept — it was not raised to evade the problem, and no unbounded traversal was introduced.

### S1-B — deletion aftermath confused ENOENT with inspection failure

`realFilesystemAdapter().exists()` caught **every** `lstat` error and returned `false`. The Git-removal
branch then read `fs.exists(root) !== true` as proof of removal. With Git removal returning without removing
and postflight inspection failing (`EPERM`/`EACCES`), the helper reported `CLEANED` /
`worktreeRemoved: true` while the directory was **physically still on disk**.

Correction: an error-aware `inspect()` operation and a `classifyRemovalState()` witness report
`REMOVED_CONFIRMED` only on `ENOENT`, `STILL_PRESENT` when present, and `STATE_UNKNOWN` otherwise.
`existsSync` is no longer the sole witness, `CLEANED` is never reported when the physical state is unknown,
and no recursive fallback is taken after an uncertain Git removal. The exact Git error and filesystem
observation travel as diagnostics.

### Evidence quality

- Controls were committed **before** the patch (C1), each asserting the defective behaviour was present.
- After the patch (C2) the same properties are asserted to hold, plus negative controls **S1-B1..B6**.
- §3's "never trust the helper's own boolean" rule is honoured: every dangerous branch checks the
  **injected adapter's call history** to show which destructive operations were invoked.
- Every test runs on disposable directories under the system temp root; an external sentinel file is
  verified byte-identical afterwards.

**Verdict: `SAFETY_MAINTENANCE = PASS`** (T2 — real filesystem operations with fault-injected adapters).

**Remaining threat-model exclusions:** protection against a concurrent adversarial process, and against a
platform whose reparse-point semantics differ from those measured on this host, is **not** claimed.

---

## 3. Archived deterministic milestone — preserved

The archived stage at `751f2e2` reported `DETERMINISTIC_MEASUREMENT_CLOSED`. That remains a valid
conclusion **about the archived code and evidence at that commit**, and is not retroactively reinterpreted
as a real PRIMARY result.

Retained distinction: **deterministic mechanism qualified ≠ live execution qualified ≠ live causal result
obtained.**

### Plan versioning deviation

The Plan ID `r3-l0c-iar-lcfsh-primary-plan` was used with **six distinct full content digests** across
successive re-freezes. Classified as **`PRE_EXPOSURE_PLAN_IDENTITY_REUSE`**: `stage-result.json` records
`modelCallsMade: 0` and `enteredPrimaryExecution: false`, so no genuine PRIMARY exposure is recorded in
durable evidence. This does **not** by itself prove the absence of all external billing activity — that
would require external provider records, which are not available here.

For any future authorization, the **exact Plan Content Digest and Git object identity** must be required in
addition to the Plan ID, with a clean one-time freeze before exposure.

---

## 4. Closure drift — expected, not a defect

The maintenance patch changes load-bearing cleanup code, so the current HEAD execution closure
(`dc6f5673…`) differs from the archived plan closure (`e850e1c5…`).

`CURRENT_MAINTENANCE_PLAN_COMPATIBILITY = DRIFTED_EXPECTED`

The archived plan remains a valid historical snapshot of its commit. **The current maintenance HEAD is not
a valid execution candidate under the archived frozen plan**, and no new plan is frozen in G0.

---

## 5. Readiness audit — what actually blocks live execution

The implementation cannot produce a verified `LIVE_PRIMARY` cost observation. The causes are concrete
missing edges, not one gap:

| # | Missing edge | Where it breaks |
|---|---|---|
| E1 | per-trajectory DSH home → cost bridge | `pipeline.mjs:321` never passes `dshHomePath`; default `null` |
| E2 | real artifact path → attempt identity | `artifact-identity.mjs:77` requires `attempt-<hex>` as a whole segment; the runtime emits `…worlds-attempt-<hex>--` |
| E3 | canonical AttemptId → artifact path contract | `instrumentation.mjs:62` uses a substring regex that disagrees with the authority-bearing parser |
| E4 | runId → durable record → witness | `JOURNAL_FIELDS` has no `runId` |
| E5 | worker process identity → port outcome | the port spawns the worker but returns no pid |
| E6 | observed route identity → witness | only a declared route exists; the verifier rejects declarations |
| E7 | witness producer → bridge | no production caller supplies a witness (`witnesses = {}`) |
| E8 | artifact path → worker attempt (non-forgeable) | the identity conflict check is skipped when the path encodes no attempt id |
| E9 | session-scoped discovery | `sessionId` is accepted but not used in candidate filtering |

The real DSH artifact lives under `<home>/sessions/<cwd-slug>/worker-<uuid>/session.v4.jsonl.zstd`; its
canonical attempt hex is embedded inside a slug the parser rejects. `sessionArtifactPath` is
**caller-supplied** (`primary-adapter.mjs:221`), not independently discovered.

**`REAL_DSH_ARTIFACT_PROVENANCE = NOT_ESTABLISHED`**

---

## 6. Route and activation boundary

- `ROUTE_DECLARED` — established (`omnigate2api-deepseek-v41-flash` / `deepseek-v4.1-flash`).
- `SHIPPED_EXECUTABLE_RESOLVED` — established (resolution only; no spawn).
- `ROUTE_IDENTITY_ATTESTED`, `PROVIDER_ACCESS_VERIFIED`, `REAL_WORKER_OBSERVED` — **not** established.

The route identifiers are **planned identifiers**, not evidence that the route works or is correctly priced.
No paid connectivity probe was attempted.

The PRIMARY prohibition is verified in code and returns **before** the run-root claim and before any worker
spawn (`pipeline.mjs:150`). No launch-capable implementation was created in G0.

---

## 7. Authorization and spending

- **`EXTERNAL_AUTHORITY = NOT_ESTABLISHED`** — no trusted authority source is configured;
  `trustedAuthoritySource()` refuses to verify a file that merely exists outside the repository, and
  implements no issuer-identity verification, independent-control proof, or revocation rules.
- **`HOST_SPEND_ENFORCEMENT = NOT_ESTABLISHED`** — `detectHostSpendEnforcement()` returns
  `enforced: false`. Every available control (declared budget, session count, launch limit) is a declaration
  or an estimate; no hard monetary cap exists.
- **`CURRENT_LAUNCH_PERMISSION = false`**, hard-coded in every verdict path.

A `decision:` string is not external authority. A declared budget is not an enforceable limit. G0 creates
neither, and fabricates no price or budget.

---

## 8. Go/No-Go

| Gate | Status |
|---|---|
| G0-SAFETY | **PASS** |
| G0-PLAN | NOT_ESTABLISHED |
| G0-ROUTE | NOT_ESTABLISHED |
| G0-ARTIFACT | NOT_ESTABLISHED |
| G0-WITNESS | NOT_ESTABLISHED |
| G0-AUTHORITY | NOT_ESTABLISHED |
| G0-BUDGET | NOT_ESTABLISHED |
| G0-FAILSTOP | **PASS** |
| G0-PRIMARY | NOT_ESTABLISHED |

`G0_READINESS_AUDIT_COMPLETE` means the audit is complete and the remaining conditions are identified. It
does **not** mean real PRIMARY is ready. Because mandatory prerequisites remain unknown:

**`PRIMARY_DECISION = NO_GO`**

This is a valid and useful terminal result.

---

## 9. Smallest set of necessary next actions

Each requires a **separate authorized decision** and is **not** implemented in G0:

1. Decide whether to build a launch-capable implementation with real artifact discovery, unique Attempt
   attribution and a genuine execution witness.
2. Establish a trusted external authority source with verified issuer identity, independent control and
   revocation rules.
3. Establish a host/provider-enforced monetary ceiling — or accept that none exists and decide accordingly.
4. Finalize runtime and measurement code, then produce and freeze **one** prospective plan bound to the
   final code and plan identity.
5. Obtain independent approval bound to that exact plan digest and commit identity.

---

## 10. Final stop

```
PAID_EXECUTION             = NOT_RUN
PRIMARY_LAUNCH_PERMISSION  = FALSE
LIVE_PRIMARY_PROVENANCE    = NOT_ESTABLISHED
EXTERNAL_AUTHORITY         = NOT_ESTABLISHED
HOST_SPEND_ENFORCEMENT     = NOT_ESTABLISHED
CAUSAL_RESULT              = NOT_EVALUABLE
```

No R3-L1. No Fusion. No merge to `main`.
