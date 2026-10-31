# COG-2 · BGC-0 — Git Branch Governance and Canonical Lineage Reconciliation

**Status:** read-only audit complete; no branch, worktree, gate root, evidence tree or ref was
modified. Everything below is derived from Git objects and the repository's own written policy.
Machine-readable records live in [`research-evidence/cog2/`](../../research-evidence/cog2/README.md).

This document answers two questions separately:

1. **Governance:** can a future engineer or Agent identify the authoritative development baseline,
   reproduce a protected research result, locate genuinely unintegrated work, and continue without
   guessing which branch is safe?
2. **Lineage:** what does `main` mean here, and what is required before it advances?

---

## 1. Method and baseline

All commands were read-only. The census producer is
[`scripts/bgc0/branch_census.mjs`](../../scripts/bgc0/branch_census.mjs); it runs `rev-parse`,
`for-each-ref`, `log`, `rev-list`, `merge-base`, `cherry`, `worktree list`, `stash list` and
`status --porcelain` under `--no-optional-locks`, and writes nothing. Remote-tracking refs were
compared with `git ls-remote --heads origin`; no fetch was run because all 79 heads already matched.

```text
development head       c8fe50590d1862840043aff4449f91ec95524c3a
                       palimpsest-cog1-real-task-compounding (COG-1 Evidence Freeze)
development tree        13623581df2e7b2a19e336e6ef94d55f9dcf9d07
origin/main            044330b2e55198542d545edc42ed9c36e7ce896b
local main              67b29c9e7907b08fe594738973ce48b55e10d80b (clean checkout, 296 behind origin/main)
remote heads            79, identical to their tracking refs
stashes                 0
```

Ancestry was checked with exit codes, not inferred from dates:

```text
git merge-base --is-ancestor origin/main <COG-1>              exit 0
git rev-list --left-right --count origin/main...<COG-1>       0    352
git rev-list --left-right --count main...origin/main          0    296
git merge-base --is-ancestor main <COG-1>                     exit 0
```

The working tree was clean at `c8fe505` before this audit wrote its own producer. The only
post-baseline untracked entry is `scripts/bgc0/branch_census.mjs` itself; the census therefore
reports one dirty entry in this worktree, and that entry is this stage's file.

---

## 2. Verified counts (resources are not interchangeable)

| resource | count | evidence |
| --- | --- | --- |
| local branch refs | 250 | `refs/heads/*` |
| remote branch refs | 79 | `refs/remotes/origin/*`, excluding `origin/HEAD` |
| total branch refs | 329 | |
| distinct branch names | 250 | every remote name also exists locally |
| worktree registrations | 95 | `git worktree list --porcelain` |
| worktrees that still exist | 3 | primary repo, `palimpsest-sr1`, one stale temp worktree |
| missing worktree paths | 92 | 90 marked `prunable`, 2 marked `locked: initializing` |
| attached-branch worktrees | 85 | of 95 registrations |
| detached worktrees | 10 | |
| dirty worktrees | 2 | this worktree (the producer file) and one stale temp worktree with one untracked marker |
| gate root entries | 19 | `~/.palimpsest-gates`; none modified |
| evidence trees | 69 | `research-evidence/*`; none modified |
| runtime home | `~/.dsh`, DSH `0.2.1-rc.3` | global npm package; no version file in the home |

A **branch ref**, a **worktree**, a **gate root** and an **evidence tree** are different resources.
None of the numbers above is a substitute for another.

---

## 3. What `main` means in this repository

This is written policy, not inference:

- [`docs/engineering/repository/BRANCH-POLICY.md`](../repository/BRANCH-POLICY.md) defines the model:
  *branch = active line of work; commit = history; PR = review/audit history; tag = milestone*.
  Historical milestones use tags, not branches. No permanent branch other than `main` unless
  declared with owner, purpose and next action in `ACTIVE-BRANCHES.md`.
- The `main-protection` ruleset (active) requires a pull request, forbids deletion and non-fast-forward
  updates, and requires the `unit` and `e2e` status checks. It requires zero approving reviews
  (single-maintainer repository) and has no bypass actors.

Therefore:

**`main` is the canonical integration branch. It is not a "latest stable tag", and it is not the
current development head in fact.** It is 352 commits behind the verified development head, with
zero commits that the head lacks. The development lineage simply has not been integrated back.

