# Host-S1RA — Execution Environment Safety and Evidence Reconciliation

**Stage:** Palimpsest Host-S1RA
**Parent branch:** `host-s1r-confidential-boundary-ratification`
**Starting HEAD:** `ae8ff3349c1079061473ae0799a7cef330cccb42`
**Branch:** `host-s1ra-environment-evidence-reconciliation`
**Starting tree:** `3638d8e33b79cd36dcbe6c8db08eda1f8c0a2652`

This document reports what was measured, what was corrected, and what remains unestablished. It does not repeat
the earlier Trajectory engineering history.

---

## A. Verdicts

| Workstream | Verdict |
|---|---|
| RA-A — Shared dependency integrity | `SHARED_DEPENDENCY_INTEGRITY_QUALIFIED` |
| RA-B — Test resource lifecycle | `TEST_RESOURCE_LIFECYCLE_QUALIFIED` |
| RA-C — Historical evidence lineage | `HISTORICAL_EVIDENCE_LINEAGE_RESTORED` |
| RA-D — Latest executable tree | `LATEST_EXECUTABLE_TREE_NOT_REQUALIFIED` |
| RA-E — Real runtime Home boundary | `REAL_runtime_HOME_BOUNDARY_ADJUDICATED` |
| Integrated engineering integrity | `HOST_S1RA_ENGINEERING_INTEGRITY_NOT_QUALIFIED` |
| Real runtime Home confidentiality | `REAL_runtime_HOME_CONTENT_BOUNDARY_NOT_ESTABLISHED` |
| Trajectory measurement chain | `TRAJECTORY_runtime_MEASUREMENT_CHAIN_NOT_RECONFIRMED` |

**The integrated verdict is withheld, and that is the finding.** RA-D requires the affected Gates to execute
against a new Code Freeze. They could not: every live gate refuses at pre-create because the installed Win32
binding seam is `0.2.1-rc.3` while the shipped fence is qualified against `0.2.1-rc.2`. That refusal is the code
under test behaving correctly. Awarding the integrated verdict on the strength of 3,690 passing non-gate tests
would report a qualification this run did not measure, which is precisely what §15 forbids.

The last two rows are reported separately and deliberately. The adjudication succeeds — and does — while the
stronger confidentiality qualification remains unestablished. Conflating them is what §9 forbids.

---

## B. Git

| Item | Value |
|---|---|
| Parent HEAD | `ae8ff3349c1079061473ae0799a7cef330cccb42` |
| Branch | `host-s1ra-environment-evidence-reconciliation` |
| C1 — baseline and falsifiers | `95e28fd0536aa59f10f29aeaf041c9b5bbc935a9` |
| C2 — module sharing and cleanup | `3dc4f13937117afc361593d2e1886e9356457233` |
| C3 — evidence lineage restoration | `0a67a266dd21eadc81e510043dc1c9fd97fd437e` |
| C4 — generator/worktree safety | `5a84d2a10a119044830bc78a57b757fb2570adde` |
| C5 — runtime Home adjudication | `a161dddb2c2586d02ba973bbfeed23df1b124cd6` |

Forward-only throughout. No commit was amended, no branch was reset, no history was rewritten, and nothing was
force-pushed.

---

## C. Environment damage analysis

### Observed damage, before this stage

`~/.palimpsest-gates` reached 18.76 GiB across 61 entries and drove `C:` to zero bytes free twice. The previous
stage reclaimed it and corrected the two dominant causes; the gate root now holds 14 entries at 15.8 MiB.

Separately, the repository's `node_modules/.bin` was destroyed at least twice by worktree removal, and
`research-evidence/host-s1/` was overwritten by a later stage's generator.

### Supported probable cause, and what was dynamically reproduced

