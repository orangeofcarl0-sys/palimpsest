# Host-S1RA-E4 — Test Isolation, Runtime rc.3 Adoption and Real Host Integration

**Stage:** Palimpsest Host-S1RA-E4
**Branch:** `host-s1rae4-test-isolation-real-host`
**Parent:** `da568e6b32dff99ed2b6c66c441e3a4e6b7316e4` (E3 Evidence Freeze, tree `39ebccf98ed17d4db1dd0b5c9f9c5d4fd0a8ed1c`)
**Runtime:** `0.2.1-rc.3`, now the qualified pin.

---

## 1. Executive verdict

| Area | Verdict |
|---|---|
| **V1 — Test isolation** | `QUALIFIED` |
| **V2 — Bounded validation** | `QUALIFIED_WITH_REPORTED_FLAKINESS` |
| **V3 — Runtime rc.3 adoption** | `QUALIFIED` |
| **V4 — Real Host delivery** | `QUALIFIED` |
| **V5 — Owned resource lifecycle** | `QUALIFIED` for the selected path, L1 only |
| **V6 — Async two-run smoke** | `QUALIFIED` |
| **V7 — Historical integrity** | `UNCHANGED` |
| **Integrated** | **`HOST_S1RAE4_QUALIFIED_FOR_SELECTED_PATH`** |

This is a narrower qualification than "the Host is secure". It establishes that **a real Worker executes a task and a
normal consumer receives the attributable result, under rc.3, with isolated run-owned resources** — and that the
two-run case overlaps and attributes correctly. It does not establish L2 adversarial isolation, multi-writer safety, or
protection of the real runtime Home.

---

## 2. Git history

| Item | Value |
|---|---|
| Parent | `da568e6` (E3 Evidence Freeze) |
| C1 + C2 + C3 + C4 | `af112bf` — isolation, rc.3 adoption, session-reader compatibility |
| Code Freeze | recorded in §10 |
| Evidence Freeze | recorded in §10 |

The E3 identities were verified rather than assumed: `bf4e8af` is the E3 Code Freeze (tree `b548e7c`), `da568e6` its
Evidence Freeze (tree `39ebccf`), and the diff between them contains only `docs/` and `research-evidence/` — **zero
executable files**.

---

## 3. Actual source changes

### 3.1 `scripts/trajectory_p2e0/owned-root.mjs` (+ `.d.mts`)

**Original.** `allocateOwnedRoot(prefix, runIdentity)` allocated under the module-level `GATE_ROOT`, resolved once at
load from `PALIMPSEST_P2E0_GATE_ROOT` or the user profile. `safeCleanup` re-proved containment against that same
constant.

**New.** `allocateOwnedRoot(prefix, runIdentity, gateRoot = GATE_ROOT)`. The default is unchanged, so **no production
consumer changes behaviour**. A caller that wants a private fixture passes its own parent, and containment is then
re-proved against `owned.gateRoot` — the parent the record was actually allocated under — rather than against an
unrelated constant.

**Why necessary.** Every test allocated in the shared `~/.palimpsest-gates`, which made a suite's observation of that
directory a measurement of other suites' work. See §4.

### 3.2 `test/trajectory_p2e0_test_runtime_safety.test.ts` and `test/trajectory_p2e1_resource_safety.test.ts`

Both allocate through a private `fixtureGateRoot` created inside their existing sandbox, so the sandbox removal
disposes of it. `countGateRoots()` in the p2e1 suite now observes the private root; a new case 36 asserts the fixtures
really are private and that the shared root is untouched by them.

### 3.3 `host/deployment/runtime/win32_label.js`

`qualifiedVersion: '0.2.1-rc.2'` → `'0.2.1-rc.3'`, with `previouslyQualifiedVersion` moved to `'0.2.1-rc.2'` and a new
`firstQualifiedVersion: '0.2.0-rc.2'`. Every integrity check is untouched — see `host-s1rae4-rc3-adoption.md` §2.

### 3.4 `host/deployment/runtime/session_reader.js`

**Original.** `(await import(...dsh-session-persistence-jsonl...)).default`, used at two call sites.

**New.** `resolvePersistencePlugin(base)` prefers `default` when it is a function or an object with `apply`, and
otherwise returns the namespace.

**Why necessary.** rc.3's package exports `apply`/`name`/`Config` and has **no `default`**, so the reader crashed with
`invalid plugin ... received undefined` after the drift refusal was resolved. Keeping `default` first means rc.2
sessions remain readable.

---

## 4. Test isolation

### The original interference

`test/trajectory_p2e1_resource_safety.test.ts` case 35 recorded `readdirSync(GATE_ROOT).length`, ran five
allocate/dispose cycles of its own, and asserted the count was unchanged. `GATE_ROOT` is `~/.palimpsest-gates` —
**the real shared directory** — and `test/trajectory_p2e0_test_runtime_safety.test.ts` allocates and disposes in the
same place.

### The deterministic RED control

`scripts/host_s1rae4/isolation-red-control.mjs` does not race. A child process signals `READY` with nothing allocated;
the observer records the count; the child performs **one** legitimate allocation; the observer records again.

