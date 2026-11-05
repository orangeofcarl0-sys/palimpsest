# LHAPE live evidence

## Authorized bounded pilot — `lhape-c-pilot-2026-11-04`

The owner authorized a bounded F/L/G pilot on 2026-11-04 under a 7.5M aggregate ceiling. It ran one
real DSH session per condition with `deepseek-official/deepseek-flash`. The measured site-B
constraint was injected at T+45s, not disclosed in the prompt.

- F: 2,528,297 tokens, 7/7, stopped at ceiling, 36,472-byte package.
- L: 2,562,093 tokens, 7/7, stopped at ceiling, 31,591-byte package.
- G: 2,332,140 tokens, 7/7, stopped at ceiling, 33,272-byte package; the worker committed but did not
  report before the stop, and a new host settled the committed world and promoted the result.
- Total: 7,428,768 including the 6,238-token F preflight; 71,232 under the 7.5M ceiling.
- No quality or cost advantage is demonstrated: all three reached the same 7-fact rubric and all
  three were stopped at their ceilings. Per-condition ceiling stops overshot by 0.03–0.06M because
  usage is written at assistant-message boundaries; the aggregate stayed under 7.5M.

Authoritative files: `lhape-c-pilot-2026-11-04/pilot-summary.json`, `score.json`, `condition-*`,
`artifacts/`, `proxy.jsonl`, `*-sessions/`, `preflight/`. Full write-up:
`docs/engineering/LHAPE-C-PILOT-RESULT.md`.

## Pre-authorization gate record

`cohort-pre-registration.json` registers the proposed full long-horizon cohort against code freeze
`e59a9112c11ea45e4300e20e30ca7e2136d7cf24`.

`lhape-c-long-horizon-2026-11-03/BLOCKED.json` is the historical fail-closed gate result from before
the authorization: no LHAPE spend authorization was present, so `modelCalls=0` and that cohort did
not start. It is not the result of the authorized pilot and does not describe the pilot's spend.

The full T1–T7 long-horizon cohort with cross-session principal sequences and repeated samples has
**not** been run.
