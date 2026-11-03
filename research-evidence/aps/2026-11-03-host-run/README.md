# APS real-host deterministic run — evidence index

**Mode:** `MOCK_MODEL_REAL_DSH_HOST`. The DSH host, Palimpsest product, SQLite state, native DSH
subagent child sessions and tool calls are real. The Messages model is a deterministic stand-in. This
is an engineering qualification, **not** a model-cognition, cost or comparative result. No provider
was called and no paid tokens were spent.

**Code freeze:** `d75c5b671fd740f6a71d16c372259e031aac4d21`
**Run:** 2026-11-03

## What happened

| Session | What it did |
|---|---|
| Principal 1 | `palimpsest_continuity action=pulse`; read the two declared sources; launched **two concurrent native DSH subagents**; each returned a finding; recorded both findings as `NATIVE_SUBAGENT` contributions with a DECLARED read footprint and `independentVerification: false`. |
| Native child 1 | Returned the 2026-coastal-rating finding. |
| Native child 2 | Returned the site-A width/design-minimum finding. |
| Principal 2 | New session. `pulse` found the project and both contributions; applied `REVISE_PLAN` to the coastal finding through the contribution tool. The product observed **revision 0 → 1**, adding `site-b-coastal` and `capacity-refresh` and removing `site-b`. It then started `site-a`, wrote `deliverables/site-a.md`, committed it, and completed the attempt; the task reached **VERIFYING**. |
| Principal 3 | New session. `pulse` found the plan change, the delivered candidate, the operator-acceptance queue and the still-unassessed second contribution, now `STALE` because the project moved. |

The second contribution was deliberately left unassessed. It is the late/unconsumed-result case in the
final pulse. No operator acceptance or promotion was performed, so `site-a` remains `VERIFYING`.

## Files

- `run-summary.json` — machine-readable summary (tool names, child sessions and returned text,
  contributions, actual plan delta, artifact digest, queue, limitations).
- `final-pulse.json` — the product's own final derived pulse over the durable state.
- `session/` — the five real DSH session streams (3 principals + 2 children), named by session id.
- `session-logs/` — each principal's host stdout/stderr and exit code.
- `mock.jsonl` / `mock.log` — the deterministic Messages requests, including the exact normal
  Palimpsest catalogue and the scripted tool calls.
- `artifact-site-a.md` — the deliverable the principal wrote and completed.
- `seed.json` — the seeded project basis and computed contribution ids.
- `deployment.json`, `profile.patch.yml`, `profile.package.json`, `dump-config.txt` — the exact
  deployment and DSH profile.
- `proxy.jsonl` — the provider proxy log (mock key only; no real credential).
- `world-log.txt`, `world-status.txt` — the Git world state.

## Non-claims

- The scripted stand-in is not a language model. No quality, token-efficiency or comparative benefit
  is inferred from this run.
- The native subagent read footprint is not observable to Palimpsest; the contribution records what
  the principal declared and labels it `PRINCIPAL_DECLARED`, not observed.
- Two subagents ran concurrently and returned findings; they did not concurrently produce
  repository artifacts. The principal produced the one artifact.
- `palimpsest_delegate` was not composed in this profile (no reasoning store / async branch host).
  Delegation consumption is covered by deterministic service/adapter tests, not this host run.
- The APS-C paid F/L/G cohort is **BLOCKED**: no APS spend authorization exists.
