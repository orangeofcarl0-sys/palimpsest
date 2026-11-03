# COG-6 — Project Outcome and Authority Ruling (C6-0)

**Status:** binding architecture ruling, written and committed before any scored model execution.
**Branch:** `palimpsest-cog6-agent-native-evolution`
**Incoming baseline:** `60be154f7f776729698f316011670abd0bc4c0eb` / tree `10d22622a70064b5b9f963b59c1476276dcec273`
**Preflight:** `research-evidence/cog6/preflight.txt`
**Model use in this phase:** none.

This document answers §5 of the COG-6 mandate. It follows the real call graph from the installed DSH plugin to
the canonical owners, records what a normal model can actually reach, and fixes the authority boundary the
experiment will rely on. It does not change the product. It is the basis for C6-G0.

---

## 1. How the tool catalogue is actually assembled

### 1.1 Two tool families, one registration point

| family | owner | composition | when present |
| --- | --- | --- | --- |
| **base Work tools** | `src/tools/tools.ts` (`definePalimpsestTools`) | always built by `composeCore` (`src/composition/core.ts:342`) | every install |
| **advanced application tools** | `src/adapters/dsh/index.ts` (`defineApplicationTools`) | assembled by `composeApplicationAssembly` (`src/composition/application.ts:197`) | only when `hasAdvancedSurface` is true |

`hasAdvancedSurface` is derived from the composed surfaces, not from a flag
(`src/composition/application.ts:166-196`). A capability that was not composed is absent; the assembly never
substitutes a stub.

The final catalogue is `[...baseTools, ...applicationTools]` (`src/composition/application.ts:197`). The DSH
host registers each definition through `toRealTool` (`host/dsh/lib/index.js:62-74`).

### 1.2 The `mode` marker is metadata, not a host gate

`toRealTool` forwards `name`, `description`, `parameters`, `output`, `timeoutMs` and `isConcurrencySafe`. It
does **not** forward `mode`. The `[read-only]` / `[mutating]` text in a description is therefore a statement
by the tool author, not an enforcement performed by this host adapter. Whether a tool may be called is decided
by the DSH host's own permission configuration and by the tool's runtime checks.

Consequence for C6: model reachability must be established from the **real request event's tool catalogue**
and from observed calls, never from a TypeScript export and never from the `mode` string.

### 1.3 Composition conditions that matter to this scenario

| surface | composed when | source |
| --- | --- | --- |
| Project Workspace | a journal store, an association store, or a proof store exists | `src/composition/cognition.ts:289-296` |
| Project Management | a Project Workspace exists | `src/composition/governance.ts:449-453` |
| Continuation | repository + world basis runtime | `src/composition/continuation.ts:138-229` |
| Project Intent | controller + workspace (expert install result only) | `src/install.ts:442-450` |
| External Assets | the governance cluster composes the bridge | `src/composition/governance.ts:340-346` |

A test-owned deployment that supplies `projectJournal` and `projectAssociations` therefore exposes
`palimpsest_project`, `palimpsest_manage`, `palimpsest_verification` and
`palimpsest_external_assets`, in addition to the base tools.

---

## 2. The authority matrix

The columns follow §5.2. "Model" means reachable through a registered `palimpsest_*` tool; "expert" means an
API on the install result, a composition seam, or an HTTP operator route.

### 2.1 Reading and knowledge

