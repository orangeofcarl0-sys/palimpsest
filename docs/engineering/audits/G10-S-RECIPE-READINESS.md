# G10-S Organization Recipe Readiness

Product readiness for each recipe/modifier. UI must show only `PRODUCTION_READY` by default;
`CONDITIONAL`/`PREVIEW_ONLY` capabilities appear in Advanced with the missing capability named.
Honest per-capability — no symmetric padding.

| Recipe/modifier | Semantic substrate | Execution binding | Empirical basis | Status | Limitation |
| --- | --- | --- | --- | --- | --- |
| `focus.v1` (base) | Work `ProjectController` + application Work surface | reuse the current principal | R anti-agentification (same-context) | **PRODUCTION_READY** | none beyond Work itself |
| `explore.v1` (base) | ReasoningCell (openCell/openBranch/branchBrief/submitCandidate/evaluateCandidate) | `ReasoningBranchExecutionPort` + `dshSubprocessBranchExecutionPort` (real DSH ephemeral branch) | R ReasoningCell SCRIPTED_MECHANICAL; quality `unavailable` | **CONDITIONAL** | quality transfer unknown; branch execution depends on a host adapter; n=3 single provider |
| `coordinate.v1` (base) | durable federation (PeerRef/boundary home/commitments/attention) | G10-P/Q production path (two OS processes) | R federation non-dominated trade-off | **PRODUCTION_READY** | requires an already-independent peer; never spawns help |
| `verify.v1` (modifier) | ReasoningCell verification policy + `ExperimentValidatorPort` | deterministic validators; independent-model/human adapters exist but are not wired by default | deterministic validators proven | **CONDITIONAL** | same-model + same-context verification is **not independent** and must be labelled so |
| `monitor.v1` (modifier) | Campaign lifecycle + prospective memory/watchers (`WAIT`/wake/reconcile) | none in production (no background condition source / host-wake binding) | none | **PREVIEW_ONLY** | no autonomous monitoring; wake remains caller-driven |

## Evidence behind the readiness claims

- **FOCUS**: anti-agentification showed an artificial same-context role split added latency/tokens/
  coordination at equal measured quality; the faithful reading is "avoid fake durable boundaries", and
  the single-locus baseline is the default when no engineering reason exists.
- **EXPLORE**: a real Explore execution was demonstrated end-to-end — a compiled `explore.v1` plan
  opened a ReasoningCell, executed **2 real DSH ephemeral branch workers** over the same frozen
  BriefBrief, submitted structurally distinct candidates through the real service, ran verification and
  the separate epistemic admission, and advanced the frontier — with **zero new PeerRefs and zero new
  PersistentPoints** (`.dogfood/g10s-explore-e2e.json`). Quality transfer remains unknown
  (`qualityScore` unavailable in R), so the recipe stays CONDITIONAL, not PRODUCTION_READY.
- **COORDINATE**: G10-Q proved two real host-backed persistent principals negotiating boundary state and
  commitments with zero human relay over the Ordarium v1.3.1 path; R measured a non-dominated
  trade-off (lower median latency vs higher coordination/token cost). It is PRODUCTION_READY *only*
  when an independent peer already exists.
- **VERIFY/MONITOR**: only the capability-gated forms are claimed; nothing is presented as autonomous.

## Capability gating (advisor)

| Capability | Required by | When absent |
| --- | --- | --- |
| `reasoningBranches` (`reasoningBranchExecution`) | EXPLORE eligibility | EXPLORE not eligible |
| `independentPeers` (`knownIndependentPeers`) | COORDINATE eligibility | hard blocker "no independent sovereign peer" (non-overridable) |
| `verificationCapabilityRef` | VERIFY suggestion | `capability_required:experiment.validator` |
| `campaignMonitoring` (campaign wired) | MONITOR suggestion | `capability_required:campaign.watcher` |