| Cause | Status |
|---|---|
| A dereferencing copy materialised the runtime tree per test home | **Dynamically reproduced** in the previous stage; cost measured at 1,048.6 MiB / 112,512 files / 124 s per home |
| Cleanup ran only on the happy path | **Dynamically reproduced**; `finish()` exits from up to ten places and `l2-gate` never cleaned up |
| `existsSync` misread a dangling junction as unoccupied | **Dynamically reproduced** this stage (RA-0/F1) |
| A partial link set was "completed" by a copy | **Dynamically reproduced** (RA-0/F2) |
| Cleanup deleted a path replaced after allocation | **Dynamically reproduced** (RA-0/F3): a foreign directory's contents were removed |
| One EPERM latched the root as permanently disposed | **Dynamically reproduced** (RA-0/F4): the third call after the lock was released did not retry |
| SIGINT/SIGTERM listeners leaked per allocation | **Dynamically reproduced** (RA-0/F5): three allocations leaked 3 + 3 |
| The reaper selected on name and age alone | **Dynamically reproduced** (RA-0/F6) |
| The storage suite passed with a failed import | **Dynamically reproduced** (RA-0/F7): 14 passed, 0 failed, exit 0 |
| The runtime-home variable name differed between test and implementation | **Dynamically reproduced** (RA-0/F8), and see the erratum below |
| The generator mutated shared Git state | **Classified from source** (RA-0/F9); not executed against this repository |
| Host-S1 evidence was overwritten and polluted | **Dynamically reproduced** (RA-0/F10) by blob identity |
| S1R evidence predates current HEAD | **Dynamically reproduced** (RA-0/F11) |
| `~/.dsh` is a junction with an unlabelled target | **Read-only observation** (RA-0/F12) |

### Forward erratum: the previous stage's cleanup root-cause claim

The previous stage's commit `414d84d` asserted that `rmSync(..., { recursive: true })` **follows** a contained
junction, and cited that as the mechanism by which the repository's `node_modules` was deleted. That assertion is
**false on this platform**, and the same claim is repeated in a comment inside `scripts/host_s1/generate-evidence.mjs`.

RA-0/F9 re-measured it in a synthetic git repository: `rmSync` removed the junction **entry** and left the
target's files byte-intact. The correction is now recorded in both places.

The unlink-before-remove step is retained anyway. It is strictly safer and costs nothing; what changed is that it
is no longer justified by a claim that does not hold.

The actual mechanism of the `.bin` destruction is therefore **not established** by this stage. It is a supported
hypothesis that `git worktree remove --force` or a pnpm relink was responsible, and it is recorded as a hypothesis
rather than a finding.

---

## D. Module sharing

### Destination admission

Every destination is classified with `lstat`, which observes the path object and never follows it. The states are
`ABSENT`, `DIRECTORY`, `FILE`, `JUNCTION_OR_SYMLINK`, `BROKEN_LINK` and `INACCESSIBLE`. **Only `ABSENT` is
creatable.**

`existsSync` is still recorded, but only so the discrepancy that caused the original defect remains visible: for a
dangling junction it returns `false` while `lstat` reports a reparse object.

### Link creation

An existing link is accepted only when its **resolved target** is the intended source, compared by `realpathSync`
rather than by name. A link pointing elsewhere is refused and left in place: refusing is not repairing.

### Failure policy

One refusal fails the whole operation with `MODULE_SHARING_NOT_ESTABLISHED`. There is no automatic copy. The
copy exists as `copyModuleGraph`, reachable only when a caller passes `{ strategy: "copy" }`, and it refuses a
non-empty destination, refuses overlapping source and destination, and reports the bytes and files it spent.

### Negative controls

Controls 7–10 of `test/gate_root_storage_discipline.test.ts` cover: a dangling junction (refused, and the vanished
target is not recreated), a correct existing link (accepted without a write), a wrong-target link (refused, link
preserved), and an ordinary file (refused, contents preserved). Controls 3–4 cover the copy path's refusal and its
reporting contract.

### Dependency immutability

The manifest in `research-evidence/host-s1ra/environment-integrity-baseline.json` was re-measured after every
high-risk phase. All seven invariants — lockfile digest, top-level names, `.bin` names, `.bin` sizes, top-level
resolution targets, runtime version, and runtime-home resolution — were **unchanged** at the end.

---

