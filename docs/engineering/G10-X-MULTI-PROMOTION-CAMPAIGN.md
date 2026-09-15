# G10-X — Canonical Project-Head Evolution Campaign

Baseline: `main @ f639181199da9ccd7acb3fac2c46392e0b82eb04` (G10-W closure). Ordarium v1.3.1.
Host: DSH 0.1.5-rc.2.

Verdict: **G10-X CANONICAL PROJECT-HEAD EVOLUTION: PASS**.

## Why this campaign

The G10-W assessment recorded CF-W-02: a plan revision could not re-anchor the canonical head, so
after the first promotion the ProjectIR head diverged from the real git head and a second promotion
could not satisfy `git.promote`'s expected-head precondition. Every multi-task project stalled at
`needs_promotion`. The CLI promote path also passed an *ambient* `git.head()` as the expected head —
an authorization basis that could diverge silently.

G10-X makes the head canonical, derives the promotion source and expected head, and closes the loop
with a quiescence-gated mechanical reconciliation.

## Scope (delivered)

| Area | Deliverable |
| --- | --- |
| Pure kernel | `src/domain/project_head.ts` — `deriveProjectHeadStatus`, `compileProjectHeadReconciliation`, `ProjectHeadError`, `promotionChainBasis` |
| Promotion manager | `promotionFacts`, `projectHeadStatus`, `canonicalExpectedHead`, `canonicalAttemptResultCommit`, `promoteAttempt`; strict validation in `promote`; typed `external_head_divergence` |
| Controller | `promoteAttempt`, `reconcileProjectHead`, trusted `planReconciled(input, { headAdvance })`, `status().head` (with provenance), `runTurn` drift barrier + `pumpSettlement` |
| Product path | `cli.ts` promote/pump, `tools/control_surface.ts` → canonical `promoteAttempt` (no caller commits) |
| Management | `RECONCILE_PROJECT_HEAD` action class + policy matrix + candidate builder + execution case + `reconcileProjectHead()` |
| Workspace | `project.head` (state + label + promotion provenance), `PROJECT_HEAD_DRIFT` / `PROJECT_HEAD_CONFLICT` open loops |
| HTTP / tools | `POST /api/project/reconcile_head`; `palimpsest_manage` action `reconcile_project_head` |
| Tests | `test/x_multi_promotion.test.ts` (7), `test/x_adversarial.test.ts` (16) |
| Dogfood | `scripts/management/multi-promotion.mjs` → `.dogfood/g10x-multi-promotion.json` |

## Key decisions

1. **One head, derived.** The status is derived from ProjectIR + `PROMOTION_COMMITTED` facts only.
   `git.head()` is diagnostic, never an input. No second store.
2. **The caller names the attempt, not the commits.** `promoteAttempt` derives both the source and
   the expected head; the low-level `promote` keeps its shape but is strictly validated, so it is
   an expert path rather than a bypass.
3. **The head advance rides the revision batch.** `reconcileProjectHead` calls `planReconciled` with
   a trusted advance that is re-validated against the canonical chain and the backing event. There
   is no second head-writing path, and no raw plan is accepted.
4. **Quiescence gates the advance.** A promoted task must reach `SATISFIED` before its effect head
   becomes the next authorization basis. The `runTurn` barrier blocks *new* activation while
   allowing settlement, so the system reaches quiescence instead of deadlocking.
5. **No mode grants promotion authority.** `RECONCILE_PROJECT_HEAD` is mechanical consistency;
   DIRECT requires an explicit act, ASSIST can only suggest, MANAGE/DELEGATE may execute it — and
   none of them can promote.
6. **The parallel old-base path is invariant-protected.** `#validateTaskSatisfied` requires
   `promotion.expected_head_commit === envelope.base_commit`; a task authorized at an older base
   cannot be satisfied by a promotion on a newer expected head. The path is therefore recorded as
   `NOT_APPLICABLE_CURRENT_TOPOLOGY` (CF-X-01) rather than reached by weakening the invariant.

## Topology

Single coherent stage; no stacked PRs. Work landed on `experiment/g10-x-project-head` and merged
with `--merge`. Replay fixtures were **not** touched.

## Gates

| Gate | Result |
| --- | --- |
| `pnpm run build` (`tsc -b`) | clean |
| `pnpm exec vitest run` | 147 files / 1342 tests, all green (baseline 145 / 1319) |
| `node scripts/management/multi-promotion.mjs` | PASS — `dshPrincipal: true`, `dshAttempt: false`, 36/36 checks, rev0 → rev2, IR head === git head |
| `fixtures/**` | untouched |
| Wire contract / migrations | untouched (no new event type, no payload change, no migration) |

## Honest outcomes

- CF-W-02 **CLOSED_IN_X**; CF-W-03 stays `STILL_DEFERRED_WITH_TRIGGER` (see the disposition audit).
- New carry-forward: CF-X-01 (parallel old-base not reachable under the aggregate invariant),
  CF-X-02 (web UI consumption of `project.head` is deferred; the payload is the contract).
- The promotion-caller audit classifies every production-safe, legacy low-level and test-embedding
  call site (see `audits/G10-X-PROJECT-HEAD-ASSESSMENT.md`).
