# Palimpsest-CI1 — E4 Evidence Closure (C0)

**Stage:** Palimpsest-CI1 — Two-Owner Causal Integration
**Branch:** `palimpsest-ci1-two-owner-causal-integration`
**Parent:** `95ce9b843948085f7a02fa86f62e867300440fc1` (E4 Evidence Freeze, tree `954a6be45d10e866f8f1a36d4ca69448e1eb9127`)
**Runtime:** `0.2.1-rc.3` (unchanged)
**Producer:** `scripts/ci1/close-e4-evidence.mjs` → `research-evidence/ci1/e4-closure.json`

C0 is a bounded integrity gate. It closes the four evidence questions E4 left open. It is not a new Host
security project, and nothing here reopens the runtime-version decision.

---

## 1. Baseline verified before anything was written

| Item | Observed | E4 reported | Agrees |
|---|---|---|---|
| Branch | `host-s1rae4-test-isolation-real-host` | same | yes |
| HEAD | `95ce9b843948085f7a02fa86f62e867300440fc1` | `95ce9b8` | yes |
| HEAD tree | `954a6be45d10e866f8f1a36d4ca69448e1eb9127` | `954a6be` | yes |
| Code Freeze | `05aa9d2250906b3a70fabd38a1fe180becdbd698`, tree `cfcaaf75ca2c0e1bec02a58910f737716f875be7` | `05aa9d2` / `cfcaaf7` | yes |
| Working tree | clean (`git status --porcelain -uall` empty) | — | — |
| Stash | empty | — | — |
| `git diff --check` | exit 0 | — | — |
| Registered worktrees | 95 | ~95 | yes |
| Protected evidence trees | 65 | 65 | yes |
| Shared gate root | 19 entries, all five `p2b-c3-OWNED-*` present | 19 | yes |
| `~/.dsh` | symlink → `/d/dsh` | junction | target agrees |
| Local vs remote | both `95ce9b8` | pushed | yes |

The Code-Freeze-to-Evidence-Freeze diff contains **two added JSON files and zero executable changes**, which
matches what E4 claimed.

**Two baseline observations that are recorded rather than repaired.**

1. **A stray 0-byte file named `0` exists at the repository root and is tracked.** It entered the repository in
   the E4 Code Freeze commit `05aa9d2` itself — `git log --follow -- 0` returns that commit and no earlier one, and
   it is absent from `af112bf`. It is an artefact of a shell redirection during that stage, not part of the work.
   This stage does not delete it: removing it would change the frozen Code Freeze tree, and the ruling forbids
   mutating the frozen production tree. It is reported so a later stage can decide, with the freeze consequences
   understood.
2. **The E4 evidence files predate the Code Freeze commit by about 50 seconds** (mtimes 20:06, commit 20:07). That
   is consistent with generating evidence, then committing — not with regenerating after freezing. It is relevant
   only to C0-D, which treats it as a fact to be checked rather than assumed benign.

---

## 2. C0-A — Test count reconciliation

### The question

E3 recorded **279 files, 3701 tests**. E4 recorded **279 files, 3691 tests**. Both claim the same selection.

### The method

The count is not compared between two reports. The **frozen tree is enumerated** with `vitest list`, which
imports each test file, runs its `describe`/`it` registration, and prints the collected names — **without
executing any test body**. No `beforeAll`, no fixture, no worktree, no database. The total is therefore a property
of the code, not of a run.

The selection formula is re-derived rather than trusted:

```
396 recursive test files − 39 r3l0* − 78 trajectory_* = 279 included
```

`formulaHolds: true`. The working tree's `test/` subtree is byte-identical to the E4 Evidence Freeze's
(`workingTreeTestSubtreeMatchesE4EvidenceFreeze: true`), so the enumeration describes the frozen code.

### The result

