# COG-6 — Executable Evolution Results (Deterministic Mechanism Arm)

**Question:** can an authorised external source change and a current-basis re-analysis execute through
the existing Work, Promotion, head-reconciliation and result-continuation owners?

**Answer:** **yes for the product mechanism, with one bounded correction.** An operator-authored intake
applied the exact frozen candidate; the accepted blob equals the candidate; normal Promotion advanced
the proven effect head; the held technical result was assessed `INCOMPATIBLE`; the continuation service
minted its own rework permit, reconciled the head and delegated a new D2 attempt on the accepted basis;
the new result is a negative finding; normal Promotion made the task `SATISFIED`.

**This is NOT an Agent result.** The intake was authorised by the test-owned operator against a frozen
candidate; the Worker is a deterministic in-process `WorkWorkerRunPort`, not a model. H6-E is **NOT
ESTABLISHED** because no Agent proposed or approved the action. The mechanism gates are reported
separately from the Agent gates.

**Evidence:** `research-evidence/cog6/runs/main/` (`run.json`, `events.json`, `worktree.json`,
`rubric.json`, `candidates.json`, `files/`), `research-evidence/cog6/outcomes.json`.

---

## 1. Initial state

| item | value |
| --- | --- |
| initial canonical head | `195d691f3569b45ca89d3ba131ee3cd30169f90d` |
| after two historical promotions | `73e7a3daf08c1450568a37e229547a0ec9df6154` |
| ProjectIR revision before the evolution | 3 |
| historical tasks | `technical-fit` and `cost-schedule`, both `SATISFIED` through genuine D2 results and normal Promotions |
| current task | `technical-refresh`, `READY` — re-check the technical fit against the current data |
| Journal | `NEGATIVE_RESULT` (2023 V2 cold-start failure), `OPEN_QUESTION` (Solaris certificate not on file), `OPPORTUNITY` (switch Site B to V2) resolved `DISMISSED` |
| canonical capabilities digest | `f81576167c284060eb494706e424204d99028823fe71bf56476883d49e4d9373` |
| candidate A | `0e997cbcc04ac1ee4c9b8d2985e2dd97443136d0f57b838f01d25de2403f920c` (V3 `min_c` -10 → 0) |
| candidate B | `14ffdd6525d292f33e86f568d9ecfd8fc5dfe47019e1bfaa76bb055ffc07bc91` (V4 coastal yes) |

The candidate lives in an external inbox outside the canonical Git tree. The initial ProjectIR does
not contain the intake task.

---

## 2. The authorised path

### 2.1 Operator authorisation and the intake task

The operator policy was applied to the frozen candidate:

```text
candidate A, exact digest, target sources/vendor-capabilities.csv,
objective names the digest and the no-extra-paths rule
→ approved: true (reason "authorised")
```

The operator then added the intake task in one plan revision that retained the READY
`technical-refresh` task (revision 4). Both tasks share the new batch anchor, so the scheduler can run
both under the declared `ACTIVE`/`VERIFYING` concurrency of 2.

### 2.2 The held current result

`technical-refresh` ran first, at the pre-candidate head `73e7a3da`:

| item | value |
| --- | --- |
| attempt | `attempt-a123e84a69339196cf19578185f3a8f4` |
| result commit | `c8415401023f77ade4c36ba88ec175510dd224c7` |
| basis source | `73e7a3daf08c1450568a37e229547a0ec9df6154` |
| basis captured at revision | 4 |
| basis digest | `f73718ea8b68d480dc24063a8bc1b0087c19a95ea8d13ec01b92d8138dbda9f7` |
| inspection before the intake | `EXACT`, `CURRENT` |
| task state | `VERIFYING` (held, unpromoted) |

### 2.3 The intake

| item | value |
| --- | --- |
| attempt | `attempt-9c38eb28691667e5b1ae470ed0877a37` |
| result commit | `16d30dee252397b53b89447e9523380e78f5b31a` |
| promotion | `promotion-a12f950e81f1798585704e676f8d01c6` (event 54) |
| expected head | `73e7a3daf08c1450568a37e229547a0ec9df6154` |
| resulting head | `55370b0f5bd7740aba4dcbe3074fb6b545443f61` |
| accepted committed blob | `0e997cbcc04ac1ee4c9b8d2985e2dd97443136d0f57b838f01d25de2403f920c` |
| equals candidate A | **yes** |

