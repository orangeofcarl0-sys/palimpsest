# G10-W — Delegate Continuity Evidence (real host)

Script: `scripts/management/delegate-continuity.mjs` · Evidence: `.dogfood/g10w-delegate-continuity.json`
Baseline: `main @ ea77783d864ccb660d14c9e13c6008a9241e7715`. Ordarium v1.3.1. Host: DSH 0.1.5-rc.2.

Result: **PASS**, 36/36 checks, `dshPrincipal: true`, `dshAttempt: false`, elapsed ≈ 7.5 s.

## The story

| Step | Observation |
| --- | --- |
| rev0 with task A | `PROJECT_CREATED` rev0, `task-a` READY |
| reach a quiescent point | `task-a` driven on the real path (activate → attempt → claim → git commit → report → gate → promote → `TASK_SATISFIED`); zero open attempts; phase `terminal` for A |
| DELEGATE proposes a local revision adding B | involvement `DELEGATE` via the operator port; a journal OPPORTUNITY is recorded; the management layer derives a `PREPARE` candidate (a proposal, mutates nothing) |
| the reconciliation commits atomically | promotion of the opportunity raises rev0 → rev1; the log tail is adjacent: `14:PROJECT_REVISED` then `15:TASK_CREATED:task-b` |
| B has a fresh authorized envelope on the new revision | `envelope-b18f598a…`, `project_revision: 1`, `project_digest: bcd1065c…` (= the rev1 head), `base_commit: cccc…` |
| the Delegate continues | the workspace view reports `task-b` READY; the scheduler activates `task-b` |
| a B attempt executes | `attempt-72e63306…` claimed, committed (`…0003`), reported completed, gate → `EVIDENCE_ADDED`, `TASK_VERIFYING` |
| the normal gate path proceeds where applicable | promotion is honestly **not** applicable (see limitation); `runTurn` phase `needs_promotion` — the next escalation state |
| zero authority bypass | goal and requirements byte-identical across the revision; `CREATE_EXTERNAL_COMMITMENT` and `APPROVE_DISCLOSURE` both refused by the policy **and** by the service step (`not_permitted`, no mutation); no event type in the log matches `COMMITMENT|DISCLOSURE|DISCLOSED|EXPORT` |

The revision also proves the addition is dependency-derived: `task-b` was created `READY` because
`task-a` is `SATISFIED`, and its envelope is bound to the new head — not inherited from rev0.

## Real DSH project principal

A single real DSH host process booted over a deployment profile wiring the same orchestration /
ordarium / association / journal / management SQLite files, using the host-bundle + profile install
pattern:

- exactly **one** `PALIMPSEST_HOST_READY` line;
- **one** localPeer `peer-g10w-project`, **one** persistentPoint `pp-g10w-project`;
- `application: "full"`, 15 tool names including `palimpsest_plan` and `palimpsest_manage`;
- over its own HTTP surface it read `/api/project/workspace` → `revision 1`,
  `task-a:SATISFIED`, `task-b:VERIFYING`, goal byte-identical;
  and the new CF-V-01 routes `/api/manage/recommend` and `/api/manage/preview` both answered 200.

## `dshAttempt: false` — exact reason (nothing faked)

> the real DSH host exposes the project/manage application HTTP routes (workspace, journal,
> association, opportunity promotion, manage status/recommend/preview/step/run) but NO remote
> claim/report/gate execution channel, and a headless DSH session cannot drive the Work tools
> without a model. The B attempt is therefore executed by the real scheduler + controller + effects
> stack against the SAME SQLite deployment the host reads.

## Honest limitation demonstrated by this dogfood

`bPromotionApplicable: false`. A's promotion advanced the **real** git head
(`…0002`) while the ProjectIR `head_commit` stayed at `cccc…` (`…0002 ≠ cccc…`): a plan revision
reuses the current head and `PlanInput` carries no `headCommit`, so B's envelope is anchored to the
old head and `git.promote`'s expected-head precondition cannot be met. The delegate stops at the
normal gate/escalation boundary instead of faking a promotion. Recorded as CF-W-02.

## Checks (36)

`rev0_a_attempt_executed`, `rev0_a_satisfied`, `quiescent_point_reached`,
`delegate_opportunity_recorded`, `delegate_prepare_candidate_derived`,
`delegate_prepare_not_a_mutation`, `delegate_plan_revision_permitted`,
`delegate_external_commitment_refused`, `delegate_disclosure_refused`,
`delegate_commitment_step_refused`, `delegate_commitment_no_mutation`,
`delegate_disclosure_step_refused`, `delegate_disclosure_no_mutation`, `revision_incremented`,
`revision_goal_byte_identical`, `revision_requirements_byte_identical`, `revision_task_added`,
`revision_b_ready_from_dependency`, `revision_b_envelope_bound_to_new_head`,
`revision_closure_is_adjacent_and_atomic`, `delegate_view_sees_b_ready`,
`delegate_scheduler_activated_b`, `delegate_b_gate_evidence_added`, `delegate_b_verifying`,
`b_promotion_not_applicable_head_diverged`, `delegate_next_escalation_state`,
`no_commitment_or_disclosure_events`, `final_goal_byte_identical`, `dsh_exactly_one_ready_line`,
`dsh_one_local_peer`, `dsh_one_persistent_point`, `dsh_observes_revision`,
`dsh_observes_both_tasks`, `dsh_goal_byte_identical`, `dsh_manage_recommend_route`,
`dsh_manage_preview_route`.