```
observerRecordedBefore: 19
afterExternalAllocation: 20
delta: 1
movedByExternalActor: true
originalAssertionWouldPass: false
gateRootRestored: true (19 -> 19)
```

The assertion fails for a reason the observing test did not cause. That is the defect, reproduced without a race.

### The correction and its control

`scripts/host_s1rae4/isolation-negative-control.mjs` runs three arms in one sequence:

| Arm | Observation |
|---|---|
| 1 — OLD semantics, shared root | 19 → 20, assertion **fails** |
| 2 — NEW semantics, private root | 0 → 0, assertion **passes** |
| 3 — is the interference real? | the shared root **did** move during arm 2's window |

Arm 3 is what makes arm 2 meaningful: without it, arm 2 could pass because nothing interfered. The control holds.

### GREEN

| Check | Result |
|---|---|
| p2e0 alone | pass |
| p2e1 alone | pass |
| Both in parallel, run 1 | **23/23, exit 0** |
| Both in parallel, run 2 | **23/23, exit 0** |
| Both in parallel, run 3 | **23/23, exit 0** |
| Shared gate root before/after all runs | **19 → 19** |

Serial execution was used only as a diagnostic, not as the accepted mode; the parallel runs are the qualification.

---

## 5. Test resource pressure

`scripts/host_s1rae4/resource-budget.mjs` separates two things that E3 conflated:

- **OWNED** — gate-root entries whose marker names this run. Attribution is from the marker, not the name.
- **AMBIENT** — machine-wide counts, labelled as ambient and **never** reported as this run's resource use.

Baseline: gate root 19 entries, 0 owned by the run, 14 without a marker, 5 carrying another run's marker (the
protected `p2b-c3-OWNED-*`). Ambient temp entries: 7334.

**One leak occurred and was reclaimed.** A gate run timed out and left `p2b-c2-79c224`. Its marker named this session's
pid and a generation of 1. The E3 reaper was dry-run first (`would remove: ["p2b-c2-79c224"]`, kept: `[]`), then
applied through the quarantine path. Gate root returned to 19 and all five protected entries remained.

**Attribution of the E3-era symptoms.** The E3 report listed timeouts, `git clone --shared` failures,
`spawnSync git UNKNOWN`, worker-fork collapse and a 26-file failed run. E4 measured the same class and attributed it:
on the **unmodified E3 baseline**, a full-selection run also failed (1 of 279, `ordarium_ledger`, the documented timing
flake), while the same selection on this branch passed **3691/3691 tests** with one teardown error
(`Timeout terminating forks worker`). The failures are different files each time, are timeouts or process-creation
errors rather than assertions, and every failing test passes in isolation. This is **environmental load sensitivity**,
not a product regression and not kernel drift.

---

## 6. Runtime rc.3

Full detail in `docs/engineering/host-s1rae4-rc3-adoption.md`. The essentials:

- the seam resolves at `0.2.1-rc.3`, all six bound symbols are **functions**, `koffi` resolves to `3.1.1` from the
  seam package's own declared graph;
- the label is **written** through the rc.3 seam and reads back as `integrity=Medium`;
- a **real Low-integrity process is refused (`EPERM`)** while an unlabelled control read succeeds — the Mandatory
  Integrity mechanism, distinguished from an incidental ACL effect and from an unapplied label;
- a precondition was **measured rather than assumed**: without an explicit DACL grant the write returns 5, and with one
  it succeeds, so the grant is applied and recorded;
- moving the pin **found a real incompatibility** (`dsh-session-persistence-jsonl` lost its default export) that a
  version-string edit alone would have missed.

---

## 7. Real Host integration

`scripts/trajectory_p2b/level-b-first-party-gate.mjs`, selected because it is the smallest existing path that uses the
real Host, creates a real Worker, executes a deterministic bounded task, delivers through the normal consumer, and
runs entirely inside a run-owned root.

| Requirement | Evidence |
|---|---|
| Worker created | `observedSource: DIRECT_CHILD_IPC_REPORT`, `realFirstPartyDshPathRan: true` |
| Task executed | the shipped capability refusal fired between `agents.create` and `agent.followup` |
| Normal consumer delivery | session identity read through the runtime's own persistence: `worker-192d6632-61dc-4e70-8eaf-20601c5a19df` |
| Invocation attribution | `wpi-f9a1a668-5678-4d2c-a7d5-a81348f4eff6`, `observedState: OBSERVED` |
| No model | `modelCallsMade: 0` |
| Cleanup | `cleaned: true`, `quarantined: true`, identity and marker checks passed |
| Protected resources | gate root 19 → 19 |

**`outcome: PASS`, `qualified: true`.** A preflight pass or a spawned-and-exited process would not have produced an IPC
report from the child carrying its own session identity, and that is the distinction the ruling required.

---

## 8. Async smoke

`scripts/host_s1rae4/two-run-smoke.mjs`. Both runs are launched **before either is awaited**, each in its own child
process with its own private gate root.