| operation | model | expert | read/mutate | canonical owner | authorization | result identity | safety checks | changes | mistake risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **1. Read Project Workspace** | yes — `palimpsest_project` actions `overview`, `assets`, `open_loops`, `history`, `journal_entries` (`src/adapters/dsh/project.ts:26,60-80`); `palimpsest_status` (`src/tools/tools.ts:353-359`) | application/HTTP read routes | read | `ProjectWorkspaceService` derives from controller + journal + associations; it copies no canonical fact | none | derived view with `openLoops`, warnings | project-scope fence: a named project other than this installation's is refused (`project.ts:40-59`) | nothing | no |
| **2. Record Journal knowledge** | yes — `palimpsest_project action=journal` (`src/adapters/dsh/project.ts:91-98`) | expert `recordJournalEntry` | mutate (Journal only) | `SqliteProjectJournalStore`; kinds `IDEA / OPEN_QUESTION / NEGATIVE_RESULT / OPPORTUNITY / REFERENCE_NOTE` (`src/project_workspace/journal.ts:29`) | normal tool access; project must exist (`service.ts:553-567`) | `JOURNAL_ENTRY_RECORDED` + entryId + digest | strict kind/fields; project scope; append-only | Journal knowledge only | **yes, if read as approval.** A `NEGATIVE_RESULT` is a finding, an `OPPORTUNITY` is a candidate; neither is evidence, a Task or an approval. |
| **3. Append a ProjectIR Decision** | yes — `palimpsest_project action=decision` (`src/adapters/dsh/project.ts:81-89`) | expert `appendDecision` | mutate (ProjectIR decisions) | ProjectIR via `controller.plan` (`src/project_workspace/service.ts:588-598`) | normal tool access; **quiescence** (no ACTIVE/VERIFYING task, no open attempt) | `PROJECT_REVISED` + `decision_id` | plan validation, revision CAS, promotion fence, quiescence | decisions append only; goal, requirements and tasks are re-asserted unchanged | **yes.** A Decision is a ProjectIR lineage append, never an external stakeholder's approval. |

### 2.2 Planning, opportunity and intent

| operation | model | expert | read/mutate | canonical owner | authorization | result identity | safety checks | changes | mistake risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **4. Revise the task graph** | yes — `palimpsest_plan` (`src/tools/tools.ts:157-187`) | `controller.plan` / `controller.planReconciled` | mutate (ProjectIR tasks) | ProjectIR (`src/tools/controller.ts:1401-1516`) | normal tool access; **quiescence** unless typed invalidation (`changeClass`/`changedIds`), which the tool does not expose | `PROJECT_REVISED` + `TASK_CREATED` / `TASK_STALE` / `TASK_REAUTHORIZED` | complete plan closure compiled and refused before any write; promotion fence; same-id meaning change refused; head unchanged | tasks only; the tool sends `tasks` and `reason`, never `goal`, `requirements` or `decisions` | **no authority mistake**, but task creation is not approval of the work's external content |
| **5. Promote an Opportunity to a Task** | **no** | yes — `ProjectWorkspaceService.promoteOpportunity` (`src/project_workspace/service.ts:603-645`), HTTP `POST /api/project/opportunity/promote` (`src/adapters/http/project.ts:163-179`) | mutate (task graph + journal resolution) | ProjectIR via `controller.plan` | explicit operator/expert call | revision + `PROMOTED` resolution | entry must be an unresolved `OPPORTUNITY`; task id must be new; plan validation; quiescence | one task + one journal resolution | no — but the tool face cannot promote, so an Agent's Opportunity needs an operator to become Work |
| **6. Prepare Project Intent** | **no** | expert `ProjectIntentService.prepare` (install result) | read + proposal only | proposal record owned by the intent service | caller of the expert API | proposal digest | grounding, basis, currentness, port wall (`src/project_intent/ports.ts:1-21`) | nothing canonical | no |
| **7. Apply Project Intent with Admission** | **no** | expert `apply` with a caller-supplied admission port; absent ⇒ `authority_unresolved` | mutate (goal / requirements / decisions + task invalidation) | ProjectIR through `applyAcceptedRevision` → `controller.planReconciled` (`src/project_intent/ports.ts:95-107`) | the admission authority supplied by the deployment; **none is supplied by the normal host** | revision + staled task ids | exact proposal digest; currentness re-checked; derived invalidation strength; quiescence or typed invalidation | meaning-level intent and the affected task set | not reachable from a model or from the normal HTTP surface |

**Plan versus Intent.** `palimpsest_plan` is a task-graph revision. It cannot change the goal or the
requirements, and it is not an Intent Admission. `ProjectIntentService` is the only path that changes goal,
requirement or decision meaning, it needs an independent admission port, and the packaged DSH deployment
supplies none. `composeApplicationAssembly` is not given the intent service, no adapter exposes it, and no
HTTP route serves it (`src/application/factory.ts` has no `intent` field). **Project Intent is not reachable
through the normal product surface at all in this deployment.**

