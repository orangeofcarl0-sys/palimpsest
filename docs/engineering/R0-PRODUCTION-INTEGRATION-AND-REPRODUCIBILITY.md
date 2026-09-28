# R0 — PRODUCTION INTEGRATION & REPRODUCIBILITY

This document answers one question:

> Can another engineer obtain the exact repository and independently reproduce the claims of
> E0–E-LIVE?

It is not a README and not a rewrite of the SDK guide. It records the exact revision, the toolchain,
the canonical commands, the expected counts, the environment assumptions, and the issues R0 found —
including the ones R0 itself fixed, so that a reader can tell a reproduction failure from a defect
that has already been closed.

---

## 1. The revision

Three identities have to be kept apart, because they are not the same commit and collapsing them
would misstate what the evidence evaluates:

| identity | commit | what it is |
|---|---|---|
| **R0 code-state RC** | `6a3c8c1` | the code state R0 itself closed on; a local commit, made before anything was pushed |
| **R0-R final code-state RC** | `7ca1004` | the last code/harness/packaging/test commit of the R0-R stage |
| **R0-M code-state RC** | `83feb0f` | the last code/harness commit of the R0-M stage — **the commit the evidence artifact currently attests** |
| **artifact on top** | *the tip* | the evidence commit carrying manifest and this document; an attestation *about* `83feb0f`, not product code |

The branch tip is by construction the evidence commit on top of the code-state RC, so pinning its SHA
inside a document that the tip itself contains would be self-defeating. The exact value is recorded
where it can stay correct: `attests.generatedAtCommit` in
`release-evidence/r0-release-evidence.json`, alongside `attests.subjectCommit` (the commit evaluated)
and `attests.generatedFromCleanTree` (whether the tree the counts came from was clean — counts
captured from a dirty tree are evidence about no commit). The generator derives `subjectCommit` from
history and refuses to run if `R0_ATTESTED_COMMIT` disagrees with it, so a regenerated artifact cannot
silently misname the code state it evaluates.

The E-stage line is linear on the last accepted pre-E baseline. Every commit below is an ancestor of
the branch tip, in this order, with no side merges, no dropped commits and no duplicated patch-ids.
The R0-M commits are described by subject rather than by SHA, because the document is *inside* the tip
and therefore cannot name commits that do not exist until it is committed; the machine-checkable
record is in the evidence artifact (see above).

| commit | stage | subject |
|---|---|---|
| `9ec76ff` | *baseline* | `refactor(sr2-closure): the last two re-derived Work reads move to the owner (#213)` |
| `0042a2e` | E0 | Project Production Constitution |
| `05d099a` | E1-K | Governed Knowledge Reuse |
| `1b658e8` | E2-I | Governed Project Intent Reconciliation |
| `f081d1c` | E3-C | Sovereign Collaboration |
| `b86c43b` | E4-L | Institutional Learning |
| `ad8f3e6` | E5-P | Procedural Capitalization |
| `ec40f6b` | E-LIVE | Long-Horizon Compounding Dogfood |
| `70c2425` | R0 | production integration & reproducibility closure |
| `3ef1002` | R0 | the three reproduction defects a clean checkout exposed |
| `ec51796` | R0 | the reproducibility contract and the release evidence manifest |
| `b702712` | R0 | the e4l cleanup hook timeout |
| `6a3c8c1` | **R0 / code-state RC** | the memoized module-graph analysis in the knowledge-boundary probes |
| `5ff47d0` | R0 | attest the release candidate with the measured evidence |
| `4da3210` | R0-R | tighten the review surface and put the gates in CI |
| `c6801d3` | R0-R | regenerate the release evidence under the §3.4 attestation schema |
| `237ab75` | R0-R | quote the skip message so the r0-gates workflow parses |
| `7ca1004` | **R0-R / code-state RC** | resolve npm/pnpm portably in the consumer smoke |
| `03ea369` | R0-R | record the remote-CI results and classify the node floor |
| `83feb0f` | **R0-M / code-state RC** | derive the attested commit, assert a clean generation tree, tighten D5 |
| *R0-M* | R0-M | state the three revision identities and the corrected D5 classification |
| *R0-M / evidence* | R0-M / evidence | attest the code-state RC with a clean-tree generation |
| *(tip)* | R0-M / evidence | attest the code-state RC with a clean-tree generation |

