# ODPE deterministic real-host run — 2026-11-05

A real Windows DSH host ran the real Palimpsest product across three sessions. The model content is
a deterministic Messages stand-in (labelled `MOCK_MODEL`); the host, worker processes, Git, execution
worlds, context delivery and pull, Work settlement, project journal, episode and Promotion are real.
No paid model call was made. This verifies **real host engineering**, not autonomous model behaviour.

## Scenario (deliberately not the energy/`inbox`/700 mm fixture)

A billing service migration (`orders` / `billing` / `gateway`, REST → gRPC), required artifact
`deliverables/migration-plan.md`.

| Phase | What actually happened | Evidence |
|---|---|---|
| T0–T1 | P1 delegated the task; a real worker committed a partial plan in its own world | `retained-world-subject.txt`, `retained-world-head.txt` |
| T2 | The P1 host tree was killed; the attempt stayed `RUNNING` with its world retained | `attempt-state-after-kill.txt` |
| T3 | A measured payload fact appeared as an **untracked** path (`updates/2026-11-03/payload-measurement.md`, 337 B, sha256 `9f15b493…`) after the basis | `measured-input.md`, `input-sha256.txt`, `canonical-status-after-input.txt` |
| T4–T6 | A NEW principal observed the retained attempt and the input, closed it as a **successor**, and delegated a NEW attempt | `timeline.json` (attempts: `CANCELLED`, then `COMPLETED`) |
| T7 | The new attempt's compiled context bound the input with its digest and kind (`UNTRACKED`) | `current-reality.json` → manifests[1] |
| T8 | The worker pulled `@ctx/input/…` through the product's own handle; the pull telemetry names it | `current-reality.json` → pulls; `worker-logs/` |
| T9 | The worker wrote the plan **from the pulled bytes** and committed `c37b04b`; it exited WITHOUT reporting | `final-plan.md`, `timeline.json` |
| T10–T12 | The principal read `readiness`, `finalize`d the observed candidate with the digest fence; the Work owner settled it | `timeline.json` relay `ORIGINAL_WORKER_OBSERVED` / `OBSERVED_EXIT` |
| T13 | The principal recorded `WAIT_FOR_OPERATOR`; the operator promoted through the existing path (`promotion-424f55dd…`, head `be6c0d9`) | `timeline.json` episode, `promote-odpe.json` |
| T14 | A later session recorded `DELIVER` over the accepted asset | `timeline.json` episode |

The input was **never copied into any attempt world** by the fixture and is **not in the canonical
commit**: delivery is context, not acceptance.

## Files

- `odpe-summary.json`, `summarize.json` — mechanical read of Work, journal, manifests, Git.
- `timeline.json` — T0–T14 stamps, attempts, relay attribution, promotion, episode, Git.
- `current-reality.json` — the input digest, the two manifests, the worker pull, reuse facts.
- `final-plan.md` (committed bytes) and `retained-partial-plan.md` (the interrupted worker's plan).
- `measured-input.md` — the exact input the attempt was compiled against.
- `sessions/` — the real DSH session streams (zstd).
- `worker-logs/` — worker process logs, including `PALIMPSEST_WORKER_PULL`.
- `mock.jsonl`, `mock-scripts.json` — the stand-in's requests/turns (no credentials).

## Note on the episode record

`episodeRecordCount` is 3: one `WAIT_FOR_OPERATOR` and two `DELIVER` records. The stand-in ran the P3
plan in two DSH sessions (two session ids, same script); the product recorded what it was told. The
conclusion is advisory and derived, so this affects no canonical Work state. It is a fixture
re-entry, not a product double-settlement.