| Check | Observation |
|---|---|
| Overlap, computed from the runs' own wall-clock timestamps | **607 ms** |
| Completion order | B finished first (`bWallEnd < aWallEnd`), as designed by giving A a longer hold |
| Attribution | A names A, B names B; distinct roots; distinct payloads |
| Isolation | each root inside its own gate root and **not** inside the other's; both cleaned; both gone |
| Sequential control | the same bodies awaited in turn produce **0 ms** overlap, so the test discriminates |

Verdict `TWO_RUNS_OVERLAPPED_AND_ATTRIBUTED`.

**Scope.** This supports exactly one claim: *two independent, isolated real execution contexts can overlap and deliver
correctly under the tested conditions.* It does not support multi-writer safety, arbitrary shared-resource concurrency,
cross-owner negotiation, or Trajectory causal reconstruction.

**Generation is per-process by design.** Both runs reported generation 1. Requiring them to differ would demand a
global counter — the shared durable state E3 declined to add. What matters is that each record authorises only its own
root, which the distinct roots and disposal receipts establish.

---

## 9. Historical integrity

| Item | Result |
|---|---|
| Protected evidence trees | **64 of 64 unchanged** |
| `research-evidence/host-s1/` vs `c4ea1ab` | empty diff |
| Worktree registrations | 95 before, 95 after |
| Historical `r3lcfsh-worktree-SMlvwB` | present, untouched |
| Gate root | 19 → 19 (one run-created leak reclaimed through the E3 reaper) |
| Five `p2b-c3-OWNED-*` | all intact, never touched |
| Real `~/.dsh` | still a junction to `D:/dsh`; no file written, no label applied |
| Global runtime install | unmodified |

**One thing must be stated plainly.** The real runtime home contains copies of `palimpsest-dsh-host` and
`palimpsest-host-deployment` written at 02:13 by an earlier run, before this stage began. The worker resolves
`palimpsest-host-deployment` to that copy. This stage did **not** modify them — they are protected — and it did not
depend on them being current: the gate installs its own bundle into its test home, and the fence and seam controls were
measured from that test home.

---

## 10. Freeze identities and test evidence

| Check | Result |
|---|---|
| `tsc -b` | exit 0 |
| `module-architecture.mjs --check` | PASS — 0 violations, 9 accepted baseline exceptions |
| `module-architecture.mjs --check-public-api` | PASS — 0 missing / 0 changed / 0 added |
| Full authorized selection | **3691/3691 tests passed**, 278/279 files, exit 1 from one teardown error |
| Baseline comparison | the **unmodified E3 baseline also fails** 1 of 279 on the same selection |

Selection: 396 recursive test files − 39 `r3l0*` − 78 `trajectory_*` = **279 included**. R3 mutation suites were not
run.

Every full-selection run is listed:

| Run | Tree | Tests | Note |
|---|---|---|---|
| 1 | this stage | 3699/3701 | `host_s1r_reparse_boundary` timeout; `lean_work_delegation_transport` timeout waiting for RUNNING |
| 2 | this stage | **3691/3691 passed**, 1 teardown error | `Timeout terminating forks worker` — a child-process exit, not an assertion |
| 3 | **unmodified baseline** | 3690/3691 | `ordarium_ledger` timing flake |

Both failing tests in run 1 pass in isolation (2/2), import nothing this stage changed, and failed with timeouts.

---

## 11. Residual risks

1. **Quarantine TOCTOU is unchanged.** A substitution between the identity re-check and the recursive removal, on a
   name the substituting process must guess, is still open. A rename-back that is itself raced is still open.
2. **L1 only.** Worker and Host run as the same principal with unrestricted same-user permissions. The quarantine name
   is **not** hostile same-user isolation, and no verdict here claims it is.
3. **Module-sharing provenance is structural.** The fingerprint compares paths and sizes, not contents, and the trust
   anchor is the current working tree — not a frozen build artifact and not independent installation provenance.
4. **rc.3 was qualified for the operations exercised**, not for every Win32 path. The ACL signatures were not compared
   at the ABI boundary for untested calls.
5. **The real runtime Home boundary remains unestablished**, exactly as E2 measured. Nothing here upgrades it.
6. **Load sensitivity in the full selection persists**, on both the baseline and this branch.
7. **The stale host bundle in the real runtime home** is a pre-existing condition this stage reported rather than
   modified.

---

## 12. Next-stage recommendation

The vertical slice and the two-run smoke both succeed, so the minimum justified move is toward **two-owner
asynchronous integration and Trajectory causal projection** — specifically: two distinct owners whose runs share an
immutable input, produce separate results, and whose causal relationship the existing Trajectory machinery reconstructs
without a new event platform.

Three narrower items are also justified and independent:

1. Close the quarantine TOCTOU residual with a handle-based stage **only if** it must be closed; it needs a new native
   binding and its own qualification.
2. Convert `test/trajectory_p2e1_resource_safety.test.ts`'s remaining shared-root observation (if any survives) and the
   load-sensitive suites to bounded resource budgets.
3. Decide whether the stale host bundle in the real runtime home should be refreshed by an authorised operator — this
   stage could not, and did not, touch it.

No Agent, Workflow or Trajectory redesign is proposed.
