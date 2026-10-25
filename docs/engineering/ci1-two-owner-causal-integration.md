# Palimpsest-CI1 — Two-Owner Causal Integration

**Stage:** Palimpsest-CI1
**Branch:** `palimpsest-ci1-two-owner-causal-integration`
**Parent:** `95ce9b843948085f7a02fa86f62e867300440fc1` (E4 Evidence Freeze, tree `954a6be45d10e866f8f1a36d4ca69448e1eb9127`)
**Runtime:** `0.2.1-rc.3`, unchanged
**Evidence:** `research-evidence/ci1/`

---

## 1. Executive assessment

**What was demonstrated.** Two distinct Owners — real `Activation` artifacts produced by the shipped realization
service, not two labels in JSON — execute through the real Work stack, settle through the real normal consumer, and
produce separately attributable immutable results. The real Trajectory projection reconstructs both and invents no
causal edge between them. A cross-Owner dependency was established on measured bytes, and a misbound one failed hard.
Promotion authority was shown to be a head comparison rather than a function of arrival time, and duplicate delivery
was shown to converge rather than duplicate state.

**What failed or is not established.** Four things, each stated in §11 with its evidence:

- the delegated settlement route records **no completion-contract evidence**, so no locally *passing* candidate
  exists on that route;
- the late-result path (`ATTEMPT_LATE_RESULT`) is only legal from `EXPIRED`, so a `COMPLETED` attempt cannot exercise
  it and the test does not fake it;
- two real **DSH subprocess** Workers were not run concurrently — the subprocess port needs a model — so C1 is two
  genuine Owner-bound executions through the Work/Consumer machinery, which is narrower and true;
- the existing Trajectory vocabulary has **no relation kind** for a shared baseline or a cross-Owner data
  dependency, so the *independent oracle* records those expectations as inexpressible rather than smuggling in a new
  edge type.

**The decisive question**, from the ruling:

> Can Palimpsest correctly understand and conditionally accept the outcomes of two real Owners working
> asynchronously on a shared project, without confusing execution order, historical truth, asset version, evidence
> scope and current authority?

**Partially, and specifically.** It correctly keeps execution order out of causality, keeps historical truth
separate from current applicability, and refuses stale authority. It does **not** currently express a cross-Owner
causal relation at all, and it does not attach evidence to delegated results. Those are the two real gaps.

---

## 2. Git history and freeze audit

| Item | Value |
|---|---|
| Parent (E4 Evidence Freeze) | `95ce9b843948085f7a02fa86f62e867300440fc1`, tree `954a6be45d10e866f8f1a36d4ca69448e1eb9127` |
| C1 (E4 closure + inventory) | `32df005` |
| C2 (real two-Owner integration) | `fcda46f` |
| C3 (causal falsifiers) | `4c9b54d` |
| C4 (recovery and synthesis) | `ca4f3d3`, `0e56a7b`, `760060a` |
| Code Freeze | `b8013f62b23b2ffa50a3ae2cc27aa7fe4a2413a0`, tree `1d3a9202aa6139e49ff8e3d4a81c4e34be5aeec3` |
| Evidence Freeze | the commit adding this report and `research-evidence/ci1/ci1-evidence.json` |

Complete changed-path set against the parent:

```
A docs/engineering/ci1-c0-e4-evidence-closure.md
A docs/engineering/ci1-c1a-architecture-map.md
A research-evidence/ci1/e4-closure.json
A scripts/ci1/close-e4-evidence.mjs
A scripts/ci1/worker-module-trace.mjs
A scripts/ci1/worker-trace-plugin.mjs
A test/ci1_bounded_synthesis.test.ts
A test/ci1_causal_oracle.test.ts
A test/ci1_dependency_staleness.test.ts
A test/ci1_stale_and_duplicate.test.ts
A test/ci1_two_owner_causal.test.ts
```

