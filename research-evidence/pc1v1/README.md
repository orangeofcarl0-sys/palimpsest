# PC1-V1 research evidence

This directory contains PC1-V1 evidence only. It does not pool or relabel PC1 runs.

- `live/BLOCKED.json` — the R9 behavioral gate, blocked because no new PC1-V1 spend authorization
  was supplied. `modelCalls` is 0.
- Deterministic qualification logs and the RC identities are referenced by
  `docs/engineering/PC1V1-FINAL-ENGINEERING-REPORT.md`.
- A future scored cohort must use `scripts/pc1v1/run_live_cohort.mjs`, a frozen cohort file and a
  fresh explicit authorization. Scored evidence is immutable once written.
