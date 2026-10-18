# Trajectory-P2-E1RD — DSH Working-Directory Security & Compatibility Qualification

**Stage:** `Trajectory-P2-E1RD`
**Branch:** `trajectory-p2e1rd-dsh-cwd-qualification`
**Parent:** `3eb88dba1420b9d13c32926e0e9c064a8533ae53` (`trajectory-p2e1rc-measurement-integrity`)
**Code Freeze:** `cf0128596547897a60d94afabd036b7d60ac2ae3` (tree `79f9ae2ecfb7942c9074c80087938d96928d21d1`)
**Evidence:** `research-evidence/trajectory-p2e1rd/`

---

## 1. Final verdicts

| Verdict | Result |
| --- | --- |
| `E1RD-A DSH_CWD_SEMANTICS_ADJUDICATED` | **QUALIFIED** |
| `E1RD-B CONFIDENTIAL_WORKER_BOUNDARY_QUALIFIED` | **QUALIFIED** |
| `E1RD-C DSH_RUNTIME_COMPATIBILITY_QUALIFIED` | **NOT ESTABLISHED** |
| `E1RD-D TRAJECTORY_DSH_EXECUTION_REQUALIFIED` | **QUALIFIED** |
| `E1RC_ADMISSION_RESIDUALS_CLOSED` | closed — four corrections, each with a defect statement |
| `CONTROL_BASELINE_TECHNICALLY_READY` | **NOT ESTABLISHED** |

`E1RD-C` is withheld deliberately. The installed `@deepseek-ai/dsh-win32-process` is `0.2.1-rc.2`; the
read-boundary contract is pinned to `0.2.0-rc.2`; R1-HR reports that drift as **HR-27 FAIL**. §9 of the ruling
forbids updating the pin to silence drift, so the drift is reported rather than absorbed. The CWD work does not
requalify the Win32 label seam, and this stage does not claim that it does.

The seven stronger verdicts (`TRAJECTORY_FIRST_PARTY_ORIGIN_SETTLEMENT_QUALIFIED`, `BENCHMARK_QUALIFIED`,
`MODEL_CONSUMED_CAPSULE`, `UTILITY_POSITIVE_SIGNAL`, `UTILITY_NEGATIVE_SIGNAL`, `WORK_UTILITY_IMPROVED`,
`AGENT_COOPERATION_IMPROVED`) remain `NOT_ESTABLISHED`. No stochastic calibration was run.

---

## 2. The contract delta (S1)

Read from two real package trees: the installed `0.2.1-rc.2` modules, and `0.2.0-rc.2` tarballs fetched from the
registry and verified against their published `sha512` integrity hashes.

| | `0.2.0-rc.2` | `0.2.1-rc.2` |
| --- | --- | --- |
| Filesystem basis | `exec.agent?.session.header.cwd` | `ctx.workingDirectory.ensure(agent, signal)` |
| Mutability | immutable Session Header | mutable Session projection |
| `dsh-working-directory` | **does not exist** | ships, with `working-directory/change` events and a restore path |
| `dsh-tool-working-directory` | **does not exist** | ships `working_directory { cd?: string }` returning the absolute cwd |
| Other consumers | — | `bash`, `bash_persistent`, `fs-search`, `subagent`, `workflow-ptc`, `agent-instructions`, the `run_code` transport |

The version comparison is not a string comparison: `dsh-working-directory` and `dsh-tool-working-directory`
have **no release at all** at `0.2.0-rc.2`. The capability is new, and so is the indirection.

---

## 3. The threat model (S2)

The invariant is `RealTarget(GuardCwd, modelPath) == RealTarget(EffectiveSessionCwd, modelPath)`.

The guard resolved against a **fixed** basis (`config.cwd ?? config.world`); the executor resolved against a
**mutable** one. A relative path the guard approved against the world could therefore be opened elsewhere. The
kernel label does not close this: tool calls execute in the Medium-integrity host, where a mandatory label cannot
bind — the same reason the trusted-code guard exists at all.

**Removing the model-facing tool is provably insufficient.** `subagent` accepts a model-supplied `cwd` and calls
`workingDirectory.set(child, create.cwd)`, so a delegated scope can move its basis with no access to
`working_directory`. `workflow` children inherit the parent's effective directory, so they follow whatever the
parent's basis became.

Classification of each finding, kept distinct as §5.1 requires:

- **source-demonstrated hazard** — the two bases can diverge (13/13 source findings);
- **deterministic unit-test reproduction** — 20 dynamic controls, all executed;
- **real first-party DSH reproduction** — the closure gate drives real DSH turns in both arms;
- **security violation observed** — none. No test-owned canary was disclosed;
- **risk not established** — metadata disclosure through directory-existence probing was not measured.

---

## 4. The compatibility decision (S3)

**Option A, extended.** The least-powerful strategy that actually restores the invariant:

1. **Withdraw** `working_directory` from the worker's actual registry, before the capability gate enumerates the
   surface.
2. **Do not classify it.** The name stays absent from `CAPABILITY_CLASSES`, so a future composition that
   re-exposes it is refused as `UNCLASSIFIED` — the same refusal E1RC observed. Withdrawal is the policy; the
   absence is the fail-closed backstop.
3. **Pin the basis** with a third layer, `cwd_fence.js`, which refuses any call whose effective Session directory
   is not the execution world.

Equality, not containment: a sibling attempt world is a disclosed residual, so a containment test would admit a
basis that moved there.

Option B (isolated `0.2.0-rc.2`) was rejected as the primary path because it abandons the installed release
rather than making it safe, and because the drift that E1RD-C records would remain. Option C (support mutable
CWD) was rejected because it requires tracking a moving basis at dispatch time, which reintroduces exactly the
check/use gap the guard closed structurally for reparse points.

### The enumeration defect found while implementing

The gate originally enumerated `tools.schemas()` with **no scope**, which returns the **global** view. A scoped
`restrict()` filters only what that scope *inherits*; it never edits the global layer. The gate therefore reported
a surface the restriction could not change, and a withdrawal looked applied while the model still saw the tool.
Measured: the worker receipt showed `withdrawnTools: []` and the gate still refused on `working_directory`.

The fix enumerates `tools.schemas(agent)` — the same projection the model-facing request uses. This is a
production behavioural correction, not a cosmetic one, and it is covered by the controls.

---

## 5. Dynamic security evidence (F)

20 controls in `test/trajectory_p2e1rd_cwd_boundary.test.ts`, all passing, all exercising the shipped functions:

- equal basis admitted; divergence outside the world, into the protected root, and into a **sibling world** refused;
- refusal is per-call and re-admits when the basis is restored;
- a divergence occurring **after** installation is still refused (the basis is not captured once);
- missing, empty, throwing or unreadable service fails closed, with the documented exception where the process
  directory is the world;
- the two path-independent worker-private tools remain usable under a diverged basis — the exemption is exactly
  two names;
- case-folded comparison on win32, and a prefix that is not the world is not treated as equal;
- withdrawal removes the capability; an absent surface yields an empty filter (`restrict()` refuses unknown
  names); re-exposure still refuses the worker; the post-withdrawal surface classifies;
- **no regression**: the read guard still allows the world, still refuses the canary, `..`, and ancestor-rooted
  searches, and the two layers compose (the read guard allows a relative path the basis fence refuses).

R1-HC: **26 PASS, 1 disclosed LIMIT, 0 FAIL.** R1-HR: 43 PASS, 3 LIMIT, **1 FAIL (HR-27, pre-existing)**.
HR-27 was confirmed to fail identically at the parent commit by running the suite against the parent tree, so it
is not a regression introduced here.

No test-owned canary was disclosed. No personal path, session or credential was read.

---

## 6. Code changes (G)

| File | Change |
| --- | --- |
| `host/deployment/runtime/cwd_fence.js` | **new.** The basis fence. Resolves the working-directory service per call, compares the effective directory to the world, refuses any divergence. |
| `host/deployment/runtime/capability_classes.js` | `WITHDRAWN_CAPABILITIES` + `withdrawalFilter()`. `working_directory` is deliberately **not** classified. |
| `host/deployment/runtime/worker_fence.js` | Installs the basis fence in the same global scope as the read guard; reports `cwdFenceInstalled` and `cwdBasisPinned` separately. |
| `host/dsh/lib/runner.js` | Enumerates `schemas(agent)`; withdraws before the gate; records `withdrawnTools` in the receipt. |
| `scripts/trajectory_p2e1/experimental-truth.mjs` | S5.1: `SCORABLE_PAGE_COVERAGE`; refuses UNKNOWN/NOT_APPLICABLE; exhaustive derivation. |
| `scripts/trajectory_p2e1/source-aware-oracle.mjs` | S5.2: `internalOnlyReferences` in the pass rule; version bumped. |
| `scripts/trajectory_p2e1/calibrate.mjs` | Version pins. |
| `scripts/trajectory_p2e1rc/closure-gate.mjs` | S5.3: numeric runtime gate; DSH release identity. |
| `scripts/trajectory_p2e1r/assay-harness.mjs` | S5.4: seven execution stages; worker completion in the integrity gate. |
| `scripts/trajectory_p2e1r/benchmark-answer-adapter.mjs` | Reports the worker's own outcome through its result tool, as a real PTC worker does. |
| `scripts/trajectory_p2e1rd/*` | Source map, worker probe, evidence generator. |
| `test/trajectory_p2e1rd_cwd_boundary.test.ts` | **new.** 20 dynamic controls. |

