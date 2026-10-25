# Host-S1RA-E3 — Resource Ownership Integrity and Safe Effect Lifecycle

**Stage:** Palimpsest Host-S1RA-E3
**Branch:** `host-s1rae3-resource-ownership-integrity`
**Parent (E2 Evidence Freeze):** `b6ee03cd77f726eb1b97a7c191ff5a0f5f6b9354` (tree `3adb3a5f97685fab35ebc175d5bf2fa838abd4c2`)
**Runtime:** installed `0.2.1-rc.3`; fence qualified against `0.2.1-rc.2` — **unchanged by this stage**

This report separates what was measured from what was inferred. No live Host qualification is claimed.

---

## 1. Git and freeze identity

| Item | Value |
|---|---|
| Parent | `b6ee03cd77f726eb1b97a7c191ff5a0f5f6b9354` (E2 Evidence Freeze) |
| Parent tree | `3adb3a5f97685fab35ebc175d5bf2fa838abd4c2` |
| Working tree at start | clean (0 entries), 0 stashes, 95 worktrees |
| C1 — audit and red falsifiers | `8db947d` |
| C2 — bounded corrections | `902bf3b` |
| Code Freeze | recorded in §9 after the final checks |
| Evidence Freeze | recorded in §9 |

The E2 identities were verified rather than assumed: `85161ee` is the E2 Code Freeze with tree `b76635d`, `b6ee03c` is its Evidence Freeze, and the path-level diff between them contains **only** `docs/` and `research-evidence/` — no executable file.

---

## 2. Source-level findings

### 2.1 The defect that was not in the reported list

`scripts/trajectory_p2b/rig.mjs:58-64` converted **every** ownership refusal into an authorization:

```js
let proof = ownedResource.revalidateOwnership(owned);
if (proof.owned !== true) {
  const legacyOk = owned?.contained === true && owned?.isReparse === false;
  if (!legacyOk) return { cleaned: false, ... };
  proof = { owned: true, ... };          // ← the refusal is discarded
}
```

The branch is named for records predating the identity model, but `allocateOwnedRoot` sets `contained` and `isReparse`
on **every** record it produces. `legacyOk` was therefore true for every record the allocator can create, so the branch
was not a legacy path — it was *the* path. Five gates consume this function: `canonical-correlation`, `cold-recovery`,
`cold-preview`, `cold-capsule` and `real-integration`.

F5 is the clearest measurement: the helper correctly answered *"the directory at this path is not the object that was
allocated"* and the consumer deleted the directory anyway.

### 2.2 The three reported gaps, confirmed

| Gap | Confirmed | Production-reaching |
|---|---|---|
| Missing marker treated as a pass | yes | yes — `revalidateOwnership` → `rig.safeCleanup` → `rmSync` |
| Wrong `ownedRoot` accepted | yes — only `runId` was compared | yes |
| Copied marker accepted | yes | yes |

### 2.3 Two independent implementations

`trajectory_p2b/owned-resource.mjs` and `trajectory_p2e0/owned-root.mjs` share no code and answered "may I delete this?"
differently. `p2e0` was **marker-only** (a copied marker with the same `runIdentity` and `root` verified), which is
weaker than `p2b`; `p2e0` was **stronger** on links (it unlinks descendant reparse points by name before the recursive
removal, and refuses an incomplete scan). Both properties are now present in both.

### 2.4 The last hand-rolled allocation

`trajectory_p2d2/l2-gate.mjs:240-246` built `{ root, contained, isReparse }` inline with no marker and no identity.
`ownedRootLifetime` refused it, so it was fail-closed but **leaked** — the `p2d2-l2-u4RMdw` directory. It now uses the
shared allocator.

---

## 3. Engineering changes