| Observation | Value |
|---|---|
| Collected tests in the frozen 279-file selection | **3701** |
| Files contributing tests | **279** |
| Matches E3's figure | **yes** |
| Matches E4's figure | **no** |
| Skip / todo / only / skipIf constructs anywhere in the selection | **0 files** |

**3701 is the frozen tree's collection count.** Therefore 3691 is not a property of the code. It is a property of
that run.

### The mechanism

`3701 − 3691 = 10`, and E4's own table records that the 3691 run collected **278 of 279 files**. Ten tests is
exactly one small file's worth, not ten tests removed from ten places. The producer lists every file whose
collection count equals the delta — sixteen candidates — so the candidate set is explicit rather than narrated.

The two test files that changed between the E3 and E4 freezes are `test/trajectory_p2e0_test_runtime_safety.test.ts`
and `test/trajectory_p2e1_resource_safety.test.ts`. Both are **`trajectory_*` files, which the selection excludes**,
so they cannot explain a difference inside the selection.

### What is established, and what is not

**Established:** the frozen tree contains 3701 tests; the 3691 run omitted one 10-test file; no tests were deleted,
skipped or todo'd; the difference is a collection difference, not a code difference.

**Not established, and stated as such:** **which** file did not contribute. No per-file manifest was preserved,
and this stage will not pick the nearest 10-test file and present it as the answer. `specificFileRecovered: false`.

---

## 3. C0-B — The non-gate runner Exit 1

### The three claims, separated

E4 reported three things at once. They are different claims and are adjudicated separately.

| Claim | Adjudication |
|---|---|
| All 3691 assertions passed | Recorded. No assertion failure appears in the evidence. |
| The runner exited 1 | Recorded. This is a **failure of the exit-status contract**. |
| The reported cause was `Timeout terminating forks worker` | Recorded. The cause is **process teardown**, not a test. |

### The adjudication

The exit status belongs to the **runner's process tree**. Assertions belong to the **tests**. A teardown timeout
is neither an assertion failure nor a product defect — and it is **also not a pass**.

`reclassifiedAsPass: false`. A later green run does not erase it, and green assertions do not make a nonzero exit
into a success. That substitution is exactly what the ruling forbids.

### What the selection shows about the mechanism

| Observation | Value |
|---|---|
| Files in the selection that create child processes | **65** |
| Constructs involved | `execFileSync`, `spawnSync`, `execSync`, `spawn`, `fork` |
| Pool | forks (vitest default) |
| Hook budget | 30 s (raised in config, with the reason recorded) |
| Global temp sweep | present (`test/global_setup.ts`) |

A forks-pool worker that fails to terminate is a child that outlived its test: an orphaned subprocess, an open
handle, a spawned `git`. The selection has 65 such files, which makes the class of failure plausible — but
plausibility is not attribution.

### What is established, and what is not

**Established:** the exit came from worker teardown; zero assertions failed; zero unhandled errors were reported.

**Not established:** **which** child failed to exit, and whether any child survived the run. E4 did not inventory
surviving processes, and this stage will not claim it did. `survivingChildrenInventoried: false`.

**The qualification limitation is preserved:** this machine does not have a clean full-selection exit 0 on record.
A CI1 causal assay that passes does not repair that.

---

## 4. C0-C — Effective Worker module identity

### Why the E4 method was insufficient

E4's `runtime-seam-probe.json` resolves the seam from **candidate bases in the repository root process**. The
ruling says plainly that a standalone probe from the repository root is not proof of the real Worker's resolution.
The probe also records `declaredQualifiedVersion: '0.2.1-rc.2'`, because it was taken **before** the pin moved — so
as an answer to "what did the rc.3 Worker load" it is both methodologically and temporally the wrong artefact.

### The method used here

A trace plugin is mounted into the Worker's own profile. Cordis loads it **inside the worker child**, after boot,
where the child's own resolver is available. It records, for each critical specifier, the resolved path, its
existence, its realpath, the declared package version, and which tree it came from. The plugin writes nothing
outside the run-owned rig and reports no environment value.

