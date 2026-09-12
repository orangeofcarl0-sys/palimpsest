# G10-C2 — Contract Coverage Matrix

## Frozen invariants at the observation boundary

| Invariant | C2 expression | Machine test | Status |
| --- | --- | --- | --- |
| `BIND1-INV-04` Resolution never creates PersistentPoints | snapshot is observation of candidates; no creation/allocation path | C2-M12 structural audit + kernel snapshot non-mutation | preserved + machine-tested |
| `BIND1-INV-05` run-scoped narrowing never violates declarative hard requirements | snapshot supplies facts; UNKNOWN never becomes UNAVAILABLE (no default snapshot) | no-default-producer audit (§45/§46) | preserved + machine-tested |
| `BIND1-INV-12` `Current ≠ Stale` orthogonal | snapshot drift (S1→S2) surfaces as staleness through the existing gate | compiler stale-admission tests with derived refs (C2-M11) | preserved + machine-tested |
| `BIND1-INV-13` lineage-scoped identity travels with lineage identity | SnapshotRef = H(snapshotId, content digest) under its own domain | C2-M06 identity-vs-content tests | implemented + machine-tested |
| `BIND1-INV-14` resolution pure/derived | observation artifact immutable; compiler translation private | C2-M07/M08 + purity audit | implemented + machine-tested |

## C2 proofs

| Proof | Subject | Test |
| --- | --- | --- |
| C2-M01 | strict snapshot parser | `binding_observation` parser tests |
| C2-M02 | canonical capability sets | order-independence + duplicate-value rejection |
| C2-M03 | canonical candidate ordering | P-2/P-1 input order → canonical output |
| C2-M04 | duplicate candidate rejection | duplicate-point rejection |
| C2-M05 | snapshot digest determinism | same-content equality; per-axis drift |
| C2-M06 | SnapshotRef changes with identity AND content | two-axis ref-drift tests + ref-domain constants |
| C2-M07 | runtime immutability | deep-freeze + `TypeError` |
| C2-M08 | caller-input detachment | mutate-after-materialize cannot change ref/digest/content |
| C2-M09 | compiler derives snapshot ref | provenance snapshot ref equals `observationRefOf(artifact)` |
| C2-M10 | ad-hoc SnapshotRef escape removed | static `planningSnapshot`-absence + raw/trusted presence |
| C2-M11 | stale resolution on changed observation | S1→S2 admission refusal + re-resolution (compiler suite) |
| C2-M12 | no PersistentPoint semantics | forbidden-field audits (runtime + static) |
| C2-M13 | kernel fixture types stay internal | static export/usage audit on `observation.ts` |

## Non-goals held

| Non-goal | Evidence |
| --- | --- |
| No snapshot persistence/history store (C2 §43) | `src/state/` no-diff; no tables/events |
| No RunConfiguration/RunDefinition work in C2 | `src/run/` no-diff this stage |
| No scheduler change | `src/scheduler/` no-diff |
| No TaskSpec/AgentGraph/Canvas change | no-diff |
| Frozen contracts untouched | PLMP-UAS-1/PLMP-BIND-1 no-diff; B3 kernel modules no-diff |
