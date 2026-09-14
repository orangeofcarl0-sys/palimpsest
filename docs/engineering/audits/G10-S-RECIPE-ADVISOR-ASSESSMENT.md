# G10-S Recipe / Advisor Readiness Assessment (S0)

Baseline: `main @ d1fb28a3daf6f4f2ee3dd1efdb473b911e6d0146`. Ordarium v1.3.1. Host: DSH 0.1.5-rc.2.
Readiness values: PRODUCTION_READY · CONDITIONAL · PREVIEW_ONLY · UNAVAILABLE. Honest per-capability,
no symmetric catalog.

## Sensible substrate that already exists

| Capability | Substrate | Evidence |
| --- | --- | --- |
| FOCUS (one persistent locus) | Work `ProjectController` + `installed.application.work`; nothing to add | always eligible |
| EXPLORE (ephemeral branches) | `src/reasoning_cell/`: `openCell`/`openBranch`/`branchBrief`/`submitCandidate`/`evaluateCandidate`, blind-until-commit frontier, separate verification + admission | real service, real tests |
| COORDINATE (sovereign peers) | G10-P/Q real durable federation: `PeerRef`, boundary canonical home, commitments, attention, two OS processes, cold resume | `scripts/dogfood/real-host-federation.mjs` PASS |
| VERIFY (deterministic) | ReasoningCell verification policy port + `src/experiment/validators.ts` (command/artifact) | real |
| MONITOR (time) | `src/campaign/` lifecycle + prospective memory/watchers (`WAIT`/wake/reconcile), explicit caller-driven | real but no background condition source |
| Empirical evidence | G10-R `OrganizationMemoryService` + `OrganizationEvaluation` (Pareto, limitations) | real campaign (18 runs) |

## Readiness matrix (per mode/modifier)

| Recipe | Semantic substrate | Execution binding | Empirical basis | Status | Stated limitation |
| --- | --- | --- | --- | --- | --- |
| `focus.v1` | PRODUCTION_READY | PRODUCTION_READY | anti-agentification (same-context) | **PRODUCTION_READY** | none beyond Work itself |
| `explore.v1` | PRODUCTION_READY (ReasoningCell) | **CONDITIONAL** — the standard host branch runner did not exist before S (CF-N-03/CF-O-09); S adds `ReasoningBranchExecutionPort` + a real DSH adapter | ReasoningCell SCRIPTED_MECHANICAL only; quality `unavailable` | **CONDITIONAL** | no measured quality transfer; branch execution is host-dependent |
| `coordinate.v1` | PRODUCTION_READY | PRODUCTION_READY (G10-Q production path) | federation non-dominated trade-off | **PRODUCTION_READY** | requires an already-independent peer; not a way to “spawn help” |
| `verify.v1` | PRODUCTION_READY (deterministic) | CONDITIONAL (independent-model/human) | deterministic validators proven | **CONDITIONAL** | same-model+same-context verification is **not** independent |
| `monitor.v1` | PRODUCTION_READY (Campaign/watchers) | **CONDITIONAL/PREVIEW_ONLY** — no background condition source or host-wake binding wired | none | **PREVIEW_ONLY** | no autonomous monitoring; caller-driven wake only |

Rule honoured: no PRODUCTION_READY without a real execution binding; unavailable capabilities are stated,
not padded.

## Facts that block naive “multi-agent is better”

- R anti-agentification: an artificial same-context role split added latency/tokens/coordination at equal
  measured quality — it supports *avoiding fake durable boundaries*, not "multi-agent is bad".
- R federation: non-dominated trade-off, not a universal win.
- R reasoning cell: lower unresolvedness with higher verification/coordination overhead; quality transfer
  unknown (validator unavailable).

## S0 decisions

- No `RecipeStore`: recipes are versioned immutable product config in code; S adds no new canonical store.
- `ScenarioFeatureAnnotation` (S) is stored as an append-only OrganizationMemory artifact; R's historical
  `ScenarioDefinition` artifacts are never rewritten.
- The advisor is read-only toward OrganizationMemory and holds no store mutator.
- Explore branch execution is host-neutral (`ReasoningBranchExecutionPort`); a branch is ephemeral and is
  never a `PeerRef`/`PersistentPoint`, even when a host carries it with an ephemeral agent handle.
