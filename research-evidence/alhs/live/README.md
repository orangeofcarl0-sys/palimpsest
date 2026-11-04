# ALHS live cohort state

## `alhs-c-2026-11-04` — core executed; diagnostic not authorized

`cohort-pre-registration.json` registers the F/L/A/G comparison described in
`docs/programs/alhs/ALHS-C-PROTOCOL.md`. The owner authorized **only the core stage** (F and A,
2 sessions each, 12,000,000 aggregate) on 2026-11-04. `authorization.json` is that authorization.

`run-plan.json` is the gate's expanded core budget plan:

- 4 sessions, 3,000,000 ceiling per session, 150,000 reserve, soft stop 2,850,000;
- planned ceiling 12,000,000; effective stop sum 11,400,000.

## Core result

The core run executed on 2026-11-04. Evidence: `research-evidence/alhs/core-2026-11-04/`;
write-up: `docs/engineering/ALHS-C-CORE-RESULT.md`.

| | F | A |
|---|---:|---:|
| Rubric | 7/7 | 7/7 |
| Tokens | 3,065,535 | 1,543,569 |
| Natural end | no (budget stop) | **yes** (`conclude DELIVER`) |
| Package | 32,228 bytes | 29,848 bytes |

Aggregate 4,609,104, 7,390,896 under the 12M authorization. F-2 stopped at 2,899,572 (2.85M soft
ceiling + 49,572 message overshoot, 100,428 below the 3M hard ceiling). One provider request returned
502 UPSTREAM_TIMEOUT during F-2 and was retried; 102 of 103 POSTs returned 200.

A did not use a formal Work task, a governed World or a Worker: it chose direct work plus one native
subagent. This run therefore says nothing about real-model governed cooperation.

## Diagnostic stage

`BLOCKED.json` is the historical pre-authorization gate record for the core stage (`modelCalls=0`,
exit 2). The diagnostic L/G stage was **not** authorized and did not run; it requires a new
`alhs-spend-authorization/v1` naming stage `diagnostic` and conditions L/G.

Nothing here is a repeated-sample comparison, a quality score or a cost advantage.

## Repeat-core (executed)

`cohort-repeat-pre-registration.json` registered one additional F/A pair with a token-milestone
interruption. The owner authorized it; `authorization-repeat.json` is the authorization. Amendment 1
lowered the milestone from 1,200,000 to 400,000 and extended the wall-clock backstop to 900s before
any repeat session (the first launch failed at the proxy bind with 0 model calls, 0 tokens).

Result: `research-evidence/alhs/repeat-2026-11-04/`, write-up
`docs/engineering/ALHS-C-REPEAT-RESULT.md`.

| | F | A |
|---|---:|---:|
| Rubric | 7/7 | 7/7 |
| Tokens | 2,797,303 | 1,058,793 |
| Natural end | no (budget stop) | **yes** (`conclude DELIVER`) |
| Committed package | no | **yes**, `f38f084` |

First windows: 427,070 vs 449,012 reported tokens. Aggregate 3,856,096, 4,143,904 under 8M.
