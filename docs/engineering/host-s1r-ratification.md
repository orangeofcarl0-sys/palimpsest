# Palimpsest — Host-S1R: Confidential Boundary Ratification

**Stage:** `Palimpsest Host-S1R — Confidential Boundary Ratification & E2 Handoff`
**Parent:** `c4ea1ab6090163f951941c0ab0d9794c6e0f8df4` (`host-s1-boundary-completeness-lock-recovery`)
**Branch:** `host-s1r-confidential-boundary-ratification`
**Code Freeze:** `9df766fe66fa513ed99fcee394a6b28ce9f15d29`
**Executed code tree:** `34ddc209802f9cfa575b0a76602c231e4d136dc7`
**Runtime:** Windows x64 10.0.26200 · Node 24.22.0 · DSH 0.2.1-rc.2 · koffi 3.1.1 · `dsh-sandbox-windows-acl` 0.2.1-rc.2

---

## A. Final verdicts

| Verdict | Result |
|---|---|
| `S1R-A CONFIDENTIAL_CAPACITY_DOMAIN_QUALIFIED` | **QUALIFIED** |
| `S1R-B CONFIDENTIAL_LOCK_RECOVERY_QUALIFIED` | **QUALIFIED** |
| `S1R-C REPARSE_ACCESS_BASIS_QUALIFIED` | **QUALIFIED** |
| `S1R-D SECURITY_EVIDENCE_ADMISSION_QUALIFIED` | **QUALIFIED** |
| `S1R-E HOST_S1_SECURITY_RATIFIED` | **QUALIFIED** |
| `TRAJECTORY_DSH_MEASUREMENT_CHAIN_PRESERVED` | **QUALIFIED** |

Still withheld, unchanged and not implied by any of the above:

`CONTROL_BASELINE_TECHNICALLY_READY`, `MODEL_CONSUMED_CAPSULE`, `BENCHMARK_QUALIFIED`,
`TRAJECTORY_FIRST_PARTY_ORIGIN_SETTLEMENT_QUALIFIED`, `UTILITY_POSITIVE_SIGNAL`,
`UTILITY_NEGATIVE_SIGNAL`, `WORK_UTILITY_IMPROVED`, `AGENT_COOPERATION_IMPROVED` — all **NOT_ESTABLISHED**.

`modelCallsMade: 0`, `externalModelRequestOccurred: false`, `stochasticTrialOccurred: false`.

Every verdict above is a conjunction of observations read from executed artifacts, and the generator's exit
code is 1 whenever the integrated verdict is not `QUALIFIED`. That was verified by observing it fail closed
several times during this stage before it passed.

---

## B. Git attestation

| Item | Value |
|---|---|
| Parent HEAD | `c4ea1ab6090163f951941c0ab0d9794c6e0f8df4` |
| Code Freeze | `9df766fe66fa513ed99fcee394a6b28ce9f15d29` |
| Executed code tree | `34ddc209802f9cfa575b0a76602c231e4d136dc7` |
| 52 protected trees | `ALL_PROTECTED_TREES_UNCHANGED` |
| Working tree at generation | clean |

Commits are forward-only. No historical commit was amended, rebased or rewritten. The four logical commits
§12 asks for exist as the first four; the later commits are corrections to this stage's own generator, each
recorded because the freeze moved and the evidence was regenerated from the new freeze.

---

## C. Security falsifiers

All nine §4 hypotheses were reproduced against the parent. The probe now runs in a **detached parent worktree**,
because once a defect is fixed it no longer reproduces on the corrected tree — running it there would silently
turn a corrected defect into "not reproduced".

| ID | Concern | Reproduced | Decisive observation |
|---|---|---|---|
| F1 | Rename-before-verify exclusivity | yes | the recoverer **moved a live successor**, a third party **acquired the vacated pathname**, and the recovery **did not terminate** (`childTimedOut: true`) |
| F2 | Release recovery and unknown ownership | yes | an injected `ENOSPC` on the record write left a holder no retry could remove |
| F3 | Cross-repository capacity scope | yes | a Low token granted only repository A read repository B's **active-world** canary |
| F4 | File symlink omitted by verification | yes (source) | `statSync().isDirectory()` returned before `lstatSync()` could classify |
| F5 | Declared root vs verified target | yes | a link into a declared-but-unlabelled root read as covered |
| F6 | Unknown external reparse target | yes | `admissionEligible: true` while `reparseBasis: REPARSE_LEAVES_PROTECTION_DOMAIN` |
| F7 | Evidence admission reuses old reports | yes | fixed `USERPROFILE` paths, no freeze, command or run id |
| F8 | Exit code not driven by qualification | yes | suite verdict ignored the child exit; final exit ignored the derived verdicts |
| F9 | Coverage semantics mismatch | yes | a fully enumerated ancestor with only the active world was refused |

