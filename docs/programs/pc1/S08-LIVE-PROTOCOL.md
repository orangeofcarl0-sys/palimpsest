# PC1 live qualification protocol (pre-registered before the first model call)

## Cohort

- Cohort `pc1-live-2026-11-02`, owner-authorized on 2026-11-02 with no special limit.
- Provider `deepseek-official`, model `deepseek-flash`, Anthropic Messages via
  `https://api.deepseek.com/anthropic`, through the Windows CONNECT proxy and the isolated WSL2/bwrap
  runtime.
- One principal session per condition/time, no subagents/web, 900 s hard timeout.
- Both conditions receive the same visible facts, observation time, model, provider, runtime,
  authorization opportunities and budget surface.

## Scenarios

### Sablewick

- T1 `2026-02-10T09:05Z`: inbox contains only solaris-certificate-claim, the 2026-02-10 capability
  bulletin and the newsletter. Candidate B and the duplicate are absent.
- T2 `2026-02-14T09:10Z`: the corrected bulletin and duplicate are added; the earlier session's
  history remains.
- The corpus is the frozen C6-R scenario; P and F are mechanically equivalent (0 confounders).

### Field study

- T1 `2026-03-02T09:00Z`: base sources only; inbox empty.
- T2 `2026-03-09T09:10Z`: field validation, budget directive (operator-review, not authority) and
  newsletter arrive; a late T1 design is represented as a real prior output, never fabricated.
- Hard requirements: 14 overlapping days, ≥90% valid data per site, ±3 µg/m³ target, 28-day
  completion, approval before deployment, budget not exceeded.

## Conditions

- **P**: Palimpsest product composition, `toolProfile=normal`, the same DSH principal and sandbox.
- **F**: native DSH + Git/Markdown, HANDOFF.md generated from the same facts, no Palimpsest tools.
- Neither condition sees `evaluator-only/` material or the other condition's transcripts.

## Scoring

- Mechanical hard constraints are scored from the resulting artifacts and source standing.
- Domain quality/uncertainty is evaluated separately; a negative or needs-verification conclusion is
  valid, and a file/exit-0 observation is not a business verdict.
- Any provider failure before a model turn is BLOCKED; a turn followed by a provider error is INVALID.
- All raw session streams and usage are preserved; no result is deleted or overwritten.

## Freeze

- Code Freeze 6 `09c7278bd9bfd74281538eda5f83c4194d34dd27`.
- Cohort file: `research-evidence/pc1/live/cohort.json`.
- The first model call happens only after this file and the cohort record are committed.
