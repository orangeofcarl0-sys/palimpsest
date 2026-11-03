# Trajectory-P2-E1RE — Pre-Tool Confidentiality & Win32 Seam Requalification

**Stage:** `Trajectory-P2-E1RE`
**Branch:** `trajectory-p2e1re-pretool-win32-qualification`
**Parent:** `940c5fd5292e1a621da135a3fd67d5ed9b4cdefa` (`trajectory-p2e1rd-dsh-cwd-qualification`)
**Code Freeze / Executed Code HEAD:** `550c96e9e6aed55f1630e8d6124851178e38e8e6` (tree `8d2860fc5e7fc1e3ad5034722304006cddc044fa`)
**Evidence:** `research-evidence/trajectory-p2e1re/`

---

## 1. Final verdicts

| Verdict | Result |
| --- | --- |
| `RE-A PRE_TOOL_CONFIDENTIALITY_QUALIFIED` | **QUALIFIED** |
| `RE-B CWD_BOUNDARY_ADMISSION_QUALIFIED` | **QUALIFIED** |
| `RE-C WIN32_SEAM_REQUALIFIED` | **QUALIFIED** |
| `RE-D TRAJECTORY_EXECUTION_CHAIN_PRESERVED` | **QUALIFIED** |
| `RE-E HOST_RUNTIME_QUALIFIED` | **QUALIFIED** — derived from all four plus runtime conformance |
| `CONTROL_BASELINE_TECHNICALLY_READY` | **NOT ESTABLISHED** |

`RE-E` is a function of the four components and the runtime, not a restatement of `HR-27` passing. The seven
stronger verdicts (`MODEL_CONSUMED_CAPSULE`, `UTILITY_*`, `WORK_UTILITY_IMPROVED`, `AGENT_COOPERATION_IMPROVED`,
`TRAJECTORY_FIRST_PARTY_ORIGIN_SETTLEMENT_QUALIFIED`, `BENCHMARK_QUALIFIED`) remain `NOT_ESTABLISHED`.

---

## 2. RE-A — a real leak, found and closed

**The hazard was live, not theoretical.** Measured against the real first-party host, a worker whose model called
`subagent { cwd: <a protected directory> }` caused the CHILD's `agent/pre-step` to read that directory's
`AGENTS.md` through `ctx.fs` and inject it into the child's context as a `user/message` — **before the child made
any tool call at all**. No tool guard observes that read: the read guard covers content-returning tools, and
`subagent` returns none.

The ordering, established from source and then reproduced:

| # | Step | Where |
| --- | --- | --- |
| 1 | parent tool dispatch (`tools/pre-execute`, then guards) | `dsh-tools` |
| 2 | delegation tool body → `startActivation({ cwd })` | `dsh-tool-subagent` |
| 3 | child directory resolved against the parent's effective directory | `dsh-subagent:1524` |
| 4 | child Session created, basis applied via `workingDirectory.set` | `dsh-subagent:1803` |
| 5 | **child `agent/pre-step`** | `dsh-agent-instructions:1406` |
| 6 | instruction discovery over the ancestor chain | `dsh-agent-instructions:673` |
| 7 | **instruction content read through `ctx.fs`** | `dsh-agent-instructions:646` |
| 8 | **content spliced into model context as a `user/message`** | pre-step result |
| 9 | child's first guarded tool call | — |

A guard refusal at step 9 is too late; the unauthorized content is already in context at step 8.

### Before and after

| Case | Controlled input | Before | After |
| --- | --- | --- | --- |
| `world` | child cwd = the world | allowed, no leak | allowed, no leak |
| `sibling` | child cwd = a sibling world | **sibling `AGENTS.md` delivered** | refused, no child session |
| `protected` | child cwd = the protected root | **canary delivered** | refused, no child session |
| `parentOfProtected` | child cwd = parent of the root | allowed (no file happened to exist) | refused |
| `traversal` | child cwd = `../durable-state` | **canary delivered** | refused, no child session |
| `production` | child cwd = world inside `.palimpsest/worlds` | allowed, no leak | allowed, no leak |