### The two measurements that changed the design

**A label is a level, not a compartment (F3).** The two worlds carried *different* workspace write SIDs
(`S-1-4-394482434-518543731` vs `S-1-4-938573126-899541022`) and both carried `Low + NO_WRITE_UP` while active.
Neither the workspace nor the repository separates them; what they share is the integrity level. This is why the
capacity domain is the Windows principal, and why a repository-scoped lock could never have been correct.

**A labelled junction protects the link, not the target.** Measured with a real Low token: listing the junction
returns `EPERM`, reading a file *through* it returns the canary. A link's own label is therefore never accepted as
coverage, and the derivation never labels through a link.

---

## D. Capacity security

**The domain is the Windows principal on this machine.** `%LOCALAPPDATA%\Palimpsest\host-capacity\`, keyed so
every host process of this principal contends for one slot whatever repository or DSH home it serves. The
repository is receipt metadata, not the namespace. Different principals are not covered and are separated by
their own profile ACLs; `domain.assumption` states exactly that so no receipt can overclaim.

Every ancestor of the capacity root is `lstat`-inspected; a reparse point refuses the slot, because a junction
could redirect the namespace.

**Lock recovery: automatic reclamation is disabled.** `mkdir` remains the atomic acquisition primitive, so the
original read-check-write race stays closed. Recovery is another matter: a process that removes a lock *by
pathname* frees that pathname between the removal and any re-publication, and the filesystem offers no
compare-and-unlink. Re-verifying the object's file index immediately before the rename narrows the window but
cannot close it. §6.4 permits the fallback, so an ambiguous lock now **refuses** and names the operator action.

The availability cost is bounded and measured: the lock is held only across the read-modify-write of the holder
record (a few file operations), and the long-lived claim is the **holder record**, which is still recovered
automatically. A crashed worker frees capacity without operator action; only a crash inside the millisecond
critical section needs one.

**Release correctness.** `held` clears only after the reduced record is durably written, so a failed write leaves
the handle retryable instead of stranding a phantom holder. An unreadable record is never rewritten; a
non-owner release removes nothing; malformed entries are written back verbatim.

---

## E. Reparse security

**Identity before type.** `lstat` now precedes any `statSync` type gate, so a link whose target is a file is
classified rather than skipped. A file symlink cannot be created on this host (`EPERM`: privilege not held,
Developer Mode off) and a junction aimed at a file is *broken* (`statSync` `ENOENT`), so the file-link case is
`SOURCE_DEMONSTRATED` and recorded as a disclosed limit.

**The basis is the verified set.** `verifyTree` takes `verifiedRoots`, populated only from roots whose label was
verified. A declaration is not evidence.

**The dependency exception is narrow and true.** An out-of-domain target is admitted only when it resolves under a
declared dependency root. Those roots are derived by enumerating `profiles/node_modules` and resolving each
entry's target, because a DSH home does not hold its packages — it holds junctions into wherever the installer
put them. Admitting the installation's parent instead would be the permissive rule §7.3 forbids.

**Disclosure is preserved.** Every out-of-domain link stays recorded, `reparseBasis` still reports
`REPARSE_LEAVES_PROTECTION_DOMAIN`, and the new counts separate qualified from unqualified links so a refusal
explains itself.

### A finding that deserves emphasis

The real runtime home on this host, `C:\Users\66494\.dsh`, is **itself a junction** to `D:\dsh`. A label written
to it lands on the link object, not on the target's content. This is not introduced by S1R and it is not a
regression: it is a property of this deployment that the reparse model now *names* instead of silently
mis-reporting. It is recorded as a residual below.

---

## F. Evidence integrity

**Conformance is run, not read.** Both suites execute against the current freeze into a rig, and each receipt
carries the Code Freeze HEAD and tree, the exact command, the process exit code, a run id, the PASS/LIMIT/FAIL
identities and the artifact SHA-256. A historical report may be compared, never substituted.

| Suite | Result |
|---|---|
| R1-HR | 44 PASS · 3 LIMIT · 0 FAIL (HR-17, HR-39b, HR-33) |
| R1-HC | 26 PASS · 1 LIMIT · 0 FAIL (HC-27) |

**Subprocess status is part of the verdict.** A nonzero exit, a missing report, an empty report, a skipped
required test and a duplicate test identity are each refused by name. Twelve negative controls prove it.

**The stipulated booleans are gone.** `controlsCoverMalformed: true` and its three siblings were literally true in
the source. They are replaced by lookups of the load-bearing security cases **by name** in the executed suite's
own test identities.

**The 257/232 discrepancy is reconciled.** Host-S1's report claimed 257 affected tests while its committed
generator recorded 232 across five groups; the difference came from a separate invocation. This stage reports
only what its generator executed, derived from the suites above — 261 tests across 17 suites.

### Two environment facts that were diagnosed rather than worked around

1. **Label writes need `WRITE_OWNER`.** A fresh directory on the workspace volume carries
   `Authenticated Users:(M)`, which excludes it, so every label write returned 5 and R1-HR reported 20 FAIL that
   said nothing about the code. The rig root is now granted `(OI)(CI)F` to the current user, and the receipt
   records the grant. The same suite on the same code reports 44/3/0 with the grant.
2. **`C:` reached 0 bytes free** during the stage, which made vitest report `ENOSPC` and suites appear `NOT_RUN`.
   That is a disk fact, not a code fact, and it is why the rig lives on the volume with space.

Neither is a security finding. Both are recorded because an unexplained red result is worse than a named one.

---

## G. Acceptance

| Gate | Result |
|---|---|
| `pnpm run build` | pass (`tsc -b`) |
| `pnpm run architecture:check` | PASS — 0 violations, 9 accepted baseline exceptions |
| `pnpm run architecture:check-public-api` | PASS — 0 missing, 0 changed kind, 0 added |
| Host suites (7 files) | 115/115 |
| Host-affected suites (17 files) | 261/261 |
| R1-HR / R1-HC | 44/3/0 and 26/1/0 |
| Real DSH delegation matrix | 8/8 matched, `allCasesClosed: true`, no leak |
| Closure gate | exit 0, `modelCallsMade: 0` |
| Protected evidence | 52/52 unchanged |

No whole-repository green result is claimed. No pre-existing failing suite was edited to obtain one.

---

## H. Residual risks

**Proven security problems, now corrected:** the repository-scoped capacity domain (F3); unsafe automatic
reclamation (F1); the failed-write phantom holder (F2); reparse classification gated on target type (F4);
declared-as-verified basis (F5); resolution-as-authorization (F6).

**Dynamically verified corrections:** all six above have executed controls in the suites, and the reparse
correction is additionally exercised against the real DSH dependency layout.

**Explicit limitations:**

- A file-directed symlink cannot be created on this host, so that classification is `SOURCE_DEMONSTRATED`.
- The indeterminate-liveness path has no reproducible fixture here: every real pid answers `ESRCH` or `EPERM`.
  The tri-state rule is pinned from source and labelled as such.
- A crash inside the lock's critical section requires an operator. This is accepted deliberately.
- Different Windows principals are not covered by the capacity slot. That separation rests on the platform's
  default profile ACLs and is not measured here.

**Unverified properties:**

- Whether `C:\Users\66494\.dsh` being a junction is safe for the *content* of the runtime home. A label on it
  reaches the link object only. This predates S1R, is not changed by it, and is now named rather than hidden.
- The `MAX_TREE_ENTRIES` bound is still exceeded by a very large root, which refuses rather than passing.

**Future product architecture decision:** if the runtime home is ever to carry a label that reaches its content,
the deployment must place the home on a real directory rather than a junction, or the fence must label the
target explicitly. That is a deployment-layout decision, not a Host-S1R correction.

---

## I. E2 handoff

See `docs/engineering/trajectory-p2e2-control-protocol-draft.md` §8. In summary: the fixture identity, Oracle
version, evaluation units, CONTROL boundary, allowed tools, trial-validity definition, failure taxonomy,
re-scoring procedure, exclusion rules and retention protocol are frozen or stated. The provider, exact model,
cost ceiling, trial count, maximum elapsed time, seed policy, stopping rule and the stochastic adapter remain
**UNRESOLVED** and must not be invented. No E2 execution occurred.

---

## J. Next-stage decision

Host security qualifies **for this exact runtime**, scoped to Windows x64, Node 24.22.0 and DSH 0.2.1-rc.2. The
recommended next step is E2 experimental authorization — CONTROL-only stochastic calibration — subject to its own
authorization and preregistration, which this stage has prepared but not granted.

This verdict is not generalised to future Windows, Node or DSH versions. If any of those change, the label
contract, the sandbox grant behaviour and the capacity domain must be re-measured.