## E. Cleanup

### Ownership model

Allocation captures the object's `dev`/`ino` pair where the platform supplies one, and writes a marker naming the
run, the process, the timestamp and the resolved root. The marker is an aid to diagnosis and is **never sufficient
on its own**, because a marker is a file and can be copied.

### Deletion preconditions

Immediately before removing anything: the path must still resolve inside the gate root; it must not be a reparse
point **now**; its `dev`/`ino` must still match the allocation; and any marker present must name **this run** and
**this root**. Any mismatch preserves the directory and names the reason.

Where `ino` is not usable the comparison degrades to object kind at the same path, and the record says so
explicitly rather than reporting a pass.

### Signal behaviour

`dispose()` removes every listener it installed — `exit`, `SIGINT` and `SIGTERM` — and `listenerCount()` reports
the remaining count so a leak is observable. Control 13 asserts all three are gone.

**This cannot run after SIGKILL.** A forcibly terminated process may leave an owned root behind; that is handled as
a separately verified recovery problem, and no claim is made otherwise.

### Retries

A failed deletion stays **retryable** up to a bounded attempt budget, the first failure reason is preserved, and
the failure is never reported as success. Control 14 and RA-0/F4 cover the replaced-root and retry paths.

### Reaper refusal

Report-only by default. A candidate is reclaimed only when it carries a marker whose schema is recognised, whose
`ownedRoot` names **the root it sits in**, and whose owning process is not running. A directory with no marker is
preserved with `NO_OWNERSHIP_MARKER` named.

**Consequence, stated plainly:** roots created before the marker existed cannot be reclaimed by this command. That
requires a human decision, which is where it belongs — the tool cannot distinguish a crashed run of its own from
someone else's work.

---

## F. Historical evidence

### Restored to their exact Host-S1 blobs

| Path | Blob |
|---|---|
| `research-evidence/host-s1/baseline-and-falsifiers.json` | `1209f76cb9a86147ad9b70df7340b602174dca2e` |
| `research-evidence/host-s1/git-and-evidence-identity.json` | `a553c1c1fa637d164dd4c40151651d8c163a36e1` |

### Preserved before removal

Six artifacts had been written into the Host-S1 directory by a later stage. Every one differed from its canonical
`research-evidence/host-s1r/` copy, and several carry unique evidence — an earlier conformance run against
`f76f376`, and a falsifier run that reproduced 4 of 9 where the canonical copy reproduces 9 of 9.

They are preserved verbatim under `research-evidence/host-s1r/earlier-execution/` and labelled as earlier runs.
Only then were they removed from the Host-S1 directory.

### Stage separation

| Path | Contents |
|---|---|
| `research-evidence/host-s1/` | Host-S1, historical, byte-identical to `c4ea1ab` |
| `research-evidence/host-s1r/` | Host-S1R, its own stage |
| `research-evidence/host-s1r/earlier-execution/` | earlier Host-S1R runs, kept verbatim |
| `research-evidence/host-s1ra/` | this stage |

No script writes into `research-evidence/host-s1/`; a grep for the historical path finds only a comment recording
that it is not rewritten.

### Forward errata

The Host-S1R evidence keeps its own `runIdentity` and is **not** rewritten to pretend it tested a later commit.
The binding gap is recorded in the S1R identity artifact's `parentWorktree` field and in this document's §B.

---

## G. Real runtime Home

### Path relationship

`~/.dsh` is a **junction** to `D:/dsh`. The link object and the target are different objects, so a label on the
link is not a label on the contents. This is the ambiguity §7 asks to resolve, and it is resolved in the
adjudication artifact rather than assumed either way.

### Protection basis, observed

| Object | Mandatory Label line |
|---|---|
| Link (`~/.dsh`) | none reported |
| Target (`D:/dsh`) | none reported |

Neither object carries a label this account can observe. The target's ACL grants `Authenticated Users:(M)`, which
is ordinary profile inheritance, not a confidentiality boundary.

### Data classes

