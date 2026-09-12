# G10-B0 — Canonical Publication Record (Stage 0)

Status: **RECORD · STAGE 0 OF G10-B0**

Records the canonical publication of the approved semantic stack
(#8 → #10 → #11) and the canonical gate that preceded Stage 1. Merge workflow
was normal (mark-ready → merge; no squash of the semantic history, no force
merge around checks, no history rewrite). Known pre-existing nondeterministic
`E2E-DEBUG-01` runtime-debugger flake was handled by re-running the failed CI
job only.

## Pre-merge verification (§3)

- `main` at task start: `b02e7ba` (baseline portability repair only).
- PR #8 (`experiment/g10-a0-evidence-grounded-semantic-rebase` @ `42127f6`,
  base `main`): MERGEABLE/CLEAN; diff = 4 docs/engineering files (G10-A0 rebase
  + matrix + delivery + index).
- PR #10 (`experiment/g10-a1-uas-semantic-consolidation` @ `1638a7b`, base
  G10-A0 branch): MERGEABLE/CLEAN; diff = 5 G10-A1 files.
- PR #11 (`experiment/g10-a2-uas1-formal-freeze-review` @ `480d4e6`, base
  G10-A1 branch): MERGEABLE/CLEAN; remote CI green on the review HEAD (run
  `34622029134`: unit PASS, e2e PASS).
- Publication-status clarification (§4): a narrow note was added to the frozen
  spec distinguishing the semantic freeze decision from canonical adoption
  (commit `1319111` on PR #11); `git diff --check` clean and `pnpm test`
  60/433 locally before merge; no invariant or semantic meaning changed.

## Merges (§5–§8)

| PR | Content | Merged as | New `main` | CI handling |
|---|---|---|---|---|
| #8 | G10-A0 evidence-grounded semantic rebase | merge commit `b31bbd0` | `b31bbd0` | was green (run `34616847414`) |
| #10 | G10-A1 UAS semantic consolidation | merge commit `a3f759a` | `a3f759a` | rebased onto `b31bbd0` (HEAD `91cdf53`, diff = 5 G10-A1 files only); run `34631506912`: unit PASS, e2e hit `E2E-DEBUG-01` twice, passed on the third job re-run |
| #11 | G10-A2 PLMP-UAS-1 formal freeze (PASS) + publication note | merge commit `b18b08b` | `b18b08b` | rebased onto `a3f759a` (HEAD `1319111`, diff = 7 freeze files only); run `34632980390`: unit PASS, e2e hit `E2E-DEBUG-01` once, passed on the first job re-run |

No PR was squashed into an opaque change; each PR's semantic scope was verified
against its base before merge (`git diff <base>...<head> --name-only`), and no
G10-A0 commits leaked into the #10/#11 diffs after rebasing.

## Canonical publication gate (§9)

- `main` = `b18b08b` contains
  `docs/engineering/UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE-v1.md` with status
  **PLMP-UAS-1 · FROZEN** (plus the publication-status note).
- `PLMP-UAS-0` (`UNIVERSAL-AGENT-SEMANTICS-ARCHITECTURE.md`), AGT-0
  (`AgentGroup_Theory_v0_Literature_Aligned_Frozen_Spec.md`) and PAG-0
  (`PLMP-PAG-0_Persistent_Agents_Campaigns_Durable_Institutions_v0.1.md`) are
  untouched by the entire stack (verified by diff).
- Canonical baseline gates on `b18b08b`: `git diff --check` clean; `pnpm test`
  60 files / 433 passed; `pnpm build` and `pnpm build:web` pass; `pnpm test:e2e`
  21 passed (Playwright `retries = 0`).
- Remote CI on the canonical publication commit `b18b08b`: first run `34633661315`
  — unit PASS, e2e hit the pre-existing `E2E-DEBUG-01` flake; after one failed-job
  re-run the run concluded **success (unit + e2e)**.

**PLMP-UAS-1 is canonically published on `main` as of `b18b08b`.** Stage 1
(`experiment/g10-b0-binding-semantics-design`) branched from this commit.
