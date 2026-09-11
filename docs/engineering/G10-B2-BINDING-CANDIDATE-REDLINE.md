# G10-B2 — Binding Candidate Redline (B1 → PLMP-BIND-1)

Status: **FREEZE RECORD**

Maps the B1 candidate (`G10-B1-BINDING-SCHEMA-CANDIDATE.md` @ `da4c211`) to the
frozen `BINDING-SEMANTIC-CONTRACT-v1.md` (PLMP-BIND-1). Classifications:
`UNCHANGED`, `NARROWED`, `NORMALIZED`, `MOVED OWNER`, `DEFERRED`, `REMOVED`,
`OPEN-FROZEN`. The review's blocker ledger (BR-01…BR-10, FR-A…FR-F) and field
disposition table live in `G10-B2-BINDING-SCHEMA-FORMAL-REVIEW.md`; this
redline is the complete candidate→frozen correspondence.

## Type/field mapping

| B1 candidate | PLMP-BIND-1 | Classification | Rationale |
|---|---|---|---|
| `BindingDefinitionId` / `BindingDigest` | §2/§3 | UNCHANGED | new namespaces; content digest |
| `BindingRevision` | §2/§3 | NARROWED | scope/order frozen (BR-10): lineage-scoped, monotonic within lineage, no arithmetic adjacency |
| `BindingDefinitionRef` | §3 | UNCHANGED | — |
| `ArchitectureSubjectRef` / `DurableContinuityRef` | §3 | UNCHANGED | CANDIDATE future identities |
| `RuntimeFeatureRef` / `ToolCapabilityRef` | §3 | NARROWED | semantic sets, deduped+sorted, logical identifiers only (FR-F/§86) |
| `WorkspaceLocalityRequirement` | — | DEFERRED | current-implementation-shaped (FR-C/§85) |
| `BindingRequirements` | `BindingHardRequirements` | NARROWED | runtimeFeatures + toolCapabilities only; workspace deferred |
| `BindingPreferences` | — | REMOVED | BR-07/§27–§30: duplicated AgentDefinition/Work semantics |
| `modelCapabilityClass` / `contextBudget` | — | REMOVED (MOVED OWNER conceptually) | model-policy / work-budget ownership, not association |
| `ContinuityBindingIntent` | §3/§5 | NORMALIZED | presence-only `true`, at most one field, pin dominates (BR-05/§19–§22) |
| `SubjectBinding.subject` | — | REMOVED | BR-04: `MapKey = SubjectIdentity` single truth |
| `SubjectBinding` | §3 | NARROWED | optional continuity/hard; ≥1 present (FR-D/§59–§61); false flags rejected |
| `BindingDefinition` | §3 | NARROWED | ≥1 subject entry (§57); digest excludes id/revision (§53/§54) |
| `ProviderModelSelection` (delta + resolution) | — | DEFERRED | BR-08/FR-A/§35/§62: not Binding-owned |
| `toolImplementations` | — | DEFERRED | §63: capability-satisfaction provenance may return as typed extension |
| `workspace` selection / `logicalResource` | — | DEFERRED | §64: opaque escape hatch avoided |
| `ResolutionProvenance` | §3 | NARROWED | `intentSource` added (BR-01); `DefinitionRevisionRef` with lineage identity (FR-E/§78–§80); `runConfigurationDigest` kept (§77) |
| `stale_inputs` / `run_selection_conflict` / `hard_constraint_unsatisfied` reasons | — | REMOVED | BR-02/FR-B/§46–§48: stale is a freshness property; static conflicts validate pre-resolution; specific reasons replaced the umbrella |
| reason taxonomy | §3 (4 reasons) | NARROWED | deterministic evaluation order (review §4) |
| `BindingResolutionResult` (no discriminant) | §3 | NORMALIZED | `status: "satisfied" \| "unsatisfied"` (BR-03); renamed `SatisfiedBindingResolution`/`UnsatisfiedBindingResolution` (§15) |
| `BindingResolution` (continuity-only core) | §3 | NARROWED | provider/model/tool/workspace selections deferred (FR-A/§65–§67); runtime identity absent (§96) |
| `BindingResolutionId` | §3 | NARROWED | opaque derived-artifact id; digest carries content identity (§43); unsatisfied results carry no id (§44) |
| `RunConfigurationBindingDelta` | — | DEFERRED | BR-08/§31–§35: narrowing semantics frozen (INV-05), shape deferred; multi-subject overrides deferred explicitly (§102) |
| `ExecutionPlanBindingRef` | §3 | NARROWED | one immutable id+digest ref per plan state; rebinding = new plan state (BR-09/§36–§39/§74–§76) |
| (new) `BindingIntentSource` | §3/§4 | NEW | BR-01/§8: discriminated legacy/explicit provenance; `semanticVersion` for default evolution (§50–§52) |
| (new) `DefinitionRevisionRef` | §3 | NEW | FR-E/§78–§80: lineage identity travels with revision |
| (new) `SnapshotRef` (opaque) | §3 | NEW | §69/§70: opaque observation-basis identity; input reference only |
| (new) frozen invariants `BIND1-INV-01..14` | §13 | NEW | single-claim set; reviewed from §112 examples |

## Rule dispositions

**BIND-CAND-01…17** (B0 §13, incl. Stage-0 closures): 01→`BIND1-INV-01`; 02→`INV-02`; 03→`INV-03` context; 04→`INV-03/02` (carrier replacement, narrowed by BR-09 plan-state rule); 05→`INV-09`; 06→`INV-09`; 07→`INV-01/14`; 08→SPLIT into `INV-12` (currency) + reason taxonomy (satisfiability); 09→`INV-04`; 10→`INV-10`; 11→firewall §11; 12→`INV-03`; 13→reason taxonomy §6; 14→`INV-05`; 15→`INV-06`; 16→`INV-07`; 17→`INV-11`. No rule rejected; 08 split; 14 narrowed to include Architecture/Work hard inputs (BR-06).

**B1-01…10**: 01→continuity canonical model §5; 02→typed hard/preference, preferences object removed; 03→`INV-14`; 04→§9 determinism (deterministic tie-breaking; no randomness); 05→`schemaVersion` vs revision; 06→§10 parser obligations; 07→`RuntimeFeatureRef`/`ToolCapabilityRef` logical-id freeze; 08→ownership table (B0 §59–§60) + BR-06 combined admissibility; 09→`ExecutionPlanBindingRef` narrowed by BR-09; 10→`BIND1-INV-12` context.

## Correction summary

The freeze is **smaller** than the candidate: 1 type removed
(`BindingPreferences`), 1 type moved out of core entirely (RunConfiguration
binding delta deferred), 3 selection families deferred
(provider/model, tool implementations, workspace), 3 reasons removed
(`stale_inputs`, `run_selection_conflict`, umbrella
`hard_constraint_unsatisfied`), 1 field removed (`SubjectBinding.subject`),
1 field re-scoped (`workspace` requirement), 3 types added
(`BindingIntentSource`, `DefinitionRevisionRef`, `SnapshotRef` — all
provenance-correctness closures). No UAS-1 statement was amended; all firewalls
survive; the legacy ephemeral path and the four continuity states are frozen
with no redundant encodings.
