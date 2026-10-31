# COG-2 · BGC-0 evidence namespace

This directory holds the machine-readable Git governance record produced before any COG-2
implementation. It was generated read-only; nothing here is a cleanup result.

| file | producer | what it records |
| --- | --- | --- |
| `branch-inventory.json` | `node scripts/bgc0/branch_census.mjs` | every local and remote branch ref with tip, tree, subject, upstream, worktree attachment, ancestry vs the development head and `origin/main`, patch equivalence (`git cherry`), freeze-record association, PR history, audit categories and a proposed disposition |
| `divergence-assessment.json` | derived from the inventory plus per-branch `git show`/`git diff` inspection | the 24 distinct graph-divergent branches grouped by whether the content is already integrated, and the focused `lean-d5d-result-continuation-service` assessment |

## Regenerating the inventory

From the repository worktree:

```bash
node scripts/bgc0/branch_census.mjs > research-evidence/cog2/branch-inventory.json
```

The producer runs only `rev-parse`, `for-each-ref`, `log`, `rev-list`, `merge-base`, `cherry`,
`worktree list`, `stash list` and `status --porcelain` under `--no-optional-locks`. It writes
nothing; the redirect above is the caller's choice. `gh pr list` supplies PR metadata when
available; unavailability is recorded, never guessed.

## Baseline identity this record was taken against

```text
development head    c8fe50590d1862840043aff4449f91ec95524c3a
development tree    13623581df2e7b2a19e336e6ef94d55f9dcf9d07
origin/main         044330b2e55198542d545edc42ed9c36e7ce896b
local main          67b29c9e7907b08fe594738973ce48b55e10d80b
remote heads        79, all tracking refs identical to `git ls-remote --heads origin`
```

## Limits

- Worktree state was probed only for paths that still exist. Of 95 registrations, 92 are missing;
  their last known HEAD is recorded, not a live status.
- Freeze association is a textual-evidence heuristic: a tip SHA appearing near freeze language in
  `research-evidence/**` or `docs/engineering/**`. The strict set is `freezeEvidenceBy`; any other
  mention is preserved separately as `freezeReferencedBy`. Neither is proof of authority.
- `git cherry` compares patches. A squash merge changes patch context, so an integrated source
  commit can still be reported as non-equivalent; each divergent branch was therefore checked
  against its PR merge commit and, where the touched file set was small, against HEAD's file content.
- PR states are a snapshot from the GitHub API at generation time.
- No ref, index, object, worktree, gate root or evidence file was modified. No fetch, prune,
  checkout, reset, stash or garbage collection was run.