| # | Change | Mechanism, and why it is sufficient for L1 |
|---|---|---|
| 1 | Marker required (I1) | An absent marker now refuses. A directory whose evidence has been removed cannot be deleted. |
| 2 | Marker binds the resource (I2) | `ownedRoot` must resolve to this root and `generation` must match. `runId` alone was not identity. |
| 3 | Refusal propagates (I3) | The `legacyOk` override is deleted. No record shape makes a failed proof sufficient. |
| 4 | Quarantine disposal | Rename → re-verify the object at the quarantine name → delete → confirm gone. A substituted object fails the re-check and is renamed back. |
| 5 | Completion observed (I4) | `cleaned: true` only after the quarantine name is observed absent. |
| 6 | Generation (I6) | One integer field, justified by F8's measured stale-authorization failure. No durable log, no replay. |
| 7 | `p2e0` object identity | `dev`/`ino` recorded and compared, so a copied marker no longer verifies. |
| 8 | Sharing destination classification | The `extra` loop now classifies, so a junction at a declared name is refused. |
| 9 | Sharing provenance | Declared host bundles are verified against a fingerprint of what the installer produces. |
| 10 | `l2-gate` allocation | Delegates to the shared allocator, so its root is reclaimable. |

**Why the quarantine rename, and not "revalidate immediately before deleting".** Path-based validation and path-based
deletion are separate operations and cannot be made atomic with the Node APIs this project ships. The rename changes
*which object* the delete acts on rather than trying to make the check atomic: the object deleted is the object verified
at the quarantine name.

---

## 4. Falsifier results

Measured by `scripts/host_s1rae3/falsifiers.mjs`. Before: `research-evidence/host-s1rae3/falsifiers-before-fix.json`.
After: `falsifiers-after-fix.json`.

| Arm | Before | After |
|---|---|---|
| F1 missing marker | **UNSAFE** — accepted | SAFE — refused |
| F1C through consumer | **UNSAFE** — deleted | SAFE — preserved |
| F2 wrong `ownedRoot` | **UNSAFE** — accepted | SAFE — refused |
| F2C through consumer | **UNSAFE** — deleted | SAFE — preserved |
| F3 copied marker A→B | **UNSAFE** — accepted | SAFE — refused |
| F3C through consumer | **UNSAFE** — B deleted | SAFE — preserved |
| F4A substitution before proof | **UNSAFE** — deleted | SAFE — preserved |
| **F4B** substitution after proof, superseded shape | **UNSAFE** — canary destroyed | **UNSAFE — preserved as the recorded counterexample** |
| F4C substitution, production shape | — | SAFE — preserved |
| F4D new object after disposal | — | SAFE — preserved |
| F5 parent redirection | **UNSAFE** — deleted despite refusal | SAFE — preserved |
| F6 junction inside root | SAFE | SAFE |
| F7 real lock + retry | SAFE | SAFE |
| F8 stale operation | **UNSAFE** — no generation | SAFE — refused |
| F9 legitimate disposal | SAFE | SAFE |
| F9B new occupant at reused path | SAFE | SAFE |
| F10 legacy-shaped record | **UNSAFE** — deleted | SAFE — refused |

**F4B remains UNSAFE deliberately.** It reproduces the superseded proof-then-`rmSync` shape, and the ruling forbids
dropping the original deterministic path-swap experiment. It is labelled `shape: "SUPERSEDED"` and no longer describes
the production code path; F4C and F4D measure that path.

### Synthetic foreign-object integrity

Every unsafe arm above destroyed a synthetic canary this experiment created. No genuine historical or user directory
was used to demonstrate an unsafe deletion. All fixtures lived under a `mkdtemp` sandbox and were removed at teardown.

---

## 5. Safety and liveness

**Safety.** Foreign canary survives (F1C, F2C, F3C, F4A, F4C, F4D, F5, F10). Wrong marker rejected (F2, F3). Stale
operation cannot delete (F8). Reparse escape target survives (F6).

**Liveness.** Legitimate owned root disposed (F9). Correct host bundle admitted with verified provenance (sharing case
3b). Correct link idempotent (case 9). A new occupant at a reused path survives (F9B).

An unconditional refusal does not pass: F9 and sharing case 9 would fail.

### Mutation controls

`scripts/host_s1rae3/mutation-controls.mjs` removes each guard **in a copy** inside the sandbox and re-measures. All
**8 of 8** guards are load-bearing:

| Control | Guard | Result |
|---|---|---|
| M1 | marker required | LOAD-BEARING |
| M2 | marker binds the root | LOAD-BEARING |
| M3 | generation enforced | LOAD-BEARING |
| M4 | identity match | LOAD-BEARING |
| M5 | quarantine re-check | LOAD-BEARING |
| M6 | sharing destination classification | LOAD-BEARING |
| M7 | sharing fingerprint provenance | LOAD-BEARING |
| M8 | observed completion | LOAD-BEARING |

