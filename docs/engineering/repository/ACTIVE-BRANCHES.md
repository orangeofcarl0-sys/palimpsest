# Active branches

Per [`BRANCH-POLICY.md`](BRANCH-POLICY.md) §2.9, every surviving non-`main` branch must appear here
with an owner, a purpose and a next action. **A branch may not be retained merely "just in case".**

## Current state

```text
permanent branch: main
retained working branches: none
```

The November consolidation uses one transient branch for the integration and this audit.
GitHub deletes that head after the PR merges.

## 2026-11-08 consolidation

The census at `1560db0bdc5c56b730ef83bd22cf7d5e1c167173` found 86 remote heads and 288 local branches,
including `main` in each count. GitHub reported zero open PRs and `main` as the protected branch.

| Scope | Disposition |
| --- | --- |
| 83 remote heads | Retire after checking that each exact tip is reachable from the audited `main`. |
| `r3-a2-sentinel-portfolio` at `10a59785b02b06670ed8ae5fe4a5df10a6fdb014` | Integrate the three original commits for the completed sentinel qualification, then retire the head. The merge adds 53 research, fixture and verification files. The frozen result remains four `UNQUALIFIED` pairs. [R3-A2 result](../R3-A2-SENTINEL-PORTFOLIO-RESULT.md) |
| `lean-d5d-result-continuation-service` at `a57f0e04823eaeab93f360c8d701244c49f9b0c9` | Archive the four divergent commits (`1a40c76`, `c068d7b`, `15db373`, `a57f0e0`) and retire the head. The merge preview conflicts on 11 paths, including continuation and Host code. PR #199 landed the continuation service and the closed PR #200 preserves this exact alternative tip. [Landed service](https://github.com/orangeofcarl0-sys/palimpsest/pull/199) · [Historical head](https://github.com/orangeofcarl0-sys/palimpsest/pull/200) |
| 287 local non-`main` branches | Retire 244 reachable branches. Of the 43 divergent tips, 23 have a tree in `main` history, nine preview with an unchanged `main` tree, ten conflict and one is the R3-A2 integration above. The conflicting local work includes alternate G10 closure records and the older Pal-Fed prototype line. |

The complete local Git bundle and verified recovery mirror are in
`branch-archives/2026-11-08-1560db0/` beside this checkout. Restoring the bundle verified all 411 named refs
and Git object connectivity. `refs-before.json` records names, exact tips and unique commits, and
`merge-review.json` records the preview results.

```text
git bundle list-heads <bundle>
git fetch <bundle> refs/heads/<archived-name>:refs/heads/<recovery-name>
```

The earlier RS-1 census remains in [the historical inventory](BRANCH-INVENTORY-AFTER.md).

## When this file changes

Add a row when a branch is deliberately retained, and remove the row when it is merged or
abandoned. The format:

| branch | purpose | owner / status | base | last meaningful commit | next action |
| --- | --- | --- | --- | --- | --- |
| _(none)_ | | | | | |

Fill in the next action when adding a row. Retire the branch after its PR merges or its audit is complete.
