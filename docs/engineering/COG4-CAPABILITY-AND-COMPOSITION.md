# COG-4.0 — Capability and Composition Audit

**Code Freeze:** `0e04becff68c68118bf99c7c9d6bac3c77dd0f33` (tree `4f6c0677a13c96961c3a1f501372f5f2110f0d72`).
**Machine-readable matrix:** `research-evidence/cog4/capability-matrix.json`.

The audit starts from the paths the ruling named and follows the real call graph. Comments are not treated
as behaviour; every claim below was checked against the implementation and, where possible, the live run.

---

## 1. The two traces

### 1.1 Work to authorized effect

```text
DSH Host (host/dsh/lib/index.js)
  -> loadDeploymentProfile(config.deploymentProfile)
  -> deriveBranchHost(profile) / deriveWorkWorkerFacts()
  -> launchDeployment(profile, { host })
       -> installPalimpsest(context, {...})
            core cluster: EventStore, GitCliPort, effects, controller, ProjectWorld basis runtime
            cognition: project workspace (journal/associations), advisor, recipes, attention
            governance: project verification, project management, monitor
            execution-association: work worker port factory, Trajectory recorder
            continuation cluster:
              ObservationAuthority + git source observer
              CompatibilityIssuer
              CrossBasisAdmissionRuntime + admission store
              RematerializationRuntime + git source rematerializer
              firstPartyResultResolver + candidate store
              WorkDelegationService (only when a work worker port exists)
              ResultContinuationService
  -> Work: controller.start / palimpsest_begin / WorkDelegationService.start
  -> Result: completion evaluation, ATTEMPT_COMPLETED, result commit, evidence
  -> ProjectWorld: basis capture at claim, currentness re-resolution, compatibility issuer
  -> Continuation: inspect / rematerialize / startRework
  -> Authorized effect: PromotionManager.promoteAttempt (operator), or a governed D2 rework
```

### 1.2 Persistent project assets to a fresh Session

```text
ProjectIR + journal + Work ledger + evidence + promotion history + result commits
  -> a NEW DSH home with an EMPTY session store
  -> the shipped host reads the SAME project databases and repository
  -> model-facing tools:
       palimpsest_project  (overview, assets, open_loops, history, journal_entries, decision, journal)
       palimpsest_manage   (status/recommend/preview/step/run/reconcile_project_head/posture/activity)
       palimpsest_status, palimpsest_begin, palimpsest_finish, palimpsest_run, ...
       ordinary read/glob/grep/bash/git
  -> the model's next decision
```

The continuation assessment, the Project Intent service and the Trajectory capsule are **not** model-facing
tools. The fresh P Agent reached the result content through the Work state plus ordinary filesystem access,
not through a continuation tool.

---

## 2. Composition facts in the normal host

`host/dsh/lib/index.js` supplies the host's real `agents` service, the host-derived blocking and
`branchExecutionFor` ports, the host's own `workWorkerFacts` (DSH bin + profile), `DSH_HOME`, and the
dashboard facts. The host does **not** supply `projectIntentAdmission`, and it does not expose a
continuation or Project Intent tool.

A live `PALIMPSEST_HOST_READY` from the fresh P home reports:

```json
{"application":"full",
 "collaboration":{"advisor":"AVAILABLE","localExplore":"AVAILABLE",
   "branchAdapter":"dsh-subprocess-branch:cog4-fresh-p","reasoningStore":"CONFIGURED",
   "projectVerification":"AVAILABLE","crossProject":"UNAVAILABLE","inboundPump":"CONFIGURED",
   "attention":"ACTIVE","coldResume":"AVAILABLE"},
 "toolNames":[... 26 tools, including palimpsest_project, palimpsest_manage, palimpsest_delegate,
              palimpsest_begin, palimpsest_finish ...]}
```

There is no `palimpsest_continuation`, `palimpsest_intent` or `palimpsest_trajectory` tool.

---

## 3. Capability matrix (summary)

| capability | implemented | composed in normal host | model-reachable | exercised in COG-4 | observed limitation |
| --- | --- | --- | --- | --- | --- |
| Work Result (`ATTEMPT_RESULT`) | yes | yes | via `begin/finish` or `manage step/run` | **yes**, two real results | a documentation/data write scope narrows the standard command out by the declared applicability rule; no command evidence for these results |
| Result identity / manifest | yes | yes | no | yes (packaged inspect resolves both) | content is not a model field |
| Basis capture | yes | yes | no | yes (both attempts at the seed) | projectSemantic/assets/environment change observers are absent |
| Packaged continuation inspect | yes | yes | **no** | yes | scoped to `ATTEMPT_RESULT`; `wholeRepositoryRead()` makes `COMPATIBLE` unreachable for a source change; no clean `UNKNOWN` for a promoted result; no model tool |
| Expert D3 kernel | yes | inside the packaged service | no | **yes** (EXACT/COMPATIBLE/INCOMPATIBLE/UNKNOWN) | the expert run used a test-owned instrumented read set, not the first-party footprint |
| Cross-basis admission | yes | yes | no | yes (COMPATIBLE ADMITTED; UNKNOWN refused) | admission ≠ promotion |
| Rematerialization | yes | yes | no | refused for INCOMPATIBLE | not offered for any source change by the packaged face |
| Governed rework | yes | yes | no | permit minted + task reopened; D2 job refused | `HEAD_BASIS_MISMATCH` when the live head is ahead of the canonical head |
| Normal promotion | yes | operator-only | no | **yes**, cost result → `TASK_SATISFIED` | model cannot promote; duplicate promotion is idempotent |
| Journal read/write | yes | yes | **yes** (`palimpsest_project`) | yes, P used it | knowledge, not Evidence |
| Project Intent | yes | only with a caller-supplied authority; the DSH host supplies none | **no** | no model proposal; no `PROJECT_REVISED` | `authority_unresolved` on the normal host; no model tool |
| Trajectory | yes | worker-prompt-facing; experimental delivery default off | no principal tool | not exercised | no qualified model Attempt binding for the deterministic worker |
| External source observation | yes | yes | via ordinary git/files | yes (vendor + newsletter) | live HEAD can be ahead of the canonical project head |
| Head reconciliation | yes | yes | `palimpsest_manage` | blocked by quiescence, then in sync; still behind the live head | does not adopt an arbitrary external commit |
| Fresh Session inheritance | yes | yes | yes | **yes**, P | assessment/result content not model-facing; filesystem recovery used |
| Native DSH collaboration | yes | enabled | yes | P did not spawn; F blocked | no valid F comparison |