### 2.3 Work, acceptance and authority

| operation | model | expert | read/mutate | canonical owner | authorization | result identity | safety checks | changes | mistake risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **8a. Start managed work — direct bootstrap** | yes — `palimpsest_begin` (`src/adapters/dsh/work.ts:99-143`) | `controller.begin` (`src/tools/controller.ts:2732-2905`) | mutate (project, task, envelope, attempt) | controller + policy | normal tool access, but only on an **in-place** deployment with a confirmed standard, a non-empty write scope, no unowned changes, HEAD == project head, no conflicting existing plan, and satisfiable verification | `READY` / `RESUMED`; the attempt id is deliberately not returned to the model | every precondition checked before any append; plan conflict refused; verification preflight | may create the project, one task, envelope and attempt; changes no requirement | no — it starts work, it does not accept a result |
| **8b. Start work through the legacy control path** | yes — `palimpsest_next`, `palimpsest_claim`, `palimpsest_report`, `palimpsest_gate` (`src/tools/tools.ts:190-350`) | same controller methods | mutate (scheduler, attempt, report, evidence) | controller + Work ledger | normal tool access | `ATTEMPT_CREATED`, `ATTEMPT_CLAIMED`, `ATTEMPT_REPORTED`, evidence event | report claims are never evidence; `palimpsest_gate` executes the authorized command and records the observed exit; the caller cannot supply an exit code | attempt lifecycle and evidence; may claim an attempt and edit its worktree | no — but `report` accepts a caller-named `resultCommit`; the canonical promotion still requires operator action |
| **8c. Start the D2 subprocess worker** | **no** | `WorkDelegationService.start` on the install result (`src/composition/continuation.ts:229`) | mutate (job, attempt, world, settlement) | Work delegation composition | the composition's own governance; not a model tool | D2 job id + attempt + settled result | basis guard, write scope, completion contract, export before report | canonical Work result | no |
| **9. Promote a Work Result** | **no** — no tool action exposes promotion; `palimpsest_manage` states it never promotes (`src/adapters/dsh/project.ts:110`) and `palimpsest_run` reports `needs_promotion` instead (`src/tools/controller.ts:2015-2130`) | `ProjectController.promote` / `PromotionManager.promote` (`src/tools/controller.ts:3982-3987`, `src/effects/promotion.ts:468-546`) | mutate (proven effect → canonical head) | Promotion ledger + ProjectIR head | operator supplies the exact source commit and expected head; both are validated against the canonical `AttemptReport.result_commit` and the proven effect head | `PROMOTION_COMMITTED` (or `PROMOTION_FAILED`), resulting head, `TASK_SATISFIED` | eligibility (batch anchor, `VERIFYING`, result commit, head chain, gate, required verification), same-base topology, ambient-head refusal, duplicate idempotency | accepts an artifact into the canonical head | **yes, in the other direction:** a Promotion accepts an artifact; it is not a proof of every real-world assumption in it, and it is not an external business approval |
| **10. Reconcile the proven effect head** | yes — `palimpsest_manage action=reconcile_project_head` (`src/adapters/dsh/project.ts:139-141`), and automatically inside `runTurn` when quiescent (`src/tools/controller.ts:2064-2084`) | `controller.reconcileProjectHead` (`src/tools/controller.ts:1819`) | mutate (ProjectIR head + reauthorization) | ProjectIR `head_commit` advanced only to the canonically proven effect head | none beyond normal tool access; the caller supplies no head, commit or plan | `PROJECT_REVISED` + `TASK_REAUTHORIZED` | quiescence; proven effect head only; never adopts ambient `git HEAD`; cannot promote | head alignment and task reauthorization | no — it cannot mint a head and cannot accept a result |
| **11. Source intake of an external candidate** | **no single operation** | operator-authored Work task + D2/claim execution + Promotion | mutate (source through Work, then head through Promotion) | Work + Promotion + head reconciliation | the operator's plan revision and the operator's Promotion; the external source's own identity grants nothing | `ATTEMPT_RESULT` + accepted blob + `PROMOTION_COMMITTED` | completion contract write scope + artifacts; same-base promotion; head chain; `HEAD_BASIS_MISMATCH` for a direct external commit | canonical source and head | the candidate is provenance, not approval |
| **12. Start Result Continuation** | **no** — no tool, no HTTP route; `installed.continuation` is an expert surface | `ResultContinuationService.inspect / rematerialize / startRework` (`src/continuation/service.ts:165-176, 397-475`) | read + assessment records; `startRework` mutates (governed reopening + head sync + D2 start) | continuation service over Work + world basis + compatibility | the service mints the permit itself from a fresh assessment; the caller supplies only the result identity and the expected assessment digest | `TASK_READY` with `rework_provenance`, then `TASK_REAUTHORIZED`, then a D2 job | task must be `VERIFYING`; batch anchor; origin must be this batch's `COMPLETED` candidate; fresh assessment digest; `INCOMPATIBLE`/`UNKNOWN` rework policy | task reopening and re-execution, never promotion | no |

