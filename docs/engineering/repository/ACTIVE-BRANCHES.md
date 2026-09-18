# Active branches

Per [`BRANCH-POLICY.md`](BRANCH-POLICY.md) §2.9, every surviving non-`main` branch must appear here
with an owner, a purpose and a next action. **A branch may not be retained merely "just in case".**

## Current state

```text
active branches: none
```

As of the RS-1 audit (see [`BRANCH-INVENTORY-AFTER.md`](BRANCH-INVENTORY-AFTER.md)), the remote has
**no active non-`main` branch**. All 101 non-`main` branches were classified deletable:

| classification | count | meaning |
| --- | --- | --- |
| A — merged ancestor | 83 | the tip is reachable from `main`; the work shipped |
| C — superseded history | 11 | merged via a PR, with one post-merge documentation record; that record was folded into `main` before deletion |
| F — abandoned unmerged | 7 | the `experiment/pal-fed-0*` prototype family: never merged, superseded by independently developed and live-qualified work, draft PRs closed so the commits stay reachable at `refs/pull/<n>/head` |
| E — active | 0 | — |
| G — review-required | 0 | — |

`main` itself is protected (§2 of the RS-1 spec): never force-pushed, rewritten, rebased or deleted.

## When this file changes

Add a row when a branch is deliberately retained, and remove the row when it is merged or
abandoned. The format:

| branch | purpose | owner / status | base | last meaningful commit | next action |
| --- | --- | --- | --- | --- | --- |
| _(none)_ | | | | | |

A row with an empty "next action" is a branch that should not exist. The RS-1 working branch
`chore/repository-stabilization` is **not** listed here: it is deleted immediately after its merge
(§27 of the RS-1 spec, and rule §2.5 of the policy), so it is never a surviving branch.
