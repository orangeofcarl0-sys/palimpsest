# PC1-V1 live runner

`run_live_cohort.mjs` is the gated R9 entry point. It starts no model session unless a new PC1-V1
spend authorization, a frozen matched cohort and a clean Code Freeze all agree.

```bash
node scripts/pc1v1/run_live_cohort.mjs \
  --cohort=research-evidence/pc1v1/live-cohort.json \
  --authorization=/secure/pc1v1-authorization.json
```

Without `--execute` it writes `run-plan.json` and stops. With `--execute` it runs each frozen
session command, preserving raw stdout/stderr and a per-session `run.json`. It never deletes or
overwrites scored evidence, and it writes `BLOCKED.json` (with `modelCalls: 0`) when any gate fails.

The cohort file is `pc1v1-live-cohort/v1`:

```json
{
  "schema": "pc1v1-live-cohort/v1",
  "cohortId": "pc1v1-live-YYYY-MM-DD",
  "codeFreeze": "<40-character commit>",
  "provider": { "id": "<provider>", "model": "<model>" },
  "oracleCopied": false,
  "sessions": [
    {
      "id": "sablewick-p-t1",
      "scenario": "sablewick",
      "condition": "P",
      "stage": "t1",
      "subagents": false,
      "cwd": ".",
      "command": ["bash", "scripts/…"],
      "env": { "PC1V1_PROMPT": "…", "PC1V1_INBOX": "…" },
      "timeoutMs": 900000
    }
  ]
}
```

The command and environment must be frozen with the cohort: they are the exact runner the recorded
sessions used. The PC1 session scripts under `scripts/c6r/` and `scripts/pc1/` are the starting
point, but a PC1-V1 cohort must name its own frozen profile/world/inbox set rather than relying on
today's defaults.

The authorization file is `pc1v1-spend-authorization/v1` (see
`docs/programs/pc1v1/R9-LIVE-PROTOCOL.md` §6). The prior PC1 authorization is not inherited.

Current state: no authorization was supplied, so the cohort is `BLOCKED` and no model call was made.
