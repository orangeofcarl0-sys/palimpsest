# G10-C0 — Contract Coverage Matrix

Scope discipline (C0 §80): this matrix maps the UAS-1 invariants C0 actually
touches plus the Binding integration invariants at the new seam. C0 claims no
UAS entities beyond Architecture/AgentDefinition identity; unrelated invariants
are intentionally not listed as "implemented".

## Part 1 — UAS-1 frozen invariants realized/touched by C0

| Invariant | C0 expression | Code face | Machine test | Status |
| --- | --- | --- | --- | --- |
| `UAS1-INV-01` Architecture ≠ Work ≠ Runtime ≠ Continuity | ArchitectureDefinition is its own artifact: imports only the canonical utility; no Work semantics, no runtime/continuity fields | `src/architecture/definition.ts` | C0-M05 import firewall + dependency-audit test; collision test §52 | realized (identity only) + machine-tested |
| `UAS1-INV-02` AgentDefinition ≠ WorkDefinition / TaskDefinition | one-field identity-only `AgentDefinition`; no task/objective/depends/work fields; distinct `agentDefinitionId` field name | `AgentDefinition` type | C0-M04/M05; B4-M01 no-leak assertion | realized + machine-tested |
| `UAS1-INV-05` `definition_id` = Work/Task lineage; future identities need distinct fields/types | `agentDefinitionId`/`architectureDefinitionId` are distinct namespaces; `definition_id` untouched; no alias | `src/schema/models.ts` (unchanged) + definition.ts | C0-M04 namespace test; §52 collision test; workRefOf test | preserved + machine-tested |
| `UAS1-INV-06` AgentGraph v1 is WorkGraph/task-bearing | no AgentGraph reinterpretation; no AgentDefinition fields on `"agent"` nodes; no migration | `src/graph/ir.ts` (no-diff) | no-diff + B4-M01 byte-stability | preserved (no-diff) |
| `UAS1-INV-09` runtime entity never silently rewrites a Definition graph | no runtime path touches ArchitectureDefinition; no promotion/mutation surface exists | compiler (read-only consumption); purity tests | purity + immutability tests (C0-M13) | preserved (structural) |
| `UAS1-INV-10` PersistentPoint ≠ AgentDefinition | no PersistentPoint fields, refs, or creation anywhere in C0 | definition.ts | purity test + §4 non-goal absence | preserved (structural) |
| `UAS1-INV-11` PersistentPoint ≠ RuntimeAgent/Session/Activation | no runtime/session/activation identity in the artifact or compiler output | definition.ts + compiler | B4-M03-style plan-shape test (forbidden keys) | preserved (structural) |

## Part 2 — Binding integration invariants at the C0 seam

| Invariant | C0 expression | Machine test |
| --- | --- | --- |
| `BIND1-INV-05` run-scoped narrowing never violates declarative hard requirements | RunConfiguration stays a provenance-only digest input (C0 §63) | runConfigurationDigest configuration-error test |
| `BIND1-INV-07` one authoritative resolution per plan state, by id+digest | unchanged; plan still stores the ref only | plan-shape test (unchanged) |
| `BIND1-INV-08` rebinding ⇒ new resolution + new plan state | now includes architecture-advance staleness (C0 §46) | C0-M12 freshness test |
| `BIND1-INV-11` legacy no-binding = implicit ephemeral default source | now over the ArchitectureDefinition's real subject set (C0 §48) | C0-M09 test |
| `BIND1-INV-12` Satisfied ≠ Unsatisfied; Current ≠ Stale orthogonal | unchanged; architecture drift surfaces as `stale`, membership mismatch as configuration error | C0-M12 + §47 tests |
| `BIND1-INV-13` lineage-scoped revisions travel with lineage identity | architecture ref carries artifact id/revision/digest via `architectureRefOf` | C0-M06 test |
| `BIND1-INV-14` resolution pure/derived; realization effectful outside | compiler still pure; architecture artifact immutable | purity + immutability tests |
| PF-02 exact subject coverage | enforced by the existing kernel over derived subjects — not reimplemented (C0 §43) | C0-M10/M11 + §47 tests |

## Part 3 — B4 invariants restated after C0

| Invariant | Change |
| --- | --- |
| `B4-INV-01` Work identity never reinterpreted as Architecture identity | strengthened: subjects now derive from an owned artifact, not caller strings; §52 collision test added |
| `B4-INV-02` Resolution only from grounded provenance inputs | architecture inputs upgraded from well-formed caller refs to artifact-derived provenance; runconfig/snapshot still caller-supplied (deferred) |
| `B4-INV-03` Plan stores only BindingResolutionRef | unchanged |
| `B4-INV-04/05/06/07/08` | unchanged; all proofs re-run green on the C0 branch |

## Part 4 — Non-goals held (absence proofs)

| Non-goal | Evidence |
| --- | --- |
| No storage/tables/events (§59) | `src/state/` no-diff; no new event types |
| No TaskSpec/schema change (§56) | `src/schema/models.ts` no-diff (canonical.ts untouched); B4-M01 |
| No AgentGraph v1 change (§57) | `src/graph/ir.ts` no-diff |
| No Canvas change (§58) | `src/canvas/` no-diff |
| No scheduler change (§83) | `src/scheduler/` no-diff |
| No DSH/Ordarium/provider/tool/workspace realization (§65) | `src/tools/dsh*`, `src/effects/` no-diff |
| No architecture mega-package (§67) | exactly one new module: `src/architecture/definition.ts` |
