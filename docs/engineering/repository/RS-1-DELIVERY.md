# RS-1 — Repository Stabilization & Branch Hygiene: delivery

**Repository:** `orangeofcarl0-sys/palimpsest`
**Canonical main at audit start:** `4028b6a30c917c73c26ecbd05c6a00743ace598e` (tree `dc863f86691681d3f722c1328b6ac630cf9fbd25`)
**Deliverables:** [`BRANCH-INVENTORY-BEFORE.md`](BRANCH-INVENTORY-BEFORE.md) ·
[`BRANCH-CLEANUP-PLAN.md`](BRANCH-CLEANUP-PLAN.md) ·
[`BRANCH-INVENTORY-AFTER.md`](BRANCH-INVENTORY-AFTER.md) ·
[`ACTIVE-BRANCHES.md`](ACTIVE-BRANCHES.md) · [`BRANCH-POLICY.md`](BRANCH-POLICY.md) ·
`repository-audit/{branches-before,branches-after,branch-classification}.json`

---

## 0. Verdict

> ## `PALIMPSEST RS-1 REPOSITORY STABILIZATION & BRANCH HYGIENE: PASS`

---

## 1. Counts (§26)

```text
starting branch count    102
ending branch count        2      (main + the transient RS-1 working branch)
final topology             1      (main) — the working branch deletes itself after its merge (§27)
```

Deleted: **101**

| class | deleted | why |
| --- | --- | --- |
| **merged** (A) | **83** | tip reachable from `main`; the work shipped |
| **superseded** (C) | **11** | merged via a PR, plus one post-merge documentation record — folded into `main` first (§3) |
| **abandoned** (F) | **7** | the `experiment/pal-fed-0*` prototype family — never merged, superseded, draft PRs closed |

Retained: **0 active, 0 review-required**. `main` is protected and was never in the deletion set.

Milestone tags created: **5** (`milestone/ux-a-pass`, `ux-b-pass`, `ux-c-pass`, `rc-1e-pass`,
`sr-1-pass`), each on the canonical merge commit in `main`.

```text
main SHA  before  4028b6a30c917c73c26ecbd05c6a00743ace598e
main SHA  after   4028b6a30c917c73c26ecbd05c6a00743ace598e     unchanged
main tree before  dc863f86691681d3f722c1328b6ac630cf9fbd25
main tree after   dc863f86691681d3f722c1328b6ac630cf9fbd25     unchanged
```

Branches requiring human review: **none** (0 classified E, 0 classified G).

## 2. How each branch was classified (§4/§5)

Per branch, from Git reachability and GitHub PR metadata only:

```text
git merge-base origin/main <tip>
git merge-base --is-ancestor <tip> origin/main
git rev-list --left-right --count origin/main...<tip>
git log origin/main..<tip>            → the unique commits
gh pr list --state all               → state, head, merge commit, base
```

`scripts/repository/branch-audit.mjs` records the facts, `scripts/repository/branch-classify.mjs`
applies the rules and refuses to run if a protected branch is ever classified deletable. No
classification cell in the plan was written by hand; the plan table is generated from the
classification JSON.

**One thing the mechanical pass got wrong first.** `git ls-remote --heads` returns `main` like any
other head, so it arrived in the inventory and classified as "an ancestor of main" — i.e. deletable.
The classifier now carries an explicit protected list and throws if a protected branch reaches the
deletion set. The dry run is what surfaced it.

## 3. The finding that mattered more than the deletions

Eight documents in `main` contained **branch placeholders** whose content lived only on the branch
that was about to be deleted:

```text
docs/engineering/G10-F1-DELIVERY.md                       "see the branch follow-up commit"
docs/engineering/G10-F-ORGANIZATION-…-CAMPAIGN.md         "recorded on branch" (×4 cells)
docs/engineering/G10-G-CAMPAIGN-…-CAMPAIGN.md             "recorded on branch"
docs/engineering/G10-GC-PAG-PRODUCTION-CLOSURE-CAMPAIGN.md "recorded on branch"
```

Deleting those eleven branches without acting would have left `main`'s own documentation pointing at
refs that no longer exist. The registration/lifecycle records were **folded into `main`'s docs first**,
in the same change that removes the branches:

