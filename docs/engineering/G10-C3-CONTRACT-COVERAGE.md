# G10-C3 — Contract Coverage Matrix

## Campaign invariants at the final grounded boundary

| Proof / invariant | Code face | Machine test | Status |
| --- | --- | --- | --- |
| C3-M01 all provenance artifact-derived | `compileGroundedBindingPlan` derivation table | coherence test | implemented + machine-tested |
| C3-M02..M07 no caller escapes | grounded input accepts artifacts only | static input-block audit (refs/subjects/digests/refs/bases/policy/hard-maps all absent) | implemented + machine-tested |
| C3-M08 RunDefinition coherence | materialized composite vs plan ref vs provenance | three-way equality test | implemented + machine-tested |
| C3-M09 plan ref-only ownership | `CompiledBindingPlan {runDefinition{digest}, bindingResolution{id,digest}}` | shape + forbidden-content test | implemented + machine-tested |
| C3-M10 unsatisfied no-plan | grounded result union | unsatisfied test | carried + machine-tested |
| C3-M11 stale no-current-plan | grounded freshness evaluation | S1→S2 admission refusal | implemented + machine-tested |
| C3-M12 architecture freshness | derived basis vs r2 state | §71 end-to-end | implemented + machine-tested |
| C3-M13 work freshness | derived basis vs W@r2 | §72 end-to-end | implemented + machine-tested |
| C3-M14 binding freshness | intent source in basis + RunDefinition digest | §75 end-to-end | implemented + machine-tested |
| C3-M15 run-configuration freshness | digest in RunDefinition + provenance + kernel gate; single canonical default (RC1==RC2) | §73 test + parser single-config proof | implemented + machine-tested (honestly scoped) |
| C3-M16 snapshot freshness | SnapshotRef in derived basis | same-state current test | implemented + machine-tested |
| C3-M17 rebinding immutability | frozen P1/R1/RD1 byte-stable | §70 end-to-end | implemented + machine-tested |
| C3-M18 legacy implicit default grounded | no-definition compile over real subjects | §76 test | implemented + machine-tested |
| C3-M19 Work compiler non-regression | `src/architecture/proposal.ts` no-diff | carried B4-M01 + §77 test | preserved + machine-tested |
| C3-M20 scheduler purity | `src/scheduler/` no-diff | scheduler suite green | preserved |

## Campaign-wide reviews (§82–§85) — summary (full detail in the umbrella doc)

| Review | Outcome |
| --- | --- |
| §82 trusted-boundary enumeration | five raw/trusted pairs documented (architecture, binding, run-configuration, observation, grounded artifacts); trusted = trusted API boundary, not unforgeable; artifact/ref coherence machine-checked (digest fail-closed at every parser) |
| §83 canonicalization | architecture membership, capability sets, candidate order, digest content key-sorted — equivalent inputs → identical digests (per-stage proofs) |
| §84 runtime immutability | every artifact deep-frozen with caller detachment (per-stage freeze/`TypeError` proofs) |
| §85 digest inventory | five digests documented with domain/included/excluded/identity-kind (umbrella doc §7) |

## Non-goals held across the campaign

No PersistentPoint storage/registry/lifecycle; no DSH Agent/Session/runtime
attachment; no Ordarium changes; no provider/model/tool/workspace
realization; no authority/organization/collaboration/commitment; no
Invocation/Participation; no Architecture UI/Canvas/Graph; no
binding/run-definition/snapshot/plan databases; no SQLite migrations; no new
event types; `Scheduler.decide()` pure and byte-unchanged; TaskSpec,
AgentGraph v1, Canvas untouched.