### 2.4 Adjacent surfaces

| surface | model | what it can do | what it cannot do |
| --- | --- | --- | --- |
| `palimpsest_verification` (`src/adapters/dsh/project.ts:201-231`) | yes | read derived head status/history; request verification of the exact current head under a **registered** verifier ref | register a verifier, supply a command, choose an independence class, verify an arbitrary commit; a PASS is not truth or Work evidence |
| `palimpsest_external_assets` (`src/adapters/dsh/project.ts:249-331`) | yes | list providers, search, inspect an exact digest revision, prepare a reference/import/publication **candidate** | commit a reference, import into the Journal, approve a publication; those are operator-explicit application operations |
| `palimpsest_delegate` (`src/adapters/dsh/product.ts:147-183`) | yes | start one ephemeral **research** delegation on a frozen HEAD; read status/inspect | create Work, an attempt, evidence, truth or a promotion |
| `palimpsest_collaborate` (`src/adapters/dsh/product.ts:16-81`) | yes | plan/run local recipes; PARALLEL exploratory branches; CHECK against project verification | mint truth, evidence, durable agents, commitments or Work |
| `palimpsest_run` (`src/tools/tools.ts:220-235`) | yes | advance one mechanical turn; report `needs_worker` / `needs_promotion` / `head_sync_required` | promote an attempt |
| `palimpsest_manage step/run` (`src/project_management/service.ts:573-645, 1171-1300`) | yes | OBSERVE/RECOMMEND/PREPARE without mutation; ADVANCE_MECHANICAL_WORK; a task-plan revision with the same goal/requirements; local recipe/verification | create an external commitment, approve disclosure, evolve the organization, perform an irreversible effect, send a peer request (`refusalReason`, `service.ts:276-291`); change goal or requirements; promote |

---

## 3. Task completion versus project objective

### 3.1 What "done" actually is

An attempt's completion contract is a **pure derivation** from the operator's confirmed `ProjectStandard`, the
task declaration, the envelope and the deployment's capabilities
(`src/domain/completion_contract.ts:154-258`). It can require exactly three mechanical things:

1. `assert_write_scope` — the observed changed paths are inside the envelope's write paths;
2. `run_standard_command` — an operator-authorized command, run and observed by the product, with the
   declared predicate — **unless every write path is documentation/data**, in which case the clause is
   narrowed out by the declared applicability rule (`completion_contract.ts:112-122, 170-186`);
3. `assert_required_artifacts` — declared-before-execution paths exist.

It can additionally require independent verification only for `contract_boundary` write paths
(`completion_contract.ts:212-234`). **No clause expresses domain validity, business correctness or objective
attainment.** The standard itself is derived from the repository's toolchain and confirmed by the operator
(`src/deployment/standard.ts:136-176`); its clauses are `command_succeeds`, `scope_respected` and `files_exist`.

`TASK_SATISFIED` therefore means: the Work acceptance contract was satisfied and the result was promoted. It
does not mean the project's goal was achieved.

### 3.2 Decision table