| Class | Present | Kind |
|---|---|---|
| Runtime packages (`profiles/node_modules/@deepseek-ai`) | yes | directory |
| Profile configuration (`profiles`) | yes | directory |
| Session persistence (`sessions`) | yes | directory, 410 entries |
| Credentials | no | — |

Counts only. No session body, credential or private file was read.

### The trusted-dependency contract, as the shipped code computes it

`verifyTree` over the real runtime package tree reports:

- `verified: false`, `complete: false`
- 234 reparse points, **all 234** classified as leaving the protection domain
- 234 unqualified external links
- `dependencyRootsUsed: 0`
- `admissionEligible: false`

98 of the 125 entries in `profiles/node_modules` are junctions and **all 98 resolve outside the target**. The
shipped runtime is therefore not contained by its own home, and the descendant-admission gate refuses it. That is
the fail-closed behaviour working as designed, and it is a **limit on production readiness** rather than a defect
introduced here.

### Synthetic first-party evidence

A test-owned home that is a junction, with a runtime-like and a session-like subtree carrying distinct synthetic
canaries, exercised through the real Low-integrity execution path on a label-writable volume:

| Configuration | Session canary | Runtime dependency | State |
|---|---|---|---|
| Target labelled | refused (`EPERM`) | readable | `PROTECTED` |
| Direct read at target | refused (`EPERM`) | — | `PROTECTED` |
| Link labelled only | refused (`EPERM`) | readable | `PROTECTED`, but `treesVerified: false` |

The third row is the important one: labelling the **link** does stop the read, but descendant verification still
reports the tree as unverified. A link's own label is therefore not accepted as coverage — the label protects the
link object, and the verification records that it is not a basis for the contents.

### Limits

A synthetic clone establishes what the **mechanism** does. It does not establish that the real private target is
protected. Because the real target carries no observable label, and establishing one would require a descriptor
write that §7.1 forbids, the real content boundary is reported as
`REAL_runtime_HOME_CONTENT_BOUNDARY_NOT_ESTABLISHED`.

---

## H. Acceptance

