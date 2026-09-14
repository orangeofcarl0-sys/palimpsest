# G10-R Empirical Organization Assessment (R0)

Baseline: `main @ bdb935be127e6d10124fb00f805659d6b2aefa58`. Ordarium v1.3.1. Host: DSH 0.1.5-rc.2.

R0 audits what is actually observable before any experiment code exists, and classifies every
candidate metric. **Unavailable metrics are recorded as `unavailable`, never 0.**

## 1. Observable telemetry inventory (source-verified)

| Source | Observable facts |
| --- | --- |
| DSH session events (`agent.session.eventAt(seq)`) | `turn/start|end{reason}`, `step/start|end`, `tool/call{name}`, `tool/result{error?}`, `assistant/message{usage: TokenUsage}`, `agent/error` |
| DSH `TokenUsage` | `inputTokens` (uncached), `outputTokens`, `totalTokens?`, `cacheReadTokens?`, `cacheWriteTokens?`, `reasoningTokens?`; `TurnTokenUsage.routes[] {provider, model}` |
| DSH agent options | `agent.options.{provider, model}` |
| Palimpsest attention (`AttentionSignal`) | `signalId, kind, peer, threadId, subjects, reason, requiresUserAttention, createdAt`; **no activation timestamp** |
| Deployment (`pumpAndActivate`) | `InboundPumpStatus{processed, ingested, skipped, cursor, mailbox}`, signals drained, `AttentionActivationOutcome{activated, detail}`; per-call counts only |
| Transport | envelopes, cursor, `delivered`; pump counters per run (no cumulative counters) |
| Federation | commitment states/transitions + `CommitmentSummary` enumeration; message events (`MESSAGE_PREPARED/DELIVERED/RECEIVED`, `ACK_RECORDED`) |
| Boundary | `BoundaryObservation` mechanical counts (participant/artifact/candidate/pending/stale/rejected/accepted/churn/blueprint) + revision seq/digest |
| Reasoning cell | candidate statuses, `EvaluationOutcome`, `InvalidationOutcome`, frontier basis, claim graph, admitted/active/inactive ids |
| Dynamics / evolution | snapshots, pressure standings, proposal kinds, obligation statuses, case states |
| Work | `ControllerStatusView` tasks/attempts/evidence/promotions/parallel/resume, `runTurn` mechanical results, `ModelPerformanceTable` (host-supplied model/cost attribution) |
| OrganizationMemory (to build) | experiment/run/evaluation/correction/intervention history |

## 2. Metric classification matrix

| Metric | Class | Note |
| --- | --- | --- |
| `wallClockLatency` | DIRECTLY_OBSERVED | monotonic clock around a run |
| `agentTurns` | DIRECTLY_OBSERVED | `turn/start` count from session events |
| `toolCalls` | DIRECTLY_OBSERVED | `tool/call` count |
| `inputTokens`/`outputTokens`/`cacheReadTokens`/`cacheWriteTokens`/`reasoningTokens` | DIRECTLY_OBSERVED | provider-reported on `assistant/message.usage` |
| `modelCalls` | DIRECTLY_OBSERVED | `assistant/message`/attempt boundaries |
| `provider`/`model` | DIRECTLY_OBSERVED | `agent.options` / `TurnTokenUsage.routes` |
| `attentionActivations` | DIRECTLY_OBSERVED | activation reports |
| `restarts`/`coldResumes` | DIRECTLY_OBSERVED | runner lifecycle |
| `transportDuplicates` | DERIVED_MECHANICALLY | replay/submit counts |
| `semanticConflicts` | DERIVED_MECHANICALLY | store conflict/error kinds |
| `boundaryRevisions`/`boundaryDecisionCount`/`boundaryCandidateCount` | DERIVED_MECHANICALLY | boundary events / `BoundaryObservation` |
| `commitmentTransitions`/`commitmentNegotiations` | DERIVED_MECHANICALLY | commitment events |
| `coordinationWaitTime` | DERIVED_MECHANICALLY | attention→activation→turn deltas where timestamps exist |
| `recoveryTime`/`timeToRecover` | DERIVED_MECHANICALLY | restart timestamps |
| `crossPeerMessages`/`messageBytes`/`boundaryArtifactBytes` | DERIVED_MECHANICALLY | canonical JSON byte length (a **proxy**) |
| `unitTestPassRate` | EXTERNALLY_VALIDATED | command/test validator |
| `artifactSchemaValid` | EXTERNALLY_VALIDATED | artifact validator |
| `answerQuality` | LLM_JUDGED | versioned judge, blinded, never truth |
| `humanRubric` | LLM_JUDGED / human | rubric+scale+blinding required |
| `estimatedCost` | **UNAVAILABLE** | DSH exposes no dollar cost; only token counts |
| `failureIndependence` | **UNAVAILABLE** | no independent failure-domain telemetry |
| `semanticCoupling` / `mutualInformation` | **UNAVAILABLE** | not measured; never inferred from agent counts |
| `boundaryTrafficRatio` | DERIVED_MECHANICALLY (proxy) | bytes ratio, not mutual information |

## 3. Ownership audit for a new store

A new `SqliteOrganizationMemoryStore` is warranted: empirical runs span restarts, evaluations must be
rebuildable, and history must not pollute semantic stores. It owns ONLY empirical observation/history
(ExperimentDefinition, ScenarioDefinition, ArchitectureVariant, RunResult, OrganizationEvaluation,
MeasurementCorrection, InterventionRecord). It owns no OrganizationDefinition, RuntimeScope,
Commitment, BoundaryState, Evidence truth, or Authority, and exposes no mutator for them.

## 4. Canonical truth ownership (frozen)

```text
OrganizationStore        semantic organization truth
RuntimeScopeStore        runtime truth
BoundaryMemoryStore      shared boundary truth
CoordinationStore        collaboration truth
ReasoningCellStore       admitted cell state
OrganizationMemoryStore  empirical observation/history ONLY
```

## 5. R0 decisions

- Token metrics are available; **dollar cost is `unavailable`** and must be recorded as such (a
  character-count token proxy may be recorded only when labelled `estimated_proxy`).
- `AttentionActivationOutcome` has no timestamp, so attention activation latency must be derived from
  runner timestamps (documented as a proxy), not claimed as host-native.
- Comparative claims require repeated runs; the `RunPolicy` carries an explicit
  `minRunsPerVariantPerScenario` (no hidden constant). R0 sets a cost-adjusted default of **3** and
  records the spec's recommended 5 as the target for a future higher-budget campaign.
- The existing Q dogfood run may be imported only as a labelled `historical pilot` and never counted
  toward a comparative conclusion.