| case | mechanical product outcome | what it proves | what it does not prove | correct project record |
| --- | --- | --- | --- | --- |
| **A — investigation completed with a positive finding** | the artifact exists; write scope valid; any applicable command passed; result promoted → `TASK_SATISFIED` | the declared Work was delivered and accepted | that the finding is true beyond its stated evidence, or that the larger objective is achieved | the artifact + a Journal `REFERENCE_NOTE`/`OPPORTUNITY` as appropriate; the goal remains whatever the ProjectIR says |
| **B — investigation completed with a negative finding** | the same mechanical outcome — the artifact is the negative conclusion | the analysis was delivered and accepted | that fulfillment occurred; a negative conclusion is not a failed execution | the artifact + `NEGATIVE_RESULT` (and an `OPEN_QUESTION`/`OPPORTUNITY` where a next investigation is known); the objective stays unresolved |
| **C — a fulfillment task did not achieve its objective** | the same mechanical outcome **if** an artifact exists and scope/commands pass — the product cannot tell | only that the artifact was written | that a compliant vendor was selected, a requirement was met, or the objective was achieved | the task must be authored as an investigation, not as a fulfillment claim, or the gap must be recorded explicitly; a mechanical `TASK_SATISFIED` must never be read as procurement success |

### 3.3 Existing surfaces that express the distinction

| surface | can express | cannot do |
| --- | --- | --- |
| task `objective` and `required_artifacts` | what the work is and what it must leave behind | make the artifact's content true |
| Journal `NEGATIVE_RESULT` | a preserved negative finding | change a task state, a requirement or the goal |
| Journal `OPEN_QUESTION` | an unresolved question (derived into `openLoops`) | become Work by itself |
| Journal `OPPORTUNITY` | a candidate action; `promoteOpportunity` can make it Work (operator only) | authorize its own promotion |
| ProjectIR `decisions` | a recorded decision with rationale and evidence ids | change a requirement; constitute external approval |
| ProjectIR `requirements` / `goal` | the binding intent | change without Project Intent Admission, which this deployment does not compose |
| `ProjectIntentService` | grounded proposal + admitted revision | reachable by a model or by the normal HTTP surface |

No `GOAL_SATISFIED`, `OBJECTIVE_UNSATISFIABLE` or equivalent canonical enum exists, and C6-0 does not
introduce one. The distinction is expressed by (a) authoring investigative tasks rather than fulfillment
claims, (b) preserving the negative finding in the Journal, and (c) leaving the requirement and goal
unchanged. The independent evaluator judges whether that was done correctly.

---

## 4. Binding ruling

### 4.1 What a normal Agent may do autonomously

Within the installed deployment and the scenario's permission configuration, an Agent may:

1. read the project workspace, journal, history, open loops, assets, status and surfaces;
2. record Journal knowledge of any kind;
3. append a ProjectIR Decision through the existing revision path (a lineage append, not an approval);
4. revise the project's task graph through `palimpsest_plan` (ordinary planning; goal and requirements are
   untouched; quiescence applies);
5. request a verification of the exact current head under a registered verifier;
6. prepare external-asset reference/import/publication candidates (never commit them);
7. use the research delegation and local collaboration surfaces (exploratory, non-canonical);
8. start direct managed work only where the deployment and the product's own preconditions allow it
   (`palimpsest_begin` on an in-place deployment with a confirmed standard), or claim and execute an
   already-scheduled attempt through the legacy control tools;
9. request a management-mode change (a request only).

### 4.2 What requires a separate operator decision

1. **accepting a Work result into the canonical head** — Promotion is operator-only and binds the exact
   result commit and expected head;
2. **advancing the ProjectIR head** — only to the proven effect head, and only when quiescent; a model may
   trigger the mechanical reconciliation but cannot mint a head;
3. **promoting a Journal Opportunity into a Task** — operator/expert only;
4. **any Project Intent change** — goal, requirement or decision meaning; requires an admission authority the
   normal deployment does not supply;
5. **committing an external-asset reference/import or approving a publication** — operator-explicit
   application operations, not tool actions;
