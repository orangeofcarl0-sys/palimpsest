# SR-1 gate blocker — live model provider returned nothing (environmental, not a regression)

## What failed

Three live gates could not be completed on the SR-1 tree:

| gate | result |
| --- | --- |
| `node scripts/interaction/uxc-dsh-local-dogfood.mjs` | FAIL — `parallel_ran_real_ephemeral_branches: completed=0/2`, `useful_findings_returned: [{"statement":"the branch has not produced a result yet"}]` |
| `node scripts/interaction/uxc-dsh-cross-project-dogfood.mjs` | FAIL — `b_packaged_local_explore_answered_the_ask` (the composed answer carries no findings text) |
| `node scripts/release/rc1-live-local.mjs --only A --trials 1` (the §44 live smoke) | FAIL, twice — `INFRASTRUCTURE_ERROR / INCOMPLETE_OBSERVATION`: "the principal produced no assistant message and called no tool (process status completed, exit 0, wall ~5.2 s)" |

All three failed **deterministically on re-run** (not the known branch-subprocess flake).

## Why this is environmental, not a refactor regression

1. **The pristine baseline fails identically.** The same `uxc-dsh-local-dogfood.mjs` was run in the
   untouched worktree at `a851848`, a TREE-IDENTICAL canonical control (both `a851848` and canonical
   main `a30a328` carry tree `83ef6ba115feaae39a4b47c9881ad78fb6df2639`; SR-1's `src/` changes are
   not present there) and produced the *same* failures, byte-for-byte:
   `completed=0/2`, the same two branch statements, the same candidate-owner note.
2. **The branch agents really did run.** The dogfood's own structural checks passed —
   `real_branch_process_was_offered_exactly_one_tool: ok, frames=9, catalogues=[["palimpsest_branch_result"]]`
   — and seven `branch-*` session directories exist for the last run.
3. **Those branch sessions contain no model output at all.** Reading the durable session
   artifacts directly: 18 records each, ending at `request/header` — no `assistant/message`, no
   `tool/call`, no `tool/result`. The host therefore fell back to
   `branch_host.ts:183` "the branch has not produced a result yet".
4. **A live principal shows the same thing.** The §44 smoke produced no assistant message and no
   tool call in ~5 s in two consecutive attempts — the same `INCOMPLETE_OBSERVATION` class that
   RC-1R recorded as a provider anomaly (`B_auto_explore#2`).
5. RC-1E, on the same machine, ran NINE live trials with real branches (2 per trial) roughly an
   hour earlier, and the same dogfoods passed then. Nothing in `src/` changed in between except
   SR-1's composition extraction, which the baseline comparison above rules out.

## Classification

`INFRASTRUCTURE_ERROR` — provider unavailability / throttling for this machine at this time.
Retained, diagnosed and reported rather than retried away (§44). It blocks the live portion of
the SR-1 gate set; the automated gates (tsc, vitest, build:web, playwright, architecture:check,
public-api:check) are all green on the same tree.

## Evidence files

`gate-sr1-uxc-dsh-local-dogfood.log`, `gate-sr1-uxc-dsh-cross-project-dogfood.log`,
`gate-sr1-live-local-smoke.log`, `sr1-live-smoke.json` (the retained failed trials),
`gate-sr1-uxc-dsh-local-dogfood-rerun.log`, `gate-sr1-uxc-dsh-cross-project-dogfood-rerun.log`.
