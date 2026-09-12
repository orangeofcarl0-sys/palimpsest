# G10-C — Run Grounding Campaign Record

Status: **G10-C · RUN GROUNDING & FULLY-GROUNDED BINDING PLANNING · CAMPAIGN COMPLETE**

Umbrella record for the single-prompt G10-C campaign (§95): stage topology,
canonical checkpoints, grounding-matrix evolution, major decisions,
campaign-wide reviews, and the final verdict. Substage records:
`G10-C0-*` (prior), `G10-C1-*`, `G10-C2-*`, `G10-C3-*`.

---

## 1. Stage topology and canonical checkpoints (§88/§89/§90)

Every stage: focused tests → full unit → build → build:web → e2e → adversarial
review → final-head remote CI on the actual HEAD (never ancestor green) →
normal merge (no squash, no force, no bypass).

| Stage | Branch | PR | Final HEAD (green run) | Merge commit | Post-stage main |
| --- | --- | --- | --- | --- | --- |
| C0 (incl. campaign Stage-0 review) | `experiment/g10-c0-minimal-architecture-identity` | #17 | `34944e6` (run 34706885164; one documented `E2E-DEBUG-01` flake + failed-job rerun on the prior HEAD cycle) | `637f153` | `637f153` — canonical CI run 34706984010 **success** |
| C1 | `experiment/g10-c1-run-definition-grounding` | #18 | `8ca9319` (run 34708165133, first-run green) | `f9d3b83` | `f9d3b83` |
| C2 | `experiment/g10-c2-binding-observation-grounding` | #19 | `ce72395` (run 34708980122, first-run green) | `7b50f0c` | `7b50f0c` — canonical CI run 34709045262: unit PASS, e2e `E2E-DEBUG-01` flake ×2, resolved by documented failed-job reruns → **success** |
| C3 | `experiment/g10-c3-grounded-binding-plan` | #20 | `36dada8` (run 34709964645, first-run green) | `297ffee` | `297ffee` — canonical CI run 34710038956 **success** |

Historical flakes (`E2E-DEBUG-01` / `E2E-RUNTIME-03` runtime-debugger
nondeterminism) were handled exclusively by failed-job reruns with every
failure preserved; no semantic, UI, or runtime code was ever modified to chase
them.

## 2. Grounding matrix evolution (§93/§96)

| Binding provenance input | B4 (pre-C) | post-C0 | post-C1 | post-C2 = campaign end |
| --- | --- | --- | --- | --- |
| Architecture ref | MISSING (caller well-formed ref) | **GROUNDED** by ArchitectureDefinition | GROUNDED | GROUNDED |
| Architecture subjects | MISSING (caller list) | **GROUNDED** by AgentDefinition membership | GROUNDED | GROUNDED |
| Work ref | GROUNDED by ProjectIr (caller ref at seam) | GROUNDED | **GROUNDED from artifact** (materializer takes ProjectIr) | GROUNDED from artifact |
| Binding intent | GROUNDED (kernel) | GROUNDED | GROUNDED (in RunDefinition) | GROUNDED |
| RunConfiguration digest | MISSING (caller string) | MISSING | **GROUNDED** by RunConfiguration artifact | GROUNDED |
| SnapshotRef | MISSING (ad-hoc caller object) | MISSING | MISSING | **GROUNDED** by BindingObservationSnapshot |
| Resolver policy | GROUNDED (kernel) | GROUNDED | GROUNDED | GROUNDED — actual kernel policy, no caller claim |
| Architecture hard requirements | INTENTIONALLY ABSENT | ABSENT | ABSENT | INTENTIONALLY ABSENT (no owner; C3 §59) |
| Work hard requirements | INTENTIONALLY ABSENT | ABSENT | ABSENT | INTENTIONALLY ABSENT (no owner; C3 §59) |

B4's historical `PARTIAL — upstream provenance blocker` verdict is preserved
untouched; the additive closures read: C0 closed Architecture provenance, C1
closed RunConfiguration provenance, C2 closed Snapshot provenance, C3 closed
compiler grounding (§96).

## 3. Major decisions

1. **C0 Stage-0 identity grammar (§10):** architecture ids adopt the
   repository's shared stable-identifier grammar, extracted as the
   semantically neutral `src/schema/identifier.ts`; whitespace/control/
   newline/path-like ids rejected. No Work model imported.
2. **C1 minimality (§14–§16):** no production run-scoped field passes the
   gate question → the canonical **default RunConfiguration** (content =
   no run-scoped specialization) is the only valid configuration; digest
   identity only. C3-M15 states honestly: RC1 == RC2 today, and run-configuration
   drift becomes observable exactly when real run-scoped fields are
   introduced — the digest plumbing is already freshness-live.
3. **C2 no default snapshot (§45/§46):** rejected with proof — a default
   with empty *known* capability sets would evaluate an explicit binding's
   unknown hard requirements as `required_capability_unavailable`,
   collapsing UNKNOWN into UNAVAILABLE. Every compile requires an explicit
   observation artifact.
4. **C3 plan ownership (§63):** the plan upgrades to
   `{runDefinition{digest}, bindingResolution{id,digest}}` — Work identity
   rides inside the RunDefinition digest (no duplication, no independent
   drift); the returned RunDefinition/Resolution values remain the single
   authoritative artifacts.
5. **Trusted boundaries (campaign §8/§82):** every trusted input is
   documented as a **trusted API boundary, not an unforgeable capability**;
   no nominal-brand machinery was introduced; trusted-path tests use real
   parser/materializer outputs; raw/trusted pairs are mutually exclusive with
   distinct parse errors.