---

## 4. The packaged continuation face versus the expert kernel

This is the central composition finding.

**Packaged face** (`src/continuation/service.ts` + `src/composition/continuation.ts`):

- scoped to `ATTEMPT_RESULT`; a derived candidate is refused by name;
- `inspect` always runs D3-a, the authority-bearing observations and the D3-b issuer;
- the result **reads** premise is `wholeRepositoryRead()` — a `repository` selector with
  `CONSERVATIVE_DOMAIN` coverage. A source change to any path overlaps it, so the assessor records a
  `read_invalidation` conflict and returns `INCOMPATIBLE`;
- the `projectSemantic`, `assets` and `environment` change premises are `UNAVAILABLE`, so a source-free
  semantic change cannot become `COMPATIBLE`;
- the result **writes** premise is the observed origin-to-result diff. After promotion, the
  origin-to-current change includes the result's own output, so the packaged face can report a
  `write_collision` with the result itself;
- `startRework` is available only for `INCOMPATIBLE`/`UNKNOWN` on a `VERIFYING` task; the service mints the
  permit and reopens the task. The D2 execution then starts at the **canonical project head**, while the
  continuation target observation is the **live source revision**.

**Expert kernel** (the same `assessCompatibility`/`issuer`/`admission` code, driven by the test with a
precise instrumented read set):

- `EXACT` when D3-a proves the basis holds;
- `COMPATIBLE` for the cost result's external changes since its own result (8 disjointness proofs,
  admission `ADMITTED`);
- `INCOMPATIBLE` for the technical result when the changed vendor file is in its read set;
- `UNKNOWN` for the technical result when the project-semantic change premise is unavailable (no conflict,
  `change_coverage` gaps, admission `INSUFFICIENT_PROOF`).

The kernel is capable. The packaged face is conservative to the point of being unable to produce a positive
compatibility certificate for any source change, and it is invisible to the model.

---

## 5. The shortest complete real path

```text
test-owned repository + confirmed standard
  -> D2 work delegation -> execution world -> completion evaluation -> ATTEMPT_RESULT + evidence
  -> packaged continuation inspect (EXACT/INCOMPATIBLE; no model-facing tool)
  -> operator promotion -> TASK_SATISFIED
  -> external source update -> live-head observation
  -> packaged continuation: INCOMPATIBLE; expert kernel: all four outcomes
  -> governed rework: permit + reopen; D2 execution refused at HEAD_BASIS_MISMATCH
  -> fresh DSH Session reads durable state + ordinary files -> continuation note
```

The narrowest complete path for a **fresh Agent** is the bottom two steps: a new Session, the same durable
project state, ordinary tools, and the model's own decision. That path works, but the product's unique
continuation assessment is not part of it.

---

## 6. Missing seams

1. **No model-facing continuation inspect/assessment.** The service is composed but has no tool. The fresh
   Agent cannot ask "is this result still usable?" and receive the product's answer.
2. **No model-facing Project Intent tool and no normal-host admission authority.** The expert service can
   apply a revision with a caller-supplied authority; the shipped host cannot, and the model cannot propose.
3. **The packaged read footprint is the whole repository.** It is honest and conservative, but it makes
   `COMPATIBLE` unreachable for a source change and prevents the product from distinguishing an affected
   result from an unaffected one.
4. **The result content is not a model field.** The P Agent recovered it from the execution world on disk.
5. **The live source revision and the canonical head can diverge.** The continuation target is the live
   world; the rework execution base is the canonical head. The product refuses with `HEAD_BASIS_MISMATCH`
   rather than fabricating a current-basis rework.
6. **`reconcileProjectHead` does not adopt an arbitrary external commit** and can be blocked by a
   non-quiescent task. There is no authorized path from the external update to the execution base.

---

## 7. C4-G0 capability verdict

**C4-G0 — Baseline and measurement integrity: ESTABLISHED.** The required capabilities are understood and
accurately documented. The normal host composes the Work, ProjectWorld, continuation, promotion and
management machinery; Project Intent is composed only with a caller authority; Trajectory is worker-facing;
the continuation assessment has no model surface. The unresolved items are implementation/composition gaps,
not stage-blocking measurement defects.