The working-tree file differs by Git's Windows line-ending normalization; the committed blob is the
authoritative comparison and equals the approved candidate exactly. The completion contract recorded
write scope and required artifact; the standard command was narrowed out for the documentation/data
write scope, so no command pass is claimed.

### 2.4 The head barrier

After the intake Promotion the project head is still `73e7a3da` and the proven effect head is
`55370b0f`. Reconciliation was refused:

```text
quiescence_required: the project must be quiescent before the head advances: every ACTIVE/VERIFYING
task and open attempt must settle (a promoted task must reach SATISFIED first)
```

The held `technical-refresh` candidate is why. This is the correct safety property.

### 2.5 The assessment

The packaged continuation re-observed the target and assessed the held result:

| item | value |
| --- | --- |
| compatibility | `INCOMPATIBLE` |
| currentness | `STALE` |
| rematerialize | `false` |
| rework | `true` |
| assessment digest | `1b05b9b1258d38cc02736bd7f4b4722b50f8664b37a609361a21bbf3173ff4d9` |

The result read `sources/vendor-capabilities.csv`; the intake changed it. The conservative
whole-repository read and the observed change overlap. The refusal is correct for this result.

### 2.6 The governed rework

`startRework` was called with only the result identity and the assessment digest. The service
re-inspected, minted its own permit, reopened the task, reconciled the head to `55370b0f`, reauthorized
the task and delegated a D2 attempt:

| item | value |
| --- | --- |
| service state | `DELEGATED` |
| headSynced | `true` |
| reopened event | 56 (`TASK_READY` with `rework_provenance`) |
| job | `wdj-4f7972b7-9ae8-4e39-9360-cbe8724b6349` |
| job terminal | `FINISHED` |
| settlement | `SETTLED` |
| new attempt | `attempt-ab0cc63e32eb6ed1640c0ca5a21d8157` |
| result commit | `7be38267ca994b1529e08e2ad77ebd23e845bc38` |
| result base | `55370b0f5bd7740aba4dcbe3074fb6b545443f61` |

The new result was promoted normally:

| item | value |
| --- | --- |
| promotion | `promotion-b812c0ee8d34c92fa934014bd9edc4c5` (event 68) |
| expected head | `55370b0f5bd7740aba4dcbe3074fb6b545443f61` |
| resulting head | `22796231660d7915c561a34445aecbd7f1900159` |
| task state | `SATISFIED` |
| reconciliation | revision 6, head `2279623` |

### 2.7 The product correction that made it possible

The first exploratory run failed at `startRework` with:

```text
StateStoreError: expected revision 0, current revision is 4
```

The governed reopening hardcoded `expected_project_revision: 0`. Any project whose plan was revised
before a held result became stale was refused. C6-2 corrected it to the current ProjectIR revision;
the focused RED/GREEN test is `test/lean_d5d_result_continuation_service.test.ts` test 15. The final
run above is at the Code Freeze containing that correction.

---

## 3. The domain outcome

The accepted capability data: V3 `min_c = 0`; Site B requires `-4 °C` **and** a coastal warranty.
V2 is `-5 °C` but has no coastal warranty; V1 and V4 have no coastal warranty. **No vendor satisfies
Site B.**

The current-basis deliverable `deliverables/technical-refresh.md` states:

> No compliant vendor exists for Site B on the current capability data. The programme cannot satisfy
> the Site B coastal-temperature requirement with the current vendor set. This is a negative finding
> about the current data, not a completed procurement.

It preserves the Solaris certificate claim as unverified. The independent rubric:

| check | result |
| --- | --- |
| accepted V3 min is 0 | pass |
| no vendor satisfies Site B | pass |
| deliverable states no Site B vendor | pass |
| certificate preserved unverified | pass |
| requirement R3 unchanged (`-4 °C` + coastal) | pass |
| goal unchanged | pass |
| task accepted (`SATISFIED`) | pass |
| result commit present | pass |
| Agent-authored Journal `NEGATIVE_RESULT` | **absent** (no Agent ran) |
| rubric failures | **none** |

