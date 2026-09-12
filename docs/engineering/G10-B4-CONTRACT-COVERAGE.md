# G10-B4 — Contract Coverage Matrix

Scope discipline (B4 §69): B3's coverage matrix
(`G10-B3-CONTRACT-COVERAGE.md`) already maps `BIND1-INV-01..14` to the kernel.
This matrix maps the **integration boundaries** — how the frozen invariants
behave once the compiler seam routes real planning facts through the kernel —
plus the B4 implementation integration invariants. Kernel-internal proofs are
referenced, not duplicated.

## Part 1 — Frozen invariants at the new integration boundary

| Frozen invariant | Integration-boundary expression (B4) | Code face | Machine test | Status |
| --- | --- | --- | --- | --- |
| `BIND1-INV-01` BindingDefinition ≠ BindingResolution | compiler input types (raw/trusted definition) vs output `SatisfiedBindingResolution`/`UnsatisfiedBindingResolution` remain disjoint; plan stores neither — only the ref | `src/binding/compiler.ts` input/result types | `binding_resolver`/`binding_parser` (kernel); compiler shape test | preserved (kernel-tested) + integration-shaped |
| `BIND1-INV-02` Runtime attachment is DSH-owned | compiler performs no realization; no runtime identity fields introduced at the seam | compiler purity test + no-realization audit | `binding_compiler` static purity | preserved (structural) |
| `BIND1-INV-03` PersistentPoint participation optional; ephemeral first-class | Case E explicit definition resolves ephemeral through the seam; implicit default = all-Case-E | `compileBindingPlan` → kernel | `binding_compiler` explicit Case E + implicit tests | preserved (kernel-tested) |
| `BIND1-INV-04` Resolution never creates PersistentPoints | planning snapshot is read-only caller input; no point allocation at the seam | `BindingPlanningSnapshot` (translation boundary) | snapshot non-mutation (kernel) + no-allocation by construction | preserved (structural) |
| `BIND1-INV-05` Run-scoped narrowing never violates declarative hard requirements | RunConfiguration exists at the seam **only as a caller-supplied provenance digest**; no binding delta exists — deferred shape unchanged | `BindingPlanCompileInput.runConfigurationDigest` | missing-digest configuration error test | preserved; delta still deferred by frozen contract |
| `BIND1-INV-06` Durable pins change only via BindingDefinition revision | pins reach the compiler only through a parsed definition (raw→`parseBindingDefinition` or trusted); no run-level pin input exists | compiler input contract | pin-through-seam test; no run-level pin field (structural) | preserved (structural) |
| `BIND1-INV-07` Exactly one authoritative resolution per plan state, by immutable id+digest | plan stores `{resolutionId, digest}` only; single-truth structural test; id outside digest re-proven through the seam | `CompiledBindingPlan` | plan-shape test (§57) + determinism/identity≠digest test | preserved + integration-tested |
| `BIND1-INV-08` Rebinding ⇒ new resolution + new auditable plan state | S1→S2 basis advance refuses the old plan (`stale`), re-resolution yields P2 referencing R2; P1 frozen and unchanged | `compileBindingPlan` freshness gate | stale-admission + rebinding tests (§59/§44) | preserved + integration-tested |
| `BIND1-INV-09` No authority/organization/collaboration/commitment semantics | no such field or parameter at the seam | compiler source audit | static purity/firewall tests | preserved (structural) |
| `BIND1-INV-10` No runtime carrier/session identity in definitions or resolutions | plan artifact introduces no identity namespace beyond work ref + resolution ref | `CompiledBindingPlan` | plan-shape test (forbidden keys) | preserved (structural) |
| `BIND1-INV-11` Legacy no-binding = explicit implicit ephemeral default source | seam-level: provenance records `implicit_ephemeral_default@1` when no definition is supplied | `compileBindingPlan` | B4-M02 test | preserved + integration-tested (live wiring deferred) |
| `BIND1-INV-12` `Satisfied ≠ Unsatisfied`; `Current ≠ Stale` orthogonal | compiler returns three distinct statuses; configuration errors stay exceptions (never become unsatisfied) | result union | unsatisfied/stale/config-error tests (§21/§23) | preserved + integration-tested |
| `BIND1-INV-13` Lineage-scoped revisions travel with lineage identity | work ref = full `{definitionId, revision, digest}` via `workRefOf`; plan detects stale Work through the ref | `workRefOf`, `CompiledBindingPlan.work` | `workRefOf` mapping test | preserved (representation) |
| `BIND1-INV-14` Resolution pure/derived; realization effectful outside resolution | compile core pure (static purity test); realization absent | `compileBindingPlan` | determinism + purity tests | preserved + integration-tested |

## Part 2 — B4 implementation integration invariants (B4 §71; not a frozen contract)

| Invariant | Proof |
| --- | --- |
| `B4-INV-01` Work identity is never reinterpreted as Architecture identity | static firewall (no `TaskSpec`/`TaskProposal`/`proposalTaskSpecs`/`definition_id` in compiler code) + `workRefOf` behavioral test (`test/binding_compiler.test.ts`, B4-M03) |
| `B4-INV-02` BindingResolution is produced only from grounded provenance inputs | required-input configuration errors for work/architecture/runConfigurationDigest/snapshot/resolutionId; placeholders unrepresentable |
| `B4-INV-03` Plan state stores only BindingResolutionRef, never a second full resolution truth | plan-shape structural test (`["bindingResolution","work"]` keys; ref keys `["digest","resolutionId"]`; forbidden keys absent) |
| `B4-INV-04` BindingUnsatisfied produces no executable plan | `binding_unsatisfied` result: no `plan` key, frozen result, no task/event/attempt surface exists |
| `B4-INV-05` Stale BindingResolution is not admissible into a current plan | S1-resolved compile with S2 admission basis → `{status:"stale"}`, no plan, no id attached |
| `B4-INV-06` Rebinding produces a new immutable plan state | re-resolve S2 → P2 references R2 (digest differs); P1 JSON-stable and frozen |
| `B4-INV-07` Legacy Work compilation remains unchanged when Binding is not explicitly used | B4-M01 byte-stability test; `src/architecture/` untouched (no diff) |
| `B4-INV-08` Binding planning occurs before runtime realization and outside `Scheduler.decide()` | `src/scheduler/scheduler.ts` byte-unchanged; compiler imports nothing scheduler/state; purity test |

## Part 3 — Non-goals held (absence proofs)

| Non-goal | Evidence |
| --- | --- |
| No storage/migration (§45) | no `execution_plans`/`binding_*` tables; `src/state/` untouched |
| No event schema change (§46) | event schema untouched; no new event types |
| No scheduler change (§25/§26) | `scheduler.ts` no-diff; full scheduler suite green |
| No `TaskSpec`/AgentGraph binding fields (§4) | `src/schema/models.ts`, `src/graph/ir.ts` no-diff; B4-M01 no-leak assertion |
| No fixture-type escape (§35) | static export test on compiler source; fixture types stay kernel plumbing |
| No Canvas truth (§66) | `src/canvas/` untouched |