Three cases leaked; all six now behave correctly. The `parentOfProtected` before-state is instructive: it
delivered nothing only because no instruction file happened to sit there — the read still happened, and the
outcome depended on the **file system** rather than on **authorization**. The corrected host refuses the
directory because it is outside the world, which is the correct rule.

### The correction

`createDelegationCwdGuard` runs on the **parent's** dispatch of `subagent` / `subagent_fork`, which is before
`startActivation()`, before child Session creation, and therefore before the child's pre-step read.

It copies DSH's own semantics rather than approximating them: an absent `cwd` inherits; a relative `cwd`
resolves against the parent's **effective** directory (not the world); an absolute `cwd` is used as given. The
resolved target must **EQUAL** the world. Containment is not enough — a subdirectory's ancestor chain reaches
outside the world, and a sibling world is a disclosed residual that containment would admit. A reparse point is
refused rather than followed, because a link can be re-pointed after any check.

The refusal is observable: the parent's tool result carries a `ToolCallError` naming the guard, and no child
session exists.

---

## 3. RE-B — the boundary is now a precondition

`installWorkerReadBoundary` reported `cwdFenceInstalled` and `delegationFenceInstalled` as independent fields,
and a caller could ignore them: a missing basis fence read as "the read guard is installed, so this is safe".
That inference is false under DSH 0.2.1, where the executor resolves against a mutable basis.

`admitWorker` now requires all of:

```
ReadGuardInstalled && CwdFenceInstalled && DelegationFenceInstalled
  && GlobalGuardScope && CapabilitySurfaceAdmitted
```

A missing installation report **refuses** rather than being treated as satisfied, and the reason names exactly
which guarantees are absent. Eight controls cover the full admission, each missing fence, a worker-scope guard,
an unclassified capability, re-exposed `working_directory`, and the per-guarantee reporting.

---

## 4. RE-C — the Win32 seam

### The ABI evidence

| Property | 0.2.0-rc.2 | 0.2.1-rc.2 |
| --- | --- | --- |
| Source | registry tarball, `sha512` verified at fetch | installed profile modules |
| Files | 13 | 13 |
| Common files | 13 | 13 |
| Executable files (`lib/**`) | 8 | 8 |
| Byte-different files | — | `README.md`, `README.zh.md`, `README.i18n.yaml`, `package.json` |
| **Executable files differing** | — | **none** |
| Export statement | identical | identical |
| Exports | 21, including `extendWin32ProcessBindings` | 21, identical |
| `koffi` declared | 3.1.1 | 3.1.1 |

The pin moved to `0.2.1-rc.2` **as a consequence** of this evidence and of the repair below — not to silence
`HR-27`. The earlier qualification is retained as `previouslyQualifiedVersion`.

### The defect the requalification found

`readMandatoryLabel` returned `ok: true` with `label: { present: false }` when `GetNamedSecurityInfoW` failed.
`ensureRoot` selects its write path on `existing.ok`, so an **unreadable** descriptor was treated as **no label**;
`planLabel` then computed the new policy mask from `existingMask = 0`, silently discarding every policy bit the
object actually carried. The function's own doc comment claimed the two facts were never collapsed — the code
did collapse them. `parseLabelAcl` had the same shape: an unparseable ACL degraded to `present:false`.

The repair: `ok: false` for both, and `ensureRoot`, `verifyTree` and `snapshotLabels` all treat it as UNKNOWN.
`present: false` now means exactly one thing: the descriptor was read and carried no label.

Six fault-injection controls exercise it through a **stub binding table** that returns a chosen failure code and
records every call. The decisive assertion is that `setNamedSecurityInfoW` is **never called** — no descriptor
write is attempted on the basis of an unread state.

### Conformance

