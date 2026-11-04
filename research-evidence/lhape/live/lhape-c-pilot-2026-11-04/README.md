# LHAPE-C bounded pilot — evidence map

Authoritative summary: `pilot-summary.json`. It reconciles the real condition run records, the
scorer and the guard ledgers. `run-state.json` is the cohort gate's partial first-attempt record and
is **superseded** by `pilot-summary.json` (F's runner was killed before it could report usage; G's
first start failed before any model call and was rerun separately).

## Conditions

| Condition | Run record | Tokens | Stop | Artifact |
|---|---|---:|---|---|
| F | `condition-F/run-recovered.json` | 2,528,297 | `pilot-f-1-STOPPED.json` | `artifacts/F-package.md` |
| L | `condition-L/run.json` | 2,562,093 | `condition-L/STOPPED.json` | `artifacts/L-package.md` |
| G | `condition-G/run.json` | 2,332,140 | `condition-G/STOPPED.json` | `artifacts/G-package.md` |

G's worker committed the package before the host was stopped; `condition-G/operator-acceptance.json`
records the new host observing and settling the world (`SETTLED`, `3789dec2…`) and the Promotion
(`promotion-538246e1…`, head `1d4132b6…`).

## Files

- `score.json` — 7-fact rubric for each condition (all 7/7).
- `proxy.jsonl` — provider request metadata only; no bodies and no credentials.
- `F-sessions/`, `L-sessions/`, `G-sessions/` — real DSH session streams.
- `condition-*/` — run records, guard ledgers, stop records, logs.
- `cohort.json`, `authorization.json`, `pilot.json`, `run-plan.json` — cohort and budget setup.
- `artifacts/` — exact final packages.

The 6,238-token F profile preflight is included in the aggregate in `pilot-summary.json`; its session
stream was discarded by the pilot preparation reset, so only the real token count is retained. The
pilot aggregate is 7,428,768 tokens, 71,232 under the 7.5M authorization.