**No production source file was modified.** Every executable addition is a test or a producer. That is the
strongest available statement that CI1 discovered and connected existing capability rather than adding to it.

---

## 3. E4 closure

Full detail in `docs/engineering/ci1-c0-e4-evidence-closure.md`. The essentials, including two corrections to E4's
own conclusions:

| Question | Answer |
|---|---|
| **C0-A** 3701 vs 3691 | The frozen 279-file selection contains **3701** tests, established by `vitest list` (collection without execution). 3691 is a **run property**: that run collected 278 of 279 files, and `3701 − 3691 = 10` is one small file's worth. **Which** file is unrecovered — no per-file manifest survives. |
| **C0-B** runner Exit 1 | Forks-pool **worker teardown**, with zero assertion failures and zero unhandled errors. Not reclassified as a pass. The specific child that failed to exit is unrecovered. |
| **C0-C** Worker module identity | Measured **inside the child** at three anchors. Runtime resolves to the external install at `0.2.1-rc.3`, `koffi 3.1.1`. The mounted host bundle and the fence it loads both come from the **run-owned test home** and declare **rc.3**. |
| **C0-D** freeze binding | The regression's **source is byte-identical** to the Code Freeze (zero modified executable files). It was **not rerun** after the freeze commit, and the report does not claim it was. |

**Two corrections to E4.** First, E4 could not demonstrate what the Worker loaded and said so; the in-child trace now
does. Second, E4 described the two runtime-home identifiers as homoglyphs differing in one character — they are pure
ASCII, differ at **all eight** positions, and do not render identically. The real defect was display-level identifier
loss, already corrected in `scripts/gates/runtime-home.mjs` and carried here.

A new environment boundary was also found: the boundary's label write succeeds under `%TEMP%` (C:) and is refused on
the repository volume (F:) by the shipped fail-closed gate, so **live Worker experiments run on C:**.

---

## 4. Source-level architecture map

Full detail in `docs/engineering/ci1-c1a-architecture-map.md`. The load-bearing findings:

**The Owner mechanism is `Activation`**, created in exactly one place: `makeRuntimeRealizationService().realize()`
(`src/runtime/realize.ts:142-277`). It requires a `RuntimeCarrierPort`, and **no production implementation of that
port exists** — `grep` over `src/adapters/`, `src/application/`, `src/tools/`, `host/` returns nothing. The durable
provenance is `ActivationRef`; the live `Activation` does not survive restart by design.

**The binding seam exists but demands a live object.** `ParticipationService` (`src/coordination/participate.ts:68-84`)
takes an `Activation`, not an `ActivationRef`. So a process holding only durable provenance cannot record
participation through the shipped service.

**The missing seam, named precisely:** *the product can record that an Activation participated in an Attempt, but it
has no production path that creates an Activation, and no path that binds a Worker execution to one.* CI1 did not
implement one; it supplied a **declared** carrier port and said so, which the ruling permits.

**There is no `Run` execution entity** — `RunDefinition` is digest-only (`src/run/definition.ts:19-21`), and
`grep -rn "CREATE TABLE runs"` returns nothing. The canonical identity is `(projectId, attemptId)`, and the `attempts`
table has **no owner column**.

**Trajectory reads the Work event store**, not the coordination store (`grep -rn "coordination" src/trajectory/` → 0
hits). Its 16 relation kinds (`src/trajectory/refs.ts:81-102`) contain **no shared-basis or cross-owner-dependency
edge**.

---

## 5. Code changes

**None in production source.** Every executable addition is a test, a producer or a diagnostic plugin. The one
non-test executable is `scripts/ci1/worker-trace-plugin.mjs`, a Cordis plugin mounted only by a test-owned profile and
unreachable in production.

The four CI1 test files are the deliverable; §6–§9 report what they establish. The three producers are:

| File | Purpose |
|---|---|
| `scripts/ci1/close-e4-evidence.mjs` | C0 closure, from frozen artefacts plus one bounded measurement |
| `scripts/ci1/worker-module-trace.mjs` | Drives the real Worker and collects its own module trace |
| `scripts/ci1/write-evidence.mjs` | Compact evidence manifest; runner exit codes are external inputs, labelled as such |

---

## 6. Real Worker results

`test/ci1_two_owner_causal.test.ts` — **PASS**, 1 test.

| Requirement | Evidence |
|---|---|
| Two real Owners | Two distinct `activationId`s allocated by the shipped realization service, from two `agentDefinitionId`s |
| Distinct Runs | Two distinct `(projectId, attemptId)` pairs, two distinct `result_commit`s, two distinct git trees |
| Shared immutable baseline | Both realizations share one `runDefinition.digest`; the baseline commit is unchanged before and after |
| Real Worker path | `start` → `prepareMutatingWork` → `worker.run` → `settleMutatingWork` → `report` → `recordCallback` |
| Normal consumer delivery | Both attempts `COMPLETED` in the `attempts` table, with `changed_files` exactly equal to each task's declared scope |
| Resource isolation | Each run in its own worktree under `<repo>/.palimpsest/worlds`; both removed |
| Real projection | `buildProjectTrajectory` over `composeTrajectoryInputs` contains both attempts and **no cross-attempt causal edge** |

**Scope, stated plainly.** The two `WorkWorkerRunPort`s are bounded test workers, and the carrier port is declared.
This is **not** two DSH subprocess Workers: that port requires a model and cannot complete a deterministic bounded
task. Its identity and delivery were established by E4's live gate and re-established by CI1's C0-C trace. What is
claimed is the narrower, true statement.

---

## 7. Causal experiments

### 7.1 The independent oracle

`test/ci1_causal_oracle.test.ts` — **PASS**, 1 test. The oracle is a pure function of fixture facts (declared tasks,
the attempt ids the consumer returned, the commits it reported) and is constructed **before** the projection is
consulted.

| Check | Result |
|---|---|
| Both attempts present as `ATTEMPT_CREATED` and `ATTEMPT_COMPLETED` nodes | yes — asserted **first**, so every negative below is non-vacuous |
| `ATTEMPT_PRODUCED_RESULT` established for each attempt | yes |
| `TASK_AUTHORIZED_ATTEMPT` established for each attempt | yes |
| Causal cross-attempt edges | **none** |
| Cross-result causal edges | **none** |
| Structure identical under both observation orders | **yes** — the `(relation, evidenceState)` multiset is equal |
| Real overlap | **174 ms**, established by a two-party rendezvous, not a timer |

### 7.2 The finding that made the control worth writing

The projection **does** emit an edge between the two attempts: `SAME_OWNER_SEQUENCE_SUCCESSOR`, from A's
`ATTEMPT_COMPLETED` to B's `ATTEMPT_STARTED`, because they are adjacent in the event log. That is **not** a defect —
`src/trajectory/projection.ts:481-497` labels it `TEMPORAL_ONLY` with the detail *"ordering only, not causation"*.

But it means the independence guarantee rests on a consumer **checking `evidenceState`**. A consumer that read edges
without it would see a cross-owner edge and could mistake it for a dependency. So the assertion is not "no edge
exists" — that would be false — but **"every cross-attempt edge is labelled non-causal"**, which is the property that
actually has to hold.

### 7.3 The dependent case

`test/ci1_dependency_staleness.test.ts` — **PASS**, 2 tests.

The dependency is **measured on bytes**: B's worker reads the file from its world and hashes it, refusing on
mismatch. The recorded digest is what B actually saw, not what anyone claimed.

| Distinction | Result |
|---|---|
| **Historical validity** | B1's consumption record still names **A1's digest** after A2 exists |
| **Current applicability** | The bytes at that path are now **A2's**, asserted separately |
| **Negative control** | A worker told to expect A1 while the world holds A2 **throws**, records A2's digest, and leaves **no `COMPLETED` attempt** |