The production tree is hashed before and after every arm; `productionTreeUnchanged: true`.

---

## 6. Recovery

| Situation | Behaviour |
|---|---|
| Removal fails (real lock) | Reports `cleaned: false`, keeps the object, `retryable: true` |
| Retry after release | Succeeds (F7, measured with a live child process holding the directory) |
| Removal fails mid-quarantine | The object is restored to its original path where possible; otherwise it is reported at the quarantine name |
| Refusal (ownership) | Final. `retryable: false`, because re-proving cannot succeed by waiting |
| Repeated disposal | Short-circuits on the recorded outcome; a new occupant at the path is untouched (F9B) |
| Superseded generation | Refused at the boundary; the object survives (F8) |
| Signal or `process.exit` | Listeners reclaim and are all removed on disposal |

**Not claimed:** recovery after `SIGKILL`. No code can run then, and the reaper is the answer for what it leaves.

---

## 7. Environment and asset integrity

| Item | Result |
|---|---|
| Protected evidence trees | **64 of 64 unchanged** |
| `research-evidence/host-s1/` vs `c4ea1ab` | empty diff |
| Worktree registrations | 95 before, 95 after |
| Historical `r3lcfsh-worktree-SMlvwB` | present, untouched |
| Gate root | 19 entries before, 19 after; all five `p2b-c3-OWNED-*` intact |
| Real `~/.dsh` | still a junction to `D:/dsh`; not written |
| Runtime version | `0.2.1-rc.3`; the pin was not changed |

### Runtime Home, and a correction to my own earlier report

`scripts/host_s1rae3/audit-runtime-home.mjs` scanned **1235** source files and reported every identifier as integer code
points.

**The E2 report's description was wrong.** It called the pair a "homoglyph collision" whose members "render identically"
and "differ only in the first code point". Measurement contradicts all three parts:

- both names are pure ASCII, and `normalize("NFKC")` changes neither;
- they differ at **all eight** positions of the shorter name, not one;
- they do not render identically — they differ in length.

What is real is a **display-level loss**: evidence that records only rendered text cannot express which identifier a
line refers to. The practical consequence stands — a caller assigning the name the fence does not read leaves its
redirection inert — but the mechanism is misreading, not Unicode substitution. The comment in
`scripts/gates/runtime-home.mjs` is corrected to say so.

---

## 8. Qualification

| Area | Verdict |
|---|---|
| Ownership admission | `OWNERSHIP_ADMISSION_QUALIFIED` |
| Safe disposal within the declared threat model | `SAFE_DISPOSAL_QUALIFIED_WITH_REPORTED_RESIDUAL` |
| Lifecycle recovery | `LIFECYCLE_RECOVERY_QUALIFIED` |
| Module-sharing admission | `MODULE_SHARING_ADMISSION_QUALIFIED_WITH_VERIFIED_PROVENANCE` |
| Consumer propagation | `CONSUMER_PROPAGATION_QUALIFIED` |
| Historical asset integrity | `HISTORICAL_ASSETS_UNCHANGED` |
| Real Host runtime integration | `BLOCKED_QUALIFIED_RUNTIME_UNAVAILABLE` |
| **Integrated** | **`HOST_S1RAE3_NOT_QUALIFIED`** |

The integrated verdict is withheld because the live Host gates cannot run: the installed runtime is `0.2.1-rc.3` and the
fence is qualified against `0.2.1-rc.2`. That is the same blocker E2 reported, and this stage did not change it.

---

## 9. Test evidence

### At the Code Freeze

| Check | Result |
|---|---|
| `tsc -b` | exit 0 |
| `module-architecture.mjs --check` | PASS — 0 violations, 9 accepted baseline exceptions |
| `module-architecture.mjs --check-public-api` | PASS — 0 missing / 0 changed / 0 added |
| Storage discipline suite | **33 of 33**, exit 0 |
| `p2e0` + `p2e1` resource safety | 22 of 22 serially; 1 pre-existing parallel-isolation failure (below) |
| Full non-gate selection | **279 files, 3701 tests**; see the run table |

