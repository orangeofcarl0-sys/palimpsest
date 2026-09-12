# G10-B3 — Contract Coverage Matrix

Status: **IMPLEMENTATION VALIDATION RECORD**

Maps every frozen PLMP-BIND-1 invariant to its code surface, machine test, and
spike status. No vague coverage claims: an invariant is `implemented + machine-tested`,
`implemented (structural)`, or `deferred by frozen contract`.

| Frozen rule/invariant | Code surface | Test | Status |
|---|---|---|---|
| `BIND1-INV-01` BindingDefinition ≠ BindingResolution | distinct types (`contract.ts`): `BindingDefinition` (parser output) vs `SatisfiedBindingResolution`/`UnsatisfiedBindingResolution` (resolver/materializer output) | `binding_resolver` result-shape tests; `binding_parser` digest tests | implemented + machine-tested |
| `BIND1-INV-02` Runtime attachment is DSH-owned; not in the Binding contract | no runtime-identity fields anywhere in `src/binding/` | `binding_resolver` "emits no runtime identity fields" (B3-M13) | implemented (structural) + machine-tested |
| `BIND1-INV-03` PersistentPoint participation optional; ephemeral first-class | `ContinuityBindingIntent` all-optional; Case E branch in `resolveContinuity` | `binding_resolver` legacy + explicit-Case-E + no-opportunistic-durable tests (B3-M01/M02) | implemented + machine-tested |
| `BIND1-INV-04` Resolution never creates PersistentPoints | no creation path in `resolver.ts`; snapshot is read-only input | `binding_resolver` snapshot-immutability test; purity audit | implemented (structural) + machine-tested |
| `BIND1-INV-05` Run-scoped narrowing never violates declarative hard requirements | RunConfiguration delta **deferred**; `runConfigurationDigest` is provenance input only; pre-resolution configuration validation (`BindingConfigurationError`) | `binding_parser` subject-coverage tests; §50 record in the spike doc | implemented (validation seam); delta shape deferred by frozen contract |
| `BIND1-INV-06` Durable pins change only via BindingDefinition revision | pin lives only on `SubjectBinding.continuity`; no run-level pin field exists | `binding_resolver` pin cases (no retarget path); structural absence | implemented (structural) |
| `BIND1-INV-07` Exactly one authoritative resolution per plan state, by immutable id+digest | `materializeResolutionResult` (id + digest over §8 content); `BindingResolutionRef`/`ExecutionPlanBindingRef` | `binding_resolver` determinism test (same inputs ⇒ same digest; ids outside digest) | implemented + machine-tested |
| `BIND1-INV-08` Rebinding ⇒ new resolution + new auditable plan state | freshness + re-resolution fixture | `binding_freshness` rebinding tests (B3-M12) | implemented + machine-tested |
| `BIND1-INV-09` No authority/organization/collaboration/commitment semantics | no such fields in `src/binding/` | authority audit (grep) | implemented (structural) + audited |
| `BIND1-INV-10` No runtime carrier/session identity in definitions or resolutions | branded new identity namespaces only | `binding_resolver` B3-M13; identity audit | implemented (structural) + machine-tested/audited |
| `BIND1-INV-11` Legacy no-binding = explicit implicit ephemeral default source | `compileBindingIntentSource(undefined)` | `binding_resolver` legacy test (B3-M01) | implemented + machine-tested |
| `BIND1-INV-12` `Satisfied ≠ Unsatisfied`; `Current ≠ Stale` orthogonal | result discriminants (`status`) + `evaluateFreshness` over provenance | `binding_freshness` (satisfied AND unsatisfied results; per-input staleness) | implemented + machine-tested |
| `BIND1-INV-13` Lineage-scoped revisions travel with lineage identity | `DefinitionRevisionRef`/`BindingDefinitionRef` carry id+revision+digest | `binding_freshness` per-input staleness; `binding_digest` identity-exclusion tests | implemented (representation) + machine-tested; **monotonic lineage enforcement deferred** to future store (documented in parser) |
| `BIND1-INV-14` Resolution pure/derived; realization effectful outside resolution | `resolveBindingCore` has no clock/randomness/IO; realization intentionally absent | determinism test (B3-M10); purity audit | implemented (structural) + machine-tested/audited |

## Parser-obligation coverage (PLMP-BIND-1 §10)

| Obligation | Test |
|---|---|
| reject unknown fields (all frozen levels) | `binding_parser` "unknown fields at every frozen level" |
| reject invalid continuity combinations (multi-field, false flags) | `binding_parser` continuity canonical-state tests |
| reject duplicate serialized subject keys | documented: JS-object surface cannot represent duplicates; applies to a future JSON-string parsing surface (parser requirement recorded, not exercised in B3) |
| reject duplicate requirement entries | `binding_parser` duplicate semantic-set test |
| require ≥1 subject entry | `binding_parser` zero-subject test |
| require ≥1 of continuity/hard per entry | `binding_parser` empty-entry tests |
| preserve explicit `continuity:{}`; normalize empty `hard` | `binding_parser` PF-01 tests |
| validate explicit subject coverage before resolution | `binding_parser`/`binding_resolver` PF-02 tests |
| validate digest after canonicalization | `binding_parser` digest-mismatch tests |
| validate configuration narrowing before resolution | configuration-validation seam (`BindingConfigurationError`); delta shape deferred |

## Spike fixtures (not frozen schema)

`ResolverSnapshot` (`ref`, `ephemeralCapabilities`, `persistentCandidates[]`),
`BindingCatalogPoint` (`point`, `available`, capability sets), and
`SubjectRequirementFixture` are spike-only adapters representing resolver-
observable facts. They are named as fixtures, not as PersistentPoint or
RuntimeAgent entities, and the snapshot is never persisted.

## Addendum — B3C conformance corrections (2026-09-12)

The post-spike contract review found the original coverage table overstated five
rows. Corrections, with the new B3C tests mapped explicitly:

| Frozen rule/invariant | Previous claim | Correction | New test |
|---|---|---|---|
| PF-02 subject coverage (under `UAS1-INV-05`-adjacent totality) | "implemented + machine-tested" | was subset-only; now **exact set equality** | `binding_conformance` B3C-M01 (missing AND extra subjects rejected; set semantics) |
| Frozen reason order (PLMP-BIND-1 §6) | "implemented + machine-tested" via resolver tests | was lexical sort; now **semantic tier order** via centralized `orderUnsatisfiedReasons` | `binding_conformance` B3C-M02 (cross-tier + same-tier + multi-subject) |
| `ResolutionProvenance` = exact freshness basis (§7) | "implemented + machine-tested" | `intentSource.binding` was unchecked; now **id+revision+digest coherence** enforced | `binding_conformance` B3C-M03 |
| Resolver-policy provenance (§9 determinism inputs) | "implemented" | provenance could omit/lie; now **actual policy always recorded, unsupported policies rejected** | `binding_conformance` B3C-M04 |
| Canonical parser output (PLMP-BIND-1 §8) | "implemented" | parser output was non-canonical (sets/subject order); now **canonical representation** | `binding_conformance` B3C-M05 |
| `BIND1-INV-08` immutability (rebinding) | "implemented + machine-tested" | nested provenance aliased caller input; selections unfrozen; now **contract-boundary frozen copies** | `binding_conformance` B3C-M06 |

All other rows stand unchanged.