`9ec76ff` is also the current `origin/main`, so the line sits directly on the published mainline and
no rebase is required.

Cumulative production change from the pre-E baseline: **100 files, +22 537 / −81** for E0–E-LIVE, plus
R0/R0-R/R0-M's own changes (harness, packaging, tests, CI and docs only — **no** `src/`, `tools/` or
`architecture/` file changed in any of the three review stages). The whole stack measured against
`origin/main` touches **113 files**; the exact insertion count is not restated here because editing
this document changes it.

```text
git rev-parse HEAD                     # the branch tip (the evidence commit)
git merge-base HEAD origin/main        # 9ec76ff…  (no divergence)
git merge-base --is-ancestor 9ec76ff HEAD   # exit 0
```

## 2. Toolchain

| tool | version used | notes |
|---|---|---|
| Node | `v24.14.1` | `node:sqlite` is used directly; it is experimental and emits `ExperimentalWarning` |
| pnpm | `11.21.0` | the repository's package manager; `pnpm-lock.yaml` is committed |
| Git | `2.53.0.windows.2` | worktrees are used by the gates and by the D2/D4/D5 matrices |
| TypeScript | `7.0.2` (devDependency) | `tsc -b` is the build |
| OS used for this evidence | Windows 10 (`win32 10.0.26200`), Git Bash / MSYS | see §6 for the platform-specific assumptions |

### The `engines` field is stricter than the toolchain that runs it

`package.json` declares `"engines": { "node": ">=24.15.0" }`, while every command in this document was
executed on Node `24.14.1`, which satisfies nothing about that range. Nothing in the tree uses a 24.15
feature: the only version-sensitive dependency is `node:sqlite`, which is present and functional on
24.14. The declaration dates from the P0 contract-core port and has never been exercised, because
`engine-strict` is not set and pnpm only warns:

```text
[WARN] Unsupported engine: wanted: {"node":">=24.15.0"} (current: {"node":"v24.14.1","pnpm":"11.21.0"})
```

This is classified **POST-R0 FOLLOWUP** (§7). It does not block reproduction on 24.15+, but the
declared floor is not the floor anyone has tested, and a CI runner pinned to `24` resolves to the
newest 24.x rather than to the declared minimum. R0 did **not** change the value: lowering a declared
floor on the strength of a warning is a compatibility claim, and deciding the intended floor is the
maintainer's call, not a reproducibility fix.

## 3. Clean setup

The clean check is the whole point of R0, so it must not reuse anything:

```sh
git clone --no-hardlinks --branch r0-production-integration <repo> r0-clean
cd r0-clean
pnpm install --frozen-lockfile
```

Do **not** copy `node_modules/`, `dist/`, `*.tsbuildinfo`, any `*.tgz`, `.palimpsest-gates/`, or any
`.sqlite` file from a working tree. R0 verified the clone carries none of them:

```sh
ls -a | grep -E 'node_modules|dist|\.tgz'   # no output
```

## 4. Canonical validation commands

Run sequentially, uncontended. Every command below was executed in the clean clone described in §3.
The expected counts are those of the **current branch tip** (R0-R); the R0-era measurement at
`6a3c8c1` is stated separately below it, because two of these numbers legitimately changed after R0.

| # | command | expected |
|---|---|---|
| 1 | `pnpm build` | exit 0, 0 errors |
| 2 | `pnpm exec vitest run` | 2923 passed / 248 files, **0 errors** |
| 3 | `pnpm test:e2e` | 38 passed |
| 4 | `pnpm architecture:check` | `PASS`, 0 violations, 9 baseline exceptions observed |
| 5 | `pnpm architecture:check-public-api` | `PASS`, missing 0 / changed kind 0 / added 0 |
| 6 | `pnpm gate:e1-k-live` | 14 PASS / 0 FAIL |
| 7 | `pnpm gate:e2-i-live` | 14 PASS / 0 FAIL |
| 8 | `pnpm gate:e3-c-live` | 21 PASS / 0 FAIL |
| 9 | `pnpm gate:e4-l-live` | 10 PASS / 0 FAIL |
| 10 | `pnpm gate:e5-p-live` | 11 PASS / 0 FAIL, 38 findings |
| 11 | `pnpm gate:e-live` | 28 PASS / 0 FAIL |
| 12 | `pnpm gate:d2-live` | 15 PASS / 0 FAIL |
| 13 | `pnpm gate:d4-live` | 21 PASS / 0 FAIL |
| 14 | `pnpm gate:d5-live` | 10 PASS / 0 FAIL |
| 15 | `pnpm release:consumer-smoke` | `PASS external consumer smoke` |

