# G10-C1 — RunDefinition Realization

Status: **G10-C1 · RUNDEFINITION PLANNING COMPOSITE · REFS-ONLY · NO PERSISTENCE · NOT A FROZEN CONTRACT**

## 1. Semantic role (C1 §21)

The frozen UAS composition, realized at reference level:

```text
RunDefinition = ArchitectureDefinition
              + Work representative (ProjectIr)
              + BindingDefinition / implicit default
              + RunConfiguration
```

## 2. Shape (C1 §22)

```ts
interface RunDefinition {
  readonly schemaVersion: 1;
  readonly digest: string;
  readonly architecture: DefinitionRevisionRef;
  readonly work: DefinitionRevisionRef;
  readonly bindingIntentSource: BindingIntentSource;
  readonly runConfigurationDigest: string;
}
```

No RunDefinitionId is invented: **digest-only identity**
(`RunDefinitionRef { digest }` is introduced for the C3 plan upgrade); two
identical composites are the same definition (C1 §22/§64). No parent
revision — the composite is derived, not a lineage store.

## 3. Composite, not a truth store (C1 §23)

The composite holds refs to the owning artifacts, never copies:

```text
RunDefinition ≠ ArchitectureDefinition   (no agentDefinitions content)
RunDefinition ≠ WorkDefinition           (no goal/tasks/TaskSpec content)
RunDefinition ≠ BindingDefinition        (only the intent source ref)
RunDefinition ≠ RunConfiguration         (only the digest)
```

Machine-proven: the serialized composite contains no `goal`, `task_id`,
`depends_on`, `write_paths`, `required_artifacts`, `agentDefinitions`, or
snapshot fields (C1-M04/M11).

## 4. Digest (C1 §24)

```text
domain:   palimpsest.run-definition.v1
content:  { architecture ref, work ref, bindingIntentSource, runConfigurationDigest }
```

Deterministic, domain-separated, canonical JSON (implementation choice, not a
UAS freeze). No runtime/snapshot state belongs in RunDefinition — the
observation snapshot is Runtime/Continuity observation, not Definition
(C2 §36/§74 machine-proves snapshot changes leave the RunDefinition
unchanged). Machine-proofs: C1-M05 (determinism; any input drift → different
digest — architecture revision, membership, work revision, binding intent).

## 5. Materialization from actual artifacts (C1 §25/§26)

`materializeRunDefinition({architecture, work, bindingDefinition?, runConfiguration})`
takes **artifacts** — an `ArchitectureDefinition`, a `ProjectIr`, an optional
trusted (already-parsed) `BindingDefinition` or the implicit default, and a
parsed/materialized `RunConfiguration` — and **derives**:

- `architecture` via `architectureRefOf` (C1-M09),
- `work` via `workRefOf` (C1-M08; ProjectIr is the authoritative Work
  representative — the sanctioned mapping, unchanged from B4),
- `bindingIntentSource` via the existing kernel helper
  `compileBindingIntentSource` — explicit → `BindingDefinitionRef`
  (C1-M06); omitted → `implicit_ephemeral_default@1`, never a synthetic
  definition (C1-M07),
- `runConfigurationDigest` from the artifact.

Adversarial proof: the materializer has **no preconstructed-ref injection
path** — its input accepts artifacts only (static test on the parameter
block, §32). The ref-derivation adapters now live in one place
(`src/binding/refs.ts`, re-exported from the compiler for the established
public surface) so the binding compiler and the run composite cannot diverge.

## 6. Immutability (C1 §28)

Deep-frozen: the composite, both refs, and the binding intent source
(including the nested `binding` ref when explicit) — `TypeError` on nested
mutation; mutating caller artifacts after materialization cannot reach the
composite (no aliasing). No persistence anywhere.

## 7. Machine proofs (C1 §31)

`test/run_definition.test.ts` (10) + `test/run_configuration.test.ts` (6):
C1-M01..M12 all covered — C1-M12 (legacy Work compiler byte-stability) rides
the unchanged B4-M01 proof in `test/binding_compiler.test.ts`. Full unit at
C1 close: 69 files / 587 tests.

## 8. Adversarial review (C1 §32) — outcomes

| Attack | Outcome |
| --- | --- |
| raw/trusted RunConfiguration coherence | raw is always parsed; tampered digest → `RunConfigurationParseError`; both-sources → `BindingConfigurationError` (tested) |
| digest tampering | parser fail-closed (tested) |
| equivalent-content ordering | digest content key-sorted by canonical JSON; intent source canonical from kernel (by construction) |
| nested mutation | frozen composite incl. nested intent-source binding ref; `TypeError` (tested) |
| fake Work/Architecture ref injection | materializer accepts artifacts only — static injection-path proof (tested) |
| fake run-config digest injection | compiler input removed; digest derived (C1-M10, tested) |
| full Architecture/Work copies in RunDefinition | refs-only structural test (tested) |
| Binding ref mismatch | intent source derived from the actual definition via the kernel helper — mismatch unrepresentable |

No unresolved defects.