This is the actionable distinction the policy asks for:

| concept | identity | meaning |
| --- | --- | --- |
| canonical integration baseline | `origin/main` @ `044330b` | the protected line every change must enter through a PR |
| active development baseline | COG-1 head @ `c8fe505`, then the COG-2 branch | the most recent verified lineage; research and implementation continue here |
| local `main` checkout | `main` @ `67b29c9` | a clean but stale checkout, 296 behind `origin/main`; not moved by this stage |

A future engineer should not start work from the local `main` checkout without first fetching and
fast-forwarding it. This stage did neither.

---

## 4. Lineage classification (250 distinct branches, 329 refs)

| audit category | distinct names | refs | notes |
| --- | --- | --- | --- |
| canonical integration branch | 1 | 2 | `main`, local + remote |
| current development head | 1 | 2 | COG-1 branch, local + remote |
| integrated historical milestone (tip contained in the development head) | 208 | 285 | 208 local, 77 remote; 149 refs are also ancestors of `origin/main` |
| protected freeze reference | 17 | 34 | tip named in a freeze record or near freeze language in evidence; all are also contained in the head |
| retirement candidate (contained, no worktree, no freeze record) | 58 | 116 | each has a local + remote ref |
| patch-equivalent but graph-divergent | 18 | 18 | local-only squash-merge source branches; 0 non-equivalent patches |
| divergent research branch | 24 | 26 | 24 local, 2 remote (D5 and `r3-a2` also have remote refs) |
| local-only / unpublished | 171 | 171 | 131 contained, 18 patch-equivalent, 22 divergent |
| active worktree branch | 2 | 2 | `main` and the COG-1 branch |
| dirty worktree branch | 1 | 1 | the COG-1 worktree, because of this stage's untracked producer |

The counts are ref-level unless stated. The category tags overlap by design: a freeze reference is
also an integrated milestone, and a local-only branch is also whatever its content says it is.

### 4.1 The development lineage

```text
origin/main (044330b, 561 commits)
        │  352 commits
        ▼
COG-1 Evidence Freeze (c8fe505, 913 commits)
```

Every remote branch except two has its tip inside that history. The research stages
(`r1-*`, `r2-*`, `r3-*`, `trajectory-*`, `host-*`, `ci1`–`ci3`, `cog1`) form a linear chain of
milestones on the unintegrated side. None of them is "lost": their commits are reachable from
`c8fe505`.

### 4.2 The 24 genuinely graph-divergent branches

`git cherry` compares patches, so a squash merge reports its source commits as non-equivalent even
when the content landed. Each divergent branch was therefore checked against its PR merge commit
and, where the touched set was small, against HEAD's file content.

| group | count | evidence | status |
| --- | --- | --- | --- |
| G10 campaign branches | 11 | one post-merge documentation commit each; PR merge commit is an ancestor of HEAD; no executable file touched | content integrated; documentation later edited in 6 of 11 |
| squash-merged source branches (`lean-d5b2`, `d5c1`, `d5c3`, `d5d`, `sr2-0`) | 5 | PR merge commits are ancestors of HEAD; source commits superseded by squash | content integrated |
| `experiment/pal-fed-0*` family | 7 | PRs #1–#7 were closed, never merged; cumulative branch content 5k–107k insertions; local-only | **unmerged**; already recorded by RS-1 as abandoned/superseded, PR refs remain |
| `r3-a2-sentinel-portfolio` | 1 | 3 commits, 53 files, 22,351 insertions, no PR | **unmerged**; unresolved research branch |

Of the 24, **16 have a merged-PR merge commit in HEAD; 8 do not**. The 8 are the only branches in
the repository that carry unique work not already present in the development head.

Local-only warning: all 8 are local refs. Their PR refs (`refs/pull/1..7/head`) are the remote
provenance for the seven `pal-fed` branches; `r3-a2` has no PR and its only copy is this local ref.
That makes `r3-a2-sentinel-portfolio` the single most fragile reference in the repository.

### 4.3 Patch-equivalent but graph-divergent (18)

