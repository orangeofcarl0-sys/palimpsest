# PNWF-CQ container cohort — 2026-11-07

**Status: INVALID / OVER BUDGET. No further paid session was started.**

The owner authorized the container cohort on 2026-11-07. The adapter ran two real
`deepseek-flash` sessions in the qualified isolation container, but the result is **not a valid
cohort** and the aggregate spend exceeded the 5,000,000 authorization.

## Spend

| item | tokens |
|---|---:|
| non-cohort adapter smoke (`CONTAINER_SMOKE`, not a cohort prompt) | 1,495,807 |
| software session | 1,720,995 |
| energy session | 1,973,976 |
| **actual total** | **5,190,778** |
| authorized aggregate | 5,000,000 |
| **overrun** | **+190,778** |

The smoke is preserved in `smoke/`; it is counted against the authorization, not hidden as
infrastructure. The supplemental authorization had 3,504,193 remaining; the two cohort sessions used
3,694,971, so the cohort itself was **+190,778 over the remaining budget**.

## Sessions

| | software | energy |
|---|---:|---:|
| stream total | 1,720,995 | 1,973,976 |
| session ceiling | 1,750,000 | 1,750,000 |
| soft ceiling | 1,662,500 | 1,662,500 |
| exit | budget killed (137) | budget killed (137) |
| natural exit | no | no |
| `complete` calls | 0 | 0 |
| `conclude` calls | 0 | 0 |
| typed `plan` | 0 | 0 |
| relay calls | 5 | 2 |
| final task | ACTIVE | ACTIVE |
| final attempt | RUNNING | RUNNING |
| promotions | 0 | 0 |
| canonical head | unchanged | unchanged |
| domain refusals | 4 | 2 |
| repeated refusals | 3 | 1 |

Primary endpoint: **0/2**. H1 is directionally supported only in the narrow sense that neither
session called `complete`; H3 is **not supported** (no legal conclusion/retirement). H5 is negative:
software **+29.2%** vs its historical closure, energy **+3.8%**, cohort **+14.3%** vs 3,233,597.
Promotions and canonical heads are unchanged, so no false acceptance was produced.

## Why the result is invalid

1. **Copied attempt-world alternates.** The recorded attempt world borrows the canonical object
   store through an absolute host path
   (`C:/Users/.../psvr-c-real/.../worlds/A/.git/objects`). In the Linux container that path does not
   exist, so `git diff 453aa7f HEAD` on the attempt world failed. Both models spent tool calls
   discovering and repairing the alternates path. `prepare_continuation.mjs` now rewrites every
   attempt world's alternates to the copied canonical objects; the copies used here predate that fix.
2. **The budget guard did not enforce the ceiling.** The adapter polled the zstd session stream every
   10 s, but DSH did not expose in-flight usage before the stream flush/exit. The watchdog killed the
   container only after the final step: software overshot the 1,662,500 soft ceiling by 58,495
   tokens; energy overshot the 1,750,000 ceiling by 223,976. The provider proxy has no pre-call token
   cap. A future paid run must add a
   provider-side per-session cap (parse `message_delta.usage` and refuse/429 at the soft ceiling)
   before another model call is authorized.
3. **The prompt/session was not a clean closure test.** The model did real work (bash, edits, relay
   attempts) and hit the budget while still working. That is a real behaviour, but it is not a clean
   test of the closure guidance.

## Isolation

The session container used the same image, uid 1001, mount policy and no-harness mount as the
qualified canary. The adapter mounted only `dist`, `host`, `node_modules` and `/run/stage`; it did
not mount `research-evidence`, `scripts`, `test` or `.git` of the product repository. The external
scorer read the state and streams on the host. The isolation canary remains
`EVALUATION_ISOLATION_QUALIFIED`.

## Files

- `software/`, `energy/` — run/budget/snapshot/prompt, state DBs, run logs.
- `streams/` — the two real DSH streams.
- `attribution/` — per-call timelines.
- `gate/` — start/end records (`modelCalls: 1` each).
- `score.json` — mechanical score (0/2 primary).
- `proxy.jsonl` — provider metadata only (no prompt/response bodies).
- `smoke/` — the non-cohort 1,495,807-token adapter smoke and its accounting.
- `cohort.json`, `authorization.json`, `core.json` — the pre-registered inputs.

## Limit

No further paid call was made after this cohort. The product fixes in `77ffa10`/`be01d96`, the
operator basis admission and adapter fixes in `ead3cd39` remain valid; this cohort does not establish
a clean CQ effect and must not be reported as one.
