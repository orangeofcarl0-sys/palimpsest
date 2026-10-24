# Host-S1RA-E2 — Code Freeze Integrity Audit and Qualified-Runtime Replay

**Stage:** Palimpsest Host-S1RA-E2
**Branch:** `host-s1rae2-freeze-audit`
**Parent:** `309be74061b04babf5452f727391d89045e6f544`
**Code Freeze:** `85161eee5c5a25011a9a1c8747bb53ae57d1953f` (tree `b76635da37e544ea7f5d065d094703243a4e2dbd`)
**Runtime:** installed `0.2.1-rc.3`; fence qualified against `0.2.1-rc.2`

This report separates what was measured from what was inferred. No integrated qualification is claimed.

---

## A. Baseline and Git history

### Verified baseline

| Item | Value |
|---|---|
| Branch | `host-s1ra-environment-evidence-reconciliation` → this stage `host-s1rae2-freeze-audit` |
| HEAD at start | `309be74061b04babf5452f727391d89045e6f544` |
| Tree at start | `c6e352c4dfa80947063f0f0cecea5559b5e1cf40` |
| Remote tracking | equal to local (`0 0` ahead/behind) |
| Working tree | clean (0 entries) |
| Stashes | 0 |
| Worktrees | 95 registered, 83 prunable, 2 locked |

### Ancestry, inspected rather than assumed

The ruling warned that `9df766f`, `ae8ff33` and `309be74` should not be assumed to form one line. They do:

- `9df766f` **is** an ancestor of HEAD, 4 commits before `ae8ff33`.
- `ae8ff33` **is** an ancestor of HEAD.
- **Zero merge commits** in `9df766f..HEAD`; the path is linear.

### Full commit chain

| Commit | Executable? | Subject |
|---|---|---|
| `95e28fd` | yes | baseline and twelve falsifiers |
| `3dc4f13` | yes | destination admission, ownership revalidation, runtime-home resolver |
| `0a67a26` | **no** | restore Host-S1 historical evidence |
| `5a84d2a` | yes | stop the generator mutating shared Git state |
| `a161ddd` | yes | runtime Home adjudication |
| `0ef556e` | yes | runtime home under every accepted name |
| `309be74` | **no** | report the kernel-drift blocker |
| `15a1961` | yes | C1: the corrections |
| `85161ee` | yes | C2: the evidence producers — **this stage's freeze** |

### Was the prior Code Freeze superseded?

**No — it was correctly bound.** The ruling asked specifically whether five later edits landed after the freeze.
All five are *inside* `0ef556e`:

- `linkModuleGraph` installed-Host-Bundle handling — in `0ef556e`
- `allocateOwnedRoot` compatibility — in `0ef556e`
- `runtimeHomePath` / `applyRuntimeHome` — in `0ef556e`
- child-process environment propagation — in `0ef556e`
- generated worker source / `workerEnv` scope — in `0ef556e`

Verified three ways: the recorded tree `c7f42c8` matches `git rev-parse 0ef556e^{tree}` exactly; the diff of
`scripts`, `test` and `host` between `0ef556e` and `309be74` is **empty**; and `309be74` touches no executable
file at all.

The prior freeze is nonetheless **superseded by this stage's own changes**, which is why `15a1961` is the freeze
every result below is bound to.

---

## B. Code review

### 4A — Module-sharing admission

**Finding: a third, unconverted implementation existed.**

`scripts/trajectory_p2a/level-c-first-party-gate.mjs` still carried the original defective helper — occupancy by
`existsSync`, completion by `cpSync({ dereference: true })`. Every other gate was converted in the prior stage;
this one was missed, and `test/trajectory_p2a_first_party_gate.test.ts` executes it.

The same file also used a **fixed** rig path (`<gate-root>/p2a-level-c`) deleted unconditionally at startup, with
**no cleanup at the end**. That is the 14 MiB directory found in the gate root during the Host-S1RA audit.

Corrected:

- delegates to `module-sharing.mjs`;
- allocates a unique owned root with a marker;
- disposes through the lifetime helper and records the outcome in its own result.

**Finding: caller-declared entries needed a three-way distinction.**

The host bundle packages exist in the shared runtime tree *and* are installed into the test home, so a declared
name can appear in both. Admission now distinguishes:

| State at a declared name | Outcome |
|---|---|
| `ABSENT` | falls through to ordinary linking |
| plain `DIRECTORY` | accepted, recorded as `providedByCaller` |
| `FILE` or reparse point | **refused** |
| neither declared nor in source | **refused** as `UNEXPECTED_ENTRY_NOT_IN_SOURCE` |

A pre-existing foreign directory is therefore **not** accepted merely because it shares a Host Bundle name: it is
accepted only when the caller declared that name *and* the object is a plain directory the caller's own installer
produces. A reparse point at a declared name is still refused, because a link there would be a write-through risk.

**Remaining limit:** `scripts/trajectory_p2e0/dsh-test-home.mjs` still decides occupancy with `existsSync`. Its
copy path is preflighted, verified and reached only on junction failure, so the exposure is much narrower than the
p2a gate's was, but the occupancy test itself was not converted.

