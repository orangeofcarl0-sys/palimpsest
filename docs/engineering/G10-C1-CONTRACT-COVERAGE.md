# G10-C1 — Contract Coverage Matrix

Scope: the C1 stage's integration-boundary proofs. Kernel-internal coverage is
referenced (B3), not duplicated; B4/C0 integration coverage carries forward
unchanged and re-runs green.

## RunConfiguration artifacts

| Invariant / proof | Code face | Machine test | Status |
| --- | --- | --- | --- |
| C1-M01 strict parsing | `parseRunConfiguration` (exact keys, schemaVersion, fail-closed digest) | `run_configuration` unknown-field/tamper tests | implemented + machine-tested |
| C1-M02 digest determinism | `computeRunConfigurationDigest` over `palimpsest.run-configuration.v1` + `{}` | same-digest-across-materializations test | implemented + machine-tested |
| C1-M03 runtime immutability | frozen materializer/parser outputs; input detachment | freeze + mutation-after-parse tests; purity audit | implemented + machine-tested |
| canonical default is the only valid configuration (§16) | no run-scoped fields exist | digest-content equality `{domain, content:{}}` | implemented + machine-tested |
| digest identity, no id/revision (§18) | type shape | type-level (structural) | structural |

## RunDefinition composite

| Invariant / proof | Code face | Machine test | Status |
| --- | --- | --- | --- |
| C1-M04 refs only | `RunDefinition` type + materializer | serialized-content forbidden-field test | implemented + machine-tested |
| C1-M05 digest determinism | `runDefinitionDigestOf` over `palimpsest.run-definition.v1` | identical-inputs / per-input-drift tests | implemented + machine-tested |
| C1-M06 explicit intent source | `compileBindingIntentSource(definition)` reuse | explicit ref equality test | implemented + machine-tested |
| C1-M07 implicit intent source | `compileBindingIntentSource(undefined)` reuse | `implicit_ephemeral_default@1` test | implemented + machine-tested |
| C1-M08 Work identity derived | `workRefOf(projectIr)` inside the materializer | ref-equality vs `workRefOf` | implemented + machine-tested |
| C1-M09 Architecture identity derived | `architectureRefOf(architecture)` inside the materializer | ref-equality vs `architectureRefOf` | implemented + machine-tested |
| C1-M11 no content duplication | refs-only composite | forbidden-field test | implemented + machine-tested |
| C1-M12 legacy Work compile byte-stable | `src/architecture/proposal.ts` untouched | B4-M01 (carried) | preserved (no-diff + test) |
| immutability (§28) | deep freeze incl. nested binding ref | freeze/`TypeError`/aliasing tests | implemented + machine-tested |
| no fake-ref injection (§32) | materializer parameter block | static artifact-only-input proof | implemented + machine-tested |

## Compiler seam change

| Invariant / proof | Code face | Machine test | Status |
| --- | --- | --- | --- |
| C1-M10 arbitrary `runConfigurationDigest` input removed | `BindingPlanCompileInput` now takes raw/trusted RunConfiguration; digest derived | static regex proof + missing-source/tampered-raw behavioral tests | implemented + machine-tested |
| raw/trusted discipline (campaign §8) | mutual exclusion; trusted = "trusted API boundary, not an unforgeable capability" (doc + comment) | both-sources error test | implemented + machine-tested + documented |
| parse-error distinctness | `RunConfigurationParseError` ≠ `BindingConfigurationError` ≠ unsatisfied | error-type tests | implemented + machine-tested |

## Non-goals held

| Non-goal | Evidence |
| --- | --- |
| No RunConfiguration/RunDefinition persistence (§59 campaign; C1 §19/§25) | `src/state/` no-diff; no tables/events |
| No snapshot work in C1 (C1 §30) | snapshot blocker untouched; `BindingPlanningSnapshot` unchanged until C2 |
| No scheduler change (§94) | `src/scheduler/` no-diff |
| Dependency direction (C1 §93/§94) | `src/run/` new package; `run → binding kernel/refs`, `binding/compiler → run/configuration`; no cycles (module import audit in review) |
| Frozen contracts untouched (§91) | PLMP-UAS-1/PLMP-BIND-1 docs no-diff; kernel modules no-diff |
