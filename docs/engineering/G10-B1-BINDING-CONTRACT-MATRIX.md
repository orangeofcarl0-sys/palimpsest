# G10-B1 — Binding Contract Matrix

Status: **DRAFT · NOT IMPLEMENTED · NOT FROZEN · NO PRODUCTION STORAGE COMMITMENT**

Every candidate rule with the schema mechanism that enforces it, its runtime
implication, the frozen PLMP-UAS-1 dependency it rests on, and its status.
"BIND-CAND" rules come from B0 (§13) including the Stage-0 closures; B1 rules
are added by this schema candidate.

| Candidate rule | Schema mechanism | Runtime implication | Frozen UAS dependency | Status |
|---|---|---|---|---|
| BIND-CAND-01 `BindingDefinition ≠ BindingResolution` | two separate candidate types; resolution carries provenance refs, never definition content | resolution is derived per run; definitions are revisioned inputs | `UAS1-INV-01` (dimensions); `RunDefinition` composition | PROPOSED |
| BIND-CAND-02 `BindingDefinition ≠ RuntimeAttachment` | no runtime-identity fields on definitions; attachment excluded from resolution | attachment stays DSH-owned (`src/tools/dsh_types.ts` seam) | `UAS1-INV-11/13` | PROPOSED |
| BIND-CAND-03 Binding does not redefine PersistentPoint identity | `DurableContinuityRef` is a CANDIDATE future identity; binding only references it | carrier/point schemes stay open | `UAS1-INV-10` | PROPOSED |
| BIND-CAND-04 carrier/session replacement does not replace the point | resolution is replaceable; pin targets continuity, not carriers | rebinding = new resolution, same point | `UAS1-INV-11/12` | PROPOSED |
| BIND-CAND-05 Binding grants no authority | no authority fields anywhere | authority model remains open | `UAS1-INV-29` | PROPOSED |
| BIND-CAND-06 Binding creates no organization/commitment semantics | no org/commitment fields | organization/collaboration stay separate species | `UAS1-INV-15/16/19/20` | PROPOSED |
| BIND-CAND-07 resolution never mutates Architecture/Work definitions | resolution is a derived artifact; definitions referenced by revision/digest only | mirrors UA-INV-4 at binding level | `UAS1-INV-09` | PROPOSED |
| BIND-CAND-08 resolution freshness-bound | `ResolutionProvenance` (four input refs + snapshot) + resolution digest | stale resolution inadmissible; `stale_inputs` reason | G9 freshness discipline | PROPOSED |
| BIND-CAND-09 unsatisfied binding creates no point | no `createIfMissing`; result union has no creation outcome | `no_matching_persistent_point` is terminal for that resolution | promotion intentionally open (PLMP-UAS-1 §14) | PROPOSED |
| BIND-CAND-10 durable definition carries no Session identity | branded identity namespaces exclude it | sessions live in runtime attachment | `UAS1-INV-12/13` | PROPOSED |
| BIND-CAND-11 Binding is not organization memory / context store | no history/context fields; binding only selects the locus | long-lived context stays with the point (continuity concern) | `UAS1-INV-08/15` | PROPOSED |
| BIND-CAND-12 continuity optional; ephemeral first-class | `ContinuityBindingIntent` all-optional; `ContinuitySelection = {kind:"ephemeral"}` is a satisfied outcome | default lifecycle `architecture+work → ephemeral → done` unchanged | `UAS1-INV-01` (Continuity orthogonal); UA-INV-12 | PROPOSED |
| BIND-CAND-13 absence of a point ≠ unsatisfied | unsatisfied requires hard constraints/pin/requirement; Case E has none | `BindingUnsatisfied` never fires for ephemeral-valid bindings | `UAS1-INV-27` (Unresolved ≠ Failure analog) | PROPOSED |
| BIND-CAND-14 RunConfiguration narrows, never violates | `RunConfigurationBindingDelta` has no constraint/pin fields; `Allowed(Effective) ⊆ Allowed(Definition)` | out-of-set run requests fail pre-resolution validation | `UAS1-INV-05` (no reinterpretation) | PROPOSED |
| BIND-CAND-15 durable pin changes only via BindingDefinition revision | pin lives on `SubjectBinding.continuity`; no run-level retarget field | changing durable intent = new BindingDefinition revision | `UAS1-INV-10/12` | PROPOSED |
| BIND-CAND-16 exactly one authoritative resolution per plan/run | ownership **Option A**: plan stores `bindingResolutionRef` (id+digest); copies are digest-bound projections | caches/projections digest-checked; no second truth | `UAS1-INV-08`-style single-truth discipline | PROPOSED (B1 decision) |
| BIND-CAND-17 legacy no-binding keeps ephemeral behavior | `BindingDefinition` optional in RunDefinition composition; semantic default, not a synthetic persisted object | existing projects compile and run unchanged | UA-INV-12; backward-compat test | PROPOSED |
| B1-01 pin is an identity constraint, distinct from preference | `pin?: DurableContinuityRef` (hard) vs `preferPersistent?` (soft) — separate fields, not a mode enum | resolver cannot silently substitute a pinned point (`pinned_target_unavailable/incompatible`) | — | PROPOSED |
| B1-02 requirement vs preference separation | `BindingRequirements` (hard) vs `BindingPreferences` (soft) typed collections; no constraint DSL, no `Record<string, unknown>` core | only hard constraints gate admissibility; preferences rank within it | — | PROPOSED |
| B1-03 resolver purity | `Resolve(…)` derived; realization (create/resume/worktree) effectful and outside `Scheduler.decide()` | scheduler purity preserved; effects governed where applicable | `UAS1-INV-` scheduler purity (G9) | PROPOSED |
| B1-04 resolution determinism property | `SameSemanticInputs + SameSnapshot + SameResolverPolicy → DeterministicResolution`; policy = provenance id/version only | availability changes legitimately yield different carriers | reproducibility vs adaptivity (B0 §68) | PROPOSED |
| B1-05 schema version ≠ binding revision | `schemaVersion: 1` (shape) vs `BindingRevision` (instance) | shape evolution and semantic evolution audited separately | — | PROPOSED |
| B1-06 fail-closed candidate parsing | reject unknown fields; typed discriminants; explicit `schemaVersion`; canonical key-sorted digest input | future parser follows house contract style (PARSE-INV) | — | PROPOSED (no code) |
| B1-07 provider-neutral logical requirements | `RuntimeFeatureRef`/`ToolCapabilityRef`/`ModelCapabilityClass` are logical kinds; concrete provider/model only in RunConfiguration delta + resolution | no DeepSeek/OpenAI/plugin ids in universal semantics | PLMP-UAS-1 §66 direction | PROPOSED |
| B1-08 Work requirements are resolver inputs, not duplicated | Architecture/Work requirements feed the resolver; BindingDefinition adds only association-specific constraints/pins/preferences | no duplicate requirements store across the four surfaces | `UAS1-INV-02` (AgentDefinition ≠ WorkDefinition) | PROPOSED |
| B1-09 ExecutionPlan references exactly one resolution | `ExecutionPlanBindingRef { bindingResolution: BindingResolutionRef }` | plan provenance traceable to all four inputs + snapshot | — | PROPOSED (Option A) |
| B1-10 unsatisfied ≠ failure | `BindingUnsatisfiedReason` taxonomy is a planning condition; no attempt necessarily started | distinct from tool error / attempt failure / cancellation | `UAS1-INV-27` | PROPOSED |

Rejected at review: `BindingGraph`, `BindingBroker`, `BindingLease`,
`BindingSession`, `BindingInstance`, `BindingSlot`, `BindingManager`,
`PersistentPointRegistry`, `AuthorityRegistry`, `PeerRegistry`,
`BindingScheduler` — no demonstrated ambiguity returns without them;
`negative constraints` (`must_not_use…`) — deferred, no current semantics needs
them; cost/latency preference fields — deferred.