### Selection

```
396 recursive test files
 −39  test/**/r3l0*.test.ts        (forbidden by the stage ruling)
 −78  test/**/trajectory_*.test.ts (live gates; refuse on kernel drift)
=279 included
```

### Every run, disclosed

| Run | Tree | Result | Failing file |
|---|---|---|---|
| 1 | this stage | 3700/3701 | `host_s1r_reparse_boundary` — **timeout at 30 s**, elapsed 52.8 s |
| 2 | this stage | **3701/3701, exit 0** | — |
| 3 | this stage | 3700/3701 | `serve_ephemeral_port` — timeout at 30 s |
| 4 | **unmodified baseline** | **3690/3690, exit 0** | — |
| 5 | **unmodified baseline** | 3689/3690 | `architecture/sr2b3_attempt_execution_owner` |

**Attribution.** The baseline fails too, on a *different* test, with no stage changes present. Each failing test:

- passes in isolation (`host_s1r_reparse_boundary` 13 s and 4.7 s; `serve_ephemeral_port` exit 0);
- imports **nothing** this stage modified — `host_s1r_reparse_boundary` reads the real runtime home;
- fails with `Test timed out in 30000ms`, not an assertion.

The three failures are three different files, which is what load-sensitive timeout flakiness looks like. This is the same
class as the `ordarium_ledger` timing sensitivity E2 recorded. **It is not kernel drift and not a product regression**,
and it is reported rather than averaged away.

The test count rose from 3690 to 3701 because this stage added 11 controls.

### A pre-existing parallel-isolation defect, reported not fixed

`test/trajectory_p2e1_resource_safety.test.ts` case 35 counts entries in the **real** `~/.palimpsest-gates` and asserts
the count is unchanged. Run in parallel with `trajectory_p2e0_test_runtime_safety`, both mutate that shared directory, so
the count moves. Measured: fails 3 of 3 in parallel, passes 3 of 3 with `--no-file-parallelism`, and **fails identically
on the unmodified baseline**. It is a test-hygiene defect that predates this stage; fixing it would mean converting that
suite to a sandbox, which is a separate change.

### Why the live gates did not run

They refuse on kernel drift before doing any work:

```
refusing to run this worker: kernel-drift: the Win32 binding seam reports drift:
resolved 0.2.1-rc.3 against qualified 0.2.1-rc.2
```

Verified identical on the unmodified baseline. `test/trajectory_p2a_first_party_gate.test.ts` is one of the 78 excluded
`trajectory_*` files; running it outside the authorized selection reproduces the same refusal.

---

## 10. Remaining risks

1. **L1 only.** The threat model is cooperating same-user actors. Ordinary ACLs are not isolation from a process running
   as the same principal, and no verdict here claims otherwise.
2. **TOCTOU residual.** A substitution between the quarantine re-check and the recursive removal, on a name the
   substituting process must guess, is not closed. A rename-back that is itself raced is not closed. Strategy C
   (handle-based deletion) was not attempted: it needs a new native binding, which this stage may not ship.
3. **The fingerprint is structural.** It compares paths and sizes, not contents, and is not a defence against an
   adversary who knows the expected shape.
4. **`SIGKILL` recovery** is the reaper's job, not the lifetime helper's.
5. **Two implementations remain.** `p2b` and `p2e0` are now consistent in what they enforce, but they are still two
   modules. Unifying them would touch twelve consumers and is not this stage's scope.
6. **Pre-existing flakiness** in the full selection, disclosed in §9.

---

## 11. Next-stage recommendation

**One action, unchanged from E2:** restore a runtime at `0.2.1-rc.2`, or perform a fresh first-party qualification of
the fence against `0.2.1-rc.3` and move the pin in its own bounded stage. E3 did not change the pin, and no E3 result
establishes live Host qualification.

Two secondary items, neither urgent:

1. Convert `test/trajectory_p2e1_resource_safety.test.ts` to a sandbox gate root, which removes the parallel-isolation
   failure reported in §9.
2. A targeted Native Handle feasibility stage, **only if** the TOCTOU residual in §10.2 must be closed. It requires a new
   native binding and therefore its own qualification.

No Agent, Workflow or Trajectory redesign is proposed.
