# G10-D1 — Contract Coverage Matrix

## Frozen boundaries at the runtime seam

| Boundary | D1 expression | Machine test | Status |
| --- | --- | --- | --- |
| AgentDefinition ≠ Activation | Activation references `agentDefinitionId`; definition fields absent | D1-M01 | machine-tested |
| Activation ≠ Attempt | no taskId/attemptId/definition_id/worktree anywhere in runtime artifacts (structural + static) | D1-M02 | machine-tested |
| ActivationId independent | allocator-seam input; incomplete coverage rejected; arbitrary ids accepted | D1-M03 | machine-tested |
| RuntimeAgentRef ≠ ActivationId ≠ SessionRef | distinct host-owned shapes; session optional, never synthesized | D1-M04/M05 | machine-tested |
| BindingResolution ≠ RuntimeAttachment | target derived via explicit `continuityTargetOf` adapter; attachment materialized separately from resolution | D1-M08/M09 | machine-tested |
| `UAS1-INV-03/04` Definition ≠ Activation ≠ Attempt | same as rows above (identity-only artifacts, no cross-fields) | D1-M01/M02 | machine-tested |
| `UAS1-INV-10/11` PersistentPoint ≠ AgentDefinition/Runtime | no point fields in runtime artifacts; no point creation in the kernel | D1-M12 import/purity audit | machine-tested (structural) |

## D1 proofs

| Proof | Subject | Test |
| --- | --- | --- |
| D1-M06 | plan/ref coherence fail-closed (run ref, resolution ref, subject set) | mismatch tests |
| D1-M07 | stale plan refused via G10-C grounded freshness (kind: plan_stale) | current/advanced-state tests |
| D1-M08/M09 | targets derive exactly from BindingResolution (ephemeral + persistent end-to-end) | target tests |
| D1-M10 | realization keys stable + input-sensitive | key tests |
| D1-M11 | deep immutability + detachment | freeze/`TypeError` tests |
| D1-M12 | no host/store/effect/randomness/io in the kernel | static purity + import audit |

## Non-goals held

No DSH calls; no Ordarium effects; no sessions; no PersistentPoint creation;
no Work assignment/routing; no scheduler change (`src/scheduler` no-diff); no
Attempt-executor change; no event/storage change; frozen contracts and all
prior campaign artifacts untouched.