### 4B — Owned-resource lifecycle

Measured on synthetic trees only (`scripts/host_s1ra/audit-owned-resource-toctou.mjs`):

| Arm | Result |
|---|---|
| Untouched allocated root | admitted; `dev/ino` match |
| **Swap after proof, before delete** | **the swapped-in directory IS deleted** — `TOCTOU_WINDOW_IS_REAL` |
| Marker removed | **treated as a pass**; falls back to captured identity |
| Marker names a *different* root | **accepted** — `runId` is checked, `ownedRoot` is not |
| Identity strength | `dev/ino` **are usable** here, so the comparison is strong, not weak |

These are three genuine gaps. They are bounded — this is a test-harness helper, not a product boundary — but they
are reported rather than waived. The reaper *does* check `ownedRoot`; only `revalidateOwnership` does not.

**No fix is proposed here**: changing deletion semantics inside an audit stage would itself be an executable
change requiring its own freeze, and the ruling asks for the audit.

### 4C — Runtime Home propagation, byte level

Audited 947 source files by **integer code point**, never by rendered text. Result:

- The fence reads a **8-code-point** name.
- The resolver accepts that name **and** a **12-code-point** one, and sets both.
- They are `runtime_HOME` (8) and `runtime_HOME` (12) — genuinely different identifiers that no rendered view can
  distinguish. My own earlier description of this as a "first code point" difference was **wrong**: they differ at
  six positions. Corrected here.
- **Zero** first-code-point collisions remain.
- 26 child-environment sites; the one in `level-b-first-party-gate` uses the helper that sets every name.

**Finding: three of this project's own audit scripts read only the 12-code-point name**, which the fence never
reads. `dependency-manifest`, `measure-environment` and `reproduce-environment-defects` all silently fell back to
`~/.dsh`. They happened to resolve to the same directory, so the recorded values were right — but for the wrong
reason. All three now use the shared resolver.

### 4D — Generator safety

Sound, and verified by absence:

- no `git worktree prune`;
- no `worktree add -f`;
- unique per-run worktree path;
- removal gated on `registeredByThisRun`;
- cleanup recorded in the identity artifact, and a failure cannot read as success.

The `rmSync` fallback after `git worktree remove` fails is scoped to the worktree this run registered.

---

## C. Test evidence

### Exact selection

```
396 recursive test files
 −39  test/**/r3l0*.test.ts        (forbidden by the stage ruling)
 −78  test/**/trajectory_*.test.ts (live gates; refuse on kernel drift)
=279 included
```

An earlier count of 258 in this stage came from a **non-recursive** listing and is corrected in the evidence.

### Authoritative results at Code Freeze `85161ee`

| Check | Result |
|---|---|
| `tsc -b` | exit 0 |
| `module-architecture.mjs --check` | PASS, 0 violations, 9 accepted baseline exceptions |
| `module-architecture.mjs --check-public-api` | PASS, 0 missing / changed / added |
| Non-gate selection | **1439/1439 suites, 3690/3690 tests, exit 0** |
| Tree after the run | unchanged (`git status` empty) |

The exit code was captured **from the vitest process**, never from a pipeline consumer.

### A previously reported result that did not hold

The prior stage reported 1439/1439 as a stable result. **It is not.** This stage's first re-run produced
**4 failed suites and 2 failed tests**. The cause was found and fixed:

`test/paths.test.ts` captured the runtime-home variable **once at module load**. Under vitest's parallel file
execution several suites share a worker, so the captured value could be `undefined` while an earlier suite in the
same worker had set it. Its `afterEach` then deleted a variable it never owned, and
`host_s1r_reparse_boundary` case 13 — which reads that variable to measure the real dependency layout — took its
`LIMIT` branch.

Signature that identified it: failed in a full run, **passed alone**, **passed on re-run**.

Fixed by taking the snapshot in `beforeEach`. After the fix the reparse case is stable across three consecutive
full-selection runs.

### Residual flake, attributed

`test/ordarium_ledger.test.ts` asserts `elapsed >= 200ms` against a ~300 ms lock release. It passes **5 of 5 in
isolation** and failed once under full-suite load. This is a pre-existing timing sensitivity, unrelated to this
stage's changes, and it is not described as kernel drift.

### Why the live gates did not run

Not for kernel drift *in this stage* — they were never invoked. §7 permits replay only after §6 establishes a
safe route, and §6 did not. Invoking them would have measured an unqualified runtime.

---

## D. Runtime adjudication

### Contract, read from source

```js
qualifiedVersion: '0.2.1-rc.2'
previouslyQualifiedVersion: '0.2.0-rc.2'
FFI_RUNTIME_QUALIFIED = '3.1.1'
```

### Discovery, read-only

| Candidate | Version | Required? |
|---|---|---|
| `.runtimes/dsh-020-win32/pkg` | `0.2.0-rc.2` | no — two releases back |
| `dsh-meld/node_modules/.../dsh-win32-process` | `0.2.1-alpha.2` | no — different release line |
| npm global tree | `0.2.1-rc.3` | no — the installed one |