6. **starting Result Continuation / governed rework** — the service is an expert surface, not a model tool;
7. **accepting external source content as canonical reality** — an operator-authored Work task plus a
   Promotion; the candidate's own identity is provenance, never authority.

### 4.3 What must be refused

- a model supplying a head, a source commit, an exit code, a verifier command, an independence class or an
  approval flag;
- a promotion whose source commit is not the canonical `AttemptReport.result_commit`, or whose expected head
  is not the proven effect head (`src/effects/promotion.ts:468-480`);
- a plan revision that changes the goal or requirements, or that silently replaces a task with different
  meaning under the same id (`replacement_task_id_required`);
- a Journal opportunity that promotes itself, or an external asset that becomes TruthAdmission;
- any claim that `TASK_SATISFIED`, `ATTEMPT_COMPLETED`, a Decision append or a delegation result is an
  external business approval.

### 4.4 Is the authority contract sufficient for this experiment's action class?

**Yes, with one disclosed boundary.**

The scenario depends on: external source content must not become canonical without an operator decision. A
model cannot promote, cannot apply Intent, cannot admit a source, and cannot commit an external asset. It can
create a task (`palimpsest_plan`) and can start or claim work; those abilities are ordinary product planning
and execution, and the resulting artifact is still an unpromoted candidate until an operator promotes it.
Starting work is not accepting work.

The disclosed boundary is that the base control tools (`palimpsest_next`, `palimpsest_claim`,
`palimpsest_report`, `palimpsest_gate`) are registered alongside the LEAN `begin`/`finish` path. They let a
model act as the worker inside a claimed attempt and author an `AttemptReport` whose `resultCommit` is a
caller-named field. This does **not** bypass promotion (operator-only) or the canonical `AttemptReport`
validation, but it means the experiment must:

- treat a model-created task or claimed attempt as **work in progress, never as approval**;
- never promote a result merely because it exists;
- record the actual tool calls and the operator's separate decision;
- treat a model write that precedes the authorized scope as an **unauthorized mutation attempt** and leave the
  canonical head unchanged.

No stop of effectful testing is required: the canonical authority boundary is intact. The quiescence rule is
a real activation constraint (a `VERIFYING` task blocks a plan revision), and C6 will measure it rather than
work around it.

---

## 5. Consequences for the C6-1 scenario and rig

1. The test-owned deployment must supply the journal and association stores so `palimpsest_project` and
   `palimpsest_manage` are really composed and appear in the request event's catalogue.
2. The scenario must not pre-create the corrective Source Intake task. If the Agent creates it, that is a
   planning act; if the operator creates it, that is a separate operator act and must be counted as
   coordination.
3. The operator's approval policy must bind the exact candidate digest, the exact target path and the exact
   task objective; a changed digest is a different candidate.
4. The Agent must not be told which tools to call, that the vendor changed, or which Journal kind to use.
5. The execution of the approved intake may use the established COG-5 D2 deterministic worker, labelled
   **agent-originated proposal + operator-approved deterministic execution**; it must not be described as a
   model worker.
6. A mechanical `TASK_SATISFIED` on the investigative task will be recorded, and the independent domain rubric
   will judge the business outcome separately.
7. The operator routine may call expert APIs (promotion, continuation) only as explicit operator acts, each
   recorded with the exact identity it binds.

---

## 6. Gate C6-G0

**ESTABLISHED.**

- The actual normal tool path is mapped from the real composition (`installPalimpsest` → `composeCore` /
  `composeApplicationAssembly` → `defineApplicationTools` → `toRealTool`), including the fact that `mode` is
  not a host gate.
- Canonical mutation owners are identified for every relevant operation, and the distinction between
  `palimpsest_plan`, a Workspace Decision, Opportunity promotion and Project Intent is explicit.
- Task completion and business-goal attainment are separated, with a three-case decision table and the exact
  contract clauses that do (and do not) exist.
- No model tool can promote a result, change the goal or requirements, apply Intent, admit external source
  content, commit an external asset or start Result Continuation.
- The remaining model-reachable start-work surfaces are disclosed, and the experiment's handling rule for
  them is fixed.
- No new authority is introduced, and no product code is changed in this phase.