**One anchor is not enough, and this is the finding E4 was circling.** Three anchors are recorded separately
because they answer three different questions:

| Anchor | Question it answers |
|---|---|
| `worker-executable` (`process.argv[1]`) | Which runtime installation is running this Worker |
| `mounted-host-bundle` (resolved from the **profile**) | Which host bundle the profile actually mounted |
| `fence:*` (resolved from the **bundle's own `runner.js`**) | Which deployment copy the fence actually loads |

The distinction is load-bearing. `host/dsh/lib/runner.js:109` performs
`import('palimpsest-host-deployment/runtime/worker_fence.js')`. That specifier resolves **from the bundle's
location**, not from the executable's. So the executable can resolve `palimpsest-host-deployment` to one copy
while the fence enforces another. Resolving only from the executable — which is what E4's probe did — cannot see
this.

### The result

| Question | Answer |
|---|---|
| Trace produced by the child itself (pid ≠ parent) | **yes** |
| `@deepseek-ai/dsh-win32-process` | `0.2.1-rc.3`, external runtime install |
| `@deepseek-ai/dsh-session-persistence-jsonl` | `0.2.1-rc.3`, external runtime install |
| `@deepseek-ai/dsh-session` | `0.2.1-rc.3`, external runtime install |
| `@deepseek-ai/dsh-sandbox-windows-acl` | `0.2.1-rc.3`, external runtime install |
| `koffi` | `3.1.1`, external runtime install |
| Mounted host bundle | **run-owned test home** |
| Fence actually loaded | **run-owned test home** |
| Fence's declared `qualifiedVersion` | **`0.2.1-rc.3`** |
| Fence's `previouslyQualifiedVersion` | `0.2.1-rc.2` |
| Sibling session reader carries the rc.3 helper | **yes** |
| Enforced pin matches the adopted pin | **yes** |

**So E4's live qualification did enforce the frozen code's pin.** The runtime comes from the external install at
rc.3 with koffi 3.1.1; the host bundle and the fence both come from the run-owned test home, which
`linkModuleGraph` verifies against the fingerprints of the trees `installHostBundle` copies from
(`VERIFIED_AGAINST_EXPECTED_FINGERPRINT`, both entries, zero refusals).

This is a **correction to E4's own uncertainty**, not a confirmation of it: E4 wrote that it "did not depend on"
the stale copies in the real runtime home but could not demonstrate what the Worker loaded. The trace now
demonstrates it.

### The pre-existing copies in the real runtime home, measured

| Copy | Repo vs real-runtime-home |
|---|---|
| `palimpsest-dsh-host` (12 files) | **12 of 12 byte-identical** |
| `palimpsest-host-deployment` (10 files) | **8 of 10 identical; 2 differ** |

The two differing files are exactly `runtime/session_reader.js` and `runtime/win32_label.js` — the two files E4
changed. The real-runtime-home copy still declares `0.2.1-rc.2` and lacks `resolvePersistencePlugin`.

This is **not** a live defect, and the distinction matters: the fence that runs resolves from the test home, so
the stale copy is not on the executed path. It remains a **latent** hazard — any execution that resolves the
deployment package from the runtime installation instead of a run-owned home would enforce the rc.2 pin and use
the pre-fix reader. Nothing here modifies those files; they are protected, and refreshing them is an authorised
operator decision.

### The volume boundary, discovered while measuring

The Worker's read boundary writes a Mandatory Integrity Label on its own root. On this machine:

| Gate root volume | Outcome |
|---|---|
| `%TEMP%` (C:) | boundary installs; a real session is created |
| repository volume (F:) | `kernel-coverage: root coverage is INCOMPLETE: 1 unverified` |

The refusal is the **shipped fail-closed pre-create gate** (`host/dsh/lib/runner.js:603-612`) doing its job — not
a defect and not a policy choice. The consequence is recorded rather than worked around: **live Worker
experiments run under `%TEMP%`**, and the gate-root volume is carried with the evidence.

### What is established, and what is not

**Established:** the effective module identity of the real Worker, from inside the Worker, at three anchors; the
enforced pin is rc.3; the fence loads from the run-owned home; the stale runtime-home copies are byte-compared and
are not on the executed path.

**Not established:** that any *other* execution path in the product resolves the deployment package the same way.
Only this selected Worker path was measured.

---

## 5. C0-D — Final freeze binding

### The question

Was the E4 broad non-gate regression actually bound to Code Freeze `05aa9d2`? A final summary existing is not
evidence that it was.

### The tree comparison

| Comparison | Result |
|---|---|
| `af112bf` (last executable commit) → `05aa9d2` (Code Freeze) | **zero modified files** |
| Executable files **added** in that delta | `scripts/host_s1rae4/two-run-smoke.mjs` |
| Non-executable additions | the `0` artefact, two docs, six evidence JSONs |
| `05aa9d2` → `95ce9b8` (Code → Evidence Freeze) | two added JSONs, **zero executable changes** |

### The binding, stated precisely

- The regression's **source is byte-identical** to the frozen source: no source, test or host file was modified
  between the commit that was tested and the Code Freeze commit.
- The Code Freeze commit **added one executable file**, the two-run smoke producer — whose own at-freeze run *is*
  recorded (`two-run-smoke-at-freeze.json`).
- The regression was **not rerun after the freeze commit existed**, and this report does not claim it was.

| Scope | State |
|---|---|
| Test execution before the freeze | occurred; source-identical to the freeze |
| Live Gate at the freeze | **yes** (`level-b-first-party-gate.mjs`, `qualified: true`) |
| Two-run smoke at the freeze | **yes** (`two-run-smoke-at-freeze.json`) |
| Broad non-gate regression at the freeze | **no** — source-identical, not temporally rerun |
| Evidence generated after the freeze | two JSONs, no executable change |

**This is a genuine but narrow binding.** Source identity is established; temporal identity is not. The
distinction is preserved rather than collapsed, because "the same code" and "rerun at the freeze" are different
claims and only the first is true.

---

## 6. Closure adjudication

| Scope | Verdict |
|---|---|
| C0-A — test count reconciliation | **QUALIFIED** (mechanism established; specific file unrecovered) |
| C0-B — runner exit adjudication | **QUALIFIED AS A PRESERVED LIMITATION** (cause attributed to teardown; specific child unrecovered; not a pass) |
| C0-C — effective module identity | **QUALIFIED** (measured inside the Worker at three anchors) |
| C0-D — freeze binding | **QUALIFIED FOR SOURCE IDENTITY** (temporal rerun not established) |

**E4 evidence integrity: `ESTABLISHED_WITH_NAMED_LIMITS`.**

Three limits are carried forward verbatim:

1. Which 10-test file did not contribute to the 3691 run — **unrecovered**.
2. Which child process failed to exit, and whether any survived — **unrecovered**.
3. A clean full-selection runner exit 0 on this machine — **not established**.

None of these blocks a CI1 semantic assay, which runs isolated. All three block any claim that the broad
regression is clean. Historical evidence was not rewritten: `historicalEvidenceRewritten: false`.

---

## 7. What CI1 may and may not inherit

**May inherit:** the runtime pin (`0.2.1-rc.3`); the real Worker path and its module identity; the E3/E4 owned
resource mechanisms; the live gate's recipe for a real Worker execution; the knowledge that live experiments
belong on a volume where the boundary installs.

**May not inherit:** that the broad regression is green; that the real runtime Home boundary is protected; that
module sharing is content-verified (the fingerprint is structural — paths and sizes); that rc.3 is qualified for
operations outside those exercised; or that L1 cooperative execution implies L2 isolation.
