# Palimpsest branch policy

Applies to the remote repository `orangeofcarl0-sys/palimpsest`. Written by RS-1 (§17/§18/§19/§20/§21)
after auditing all 102 remote branches branch-by-branch.

## 1. The model

```text
branch  = an active line of work
commit  = history
PR      = review / audit history
CI      = verification history
tag     = a milestone
docs    = the design and delivery record
```

A branch is **not** a museum exhibit. History already lives in Git: every commit that reached `main`
is reachable there forever, and every pull request keeps its commits reachable at
`refs/pull/<n>/head`. Retaining a branch adds nothing to history and taxes every future reader.

## 2. Rules

1. **Spec stage ≠ branch.** A campaign's stages (`1`, `1R`, `1E`, `final`, `closure`) are commits,
   PR descriptions, docs and Spec IDs. They are not branches.
2. **One major campaign = one branch.** Created once, extended with commits as the campaign
   proceeds, merged once.
3. **A continuation spec continues the same branch** unless it starts genuinely unrelated work.
4. **Merged branches are deleted immediately.** GitHub's *Automatically delete head branches* is
   enabled for this repository (§4), so this is the default rather than a manual step.
5. **Checkpoint branches are deleted immediately after their merge.** A checkpoint records a merge
   in a document; that is what docs are for.
6. **Historical milestones use tags, not branches** (§6).
7. **Abandoned experiments are documented, then deleted.** The audit record — tip SHA, unique commit
   list, why it was abandoned — is the provenance.
8. **No branch exists without an active purpose.** "Just in case" is not a purpose.
9. **No permanent branch other than `main`** unless explicitly justified in
   [`ACTIVE-BRANCHES.md`](ACTIVE-BRANCHES.md) with an owner, a purpose and a next action.

## 3. Lifecycle (§19)

```text
merged                         → delete immediately
active feature/fix/refactor    → keep while active
inactive unmerged > 30 days    → audit (classify against §4 of the RS-1 audit model)
experiment inactive > 60 days  → classify: continue / tag+delete / abandon+delete
```

This is process guidance, **not an automated destructive timer**. Nothing deletes a branch on age
alone; every deletion is a classification backed by evidence.

## 4. Naming (§18)

```text
feature/<short-purpose>
fix/<short-purpose>
refactor/<short-purpose>
experiment/<short-purpose>
chore/<short-purpose>
```

Avoid embedding a campaign chronology in a name:

```text
foo-stage-1
foo-stage-1r
foo-stage-1e
foo-stage-1-final
foo-stage-1-final-closure
```

Names must describe the *purpose*, not the sequence.

## 5. Milestones are tags (§6/§10)

A tag answers **"what historically important product state does this commit represent?"** — never
"which branch did we delete?".

Rules:

- prefer the **canonical merge commit** in `main` over a feature-branch tip;
- do not create one tag per campaign step;
- do not convert deleted branches into tags;
- keep the set small and deliberate (the current set is five, plus three release tags);
- check for an existing release tag that identifies the same state before adding a milestone.

Current milestones:

| tag | commit | state |
| --- | --- | --- |
| `milestone/ux-a-pass` | `2e0f48b2` | one-request local multi-agent collaboration |
| `milestone/ux-b-pass` | `a36d37b1` | one-request cross-project collaboration |
| `milestone/ux-c-pass` | `6c7181d6` | host-native zero-config collaboration runtime |
| `milestone/rc-1e-pass` | `b22187cd` | remote collaboration intent handoff (5/5 live trials) |
| `milestone/sr-1-pass` | `74bb1422` | architectural decomposition and composition-root refactor |
| `palimpsest-v0.1.0` … `v0.1.2` | — | release tags (pre-existing) |

## 6. Repository settings (§20/§21)

Audited and, where the workflow supports it, applied:

| setting | before RS-1 | after RS-1 | how |
| --- | --- | --- | --- |
| *Automatically delete head branches* | **off** | **on** | `PATCH /repos/…` — matches a workflow where every change lands through a PR |
| `main` classic branch protection | none (404) | n/a | superseded by the ruleset below |
| ruleset `main-protection` | none | **active** | rules: `deletion`, `non_fast_forward`, `pull_request` (0 required approvals), `required_status_checks` = `unit`, `e2e` |

The ruleset deliberately requires **zero approving reviews**: this is a single-maintainer
repository, so requiring an approval would deadlock every merge rather than protect anything. It
does implement the other three minimums from the RS-1 spec — PR before merge, CI required, no force
push, no deletion.

A human decision is still required for:

- required approving reviews (needs a second maintainer);
- `strict_required_status_checks_policy` (would force every branch to be rebased on the latest
  `main` before merging — appropriate once more than one line of work is active).

## 7. Applying this policy

When starting work:

```text
git fetch --prune origin
git switch -c <type>/<short-purpose> origin/main
```

When finishing work:

```text
open PR → CI green → merge → the branch deletes itself (§4)
```

If a branch is abandoned, do not leave it in place "in case": record the tip SHA, the unique
commits and the reason in an audit document, then delete it.