- **9 of 11 applied cleanly** (`git apply --3way` of each branch's documentation commit);
- **2 required renumbering** because `main` had since grown later historical notes at the same
  location. Both campaign gate records are appended as new final sections, and the later notes are
  explicitly **not rewritten** — each resolution carries an RS-1 note saying so.

After the fold, `main` contains no reference to a branch or commit outside `main`.

## 4. Four placeholders that can never be completed

`docs/engineering/G10-F2/F3/F4/F5-DELIVERY.md` each say:

```text
Remote canonical CI on the final F<n> HEAD: recorded on the branch after the run.
```

Their branches (`experiment/g10-f2-…`, `g10-f3-…`, `g10-f4-…`, `g10-f5-…`) are **already ancestors
of `main` with zero unique commits**, so no branch-only record exists to fold — the promised CI
record was never written to any branch or to `main`. RS-1 reports this rather than inventing a
result. It is a pre-existing documentation defect, not something this cleanup introduced, and it is
not a reason to retain any ref.

## 5. The abandoned prototype (the only unmerged work removed)

The 7 `experiment/pal-fed-0*` branches are a **strictly stacked** family — verified pairwise with
`merge-base --is-ancestor`: `-0` ⊂ `-0-dsh` ⊂ `-0e` ⊂ `-0f` ⊂ `-0g` ⊂ `-0h` ⊂ `-0i`. Evidence of
abandonment and supersession:

| evidence | value |
| --- | --- |
| PRs | #1–#7, all **DRAFT**, created 2026-09-10/11, never reviewed, never merged |
| divergence | all 7 share merge-base `59fae6e4`, **288 commits behind** `main` |
| the prototype | 15 `src/federation/*` files (codec, contracts, fabric, mcp, peer_state, store, strict, types, …) + ~5,000 lines |
| was it ever merged anywhere? | **no** — `git log origin/main -- src/federation/{codec,mcp,fabric}.ts` is empty for each; those paths never existed in `main` |
| what superseded it | `feat(g10-e5): bottom-up federated workforce service and derived views` (2026-09-13) created `main`'s `src/federation/` as a **different design** (coalition/commitment/messaging/peer/transport/workforce), and its host-facing surface passed live qualification in RC-1E (5/5) |

The commits were **not destroyed**: the draft PRs were **closed** rather than merged, which keeps
every commit reachable in this repository at `refs/pull/<n>/head`. Verified after deletion:

```text
refs/pull/1/head  2c7a63c12366  ==  deleted tip of experiment/pal-fed-0
refs/pull/7/head  b4a0334b8f34  ==  deleted tip of experiment/pal-fed-0i
```

## 6. Milestones as tags, not branches (§8/§10)

Five annotated tags now name the product states that previously existed only as branch refs. Each
points at the **canonical merge commit in `main`**, not at a feature-branch tip:

| tag | commit | state |
| --- | --- | --- |
| `milestone/ux-a-pass` | `2e0f48b2` | one-request local multi-agent collaboration (PR #111) |
| `milestone/ux-b-pass` | `a36d37b1` | one-request cross-project collaboration (PR #113) |
| `milestone/ux-c-pass` | `6c7181d6` | host-native zero-config collaboration runtime (PR #115) |
| `milestone/rc-1e-pass` | `b22187cd` | remote collaboration intent handoff, 5/5 live trials (PR #117) |
| `milestone/sr-1-pass` | `74bb1422` | architectural decomposition and composition-root refactor (PR #119) |

Existing tags and releases were audited first (§24): 3 release tags (`palimpsest-v0.1.0`–`v0.1.2`,
all 2026-08-20, all predating the UX/RC/SR milestones), so there was no duplicate representation and
no naming collision. Total tags: **8**. No G10 step was tagged, and no branch was converted into a
tag.

## 7. Settings audited and applied (§20/§21)

| setting | before | after |
| --- | --- | --- |
| *Automatically delete head branches* | **off** | **on** |
| ruleset `main-protection` | none | **active** — `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks` (`unit`, `e2e`) |
| classic branch protection on `main` | none (HTTP 404) | superseded by the ruleset |

Both were applied, not merely recommended: the repository settings permitted it and the workflow
already matches (113 merged PRs, every change through a PR with green CI). The ruleset requires
**zero approving reviews** on purpose — this is a single-maintainer repository, so requiring an
approval would deadlock every merge instead of protecting anything. Recorded as a human decision in
`BRANCH-POLICY.md` §6:

```text
required approving reviews        needs a second maintainer
strict_required_status_checks     appropriate once more than one line of work is active
```

## 8. Deletion batches (§13) and the invariants checked after each

| batch | scope | deleted | remote refs after |
| --- | --- | --- | --- |
| 1 | merged ancestors (feature/campaign) | 59 | 43 |
| 2 | checkpoint / closure branches | 24 | 19 |
| 3 | superseded historical branches | 11 | 8 |
| 4 | abandoned unique-history branches | 7 | **2** |

After **every** batch, `scripts/repository/branch-delete.mjs` re-checked: `main` SHA unchanged,
`main` tree unchanged, tags unchanged, every batch ref gone, `main` still present. Batches were
deleted in groups of ten, so a mid-batch failure would have left a known state.

No history was rewritten. Deleted: **refs only**. No `filter-branch`, no `filter-repo`, no
force-push, no rebase of published `main`, no tag removed.

## 9. Policy installed (§17/§18/§19)

[`BRANCH-POLICY.md`](BRANCH-POLICY.md) states that spec stages do not imply branches, one campaign
uses one branch, continuations extend the same branch, merged and checkpoint branches are deleted
immediately, abandoned experiments are documented then deleted, milestones use tags, and no branch
exists without an active purpose. It carries the naming convention, the lifecycle guidance, the
tag list and the settings table.

[`ACTIVE-BRANCHES.md`](ACTIVE-BRANCHES.md) records that there are currently **no** active
non-`main` branches, and defines the row format a future retained branch must fill in — including an
"next action" that cannot be empty.

## 10. Reproducing this audit

```text
node scripts/repository/branch-audit.mjs --out repository-audit/branches-before.json
node scripts/repository/branch-classify.mjs
node scripts/repository/branch-report.mjs --mode before
node scripts/repository/branch-report.mjs --mode plan
node scripts/repository/branch-delete.mjs --batch <1|2|3|4>            # dry run
node scripts/repository/branch-delete.mjs --batch <1|2|3|4> --execute  # act
node scripts/repository/branch-report.mjs --mode after
```
