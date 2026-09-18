# SR-1C/SR-1D §29/§47 — live-smoke provider differential

| tree | command | result |
| --- | --- | --- |
| refactor branch | `node scripts/release/rc1-live-local.mjs --only A --trials 1` | `INFRASTRUCTURE_ERROR / INCOMPLETE_OBSERVATION` — "the principal produced no assistant message and called no tool (process status completed, exit 0, wall 8916 ms)", tools=[] |
| **exact canonical main** `a30a328`, tree `83ef6ba` (clean worktree, built) | same command | `INFRASTRUCTURE_ERROR / INCOMPLETE_OBSERVATION` — same classification, wall 5377 ms, tools=[] |

Classification: **environmental** (the provider returned no model output). The equivalent
canonical-tree control fails identically, so per §29/§47 the smoke is neither called green nor
reported as a refactor regression. Static R2/R3 work was not blocked on provider recovery (§47).

Artifacts: `release-evidence/gate-sr1c-live.log`, `release-evidence/gate-sr1-live-local-smoke.log`,
and the retained failed trial JSON next to them.
