# COG-4 evidence

**Code Freeze:** `0e04becff68c68118bf99c7c9d6bac3c77dd0f33` (tree `4f6c0677a13c96961c3a1f501372f5f2110f0d72`)
**Evidence Freeze:** this commit (its SHA is deliberately not written into its own content)

## Contents

- `measurement/` — the forward-only COG-3 audit (token reconciliation, update-commit scope, turn telemetry,
  Python environment) and the budget-monitor self-test.
- `runs/mechanism/` — the deterministic Work/continuation run: two real ATTEMPT_RESULTs, normal promotion,
  the four packaged/expert outcomes, the rework attempt, the head-divergence refusal and the negative controls.
- `runs/P1/` — the scored fresh Palimpsest Session: run record, continuation note, principal log, deployment
  profile and raw session stream.
- `runs/F1-contaminated/` — a labelled diagnostic only: the first F world contained the P note, so its note is
  not independent evidence. It is preserved and excluded from the comparison.
- `runs/F1-blocked/` — the clean F attempt: the provider returned `QUOTA: Insufficient Balance` before any model
  turn. No note exists. The condition is BLOCKED; no baseline was fabricated.
- `verification/` — build, architecture, public API, targeted and broad logs.
- `scores.json`, `capability-matrix.json`, `verification.json`, `manifest.json`.

## Headline

The expert D3 kernel distinguishes EXACT, COMPATIBLE, INCOMPATIBLE and UNKNOWN from real observations. The
packaged ResultContinuationService produces EXACT and INCOMPATIBLE only: its first-party read footprint is the
whole repository, so COMPATIBLE is unreachable for a source change, and no model-facing tool exposes the
assessment. The fresh P Session recovered the project state and produced a strong 16/16 note by using the
journal, the Work state and ordinary filesystem access. The matched F baseline is blocked by provider quota,
so no comparative value is claimed.
