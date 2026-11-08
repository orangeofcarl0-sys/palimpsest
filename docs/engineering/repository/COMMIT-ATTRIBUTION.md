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

The `main-protection` ruleset requires GitHub Actions to report `commit-attribution`
alongside `unit` and `e2e` on a head up to date with `main`. It allows rebase-only PR
merges and requires linear history. The rebase path
carries the checked commit messages forward without an editable merge or squash
message. GitHub assigns fresh SHAs on rebase. Record the resulting main SHA for new
release evidence. [Main protection](https://github.com/orangeofcarl0-sys/palimpsest/rules/23655367)

The separate `main-publisher` ruleset limits main updates to the repository owner.
The owner still satisfies the PR and check requirements in `main-protection`.
The GitHub CLI merge preflight can report `BLOCKED` under the update restriction.
After all CI jobs and required checks pass for the exact PR head, use the merge
endpoint with that SHA. The endpoint evaluates the caller's permissions and
rejects a changed head.

```sh
repo=orangeofcarl0-sys/palimpsest
gh pr checks "$pr" --repo "$repo" &&
  gh api --method PUT "repos/$repo/pulls/$pr/merge" -f merge_method=rebase -f sha="$head"
```

Set `pr` to the PR number and `head` to the verified head SHA before running the commands.
[Publisher rule](https://github.com/orangeofcarl0-sys/palimpsest/rules/26806204) · [Merge API](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request)

Agent credentials need a separate permission boundary. Give agents access to topic
branches or forks and keep the maintainer's administration, status publishing and
workflow-writing credentials outside agent reach. The email allowlist checks Git
metadata. Account authentication and credential isolation supply identity assurance.

Run the bypass regressions with `node --test scripts/repository/commit-attribution.test.mjs`.
