# PAL-FED-0F Delivery Report

Status: EXPERIMENTAL / BEHAVIORAL EVIDENCE / NOT UAS FROZEN.
Branch: `experiment/pal-fed-0f` (child of the PAL-FED-0E line at `bae56f9`).

## Headline

With realistic read-only repository inspection and 0E's ambient-collaboration
confound removed, the **local-first boundary criterion is a real lever but too
blunt**: it eliminated false contact completely (L 22%→0%, P 22%→0%; precision
69%→100%) while also suppressing genuine required contact (R 100%→56%;
balanced accuracy 0.89→0.78). Inspection alone does **not** fix selectivity
(both arms inspected in 100% of runs, yet F0 still over-contacted). Verdict:
**keep experimental — promote the principle, not the wording**; the missing
piece is explicit freshness/authority semantics.

## Design and integrity

| Item | Value |
| --- | --- |
| Primary runs | 62 (11 scenarios × 2 arms; R/L/P ×3 replicates, A ×2) |
| Symmetry runs | 8 (2 scenarios × 2 arms × 2 replicates) |
| Valid / invalid | **70 / 0** |
| Randomization | seeded 20260911; frozen before outcomes |
| Treatments | F0 mechanical-only guidance; F1 = F0 + local-first criterion |
| Isolation | control plane differs only in `federation/dsh/instructions.*`; prompt assembly shows identical tools and only the `pal-fed:peer-collaboration` section differing |
| Read-only tools | `repo_list`, `repo_read`, `repo_search`, `repo_git` (read-only subcommands), path-jailed per workspace |
| Workspaces | Palimpsest `59fae6e` sources with pins reconciled to the frozen Ordarium 1.3.1; Ordarium `073409b`; no experiment evidence present |
| Model | `deepseek-official` / `deepseek-flash`, no honored seed (stochastic); single route |
| Polling | 2 s (unchanged) |

## Results

- **Primary contact table and selection metrics:** `PAL-FED-0F-ANALYSIS.md`.
- **R recall** 100% → 56%; **L+P specificity** 78% → 100%; **precision** 69% →
  100%; **balanced accuracy** 0.89 → 0.78.
- **Inspection before contact:** 100% in both arms; **premature contact 0%** in
  both arms — so F0's over-contact happened *after* real inspection.
- **Delivery (contacted, n=26):** receipt/response/reply-delivery 100%/100%/100%.
- **Ack 85%**, pending-after-idle 8% (0E: 24% / 72%) — ack discipline is largely
  a function of realistic task context.
- **Contracts touched 0%** (0E: 59%); **thread 27%** (0E: 86%); event kinds used
  5/8 (`constraint`/`change_ready`/`blocker` unused).
- **Latency:** change→wake 903 ms, wake→inbox 1 096 ms, change→response 59 s.

## Failure modes worth keeping

1. **Over-localization** — F1 misses authority/intent questions
   (`R-new-primitive` 0/3) because "local evidence exists" was treated as
   "sufficient/authoritative".
2. **Inspection ≠ selectivity** — thorough repository reading in F0 did not
   prevent 22% unnecessary contact; the decision rule, not capability, drives it.
3. **Fixture coherence matters** — the first smoke run exposed a workspace
   declaring Ordarium 1.2.0 while installing 1.3.1; the agent reasonably asked
   the peer about the discrepancy. Fixed before scored runs (scenarios
   unchanged).

## §73 stop-rule checklist

```
F0/F1 treatment isolation proven ................. ✅ (hash + prompt capture)
real read-only repository tools enabled .......... ✅ (repo_list/read/search/git)
cross-workspace reads prohibited ................. ✅ (path jail to own workspace)
previous behavioral evidence hidden .............. ✅ (clean snapshots; leak-scan clean)
scenario manifest frozen ......................... ✅
>=3 R, >=3 L, >=3 P, >=2 A ....................... ✅ (3/3/3/2)
>=3 replicates/arm for R/L/P ..................... ✅ (9 per class per arm)
symmetry probe complete .......................... ✅ (S-O-R, S-O-L)
run ordering frozen/randomized ................... ✅ (seed 20260911)
fresh sessions/fabrics/workspaces used ........... ✅
all valid failures retained ...................... ✅ (no retry-to-success)
R recall measured ................................ ✅
L/P specificity measured ......................... ✅
precision / balanced accuracy measured ........... ✅
inspection-before-contact measured ............... ✅
premature contact measured ....................... ✅
ack behavior re-measured ......................... ✅
contract/thread/taxonomy behavior recorded ....... ✅
latency recorded ................................. ✅
analysis written ................................. ✅
G10-A0 evidence memo written ..................... ✅
full regression gates recorded ................... ✅ (below)
```

## Evidence index

| Artifact | Path |
| --- | --- |
| Frozen scenarios | `docs/engineering/experiments/PAL-FED-0F-SCENARIOS.json` |
| Treatment manifest | `evidence/pal-fed-0f-treatment-manifest.json` |
| Isolation proof | `evidence/pal-fed-0f-treatment-isolation.json` |
| Prompt capture | `evidence/pal-fed-0f-prompt-capture.json` |
| Run manifest (order) | `evidence/pal-fed-0f-run-manifest.json` |
| Run ledger (70) | `evidence/pal-fed-0f-runs.jsonl` |
| Per-run machine results | `evidence/pal-fed-0f-runs/<runId>.json` |
| Analysis + tables | `evidence/pal-fed-0f-analysis.json`, `evidence/pal-fed-0f-tables.md` |
| Raw evidence (local) | `F:/Codex_Work_Space/pal-fed-0f/runs/<runId>/` (result.json, coordination.sqlite, DSH session logs) |

## Regression gates (§71)

`pnpm run clean`, `build`, `build:web`, `test` (66 files / 475 tests) and
`test:e2e` with Playwright `retries = 0`; the known nondeterministic
`runtime-debugger` E2E flake is recorded, never retried away. This batch changes
no product behaviour beyond the experiment branch's guidance text and adds only
harness/scenario/analysis tooling (`tools/pal-fed-0f-*`).

## Not started (by instruction)

PAL-FED-1, G10-A implementation, dynamic federation, contact budgets, ack guard,
new Ordarium primitive, organization graph.
