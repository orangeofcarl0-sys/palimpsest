# G10-B4 — Delivery Report

Status: **G10-B4 · BINDING COMPILER / EXECUTIONPLAN INTEGRATION · PARTIAL (UPSTREAM IDENTITY/PROVENANCE BLOCKER) · NO STORAGE · NO RUNTIME REALIZATION · NO SCHEDULER CHANGE**

Branch `experiment/g10-b4-binding-compiler-plan-integration`, from canonical
`main` `8ac32ed48f024962ce77cd68903f2950756b7a8f`. Draft PR (not merged — B4 §78).

## Answers (30)

1. **What was the actual production compile path on `main@8ac32ed`?**
   Proposal producers (CLI `architect` via `presetDraft`/`parseProjectProposal`,
   serve `/api/*` declarations, canvas→IR compile) → `validateProjectProposal`
   → `proposalTaskSpecs` → `TaskSpec[]` → `controller.start()`
   (ProjectIr rev 0, `PROJECT_CREATED`) or `controller.plan()` (rev N+1,
   `PROJECT_REVISED`, parent chain) → `Scheduler.decide()` (pure) /
   `commit()` (persists). Full trace: `G10-B4-BINDING-INPUT-GROUNDING.md` §1.
2. **Did a production ExecutionPlan type already exist?** No — `grep` for
   `ExecutionPlan|RunDefinition|CompiledPlan|PlanDefinition` hits only
   `src/binding/**` (the frozen contract's `ExecutionPlanBindingRef`).
3. **Did a production RunDefinition type already exist?** No.
4. **What is the authoritative current Work revision source?** The `ProjectIr`
   revision chain (`project_id`/`revision`/`digest` via `projectIrDigestOf`,
   with `parent_revision`/`parent_digest`). The sanctioned mapping is
   `workRefOf(project)`.
5. **Is ArchitectureDefinition production-realized?** No.
   `ARCHITECTURE SUBJECT IDENTITY: NOT YET PRODUCTION-REALIZED`.
6. **Is AgentDefinition production-realized?** No — PLMP-UAS-0 froze the
   AgentDefinition/TaskDefinition split; AgentGraph v1 `agent` nodes are
   task-bearing with no agent-side fields.
7. **What provides participating ArchitectureSubjectRefs?** Nothing in
   production. The compiler seam accepts them as explicit caller-supplied
   input (B4 §30) — never inferred from tasks.
8. **Was `TaskSpec.definition_id` used as ArchitectureSubjectRef?** No —
   machine-proven (static + behavioral firewall, B4-M03); it remains Work/task
   lineage.
9. **What provides the RunConfiguration digest?** Nothing in production. The
   seam requires a caller-supplied deterministic digest; no persisted
   RunConfiguration was invented (B4 §11).
10. **What provides the Binding resolution snapshot?** Only caller-supplied
    planning snapshots (documented, read-only). No PersistentPoint registry or
    hidden discovery exists.
11. **What provides Architecture hard requirements?** Nothing — the seam
    accepts explicit caller-supplied profiles and production passes none
    (B4 §13; no heuristic reinterpretation).
12. **What provides Work hard requirements?** Nothing — same disposition.
13. **Were any current fields heuristically reinterpreted as Binding
    capabilities?** No — `suggested_skills ≠ toolCapabilities`, `role ≠`
    runtime capability, `write_paths ≠` workspace locality,
    `required_artifacts ≠` runtime feature, `scope_id ≠` PersistentPoint.
14. **Is live explicit Binding enabled or deferred?**
    `DEFERRED — ARCHITECTURE SUBJECT IDENTITY NOT PRODUCTION-REALIZED`
    (also missing RunConfiguration digest and resolution snapshot).
15. **Is legacy implicit Binding live or only seam-ready?**
    `COMPILER SEAM READY, LIVE RESOLUTION DEFERRED — missing provenance:
    Architecture DefinitionRevisionRef, RunConfiguration digest, resolution
    snapshot` (empty grounded subject set is permitted and tested — grounding
    matrix §6).
16. **What plan artifact exists after B4?**
    `CompiledBindingPlan { work: DefinitionRevisionRef; bindingResolution:
    BindingResolutionRef }` — derived, deep-frozen, ref-only, not persisted.
    `EXECUTION PLAN: MINIMAL DERIVED REF-ONLY ARTIFACT INTRODUCED`.
17. **Does the plan contain full BindingResolution or only its ref?** Only the
    ref (`resolutionId + digest`); structurally asserted.
18. **Can BindingUnsatisfied create a plan?** No — `{status:
    "binding_unsatisfied"}` carries the frozen result and no plan; no task,
    no event, no attempt.
19. **Can stale BindingResolution create a current plan?** No — `{status:
    "stale"}` refuses plan construction; re-resolution is required.
20. **What happens on rebinding?** P1 and R1 remain frozen and unchanged; a
    resolution against the new basis yields R2 and plan P2 referencing R2 (no
    pointer mutation).
21. **Did `proposalTaskSpecs` legacy output change?** No — B4-M01 exact
    deep-equality on a representative proposal; `src/architecture/` has no
    diff.
22. **Did `definition_id` semantics change?** No — still Work/task lineage
    (AgentGraph node id); firewall machine-proven.
23. **Did TaskSpec wire schema change?** No — `src/schema/models.ts` no-diff;
    no binding fields added.
24. **Did scheduler semantics change?** No — `src/scheduler/scheduler.ts`
    no-diff; full scheduler suite green.
25. **Did `Scheduler.decide()` remain pure?** Yes — untouched; B4 adds no
    pre-scheduler seam inside the scheduler (binding planning is
    planning-time, before admission).
26. **Was any storage/migration added?** No — no `execution_plans` /
    `binding_*` tables, no SQLite migration, nothing persisted.
27. **Was any DSH/Ordarium integration added?** No.
28. **What focused/full test counts passed?** Binding-focused suite **109/109**
    (88 kernel + 21 new compiler proofs); full unit **66 files / 542 tests**
    (baseline 65/521 + 21); `pnpm build` and `pnpm build:web` pass; local
    `pnpm test:e2e` **21 passed** (`retries = 0`; first run hit the two known
    runtime-debugger flakes `E2E-DEBUG-01`/`E2E-RUNTIME-03`, clean rerun
    21/21 — reported honestly, no flake-masking changes; B4 touches no
    UI/runtime code).
29. **What is final remote CI state?** Draft PR remote unit + e2e on the
    actual final HEAD — recorded below in "Remote CI history".
30. **What exact next stage is recommended and why?** The smallest upstream
    realization: **Minimal ArchitectureDefinition / AgentDefinition identity
    realization** (plus minimal RunConfiguration-digest and planning-snapshot
    grounding seams). A missing ArchitectureSubjectRef is not solved by
    PersistentPoint storage (Architecture identity ≠ Continuity locus, B4
    §84). `G10-B5` becomes meaningful only after those exist.

## Docs hygiene closure (§53/§85)

`G10-B3-DELIVERY.md` answer 2 now carries an additive clarification:
`7643c77` = **PLMP-BIND-1 publication baseline**; post-G10-B3 canonical `main`
= `8ac32ed48f024962ce77cd68903f2950756b7a8f`. No historical text rewritten.

## Remote CI history

Recorded after push; known `E2E-DEBUG-01`/`E2E-RUNTIME-03` nondeterminism is
handled by failed-job reruns exactly as in prior stages, with every failure
preserved in this history.

- (this section is finalized on the branch once the draft PR's workflows
  complete — see the PR description for the recorded runs.)

## Verdict

```text
BINDING COMPILER INTEGRATION: PARTIAL — UPSTREAM IDENTITY/PROVENANCE BLOCKER
```

The pure compiler/plan seam works, the frozen kernel is reused untouched, all
machine proofs pass, and legacy behavior is unchanged — but no live path can
truthfully produce the Architecture lineage ref + participating subjects, the
RunConfiguration digest, or the resolution snapshot. PARTIAL names the exact
missing sources; a truthful PARTIAL is preferable to a fake complete
integration (B4 §88).
