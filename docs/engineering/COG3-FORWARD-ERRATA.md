# COG-3 — Forward Erratum (documentation only)

**Issued:** 2026-11-01, during COG-3.
**Scope:** one factual statement in the COG-2 governance record. No historical freeze, commit or
evidence file is changed.

---

## 1. `r3-a2-sentinel-portfolio` is not local-only

**Original record.** `docs/engineering/COG2-BRANCH-GOVERNANCE.md` (COG-2 Evidence Freeze
`dec8bf3`) says, at lines 146 and 152–153:

> `r3-a2-sentinel-portfolio` | 1 | 3 commits, 53 files, 22,351 insertions, no PR | **unmerged**
> ... `r3-a2` has no PR and its only copy is this local ref. That makes
> `r3-a2-sentinel-portfolio` the single most fragile reference in the repository.

**Recheck (COG-3, read-only).**

| observation | value |
| --- | --- |
| `git ls-remote origin refs/heads/r3-a2-sentinel-portfolio` | `10a59785b02b06670ed8ae5fe4a5df10a6fdb014` |
| local `refs/heads/r3-a2-sentinel-portfolio` | `10a59785b02b06670ed8ae5fe4a5df10a6fdb014` |
| local `refs/remotes/origin/r3-a2-sentinel-portfolio` | `10a59785b02b06670ed8ae5fe4a5df10a6fdb014` |
| pull requests with that head (`gh pr list --state all`) | none |
| commits ahead of `origin/main` at the observation | 43 (`git rev-list --left-right --count origin/main...<ref>` = `0 43`) |

**Correction.** The branch **is** present on the remote with the same tip. The phrases "its only
copy is this local ref" and "the single most fragile reference in the repository" are inaccurate as
written. The substantive disposition is unchanged: the branch is unmerged, has no pull request, and
retiring or integrating it still requires an owner decision. The remote copy reduces the
single-copy risk but does not make the work integrated or protected by review.

**What this erratum does not do.** It does not amend the COG-2 Evidence Freeze, reclassify the
branch, delete anything, or change the retirement proposal. The COG-2 record remains readable as
the record of what that stage believed; this note is the forward correction COG-3 was asked to
produce.

---

## 2. COG-2 concurrent targeted-test failures remain unattributed

COG-2's first targeted run under default parallelism reported 8 failed files / 9 failed tests; its
preserved JSON diagnostic reported 5/5. The diagnostic included `HOST_ERROR`, absent attempt ids,
and a revoked-convergence assertion that followed an absent attempt id. COG-2's serial authoritative
run passed 21 files / 76 tests, and one failing file passed in isolation.

COG-3 does **not** silently classify those failures as harmless resource contention. They remain
**unattributed**: the available evidence is consistent with contention in the Work/qualification
suites but does not exclude a real ordering or recovery defect. The COG-3 verification record
reports its own runs, including any failure, separately and without retroactively changing the
COG-2 measurement.