### 7.4 The absent relation vocabulary

The oracle records, as a **named limitation**, that the shared immutable baseline is a real relation the existing
Trajectory cannot express: there is no `SAME_BASIS` or `SHARED_BASELINE` edge kind, and `sharedBaseline.expressibleByTrajectory`
is asserted `false`. This is reported rather than worked around by inventing a relation kind inside Trajectory core.

---

## 8. Qualification and recovery

`test/ci1_stale_and_duplicate.test.ts` — **PASS**, 2 tests.

| Question | Mechanism | Result |
|---|---|---|
| Historical validity | attempt report and commit blob | unchanged after every other operation |
| Current applicability | read `HEAD:<path>` directly | the canonical head is R1, stated separately |
| Promotion authority | `promote.ts:474-483` head comparison | a caller naming an unproven head is **refused**, and the refusal writes **nothing** (`PROMOTION_COMMITTED` stays 0) |
| Duplicate delivery | operation-derived idempotency key | **converges**: same `promotionId`, no second event, no second head advance |

**Four expectations were wrong, and the measurements corrected them.** Each is recorded where it happened:

1. A repeated promotion was expected to be **refused** as stale. It **resolved** — idempotent convergence is not
   staleness, and conflating them would have been a false claim about the product.
2. The head check was expected to fire before eligibility. It does not: promotion first requires the task in
   `VERIFYING`, so a probe on an `ACTIVE` task measures eligibility, not the head.
3. `ATTEMPT_LATE_RESULT` is only legal from `EXPIRED` (`src/domain/state_machine.ts:61`), so a `COMPLETED` attempt
   cannot receive a late result. That is correct product behaviour; the late-result path is therefore reported as
   **not exercised** rather than faked.
4. A blob digest and a materialized digest are **different identities** here (`core.autocrlf=true`). The test asserts
   they differ, so the normalization cannot silently become a no-op.

**No outbox, replay log or durable delivery table was added** — no measured failure called for one.

---

## 9. Bounded synthesis

`test/ci1_bounded_synthesis.test.ts` — **PASS**, 2 tests.

The gate machinery was used **as shipped**: `declareGate` appends `GATE_DEFINED`, and `GateEngine.evaluate` reads the
active Evidence projection for **one** subject and returns `PASS`/`FAIL`/`INCOMPLETE` with the clauses it used.

| Check | Result |
|---|---|
| A declared gate is found by the registry read | yes |
| A gate verdict is per-subject | yes — `subject_id` is the candidate's attempt, never the other's |
| A **combination** subject exists in the vocabulary | **no** — `attempt \| commit \| task` only |
| Evidence for a combination subject | **none** |
| A gate over an unevidenced subject | **`INCOMPLETE`**, never `PASS` |
| A local `PASS` implies a combination `PASS` | **no** — written as an implication over the actual verdicts |

### The measured gap

A fully settled **delegated** attempt produces this event log and **nothing** in the evidence table:

```
PROJECT_CREATED, GATE_DEFINED, ROLE_TABLE_DEFINED, STAGE_GRAPH_DEFINED, TASK_CREATED,
TASK_STARTED, ATTEMPT_CREATED, ATTEMPT_STARTED, CONTEXT_MANIFEST_ADDED, ATTEMPT_COMPLETED
```

`evidence` count: **0**.

The cause is structural. `makeMutatingAttemptService(...).settle(...)` (`src/work/attempt_execution.ts:330`) observes
the world, enforces scope and exports the commit, but **never runs the completion contract**. The mechanical checks
that emit `write_scope_valid` / `expected_files_exist` live in `ProjectController.report`'s finish path
(`src/tools/controller.ts:3184-3215`), which the delegated kernel does not call.

**So the two settlement routes differ in what evidence they produce.** That is reported, not repaired: repairing it
would change the settlement contract, which is beyond a conditional C4 and would need its own justification.