All commands run under the pinned runtime `F:\Codex_Work_Space\Palimpsest\.runtimes\node-v24.22.0-win-x64\node.exe`
(Node 24.22.0; the system Node 24.14.1 is below the repository's `>=24.15.0` floor).

| Check | Result |
|---|---|
| `tsc -b` | exit 0 |
| `module-architecture.mjs --check` | PASS, 0 violations, 9 accepted baseline exceptions |
| `module-architecture.mjs --check-public-api` | PASS, 0 missing, 0 changed, 0 added |
| Non-gate suites (vitest) | **1439 of 1439 suites, 3690 of 3690 tests PASS** |
| Host-S1R + storage suites | **77 of 77 PASS** |
| Live first-party gates | **BLOCKED** — kernel-drift at pre-create, 33 suites |
| R1-HR / R1-HC conformance | **NOT_RUN** — same refusal |
| Dependency integrity after all phases | 7 of 7 invariants unchanged |
| Protected historical evidence | 52 of 52 trees unchanged |

The only new entry under `node_modules` after the whole stage is `.cache` (4 KB, gitignored), a vitest fixture
cache the R3 suites create. It is a test byproduct, not a dependency change, and it is recorded rather than
quietly removed.

The runtime installed on this machine is **0.2.1-rc.3**, not the `0.2.1-rc.2` the handoff records. Every
first-party result in this stage is attributed to the measured version.

---

## I. Evidence

`research-evidence/host-s1ra/`:

| Artifact | Producer |
|---|---|
| `environment-integrity-baseline.json` | `scripts/host_s1ra/measure-environment.mjs` |
| `baseline-environment-falsifiers.json` | `scripts/host_s1ra/reproduce-environment-defects.mjs` |
| `dsh-home-boundary-adjudication.json` | `scripts/host_s1ra/adjudicate-runtime-home.mjs` |
| `affected-gates-and-conformance.json` | `scripts/host_s1ra/generate-evidence.mjs` |
| `git-and-evidence-identity.json` | `scripts/host_s1ra/generate-evidence.mjs` |
| `final-verdicts.json` | `scripts/host_s1ra/generate-evidence.mjs` |
| `artifact-manifest.json` | `scripts/host_s1ra/generate-evidence.mjs` |

Every success claim names the producer and the Code Freeze it measured.

---

## J. Residual risks

### Active findings

1. **The real runtime Home's contents are not shown to be protected.** The target carries no observable label, and
   98 of its dependency junctions leave the target entirely.
2. **Descendant admission refuses the real installation.** `admissionEligible: false` with 234 unqualified
   external links. A Tool-capable production profile on this machine would be refused, by design.
3. **The `.bin` destruction mechanism is not established.** The previously asserted cause is false; the actual
   cause remains a hypothesis.

### Bounded limitations

1. **SIGKILL cannot be cleaned up after.** A forced termination may leave an owned root; recovery requires the
   marker, and a root without one is preserved rather than guessed at.
2. **Object identity is weak where `ino` is unavailable.** The record says so; deletion then rests on containment
   and the absence of a reparse point.
3. **The reaper cannot reclaim pre-marker roots.** That is deliberate.
4. **A synthetic arm does not prove the real target.** Stated in §G.
5. **`rmSync`'s junction behaviour is measured on this platform only.** It removed the entry and left the target
   intact here; the code does not depend on that either way.

### Unverified properties

1. Whether any real deployment's runtime Home target carries a label that this account simply cannot read. The
   observation cannot distinguish "absent" from "unreadable" without a descriptor write.
2. Whether the 83 stale worktree registrations in this repository's administrative state are safe to prune. They
   are **reported, not cleaned** — pruning is a mutation of shared state this stage is not authorized for.

---

## K. E2 decision

**Proceeding to a CONTROL experimental authorization is NOT permitted. Two independent blockers stand, and the
first is environmental rather than a property of the code.**

**Blocker 1 — kernel drift, and it blocks every live gate.**
The installed `@deepseek-ai/dsh-win32-process` is `0.2.1-rc.3`. The shipped fence pins `qualifiedVersion`
`0.2.1-rc.2` and refuses when the resolved version differs, so every worker exits nonzero at pre-create with
`kernel-drift` before an Agent is created. Host-S1R's own evidence records that it qualified against
`0.2.1-rc.2`; the runtime moved afterwards, and this stage neither changed it nor changed the pin.

This must not be worked around by editing `qualifiedVersion` — that would assert a qualification nobody performed.
The two legitimate resolutions are to restore the runtime at `0.2.1-rc.2`, or to perform a fresh first-party
qualification of the fence against `0.2.1-rc.3` and move the pin in a separately authorized stage.

**Blocker 2 — descendant admission refuses the real installation.**
`admissionEligible: false` with 234 unqualified external links, because 98 of the 98 dependency junctions in
`profiles/node_modules` resolve outside the runtime Home and the target carries no label establishing a content
boundary. That is a Host security property, and correcting it requires a production Host change rather than
another reconciliation stage.

What the environment **does** support:

- The engineering Agent can run, fail, recover, clean up and attest its tests without damaging the project assets
  those tests depend on. That is the stage's success criterion and it holds: 3,690 tests across 1,439 suites ran
  to completion with zero dependency damage, zero protected-tree changes and zero leaked test roots.
- A tool-free epistemic study could be considered independently: it needs no worker filesystem boundary, so the
  blocker above does not apply to it.

What remains unresolved for any stochastic work:

- Provider, model and cost authorization fields.
- Frozen Fixture and Oracle identities.
- The treatment-relevant CONTROL failure criteria.
- Raw structured-answer retention and rescoring policy.

The five R2-VR concerns are preserved unchanged: non-floor/non-ceiling outcomes; variation across at least two
relevant dimensions; variation in Treatment-relevant CONTROL failures; explicit relevance of available Trajectory
information to those failures; and no qualification manufactured by Treatment-irrelevant residual failures.

Correct UNKNOWN and justified deferral are not scored as failures.

No external model request was made in this stage.