Searched: the repository runtimes directory, the dsh-meld checkout, the npm global tree, the npm cache index, and
the pnpm store. **No artifact at `0.2.1-rc.2` exists.** A directory merely *named* that version was never accepted
as evidence.

### Enforcement

```js
if (kernel.contract?.drifted === true) {
  refuse('kernel-drift', `... resolved ${...} against qualified ${...}`);
}
```

Unconditional. No environment override exists, and adding one is forbidden.

### Isolation feasibility

`koffi` matches at `3.1.1` and all six seam symbols the fence binds are present and functions on rc.3 — measured
by importing the installed package directly. That establishes **symbol compatibility only**. It does not
establish ABI behaviour, which is precisely what the pin exists to catch.

**Verdict: `BLOCKED_QUALIFIED_RUNTIME_UNAVAILABLE`.** No Live Gate was invoked.

---

## E. Security and asset preservation

### Historical evidence

| File | Authoritative blob | Current | Match |
|---|---|---|---|
| `host-s1/baseline-and-falsifiers.json` | `1209f76cb9a86147ad9b70df7340b602174dca2e` | same | yes |
| `host-s1/git-and-evidence-identity.json` | `a553c1c1fa637d164dd4c40151651d8c163a36e1` | same | yes |

`research-evidence/host-s1/` has an **empty diff** against `c4ea1ab`. All six misplaced S1R artifacts are
preserved byte-identically (`R100`) under `host-s1r/earlier-execution/`.

### Protected trees

`ALL_PROTECTED_TREES_UNCHANGED` — 52 of 52.

### Dependency invariants

**6 of 7 identical.** The seventh differs by exactly one entry: `node_modules/.cache/r3l0c-fixtures/h0.mjs`
(4 KB, gitignored). Its producer is identified — `test/r3l0c_contract.test.ts` writes it deliberately so a
concurrent temp-hygiene sweep cannot delete a live fixture. It is a **test byproduct, not a dependency mutation**,
and it is named here rather than folded into a "7 of 7" claim.

### Worktrees

95 registered at baseline, 95 after this stage's work. One unprunable registration
(`r3lcfsh-worktree-SMlvwB`, HEAD `a161ddd`) was created by the R3 suites during the prior stage's full-suite run
and carries a deliberately mismatched marker. It is **reported, not removed** — pruning is a mutation of shared
Git administrative state, and the ruling forbids it without fresh authorization.

### Real Runtime Home boundary

`REAL_runtime_HOME_CONTENT_BOUNDARY_NOT_ESTABLISHED`. `~/.dsh` is a junction to `D:/dsh`; neither object carries
an observable Mandatory Label; 98 of 98 dependency junctions resolve outside the examined target;
`verifyTree.admissionEligible` is false with 234 unqualified external links. **Not upgraded by anything in this
stage** — no isolated gate passed, and none ran.

---

## F. Final verdict

| Area | Verdict |
|---|---|
| Code Freeze integrity | `CODE_FREEZE_INTEGRITY_VERIFIED` |
| Historical evidence | `HISTORICAL_EVIDENCE_IMMUTABLE` |
| Module-sharing admission | `MODULE_SHARING_ADMISSION_QUALIFIED_WITH_LIMITS` |
| Owned-resource lifecycle | `OWNED_RESOURCE_LIFECYCLE_QUALIFIED_WITH_MEASURED_GAPS` |
| Runtime Home propagation | `RUNTIME_HOME_PROPAGATION_QUALIFIED` |
| Generator safety | `GENERATOR_WORKTREE_SAFETY_QUALIFIED` |
| Test evidence | `TEST_EVIDENCE_RECONCILED` |
| Isolated qualified replay | `BLOCKED_QUALIFIED_RUNTIME_UNAVAILABLE` |
| Real runtime Home boundary | `REAL_runtime_HOME_CONTENT_BOUNDARY_NOT_ESTABLISHED` |
| **Integrated** | **`HOST_S1RAE2_NOT_QUALIFIED`** |

The integrated verdict is withheld because **no required Live Gate executed**. The audit is complete and the
non-gate checks pass against a verified freeze, but a blocked qualification is not a qualification.

---

## G. Next-stage recommendation

**One action: restore a runtime at `0.2.1-rc.2`, or perform a fresh first-party qualification of the fence against
`0.2.1-rc.3` and move the pin in its own bounded stage.** See
`docs/engineering/host-s1rae2-rc3-requalification-plan.md`.

That plan exists because the second option is the one that does not depend on retrieving an artifact that is not
on this machine. It specifies the synthetic controls, the affected Live Gates, the freeze requirements, and the
stop conditions — and it changes no pin.

Two secondary items, both already measured and neither urgent:

1. The three owned-resource gaps (§4B) — worth a bounded fix in a stage whose purpose is that fix, since changing
   deletion semantics here would itself invalidate this freeze.
2. `dsh-test-home.mjs`'s remaining `existsSync` occupancy test (§4A).

No broader architecture work is proposed. The single blocker is the runtime version, and everything else is
bounded.
