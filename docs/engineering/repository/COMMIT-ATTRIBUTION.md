# Commit attribution

Palimpsest rejects a `Co-authored-by` field on any message line, including mixed case,
indentation and horizontal space before the colon. Approved Git author addresses are
listed in the shared checker. The committer list additionally permits GitHub's web
committer. Changing attribution policy requires a reviewed change to this file and
the checker on `main`.

## Local commits

Run this once per clone, with Git and Node on PATH.

```sh
git config --local core.hooksPath .githooks
```

If the clone already uses a hooks directory, chain the checker from its `commit-msg`
hook. The hook checks the effective author and committer, including CLI and environment
overrides. For a rejected local commit, correct the metadata and retry. If an
unpublished commit already exists, amend or rebase it before pushing.

## Main admission

The workflow loads the checker from the PR's protected base SHA. It fetches candidate
Git objects without checking out or executing their code, then posts the
`commit-attribution` status to the exact PR head. The checker reads raw messages and
identity headers for every incoming commit, including merge commits created on a
topic branch. The `main` push audit checks the resulting commits.

Require `commit-attribution` from GitHub Actions alongside the existing CI checks.
Use rebase-only PR merges and require linear history on `main`. The rebase path
carries the checked commit messages forward without an editable merge or squash
message. GitHub assigns fresh SHAs on rebase. Record the resulting main SHA for new
release evidence.

Agent credentials need a separate permission boundary. Give agents access to topic
branches or forks and keep the maintainer's administration, status publishing and
workflow-writing credentials outside agent reach. The email allowlist checks Git
metadata. Account authentication and credential isolation supply identity assurance.

Run the bypass regressions with `node --test scripts/repository/commit-attribution.test.mjs`.
