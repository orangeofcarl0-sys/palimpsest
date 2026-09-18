# SR-1 final closure — provider differential (§33)

## Conclusion

The two provider-dependent UX-C dogfoods fail on this branch, and they fail **identically on the
tree-identical canonical control** (`a30a328`, tree `83ef6ba`, detached worktree
`palimpsest-sr1-canon`, node_modules linked, `tsc -b` clean before the run).

Per §33 this is an **environmental provider outage, not a regression** — and it is **never reported
as green**. It blocks nothing in SR-1, whose claims are structural.

## The three-way comparison

| dogfood | branch (`refactor/sr1-architecture`) | canonical control (`a30a328`, tree `83ef6ba`) | verdict |
| --- | --- | --- | --- |
| `scripts/interaction/uxc-dsh-local-dogfood.mjs` | `pass=false`, **4** failures | `pass=false`, **4** failures | environmental |
| `scripts/interaction/uxc-dsh-cross-project-dogfood.mjs` | `pass=false`, **1** failure | `pass=false`, **1** failure | environmental |

Failure identities are the same on both sides, in the same order:

```text
uxc-dsh-local (both trees)
  parallel_ran_real_ephemeral_branches: completed=0/2
  useful_findings_returned: [{"statement":"the branch has not produced a result yet"}]
  exactly_one_candidate_owner: {"branchReportedDigests":[],"submitted":2,"completedBranches":0,…}
  memoryless_auto_selects_explore_for_a_decomposable_task: LOCAL_EXPLORE findings=1

uxc-dsh-cross-project (both trees)
  b_packaged_local_explore_answered_the_ask
```

In the cross-project run the rest of the checklist is green on both trees, including
`b_execution_remains_the_sole_candidate_owner: [{"status":"failed","candidateDigest":null}, …]` — the
branches were started and each ended `failed` with no candidate digest, which is the provider
signature rather than a structural one.

## The signature

The branches are created, are offered exactly their one tool, and then produce no assistant message.
The same runs passed on this machine earlier in the RC-1E campaign (nine live trials with real
branches), so this is a time-local outage of the model provider, not a property of either tree.

## What this does NOT affect

Every SR-1 claim is structural or deterministic and is separately green:

| gate | result |
| --- | --- |
| `pnpm build` (`tsc -b`) | clean |
| `pnpm architecture:check` | PASS — 0 violations, 4 concrete forbidden imports + 8 SCCs observed |
| `pnpm architecture:check-public-api` | PASS — missing 0, kind changes 0, added 0 |
| golden parity (`test/architecture/application_parity.test.ts`) | 23/23 — 128 routes × 5 methods, 24 tools with full contract |
| `pnpm exec vitest run --maxWorkers=2` | green — 178 files / 2,027 tests |
| `pnpm run build:web` | green |
| `pnpm exec playwright test` | green — 36 passed |
| frozen dogfoods that need no provider | green — `uxa-dogfood`, `uxb-two-project-dogfood`, `aer-boundary-dogfood`, `ae-dogfood` all `pass=true`, exit 0 |

## Artifacts

```text
release-evidence/gate-sr1f-uxc-local-branch.log
release-evidence/gate-sr1f-uxc-local-canonical.log
release-evidence/gate-sr1f-uxc-cross-branch.log
release-evidence/gate-sr1f-uxc-cross-canonical.log
```