**Re-run after deleting generated state.** The gates keep their fixtures under
`$PALIMPSEST_GATE_ROOT` (default `~/.palimpsest-gates`). R0 deleted that entire tree and re-ran
`gate:e-live` and `gate:e5-p-live`; both produced identical verdicts, so no gate depends on leftovers
from a previous run.

**Measured result of this exact sequence** on a clean clone at `6a3c8c1` (R0's own code-state RC):
build 0 errors; **2921** tests in 248 files with 0 errors; 38 e2e; architecture 0 violations; public
API 0/0/0; and 14/14/21/10/11/**24**/15/21/10 verdicts across the nine live gates; consumer smoke
`PASS`. R0-R later added the `e-live_derivation` test file and extended `gate:e-live` from 24 to 28
verdicts, which is why the table above reads 2923 and 28 — the numbers differ because the *harness*
grew, not because a measurement was revised.

**One known flake, recorded rather than hidden.** `gate:d5-live` failed once in eight sequential runs
of the RC with `the scheduler never offered TASK_STARTED for tb`, and passed on every retry (four
consecutive). D5 drives two sibling tasks *concurrently* and waits for the scheduler's own
`TASK_STARTED` decision to point at one exact sibling (`driveTask(taskId)`); under load the decision
can be offered for the other sibling first and the gate's bounded wait gives up. This is an ordering
assumption **in the gate**, not a demonstrated kernel race: the scheduler behaved consistently with
its contract, and nothing in D5 or any product source was weakened. R0 touches neither, so this is
not an R0 regression — but a reader re-running the suite may hit it, and it is listed in the evidence
manifest so the failure is not mistaken for a reproduction problem.

### Determinism of `gate:e-live`

Two runs of `gate:e-live` produce **byte-identical verdict lists** (28 PASS each at the current tip).
The run *output* differs only in allocated identifiers: `CONTACT_NEED_DECLARED` uses
`need-${randomUUID()}`, and the procedure ids are content-addressed from digests that include those
uuids. The counts, verdicts and the derived implementation are stable; a diff-based check should
compare verdicts, not ids.

## 5. Environment assumptions

Every external assumption, classified:

| assumption | classification | detail |
|---|---|---|
| Node ≥ 24, with `node:sqlite` | **documented requirement** | the kernel's event store is a `node:sqlite` database; `ExperimentalWarning` is expected output |
| `git` on `PATH` | **documented requirement** | the Work kernel materializes attempt worlds as worktrees and commits into them |
| pnpm (lockfile-driven install) | **documented requirement** | `pnpm-lock.yaml` is committed; `npm install` cannot resolve the pinned `@ordarium/*` tarball specifiers |
| network access to the `@ordarium/*` GitHub release tarballs | **documented requirement** | they are `dependencies`/`devDependencies`; an offline install is not supported |
| `$PALIMPSEST_GATE_ROOT` defaults inside the user profile | **platform-specific test assumption** | measured on Windows: DSH's PTC sandbox grants a worker's write capability via `SetNamedSecurityInfoW`, which needs `WRITE_DAC`. The user holds FullControl inside their own profile but only inherited Modify on `F:`/`E:` and on `C:\`, so a fixture beside the repository fails with `grantWrite(<dir>)`. The default is documented in `scripts/gates/env.mjs`; `PALIMPSEST_GATE_ROOT` overrides it |
| the gates' `PALIMPSEST_GATE_REPO` defaults to the running checkout | **portable implementation** | overridable; a gate may validate a different checkout's `dist/` |
| `python -m pytest` | **intentionally absent** | `test/lean_governance.test.ts` pins that no default gate command ships `pytest`; the `docker/minimal/` scripts install it inside their container |
| Playwright browsers | **documented requirement for `test:e2e`** | `@playwright/test` is a devDependency; unit tests do not need a browser |

**Unintended local dependencies: none found in the product or the gates.** The only absolute local
paths in the tree are in `scripts/experiments/`, `scripts/dogfood/`, `scripts/management/`,
`scripts/proof/`, `scripts/recipes/` and `scripts/interaction/` — the pre-existing hosted-dogfood
harnesses, which default `DSH_HOME` to `C:/Users/66494/.dsh` as a convenience fallback and are
overridable through the environment. None of them is part of the canonical suite, none was touched by
E0–E5-P, and none is required to reproduce any claim in this document.

## 6. Package smoke

```sh
pnpm release:consumer-smoke
```

The script builds the distributable, inspects what it would ship, installs it into a throwaway
project **outside the repository**, and drives only the public surface.

Declared entrypoints (`package.json#exports`), all four E-plane subpaths added by R0:

| subpath | contents |
|---|---|
| `palimpsest-dsh` | schema, domain, state, scheduler |
| `palimpsest-dsh/advanced` | effects, evidence, select, allocate, telemetry, tools, `installPalimpsest` |
| `palimpsest-dsh/procedures` | E5-P: `ProcedureStore`, `SqliteProcedureStore`, content/candidate/admission contracts |
| `palimpsest-dsh/project-intent` | E2-I: `ProjectIntentService`, admission port, proposal/receipt types |
| `palimpsest-dsh/project-collaboration` | E3-C: `ProjectCollaborationService`, authoring/admission ports |
| `palimpsest-dsh/institutional-learning` | E4-L: `InstitutionalLearningService`, intervention projection types |

Expected output: the tarball installs, `installPalimpsest` starts a project with one READY task, the
capabilities whose owners were supplied (`intent`, `procedures`) are present, the ones whose owners
were not (`projectCollaboration`, `institutionalLearning`) are **honestly absent** rather than
stubbed, and `dispose()` returns cleanly.

Two packaging notes, recorded rather than fixed:

- The tarball includes ~1020 compiled test files and the 22 gate files. They are inert (nothing imports
  them) but they are dogfood evidence, not product, and they dominate the 8.6 MB packed size. A `files`
  allowlist would trim this. **POST-R0 FOLLOWUP.**
- `"private": true`, so the artifact is a local/CI tarball rather than a publishable package.

## 7. Issues found, classified

### Fixed by R0

| # | issue | class |
|---|---|---|
| 1 | `package.json` declared no `exports` entry for the four E-plane barrels, and a declared `exports` map blocks every unnamed subpath. `palimpsest-dsh/procedures` threw `ERR_PACKAGE_PATH_NOT_EXPORTED`, so **no external embedder could supply a `procedureStore`** — the E5-P capability was unusable outside the repository. The live gates never noticed because they import `dist/src/<plane>/index.js` by filesystem path, which bypasses the package boundary. | **BLOCKER for embedders** — packaging defect |
| 2 | `test/e4l_institutional_learning.test.ts` produced 22 unhandled rejections: its cleanup called the async `dispose()` without awaiting it, and separately closed a memory store the install already owns (`CALLER_SUPPLIED_INSTALL_MANAGED_LEGACY`), throwing `database is not open`. | **test isolation defect** — visible only in a clean checkout |
| 3 | R0's own `r0_package_exports.test.ts` read `entry.import` on a possibly-undefined value; an incremental `tsc -b` had not rechecked it, and only the clean build failed. | **R0 self-inflicted** — caught by the clean build |
| 4 | `public_api_parity` pinned `exports` to exactly `['.', './advanced']`, so fix #1 failed a pre-existing pin. The pin's intent is "an entrypoint cannot drift in or out unnoticed", so it is **extended** to the documented set rather than loosened. | **pin update**, intent preserved |
| 5 | The E-LIVE gate measured the acceptance suite **before** promotion, so Generation 0 and the paired control were reported as the H0 stub's 0/8 instead of the naive implementation's 4/8 — overstating the compounding jump. | **live-gate defect** |
| 6 | The E-LIVE gate counted each `node --test` failure twice (summary list + "failing tests:"), reporting three distinct cycle failures as "six". | **live-gate defect** |
| 7 | The E-LIVE worker consumed the procedure at **Level 1**: it saw a cycle keyword and wrote a pre-written file. It now derives the implementation by interpreting the method's structured clauses, and `C.22` proves the content drives the behaviour. | **harness improvement** (§20 explicitly allows it) |
| 8 | Generation 1's reasoning `claimId` crossed the cold restart as a JavaScript variable; it is re-read from the durable cell frontier. | **live-gate defect** (§22) |
| 9 | `e0e_knowledge_boundary`'s collaboration-firewall bite test called `clone()` per synthetic breach, and each call re-ran `analyseModuleArchitecture` over the whole module graph. Ten breaches cost ten full analyses and timed the test out at the 30s default in a cold run, while passing in a warm incremental one. Now the analysis is computed once and cloned per probe. | **test flake**, visible only in a clean checkout |
| 10 | Having awaited the `e4l` disposals (fix #2), that file's `afterAll` legitimately exceeded vitest's 10s hook default; the timeout is now stated explicitly. | **consequence of fix #2** |

### Post-R0 followups

| # | issue |
|---|---|
| 11 | `engines.node` declares `>=24.15.0`; see §10 for the classification after the R0-R Linux run. |
| 12 | The tarball ships compiled tests and gate fixtures; a `files` allowlist would make the artifact honest about what it is. |

## 7a. R0-R — remote CI, and the two defects only Linux could find

R0-R put the stack in front of remote CI for the first time (PR #214, base
`e-live-intellectual-compounding`). It found two more real defects, both in tooling rather than in
product semantics, and both invisible to every local run:

| # | issue | class |
|---|---|---|
| 18 | The new `r0-gates` workflow did not parse at all: an unquoted `echo "skipped: no DSH host…"` made YAML read the colon as a mapping separator, so GitHub rejected the file and every run died in **0 s with zero jobs**. | **CI defect**, now validated with a real YAML parse before push |
| 19 | `consumer-smoke.mjs` resolved `npm-cli.js` at the **Windows** nodejs.org layout only, so the Linux run died with `Cannot find module …/bin/node_modules/npm/bin/npm-cli.js`. Both the npm and pnpm resolvers now check the layouts that actually occur, verify the file exists, and fall back to PATH. | **portability defect** — the script had never run anywhere but Windows |

The second one is the important one: R0 added the smoke *because* the packaging boundary was untested,
and the smoke itself turned out to be platform-locked. Remote CI is what caught it.

### Measured on Linux (ubuntu-latest, Node v24.21.0, pnpm 11.28.0)

```
unit        2923 passed / 248 files
e2e         38 passed
architecture / public API         PASS (0 violations / 0 0 0)
gate:e1-k 14 · e2-i 14 · e3-c 21 · e4-l 10 · e5-p 11 · e-live 28   ALL PASS
package-smoke  PASS — all six declared subpaths resolve from the installed tarball
```

`D2/D4/D5` require the private `@deepseek-ai/dsh` host, which a stock runner does not have; those jobs
emit an explicit `::notice::` and **skip** rather than reading as red, so the CI signal is honest about
what it did and did not run.

### D5 reliability pressure (§6)

`gate:d5-live` was run **20 times sequentially** and passed **20/20**, with every outcome recorded
rather than only the final status. Combined with the single failure observed in eight earlier local
runs, this classifies the event as:

> **KNOWN GATE-LEVEL SCHEDULER-ORDERING FLAKE, NONBLOCKING** — isolated and non-reproducible. The
> flake is in the *gate's* wait, not in the kernel: `driveTask(taskId)` requires the scheduler's
> `TASK_STARTED` decision to point at one exact sibling under concurrent drive, and under load it may
> point at the other first. No kernel race was observed or demonstrated. No repeatable failure was
> observed, so this is not a reliability blocker, and the D5 gate was not weakened.

The CI reliability job applies the same three-way threshold rather than a binary one: **0 failures**
is PASS, **1** is a known isolated flake reported as a warning, and **≥2** is a reliability blocker
that fails the job. A single re-run of a flaky gate is not accepted as evidence anywhere in this
matrix.

### Deferred pressures (unchanged)

| # | pressure | why it is not a blocker |
|---|---|---|
| 13 | **G-4** — `PeerRef` ↔ `PersistentPoint` | Assessed during E-LIVE: `PeerRef` reconnected across two cold restarts using existing durable state; no correctness failure was observed. |
| 14 | **G-15** — Participation | Assessed during E-LIVE: every operator question about the dogfood project was answerable from existing Attempt/Activation/Federation surfaces. |
| 15 | **Relevance selection** | V1 selection is explicit. Candidate assets are discoverable by owner query; judging their *relevance* is the host's judgement. E-LIVE §16 permits explicit selection as long as the ids come from durable state, which `R1.1`/`R1.1a`/`G2.6` prove. |
| 16 | **E-LIVE scale / stochastic generalization** | The compounding mechanism is demonstrated in one deterministic scenario with three generations and one peer. Its behaviour under many assets, many participants, or a stochastic worker is not measured. |
| 17 | **`install_contract.ts` composition pressure** | At **700/700 LOC and 40/40 fan-out**, i.e. exactly at both ceilings, with every hotspot ratchet still biting and no ceiling raised. This is an **ACTIVE ARCHITECTURE SIGNAL**: the next capability that wants a field on the aggregate install contract must decompose structurally rather than compress. R0 needed no install-contract capacity and made no change to it. |

## 8. Release / integration recommendation

**Option A — retain the staged commits.** Recommended, and the default.

Each E commit is a semantically reviewed closure with its own gate and its own ruling. Squashing them
would destroy the bisectability that makes "which stage introduced this?" an answerable question, and
the six E-stage gates are named after the stages they close. The line is linear, has no merges, sits
directly on `origin/main`, and every commit builds.

**Option B — squash** is permitted only if repository policy prefers it; it would require re-running
every gate on the squashed result and preserving this commit map in the docs. Nothing observed in R0
argues for it.

**Upstream divergence: none.** `origin/main` is `9ec76ff`, which is the baseline the E line was built
on, so there is no rebase to perform and no semantic conflict to resolve. If `main` advances before
integration, re-run §4 in full on the rebased result rather than assuming the gates still hold.

**Outward action.** R0 itself pushed nothing. R0-R then pushed `r0-production-integration`, opened
PR #214 (base `e-live-intellectual-compounding`), and opened the umbrella PR #215
(`r0-production-integration` → `main`). `main` is still `9ec76ff` and the package is unpublished.
Neither PR was merged or squashed; merging is an outward, state-changing action that R0-M does not
perform without explicit authorization. The PR descriptions carry their own commit and file counts,
which move as commits land; this document deliberately does not restate them, because a count written
here is stale the moment the commit containing it exists.

`release-evidence/r0-release-evidence.json` keeps the outward state at each capture distinct rather
than editing one historical claim. `atCodeStateCapture` is preserved verbatim as historical truth —
R0's own RC `6a3c8c1` was genuinely unpushed — but it now also names the `subjectCommit` it describes,
so it cannot be mistaken for a claim about a later code state. The currently attested subject was
committed *after* the push and after PR #214 opened, so it gets its own `atAttestedSubjectCapture`
instead of inheriting a claim that would have been false of it. The field describing the mutable
present is deliberately called `outwardStateAtEvidenceCapture` rather than `current`, so a later stage
cannot mistake a snapshot for a standing claim.

## 9. What this document does NOT claim

- It does not claim the E-LIVE textbook effect generalizes beyond the measured scenario. E-LIVE's own
  §14 forbids that, and its report marks the generalization as interpretation.
- It does not claim the deferred pressures (G-4, G-15, relevance selection, scale) are resolved, only
  that none failed in a way R0 could observe.
- It does not claim every platform is supported. §5 states what is genuinely required and what is a
  measured Windows assumption.
- It does not claim `D2/D4/D5` ran on CI. They need the private `@deepseek-ai/dsh` host and **skipped**;
  their Linux behaviour is therefore still unverified, and only their Windows evidence stands.

## 10. `engines.node`: the declared floor, classified

`package.json` declares `>=24.15.0`. Two data points now bear on it:

| interpreter | satisfies `>=24.15.0`? | full matrix |
|---|---|---|
| `v24.14.1` (local, Windows) | **no** | passes entirely |
| `v24.21.0` (CI, ubuntu-latest) | yes | passes entirely |

**Classification: the declared floor is satisfied by a tested interpreter, but its necessity is
unverified.** The machine that produced most of this repository's evidence runs an interpreter the
declaration excludes, and nothing observes the difference — so the floor is neither justified as a
requirement nor shown to be wrong. R0-R deliberately did **not** lower it: a lower bound is a
compatibility promise, and R0-R's job is to report, not to widen support on the strength of two
interpreters that happen to agree. The action, when someone chooses to take it, is either to lower the
floor to a tested value or to pin CI to the declared one; either way the claim should match evidence.