The project record correctly distinguishes completed investigative Work (`TASK_SATISFIED`, a promoted
negative deliverable) from the unmet business objective (Site B has no compliant vendor; the goal is
not marked achieved). No vendor, certificate or requirement was invented.

---

## 4. The authority controls

### 4.1 Wrong source commit and wrong expected head

Before the real intake Promotion:

```text
source commit 73e7a3da… does not match the canonical AttemptReport.result_commit 16d30dee…
expected head 0000… does not match the canonical proven effect head 73e7a3da…
```

No event was appended.

### 4.2 Duplicate promotion

Repeating the intake promotion returned the same `promotion-a12f950e…` and the same event 54. The head
did not move twice.

### 4.3 Changed candidate

The operator policy refused candidate B under approval of A:

```text
approved: false, reason: digest_mismatch
approval binds 0e997cbc…; the proposed candidate is 14ffdd65… (a different candidate)
```

### 4.4 Duplicate delivery

The re-sent bulletin has the same bytes as A. The policy recognised it:

```text
approved: true, reason: duplicate_delivery_same_digest, duplicate: true
no second canonical application is authorised
```

### 4.5 Unauthorised requirement relaxation

A proposal to lower Site B to `-2 °C` and drop the coastal warranty was refused:

```text
business_requirement_change_requires_operator: Site B's -4 °C minimum and coastal warranty are
binding grant requirements; a separate explicit operator decision is required
```

The ProjectIR requirements digest is identical before and after the whole run:
`f341a9c3243c564fc5fec31fe31c0e08e94228c8ff228cb9902f3bd383e5688f`.

### 4.6 Unapproved write

A separate test-owned world used a worker that wrote the declared deliverable **and**
`sources/newsletter.md`. Settlement refused:

```text
state: NOT_READY, reason: OUT_OF_SCOPE
the world changed paths outside the task envelope's write_paths [deliverables/technical-refresh.md]:
sources/newsletter.md
```

No result, no promotion; the attempt remains `RUNNING`.

### 4.7 Direct external commit

After the positive path, a new `post-control` task was created at the accepted head, then candidate B
was committed directly to the test repository (bypassing Work and Promotion):

```text
HEAD_BASIS_MISMATCH: the repository is at caa543441c45, the project head at 22796231660d,
the proven effect head at 22796231660d and the task's base at 22796231660d
```

The job is `HOST_ERROR`; no attempt was created; the task remains `READY`; the project head did not
move. The direct commit granted no authority.

### 4.8 Irrelevant update

In a separate world a newsletter commit moved the live head. The packaged inspection went from
`EXACT`/`CURRENT` to `INCOMPATIBLE`/`STALE`, with `rework: true`. The product cannot distinguish this
provably unrelated change from a real dependency; the operator policy created no task for it. This is
the preserved C5-A limitation.

---

## 5. What this establishes

| claim | verdict |
| --- | --- |
| an authorised source intake enters canonical state through Work + Promotion | **established** |
| the accepted content is exact (committed blob = candidate) | **established** |
| a stale held result is correctly assessed and refused | **established** |
| the service mints its own rework permit and reopens the task | **established** |
| the head is reconciled and the task reauthorized on the accepted basis | **established** |
| a D2 attempt executes on the accepted basis and settles a new result | **established** |
| normal Promotion advances the head; the task reaches `SATISFIED` | **established** |
| the negative finding is preserved and the objective remains unmet | **established** (deliverable + unchanged requirements) |
| an Agent proposed or approved any of this | **NOT ESTABLISHED** — no Agent ran |
| the rework after a plan revision works | **established after the C6-2 correction** |

### Gate C6-G4

**ESTABLISHED for the product mechanism.** An approved action reached an observable, legitimate
product result through the existing Work and acceptance owners. The approval was **operator-authored**;
the Stage's Agent-originated hypothesis (H6-E) is **NOT ESTABLISHED**.

### Gate C6-G5

**ESTABLISHED for the product mechanism.** The project preserves completed investigative Work and the
valid negative finding while the larger objective remains unmet. The Agent-dependent Journal
preservation was not exercised because no Agent ran; the canonical deliverable is the preserved
finding, and the requirements and goal are unchanged.
