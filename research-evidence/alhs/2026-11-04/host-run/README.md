# ALHS deterministic real-host run — 2026-11-04

This is an **engineering qualification** of the ALHS-A/B product paths on the REAL Windows DSH host.
The host process, worker subprocesses, Git worlds, Palimpsest Work/Attempt/Promotion, operator
promotions and the project journal are real. The model content is a deterministic Messages stand-in
(`MOCK_MODEL`); this run makes **no cognitive, quality or cost claim**.

## What the run exercised

| Step | Real effect |
|---|---|
| A1 principal | Pulse → delegate the baseline `cost` task to a real Work Worker in an isolated world. The worker writes and commits `deliverables/cost.md` and `deliverables/assumptions.md`, then **parks before reporting**. |
| New measurement | The harness writes `.palimpsest/inputs/corridor-measurement.md` (700 mm measured; 900 mm not admissible at site B). It is not committed, so the canonical worktree stays clean. |
| A2 principal | Records a contribution and a `REVISE_PLAN` decision with `changeClass=behavior_change`, retires `cost`/`capacity`, adds `capacity-v2`, and starts a real replacement worker. |
| Replacement | `capacity-v2` writes `deliverables/capacity.md` and `deliverables/assumptions.md` on the measured basis and settles. |
| Late result | The parked baseline worker is released **before** the replacement is promoted, so its result settles on the retired task (COMPLETED attempt, STALE task). It is never accepted. |
| Operator | Promotes `capacity-v2` through the ordinary operator path. The canonical head moves and `assumptions.md` changes. |
| A3 principal | Pulse → `results` for the retired `cost` task → block-level reuse facts: `deliverables/cost.md` **unaffected**, `deliverables/assumptions.md` **conflicted**. |
| Governed reuse | A3 adds a new `cost-v2` task whose objective names the old result commit. The worker runs `git show <commit>:deliverables/cost.md`, keeps only the vendor-pricing section, and writes `deliverables/cost-v2.md` with the measured 700 mm assumption and a provenance line. |
| Episode conclusion | A3 runs the mechanical scheduler step and records `WAIT_FOR_OPERATOR`. The host exits 0; the operator promotes `cost-v2`. |
| A4 principal | A new session sees the conclusion REOPENED by the promotion, re-reads the pulse, and records `DELIVER` with the two artifacts. The host exits 0 naturally. |

## Exact facts (all from `alhs-summary.json`)

- Project revision **4**; final head **`a9bf7cbfd7036864ac33177562ce227328b423f2`**.
- Tasks: `capacity` STALE, `cost` STALE, `capacity-v2` SATISFIED, `cost-v2` SATISFIED.
- Promotions:
  - `promotion-afbae706f6a3a8c8bb8ea9898f1a68f3` — `capacity-v2`, source `d53ff315…`, head `d47a11d8…`;
  - `promotion-98acd358ca3794efbdda00802cdd6314` — `cost-v2`, source `5e743218…`, head `a9bf7cbf…`.
- Old cost result: commit **`438c93bc71cf8734300c9526fab2271d6977a0df`**, task STALE,
  `compatibility=INCOMPATIBLE`, `currentness=STALE`; **not** rematerialized or promoted.
- Reuse facts: base `7ee1a781…`, result `438c93bc…`, current `a9bf7cbf…`;
  `unaffectedPaths=["deliverables/cost.md"]`, `conflictedPaths=["deliverables/assumptions.md"]`,
  `alreadyPresentPaths=[]`.
- `cost-v2` artifact: 318 bytes, sha256 `72d4278090cd879dd17c5a1473fa690351b6d060d59407483a4cac295eed17e6`;
  it names commit `438c93bc…`, carries the old vendor price (1200 EUR) and the measured 700 mm
  assumption, and does not keep the old 1200 mm assumption as current.
- Episode conclusion: DELIVER, `episode-167b9682b53dca2581ba60d8`, basis revision 4 / head `a9bf7cbf…`,
  `current=true`.
- Session exits: A1=0, A2=0, A3=0, A4=0. No kill, no budget stop.

## Checks

`alhs-summary.json` records all six checks as true:

- `baselineCostWasProduced`
- `capacityPromoted`
- `costV2Promoted`
- `oldCostRetiredNotPromoted`
- `reuseFactsPresent`
- `deliveredEpisode`

`naturalExit` is true: every host session exited on its own, after a recorded conclusion, with no
ceiling stop and no forced termination.

## Files

- `alhs-summary.json` — the authoritative derived read after the run.
- `artifacts/capacity.md`, `artifacts/cost-v2.md` — the promoted deliverables.
- `sessions/` — the real DSH session streams.
- `session-logs/A1..A4/` — host logs, stderr and exit codes.
- `promotions/` — operator promotion records.
- `mock-scripts.json`, `seed.json`, `deployment.json` — the scenario and host configuration.
- `mock.jsonl` — request metadata from the stand-in (no model content beyond the script).

## Limitations

- One deterministic run. It proves the product mechanics and the real host/Worker/Git path, not model
  autonomy or a comparative benefit.
- The scripted principal does not "discover" the reuse; the scenario hands it the result and the
  product supplies the path-level facts. The product's contribution is the facts, the governed
  rework path and the conclusion state.
- The reuse is path-level. A semantic change in an "unaffected" path would not be detected by the tree
  diff; the summary says so and the principal must judge it.
- No business-quality score is computed here. The old result is not accepted; the new result is
  accepted only by the operator's Promotion.
