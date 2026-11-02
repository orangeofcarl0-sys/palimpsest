# PC1-V1 research evidence

This directory contains PC1-V1 evidence only. It does not pool or relabel PC1 runs.

- `live/usage.json` — all 19 model sessions (8 principal + 11 Subagent child sessions), 41,685,383
  tokens, 0 provider errors.
- `live/outcomes.json` — correctness, completeness and the matched comparison.
- `live/pc1v1-live-2026-11-03-b/` — Sablewick T1.
- `live/pc1v1-live-2026-11-03-b-repair/` — Sablewick T2 (environment-only T2 retry).
- `live/pc1v1-live-2026-11-03-c-field/` — Field Study P/F T1/T2 under the frozen artifact contract.
- `live/pilots/` — excluded pilots with explicit reasons.
- `live/authorization*.json` — the owner's 2026-11-03 authorization and the local reservation
  amendments.
- `rc.json` — final local RC identity; the raw live evidence is external to the RC tarball.

The current behavioral result is in `docs/engineering/PC1V1-LIVE-ADDENDUM.md`: both P and F were
correct and complete; F used 15.16M tokens versus P's 26.52M; the required comparative benefit is
`NOT_SUPPORTED`. A future scored cohort must use a fresh freeze, fresh worlds and an explicit
authorization; scored evidence is immutable once written.