| Suite | Checks | Failed | Limits |
| --- | --- | --- | --- |
| R1-HR | 47 | **0** | HR-17, HR-39b, HR-33 (disclosed) |
| R1-HC | 27 | **0** | HC-27 (disclosed) |

`HR-25`, `HR-26` and `HR-27` all pass against `0.2.1-rc.2`.

---

## 5. RE-D — the execution chain

Closure gate: **53/53 gates, exit 0, `CLOSURE_ESTABLISHED`** under Node v24.22.0.

Per-arm receipts are now derived by the gate from each arm's own payload:

| Field | CONTROL | TREATMENT |
| --- | --- | --- |
| Trial id | distinct | distinct |
| Frozen truth digest | per-trial SHA-256 | per-trial SHA-256 |
| Assigned arm / presentation | CONTROL | TREATMENT |
| Section bytes / digest | present | present |
| Session id | `worker-d8ada45c-…` | `worker-745a94ec-…` |
| Worker outcome | reported | reported |
| Capability admission | passed | passed |
| Execution stages | all seven true | all seven true |
| Assistant messages | 2 (seq 22) | 2 (seq 22) |
| Oracle | `p2e1rd-internal-citation-closed-1`, ok | ok |
| Cleanup / dependency root | ok / preserved | ok / preserved |
| Model calls | 0 | 0 |

No message body is stored — the answer is represented by its digest. `cwdBasisPinned` is recorded as
`NOT_SURFACED_BY_WORK_WORKER_PORT` rather than inferred: the worker emits that line to its own stdout, which the
port consumes rather than forwards.

---

## 6. Evidence identity

`evidenceContentDigest: sha256-7e9b6b…` over the digests of all ten artifacts, including the verdicts. The
manifest cannot hash itself or name its own commit; the final HEAD is reported here and in the final report.

### The E1RD identity discrepancy, recorded forward-only

E1RD documentation named `cf01285` as Code Freeze, but `d8cc481` later modified the evidence generator, so the
executed-evidence input differed from the behaviour freeze. E1RD history is not rewritten. This stage separates
five identities so no single SHA means two things: **host behavior**, **assay behavior**, **evidence tool**,
**executed code**, **evidence freeze**.

---

## 7. Regression and exclusions

48/48 focused controls pass (22 pre-tool/boundary, 6 Win32 fault injection, 20 E1RD CWD boundary). Architecture
and public-API checks pass. The historical 192/17 baseline is context, not a target — no failure count was
hard-coded. `test/r3l0ciarlcf_gates.test.ts` remains excluded as known-unsafe against a shared working tree.

---

## 8. Residual risks

- **Metadata disclosure** through non-withdrawn tools was not measured. Directory-existence probing is bounded by
  the same guards but not separately characterised here.
- **A child created legitimately** still runs its own instruction discovery inside the world. That is intended:
  in-world instructions are authorized, and the world's own `AGENTS.md` is delivered (visible in the `world`
  case). What is now refused is any basis outside the world.
- **`workflow` children** inherit the parent's effective directory rather than choosing one; they are covered by
  the basis fence, not by the delegation guard.
- **A `subagent` call with no `cwd`** inherits the parent's effective directory, which the basis fence already
  pins to the world.
- **The Win32 label seam** is qualified by byte-identical executable source plus live conformance on this host.
  A different `dsh-win32-process` release still reports drift rather than being assumed compatible.
- **`CONTROL_BASELINE_TECHNICALLY_READY`** requires a frozen calibration specification and external-model
  authorization, neither of which exists. This stage does not authorize spending money or contacting a provider.

---

## 9. Next-stage decision

RE-A through RE-E qualify, so CONTROL-only stochastic calibration is now technically unblocked **on the host
side**. It still requires, before any run: a frozen experiment specification (arms, trial count, stopping rule,
seeds, adapter identity) and explicit external-model authorization parameters with a cost bound. No stochastic
calibration was run in this stage, and none should begin without those two artifacts.