## 4. Campaign-wide trusted-boundary review (§82)

| Artifact | Raw parser | Trusted producer | Mutual exclusion | "Trusted" meaning | Artifact/ref coherence |
| --- | --- | --- | --- | --- | --- |
| ArchitectureDefinition | `parseArchitectureDefinition` | `materializeArchitectureDefinition` | raw+trusted → `BindingConfigurationError` | trusted API boundary | digest fail-closed at parser; refs derived via `architectureRefOf` |
| BindingDefinition | `parseBindingDefinition` | kernel authoring helper (tests) | raw+trusted → error | trusted API boundary | intent ref derived from the actual definition (kernel BC-03) |
| RunConfiguration | `parseRunConfiguration` | `materializeRunConfiguration` | raw+trusted → error | trusted API boundary | digest fail-closed (only the canonical default is valid) |
| BindingObservationSnapshot | `parseObservationSnapshot` | `materializeObservationSnapshot` | raw+trusted → error | trusted API boundary | digest fail-closed; SnapshotRef derived via `observationRefOf` |
| ProjectIr / grounded artifacts | `parseProjectIr` (existing Work contract) | `buildProjectIr` / controller (existing) | n/a (single trusted artifact boundary at the grounded seam) | existing Work contract | ref derived via `workRefOf` |

No undocumented trust assumption remains.

## 5. Campaign-wide canonicalization review (§83)

- ArchitectureDefinition: membership is a semantic set (sorted, duplicates
  rejected) — `[B,A] ≡ [A,B]` (C0-M02).
- RunConfiguration: single canonical content — identical digest across
  materializations (C1-M02).
- RunDefinition: digest over key-sorted canonical JSON of the four refs;
  binding intent source canonical from the kernel (C1-M05).
- BindingObservationSnapshot: capability sets sorted/deduplicated, candidates
  sorted by point — order permutations produce identical digests (C2-M02/M03/M05).
- Compiled plan: refs only; content deterministic for identical grounded
  inputs (determinism proofs B4 §61 + C3).
No insertion-order dependence exists anywhere.

## 6. Campaign-wide runtime immutability review (§84)

Every artifact — ArchitectureDefinition, RunConfiguration, RunDefinition,
BindingObservationSnapshot, CompiledBindingPlan, BindingResolution — is
top-level frozen, nested-object frozen, array frozen, with caller inputs
detached (per-stage `Object.isFrozen` + `TypeError` + mutate-after proofs).
The B3C2 standard holds with no regression.

## 7. Campaign-wide digest inventory (§85)

| Digest | Domain | Included | Excluded | Identity kind |
| --- | --- | --- | --- | --- |
| Architecture content digest | `palimpsest.architecture-definition.v1` | canonical AgentDefinition membership | architectureDefinitionId, revision, timestamps, runtime/work state | content identity |
| RunConfiguration digest | `palimpsest.run-configuration.v1` | run-scoped specialization (currently `{}`) | nothing else exists | content identity (digest identity, run-scoped) |
| RunDefinition digest | `palimpsest.run-definition.v1` | architecture ref, work ref, binding intent source, runConfiguration digest | snapshot/observation state, runtime state | composite content identity |
| Observation content digest | `palimpsest.binding-observation.v1` | canonical capability facts + candidate availability/capabilities | snapshotId (instance identity) | observation content identity |
| SnapshotRef | `palimpsest.binding-observation-ref.v1` | snapshotId + observation content digest | — | observation-instance identity (verified basis) |
| Binding resolution digest | (B3 kernel, existing) | selections + provenance + snapshot + policy | resolutionId | content identity (unchanged) |

No helper silently redefines another's semantics; all SHA-256/canonical-JSON
choices are implementation choices, not UAS freezes.

## 8. Final grounding matrix (§86)

See §2's last column: **all Binding freshness inputs are derived from owning
semantic artifacts**; Architecture/Work hard requirements remain
intentionally absent (no production owner; passing none is the truthful
state). The final compiler needs no fabricated provenance.

## 9. What "fully grounded" means here (§87/§94)

Every freshness-critical value used by the Binding resolver is derived from an
owning semantic artifact that can answer: *who owns this fact, how was it
canonicalized, and what would make it stale?* It does NOT mean artifacts are
persisted, UI-editable, or bound to runtime agents; PersistentPoint, DSH
runtime attachment, and effect admission remain outside (next campaign:
**G10-D — Runtime Realization & Continuity Grounding**; not started, §101).

## 10. Final verdict

```text
G10-C RUN GROUNDING CAMPAIGN: PASS
```

**Campaign-final canonical gate (§97).** On canonical main `297ffee`:
`git diff --check` clean; unit **71 files / 615 tests passed**; `pnpm build`
and `pnpm build:web` pass; local e2e (`retries = 0`) **21 passed**; remote
canonical-main CI run **34710038956** **success** (first run).

All §99 PASS criteria hold: C0 canonical; Architecture/RunConfiguration/
Snapshot artifact-grounded; RunDefinition implemented as a ref-only
composite; Work provenance from ProjectIr; Binding intent from the
artifact/default; all freshness inputs artifact-derived; no arbitrary
provenance escape hatches in the high-level compiler; plan ref-only;
BindingResolution single-truth; stale/unsatisfied admission rules proven;
legacy Work compiler, TaskSpec, AgentGraph v1, and scheduler unchanged and
pure; no runtime realization; no storage migration; full adversarial review
complete (two in-stage defects found test-first and fixed: C2 candidate
validation, C3 derived-basis policy); canonical main green.
