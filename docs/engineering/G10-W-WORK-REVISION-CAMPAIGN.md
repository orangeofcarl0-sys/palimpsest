# G10-W — Revision-Safe Work Evolution (Campaign)

Baseline: `main @ ea77783d864ccb660d14c9e13c6008a9241e7715`. Ordarium v1.3.1. Host: DSH 0.1.5-rc.2.

## Why this campaign exists

The G10-V dogfood surfaced CF-V-05: `controller.plan(...)` after task registration left the
scheduler's stored task envelope at the OLD `project_revision`; the next activation failed its
revision guard (`StateStoreError: expected revision N, current revision M`). The minimal repro is
`start() → plan() → step()`. G10-V worked around it by never revising the plan before mechanical
advancement — a product-visible constraint that must not survive.

The Work layer had, by then, already grown the ingredients of a real fix
(`compilePlanRevision`, the canonical `TASK_REAUTHORIZED` event, `EventStore.appendAtomic`). What
remained was the contract: `plan()` still **delegated to `planReconciled` and fell back to a legacy
single-event `PROJECT_REVISED` write** whenever the world was non-quiescent or a same-id replacement
was detected. That fallback is precisely the defect's escape hatch, and it is what G10-W removes.

## Stages

| Stage | Goal | Deliverable |
| --- | --- | --- |
| W0 — contract | Remove the legacy fallback; enforce quiescence or explicit settlement; typed blockers with zero writes | `src/tools/controller.ts`, `src/domain/plan_reconciliation.ts` |
| W1 — semantics | Settle typed invalidation inside the batch; keep quiescence for UNAffected in-flight work; never swallow blockers | `planReconciled` |
| W2 — tests | Update the tests that encoded the old semantics (with justification); add the revision-safe + adversarial suites | `test/acceptance.test.ts`, `test/debugger_controls.test.ts`, `test/v_project_workspace.test.ts`, `test/invalidation.test.ts`, `test/e3_resume.test.ts`, `test/architecture_modes.test.ts`, `test/w_revision_safe.test.ts`, `test/w_adversarial.test.ts` |
| W3 — hardening | Fix the replay-fatal promotion check found by the integrity invariant; CF-V-01 recommend/preview routes | `src/domain/aggregate.ts`, `src/application/http.ts`, `test/v_management_autonomy.test.ts` |
| W4 — real host | Real DSH project principal: DELEGATE revise→continue dogfood | `scripts/management/delegate-continuity.mjs` |
| W5 — closure | Assessment, carry-forward disposition, anti-waste, delivery, README row | `audits/G10-W-*.md`, `docs/engineering/README.md` |

## Gates

- `pnpm run build` clean.
- `pnpm exec vitest run` green (baseline 142 files / 1280 tests → 144 / 1304).
- `node scripts/management/delegate-continuity.mjs` → PASS with `dshPrincipal: true`.
- No fixture under `fixtures/` touched.
- No new event type, no wire-contract change, no migration.

## Invariants under test (see SPEC §5)

W-A01 (CF-V-05 repro) · W-A02 retention · W-A03 addition · W-A04 removal · W-A05 same-id blocker ·
W-A06 quiescence · W-A07 scoped settlement · W-A08 atomicity · W-A09 idempotency/fail-closed ·
W-A10 canonical invariants · W-A11 evidence staling · W-A12 source firewall.

## Evidence

| Artifact | What it proves |
| --- | --- |
| `audits/G10-W-WORK-REVISION-ASSESSMENT.md` | CF-V-05 reproduction with the exact failure + the wider revision-case audit A–H |
| `audits/G10-W-DELEGATE-CONTINUITY-EVIDENCE.md` | the real-host dogfood story and its checks |
| `audits/G10-W-REVISION-ANTI-WASTE.md` | no second scheduler/store/ProjectIR truth, no shadow cache, no hidden repair |
| `audits/G10-W-WORK-REVISION-DELIVERY.md` | delivered areas, gates, honest deviations |
| `audits/G10-W-V-CARRY-FORWARD-DISPOSITION.md` | CF-V-05 CLOSED_IN_W; CF-V-06 reassessed; CF-V-01 CLOSED_IN_W |
| `audits/G10-W-CARRY-FORWARD.md` | new findings CF-W-01… |