`lean-d4-live-gate`, `lean-d4c1-read-evidence`, `lean-d5-0-effect-authority`,
`lean-d5a-continuation-assessment`, `lean-d5b-rework-admission`, `lean-d5b1-attempt-authorization`,
`lean-d5c2-prior-result-context`, and the twelve `sr2-*` integration branches. Each is one commit
ahead of HEAD with **zero** non-equivalent patches and a merged PR. The work is integrated; only the
commit identity differs.

---

## 5. Focused D5 assessment — `lean-d5d-result-continuation-service`

This branch was the ruling's special case: tip `a57f0e0`, merge base with COG-1
`8c6d226`, four branch-exclusive commits, PR #199 merged and PR #200 closed. The question was
whether real functionality was missing.

**Answer: no functionality is missing.** Each commit was traced to a squash merge that is an
ancestor of HEAD:

| commit | content | integration route | verification |
| --- | --- | --- | --- |
| `1a40c76` | packaged result continuation authority | PR #199 → squash `3e267c5` (ancestor of HEAD) | file blobs identical for all five new/central files (`src/continuation/service.ts`, `src/composition/continuation.ts`, `continuation_contract.ts`, `src/domain/aggregate.ts`, `rework_admission.ts`) |
| `c068d7b` | reviewed capability-additions escape in the parity gate | folded into the same PR #199 squash | `REVIEWED_CAPABILITY_ADDITIONS` was introduced at `3e267c5` and is live in `tools/architecture/application_parity.ts` |
| `15db373` | system-level acceptance gate on real DSH workers | PR #200 was closed, but the same content merged as PR #201 → squash `a3915d7` (ancestor of HEAD) | `scripts/gates/d5-live-gate.mjs` blob-identical; 51 of 51 added lines in `host/dsh/lib/runner.js` and `src/deployment/launch.ts` present at HEAD |
| `a57f0e0` | CI retrigger | not content-bearing | tree equals its parent |

Consequences:

- The packaged continuation service, execution-context delivery and system-level acceptance gate are
  all present in the development head. No integration candidate is created by this branch.
- The branch is **patch-equivalent at content level but graph-divergent**. `git cherry` says
  otherwise because squash merges change patch context; that is a measurement artifact, not
  missing work.
- The branch must still not be deleted, cherry-picked or merged automatically: its ref is a public
  historical pointer and PR #200's closed state is part of the record. Preserve it.

---

## 6. Local-only and dirty-worktree warnings

**Local-only:** 171 refs have no remote branch of the same name. Of these:

- 131 are contained in the development head — the commits are already safe; only a local label is at issue.
- 18 are patch-equivalent local-only branches — content integrated, commit identity not.
- 22 are divergent: the 11 G10 post-merge documentation branches, the 7 `pal-fed` branches,
  three lean source branches (`d5b2`, `d5c1`, `d5c3`) and `sr2-0`. (`d5d` and `r3-a2` also have
  remote refs, so they are not in the local-only count.)

**Dirty worktrees:** two of the three existing worktrees are dirty:

| path | state | content |
| --- | --- | --- |
| `F:/Codex_Work_Space/Palimpsest/palimpsest-sr1` | clean at baseline; now one untracked file | `scripts/bgc0/branch_census.mjs`, this stage's producer |
| `C:/Users/66494/AppData/Local/Temp/r3lcfsh-worktree-SMlvwB` | dirty, detached at `a161ddd` | one untracked disposable marker, `.r3lcfsh-disposable-worktree.json` |

The stale temp worktree is not this stage's resource. It is left untouched.

**Stale registrations:** 92 of 95 worktree paths no longer exist. 90 are marked `prunable`; two are
marked `locked: initializing` and therefore cannot be pruned even by a normal prune. This is the
largest concrete hygiene hazard in the repository: tools that enumerate worktrees see 95 where only
3 exist. No pruning or lock removal was performed (see §11).

---

## 7. Historical freeze retention obligations

34 refs (17 distinct branches) carry a tip named in a freeze record or in freeze-adjacent evidence.
They are all contained in the development head, so their commits survive even if a ref is later
retired; the refs themselves are retained because an evidence manifest may cite the branch tip as a
freeze identity.

The 17 branches:

```text
host-s1-boundary-completeness-lock-recovery
host-s1r-confidential-boundary-ratification
host-s1ra-environment-evidence-reconciliation
host-s1rae2-freeze-audit
host-s1rae3-resource-ownership-integrity
host-s1rae4-test-isolation-real-host
palimpsest-ci1-two-owner-causal-integration
palimpsest-ci2-delegated-completion-qualification
palimpsest-ci3-evidence-applicability-authority
r2-e-controlled-capital-efficacy
r2-lr-worker-index-delivery
r3-l0c-iar-lcf-measurement-fidelity
r3-wr5-authorized-recovery
trajectory-p2e1r-assay-validity
trajectory-p2e1rc-measurement-integrity
trajectory-p2e1rd-dsh-cwd-qualification
trajectory-p2e1rg-host-admission-closure
```

The detection is textual and deliberately conservative: `freezeEvidenceBy` requires freeze language
near the SHA. Any other mention is recorded separately as `freezeReferencedBy` and does **not** by
itself establish protection. A manifest's own frozen identity (Code Freeze / Evidence Freeze) is the
authority; a branch name is not.

No tag was created. The policy prefers a small, deliberate tag set and the canonical merge commit
over a feature-branch tip; creating 40 stage tags would add clutter, not clarity.

---

## 8. Canonical development-head proposal

**Proposed head for this stage:** `palimpsest-cog2-project-native-continuity`, created from
`c8fe505` (COG-1 Evidence Freeze), tree `13623581`.

- One branch for the whole stage. Checkpoints are commits; the Code Freeze and Evidence Freeze are
  commits with recorded tree identities.
- No separate branch per COG-2 sub-experiment.
- On completion, this document's successor will record whether the stage is integrated,
  research-only, blocked or superseded.
- `COG-1` remains the previous verified milestone, not a competing "latest product" branch.

This satisfies the policy's "one major campaign = one branch" rule without inventing a new
integration branch that merely points at the same SHA.

---

## 9. Mainline reconciliation proposal

**Fast-forward eligibility:** technically yes. `origin/main` is an ancestor of the development head
with `0` commits on the main-only side. No merge conflict or graph divergence exists.

**Authorization:** not granted. The ruleset requires a pull request and the `unit`/`e2e` checks;
direct updates and non-fast-forward pushes are forbidden; there are no bypass actors. A
technically possible fast-forward is not permission to promote.

**Proposal (not performed):**

1. Finish COG-2 on the stage branch, with its Code Freeze and Evidence Freeze.
2. Open **one** pull request from `palimpsest-cog2-project-native-continuity` into `main`. Do not
   create a second integration branch.
3. Let the required `unit` and `e2e` checks run. Do not bypass them and do not rewrite CI3 or COG-1
   evidence to make the integration appear green.
4. Merge only after explicit owner authorization, using the PR, never a direct push.
5. After the merge, re-run the retirement proposal in §10 against the new `main`.

**Draft PR status: not opened.** The ruling conditions opening a draft PR on authorization, and
creating a public PR is an outward-facing action. The integration report is prepared; the decision
belongs to the owner. No PR was opened, merged, closed or edited in this stage.

**Known limitation carried into the integration decision:** CI3's Contract Basis limitation and
COG-1's non-green first broad run remain part of the record. A green required-check run on the PR
would qualify the integration, not retroactively qualify those findings.

---

## 10. Non-destructive retirement proposal

Nothing in this section was executed. It is a proposal with exact conditions.

### 10.1 Safe-to-propose now (owner authorization still required)

| set | distinct names | condition already verified |
| --- | --- | --- |
| contained, non-freeze, non-worktree remote branches | 58 | tip contained in the development head; no worktree exists; no freeze record names the tip |
| contained local-only branches | 131 | tip contained in the development head; commits survive in `c8fe505`'s history; only a local label is retired |
| patch-equivalent local-only branches | 18 | zero non-equivalent patches; merged PR for each |

All three sets presuppose that the development head will be integrated into `main` first, so the
commits acquire a second durable reference. Until then, retirement would not lose objects for sets
1–3 (the head already contains them), but the policy's "durable, verified reference" test is best
satisfied after integration.

### 10.2 Defer — content verified, but the branch name is part of a public record

16 branches: the 11 G10 post-merge documentation branches and the 5 squash-merged source branches
(`lean-d5b2`, `d5c1`, `d5c3`, `d5d`, `sr2-0`). Their content is integrated and their PR merge
commits are in HEAD, but they are referenced by PR history and campaign records. Retirement needs an
owner decision, not just a technical check.