**C4's honest verdict** is therefore: *a declared gate cannot auto-qualify a combination, because there is no
combination subject and an unevidenced subject is `INCOMPLETE`* — **not** *two locally passing candidates were shown
not to imply a passing combination*, because no local `PASS` was reachable on this route.

No promotion infrastructure was added. The ruling says to stop at the decision record if C4 would need one; it did
not, so the decision record **is** the gate result.

---

## 10. Test and environment integrity

| Check | Result |
|---|---|
| `tsc -b` | **exit 0** |
| `module-architecture.mjs --check` | **PASS** — 0 violations, 9 accepted baseline exceptions |
| `module-architecture.mjs --check --public-api` | **PASS** — 0 missing / 0 changed / 0 added |
| CI1 tests, all five files together | **8/8 passed, exit 0** |
| `git diff --check` | exit 0 |
| Working tree | clean |
| Protected evidence trees | **65**, unchanged |
| Registered worktrees | **95**, unchanged |
| Historical `r3lcfsh-worktree-SMlvwB` | present, untouched |
| Shared gate root | **19** entries, all five `p2b-c3-OWNED-*` intact |
| Real `~/.dsh` | still a link to `D:/dsh`; no file written, no label applied |
| Global runtime install | unmodified |

**One resource boundary worth naming.** The boundary's label write succeeds under `%TEMP%` and is refused on the
repository volume. All CI1 live experiments therefore ran under `%TEMP%`, and the volume is recorded with the
evidence. This is an environment boundary, not a product defect.

**Runner exit is reported as measured.** The CI1 combined run exited 0. E4's broad-regression exit 1 is carried
forward unresolved; a CI1 pass does not repair it.

---

## 11. Remaining limitations

1. **The delegated settlement route records no completion-contract evidence** (§9). This is the most consequential
   finding: it means a delegated result carries no evidence atoms, so any gate over it is `INCOMPLETE` by
   construction.
2. **The late-result path was not exercised.** `ATTEMPT_LATE_RESULT` requires `EXPIRED`; a `COMPLETED` attempt cannot
   reach it, and no attempt was forced into expiry to manufacture the case.
3. **No cross-Owner relation is expressible.** Trajectory has 16 relation kinds and none of them means "shared
   baseline" or "B consumed A". The oracle reports this as inexpressible rather than inventing a kind.
4. **No production Activation path exists.** The product cannot create an Owner at all without a carrier port, and
   the participation service demands a live `Activation` rather than a ref.
5. **Two real DSH subprocess Workers were not run concurrently.** The subprocess port needs a model. Its identity and
   delivery are qualified separately by E4 and by C0-C.
6. **E4's unresolved runner lifecycle defect** (which child failed to exit, whether any survived) is unchanged.
7. **No model-in-the-loop behaviour** was exercised. The ruling makes it optional; it was not added.
8. **E3 quarantine residual TOCTOU** is unchanged, as are **L1-only** execution, **structural** sharing provenance,
   **rc.3 qualified only for exercised operations**, and the **unestablished real runtime Home boundary**.
9. **The stale deployment copy in the real runtime home** differs from the repo in exactly the two files E4 changed.
   It is **not** on the executed path — the fence loads from the run-owned home — but any execution that resolved the
   deployment package from the runtime installation would enforce rc.2 and use the pre-fix reader. It was not
   modified.
10. **No full shared-asset multi-writer qualification.** The candidates never write the same file.

---

## 12. Freeze identities and verdicts

| Item | Value |
|---|---|
| **Code Freeze** | **`b8013f62b23b2ffa50a3ae2cc27aa7fe4a2413a0`**, tree **`1d3a9202aa6139e49ff8e3d4a81c4e34be5aeec3`** |
| **Evidence Freeze** | the commit that adds this report and `research-evidence/ci1/ci1-evidence.json` |
| Executable diff, Code → Evidence Freeze | **documentation and evidence only — zero executable changes** |