Zero changes to `src/`. Zero changes to canonical Work, settlement, Trajectory semantics, or public API.

---

## 7. Runtime and DSH execution (H)

- Node **v24.22.0** (isolated, downloaded from nodejs.org, verified against `SHASUMS256.txt`, extracted outside the
  repository; the user's global Node 24.14.1 was not modified). Declared minimum: `>=24.15.0`.
- DSH `0.2.1-rc.2`; read-boundary qualified version `0.2.0-rc.2`; `drifted: true`.
- Closure gate: **53 gates, 0 failed, exit 0, `CLOSURE_ESTABLISHED`**.

Both arms completed a real first-party DSH turn. The stages are recorded separately, because they are different
facts:

| Stage | CONTROL | TREATMENT |
| --- | --- | --- |
| Session created | yes | yes |
| Worker start attempted | yes | yes |
| Capability admission passed | yes | yes |
| Worker completed (reported an outcome) | yes | yes |
| Assistant message persisted | yes | yes |
| Answer extracted from DSH persistence | yes | yes |
| Official oracle evaluated the extracted output | yes | yes |

The answer is the last assistant text, read back through official DSH session persistence by exact SessionId and
scored by the single official source-aware oracle against a per-run frozen truth. `modelCallsMade: 0`,
`externalModelRequestOccurred: false`, `stochasticTrialOccurred: false`, `MODEL_CONSUMED_CAPSULE: NOT_ESTABLISHED`
(the adapter is seeded with the answer; it never reads the Capsule).

---

## 8. Regression and historical preservation (I)

- 52/52 protected research-evidence trees byte-identical, verified against real Git tree OIDs.
- No E1, E1R or E1RC historical evidence was rewritten.
- Architecture check: PASS, 0 violations. Public API check: PASS, 0 missing, 0 changed, 0 added.
- The E1RC scoped regression baseline (192 tests, 17 pre-existing failures) is unchanged by this stage; the
  focused suites run here are 84 tests, all passing.
- `test/r3l0ciarlcf_gates.test.ts` remains excluded: it is known unsafe against a shared working tree.

---

## 9. Residual risks (J)

- **Win32 seam drift (open).** `dsh-win32-process@0.2.1-rc.2` is not the qualified `0.2.0-rc.2`. HR-27 reports it.
  This is the reason E1RD-C is withheld. Requalifying that seam is a separate bounded task.
- **Metadata disclosure (not measured).** A refused basis cannot be probed through content tools, but
  directory-existence observation through a `working_directory` call that was *withdrawn* is simply unreachable;
  what remains unmeasured is metadata disclosure through tools that were never withdrawn.
- **Delegation cwd.** A `subagent { cwd }` child is refused at its first path-bearing call, not at creation. The
  child session exists and its first call fails. That is observable but not silent.
- **Coverage limitation.** Family A admits only `FULL`/`PARTIAL` page coverage. A four-state contract is
  unimplemented by design, not by omission.
- **Test coverage limitation.** The controls use a stand-in for the DSH working-directory service; the real
  service is exercised end-to-end only through the closure gate's DSH turns.

---

## 10. Next-stage recommendation (K)

**Trajectory may not proceed to CONTROL-only stochastic calibration yet.** The minimum blocker is
`E1RD-C`: the Win32 read-boundary seam must be requalified against the installed release, or the deployment must
be pinned to the exact qualified release, with conformance evidence. Until that is resolved, a runtime mismatch
prevents full qualification regardless of how clean the CWD work is.

If that is resolved, calibration additionally requires a frozen experiment specification (arms, trial count,
stopping rule, seeds) and explicit external-model authorization parameters. Neither was produced here, and the
calibration was not started.