### 10.3 Preserve

- 8 genuinely unmerged branches: 7 `experiment/pal-fed-0*` + `r3-a2-sentinel-portfolio`.
- 17 freeze-referenced branches.
- `main`, the COG-1 head and the COG-2 branch.
- Every branch attached to an existing worktree.
- The 92 stale worktree registrations, 19 gate roots and 69 evidence trees, until their owners
  authorize a bounded cleanup.

### 10.4 Retirement conditions (all must hold before any deletion)

1. The tip is preserved by a durable, verified reference (`main` after integration, or a named tag).
2. Relevant Code/Evidence Freeze identities remain accessible and are recorded by SHA, not by a
   mutable branch name.
3. Unique commits have been examined (§4.2 for the divergent set; `git cherry` for the rest).
4. PR or integration obligations are understood.
5. No existing worktree depends on the branch.
6. No current agent, test runner or gate depends on the branch name.
7. Evidence manifests do not require the mutable ref.
8. The owner explicitly authorizes the specific list.

The default remains **preserve**.

### 10.5 Worktree hygiene proposal

After owner authorization, and only after reviewing the exact list:

- prune the 90 `prunable` registrations with a bounded `git worktree prune` (never a global prune of
  unrelated repositories);
- separately inspect and remove the two `locked: initializing` registrations, which prune will not
  touch;
- leave the one existing stale temp worktree with its untracked marker to its owner.

No `git worktree prune`, no lock removal and no recursive directory deletion was run.

### 10.6 New branch policy from this stage onward

- One active development branch per substantial stage; no branch per sub-experiment.
- Commit logical checkpoints on the stage branch; freezes as commits with tree identities.
- Do not amend historical freeze commits; do not force-push.
- After a stage, record integrated / research-only / blocked / superseded.
- Keep temporary worktrees limited and ownership-aware; no name-based deletion.
- Cross-stage consolidation is an explicit integration operation, never a side effect.

---

## 11. Operations explicitly not performed

- No branch created before BGC-0's read-only audit; the COG-2 branch was created only from the
  verified `c8fe505` after the census.
- No `git branch -D`, no `git push --delete`, no remote branch deletion.
- No force-push, reset, rebase, checkout overwrite, stash drop/pop or history rewrite.
- No `git fetch --prune`; no fetch at all (all 79 remote heads already match tracking refs).
- No `git worktree prune`, no lock removal, no `git gc --prune=now`, no `git clean -fdx`.
- No update of `origin/main`, local `main` or any protected ref.
- No draft PR, PR merge, PR close or review action.
- No tag creation.
- No modification of the 19 gate roots, the 69 evidence trees, the runtime home or any test-owned
  resource.
- No claim that the branch count was reduced: it was not.

---

## 12. Direct answers

| question | answer |
| --- | --- |
| How many branches actually exist? | 250 local refs and 79 remote refs (329 total; 250 distinct names). |
| Which are ancestors of the active development line? | 208 local and 77 remote refs; 285 refs total. |
| Which are truly divergent? | 24 distinct branches (26 refs): 11 G10 docs, 5 squash-merged sources, 7 `pal-fed`, 1 `r3-a2`. |
| Which appear patch-equivalent? | 18 local squash-merge source branches with zero non-equivalent patches, plus the 16 divergent branches whose content-is-integrated status is proven through their PR merge commits. |
| Which represent protected research milestones? | 17 branches named in freeze records; their commits are also contained in the development head. |
| Which are attached to active or dirty worktrees? | 2 attached (`main` in the primary repo, COG-1 here); 1 of those dirty only because of this stage's producer; one separate stale temp worktree is dirty and detached. |
| What is `main` intended to mean? | The protected canonical integration branch (written policy + ruleset), not a stable-release tag and not, in fact, the current development head. |
| Is canonical integration ready, blocked or awaiting authorization? | Technically fast-forward-eligible; **awaiting explicit owner authorization** and the required `unit`/`e2e` checks through a PR. |
| What safe actions were actually performed? | Read-only census, ancestry/patch/PR analysis, branch creation from the verified head, governance documentation. |
| What actions require human review? | Main integration; the retirement list; stale-worktree pruning and lock removal; the 8 unmerged branches; the 16 deferred branches; any change to the main ruleset. |