### Verification performed AT the Code Freeze `b8013f6`

| Check | Result |
|---|---|
| `tsc -b` | exit 0 |
| `module-architecture.mjs --check` | PASS — 0 violations, 9 baseline exceptions |
| `module-architecture.mjs --check-public-api` | PASS — 0 / 0 / 0 |
| CI1 tests, all five files | **8/8 passed, exit 0** |
| Evidence trees | **66** = 65 protected + the new `ci1` tree |
| Pre-existing evidence trees vs parent | **unchanged** (`git diff` empty) |
| Worktrees | 95 |
| Shared gate root | 19, all five `p2b-c3-OWNED-*` intact |

### Verdicts

| Verdict | Result |
|---|---|
| **V0 — E4 Evidence Integrity** | **ESTABLISHED_WITH_NAMED_LIMITS.** Four questions answered; three limits carried (which 10-test file, which child, no clean full-selection exit 0). Two E4 conclusions corrected. |
| **V1 — Real Two-Owner Execution** | **QUALIFIED FOR THE WORK/CONSUMER PATH.** Two genuine Owner-bound executions settle through the real consumer. Not qualified for two DSH subprocess Workers. |
| **V2 — Candidate Provenance** | **QUALIFIED.** Content identity is a git tree/commit, not a filename; the misbound-dependency control fails hard. Owner/Run/Task binding is via `ActivationRef` and `(projectId, attemptId)`; the candidate store itself does not name the attempt, which is a named limitation. |
| **V3 — Causal Projection** | **QUALIFIED FOR INDEPENDENCE AND ORDER.** No fabricated causal edge, order-independent structure, temporal edges honestly labelled. **NOT ESTABLISHED** for expressing a cross-Owner dependency. |
| **V4 — Stale and Duplicate Handling** | **QUALIFIED FOR AUTHORITY AND DUPLICATES.** Stale authority is a head comparison that refuses; duplicates converge. **NOT ESTABLISHED** for the late-result path. |
| **V5 — Bounded Trusted Synthesis** | **ESTABLISHED NARROWLY.** A declared gate cannot auto-qualify a combination. Not established that a locally passing candidate exists on the delegated route. |
| **V6 — Historical and Environment Integrity** | **UNCHANGED.** 65 trees, 95 worktrees, gate root 19, `~/.dsh` intact, runtime unmodified. |
| **V7 — Overall CI1** | **`CI1_QUALIFIED_FOR_THE_WORK_CONSUMER_AND_CAUSAL_INDEPENDENCE_PATH`** |

**Why V7 is not a broader claim.** Three prerequisites for a stronger verdict failed on measurement, not on effort:
no evidence on the delegated route, no cross-Owner relation vocabulary, and no concurrent real subprocess Workers.
Each is named above with its evidence. Reporting a broader qualification would require claiming a behaviour that was
not demonstrated.

---

## 13. Next-stage recommendation

The narrowest move that addresses a **measured** deficiency is **evidence attachment on the delegated settlement
route** — the gap in §9. It is the only finding that blocks a whole capability rather than bounding one: without
evidence atoms, no gate can pass over a delegated result, so qualification of autonomous work cannot proceed at all.

Concretely: run the completion contract from the delegated kernel, or have the kernel call the same finish path, and
then re-run C4 to see whether a locally passing candidate becomes reachable. That is a correction to one call path,
not a new subsystem.

Three independent items are also justified and smaller:

1. **A cross-Owner relation kind**, if the shared-baseline relation must be expressible. This touches Trajectory core
   and needs its own ruling, because adding a relation kind changes what the projection claims.
2. **The stale deployment copy in the real runtime home** — an authorised operator decision; this stage could not and
   did not touch it.
3. **The E4 runner lifecycle defect** — unchanged, and still the reason no clean full-selection exit 0 is on record.

No Agent, Workflow or Trajectory redesign is proposed, and no general infrastructure rewrite is warranted by anything
measured here.
