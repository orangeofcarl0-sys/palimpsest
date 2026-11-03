# APS-C real-model pilot — evidence index

**Mode:** `REAL_MODEL_PILOT` (not the full APS-C long-horizon cohort)  
**Provider/model:** `deepseek-official` / `deepseek-flash`  
**Cohort:** `aps-pilot-2026-11-03`, F/L/G each one session  
**Authorization:** 2.5M tokens/session, 7.5M aggregate  
**Actual:** 1,851,733 tokens; no session stopped by the budget guard  
**Code freeze:** `10b277cafa2c0b8e5b8a2b1ac9e7d3cbfe29d5cf` (pilot harness)

## Scores

| Condition | Score | Tokens | Subagent calls | Palimpsest calls |
|---|---:|---:|---:|---:|
| F | 5/5 | 344,470 | 1 | 0 |
| L | 5/5 | 250,765 | 0 | 4 |
| G | 5/5 | 1,256,498 | 1 | 17 |

All three produced a correct `deliverables/selection.md`: Site A Kestrel V2 with an explicit tie-break;
Site B withheld because no current 2026 coastal-rated warranty is on file; no unconditional 2026
coastal claim.

## G's real Work state

G used the formal Work path. `selection` reached VERIFYING; the VERIFYING latch left
`independent-check` READY. The model also recorded the independent check as a contribution
(`ctb-90b21f7b...`) and an exploration, not as accepted Evidence.

An operator acceptance attempt on `selection` was **refused** because the model committed the
independent check after reporting the selection (`349e074` vs repository head `ac4971f`). The in-place
guard correctly refused to promote a result that does not contain the later work. `accepted: false`;
no guard was bypassed.

## Files

- `score.json` — deterministic artifact check, tokens, tool/subagent calls.
- `score-summary.json` — compact score output.
- `cohort.json`, `authorization.json` — frozen cohort and exact spend authorization.
- `run-plan.json`, `run-state.json` — gate and execution state.
- `F/`, `L/`, `G/` — each condition's `selection.md`, run logs, session streams and Git history.
- `G/reviews/coastal.md` — G's independent-check artifact.
- `pilot-G-state.json` — derived Product Pulse/Work state after G.
- `pilot-G-acceptance.json` — the refused operator acceptance, preserved verbatim.
- `proxy.jsonl` — provider request status; no credential.
- `pilot-*-budget.json` — per-session token ledgers.

## Non-claims

- n=1 per condition, one scenario, one model: no statistical or general superiority claim.
- The scorer checks five public facts; it is not a deep reasoning benchmark.
- No T1/T2, cross-session continuation, late delegation result, or full delegation path in this pilot.
- G's artifacts are correct but not accepted; the selection is still VERIFYING.
