# G10-B3 — Minimal Binding Compiler / Resolver Spike

Status: **G10-B3 · MINIMAL BINDING COMPILER / RESOLVER SPIKE · IMPLEMENTATION VALIDATION · NO STORAGE · NO RUNTIME INTEGRATION · NO PERSISTENTPOINT IMPLEMENTATION · NO DSH/ORDARIUM CHANGE**

Stage 0 record: `G10-B3-CANONICAL-PUBLICATION.md` (PLMP-BIND-1 canonically
published at `main` `7643c77` after the PF-01…PF-04 adequacy closures). This
document covers Stage 1 (implementation) and Stage 2 (verification).

## 1. Implementation boundary

Implemented exactly the frozen core and nothing else:

```text
src/binding/
  contract.ts    frozen core types (PLMP-BIND-1 §3 equivalents)
  digest.ts      stable canonical JSON + SHA-256 digests with domain separation
  parser.ts      strict parse/validate of BindingDefinition; subject-coverage check
  resolver.ts    intent compilation + pure deterministic resolver + materialization
  freshness.ts   current/stale validation over the provenance basis
  index.ts       frozen-contract public surface
test/
  binding_parser.test.ts
  binding_digest.test.ts
  binding_resolver.test.ts
  binding_freshness.test.ts
  binding_helpers.ts   (authoring helper + spike fixtures; creation ≠ validation)
```

No runtime wiring: the kernel is reachable only through explicit module imports
and unit tests. It is not imported by scheduler, serve, CLI, DSH tools, effects,
canvas, projector, or database code. Deferred contract extensions
(provider/model/tool/workspace selections, RunConfiguration binding delta,
negative constraints, cost/latency preferences) are **absent**, and there is no
`Record<string, unknown>` escape hatch.

## 2. Contract mapping

- **Types** (`contract.ts`) mirror PLMP-BIND-1 §3 one-for-one, including the
  presence-only continuity flags (`requirePersistent?: true`), the CANDIDATE
  future identities (`ArchitectureSubjectRef`, `DurableContinuityRef`), and
  `DefinitionRevisionRef` carrying lineage identity.
- **Parser** (`parser.ts`) implements PLMP-BIND-1 §10 obligations: unknown-field
  rejection at every frozen level, `schemaVersion` exactly 1, non-negative safe
  integer revision, ≥1 subject entry, ≥1 of continuity/hard per subject,
  presence-only continuity with at most one field (PF-05 states of §5), semantic
  sets rejecting duplicates, present `continuity: {}` preserved as canonical
  Case E while present-but-empty `hard` normalizes to absent (PF-01), explicit
  subject-coverage validation (PF-02), and fail-closed digest validation
  (provided digest must equal the computed canonical digest). Monotonic lineage
  enforcement of revisions is documented as a future repository/store
  responsibility — the parser validates local shape only.
- **Canonicalization + digest** (`digest.ts`): one canonical content builder per
  digest category (subject-keyed intent for definitions; selections +
  provenance/snapshot/policy for resolutions), key-sorted maps, sorted semantic
  sets, identity/revision/resolutionId excluded exactly as PLMP-BIND-1 §8
  requires. SHA-256 is a **B3 implementation choice**, not a contract amendment;
  the algorithm is hidden behind this module and domain-separated
  (`palimpsest.binding-definition.v1` / `palimpsest.binding-resolution.v1`).
- **Intent compilation** (`resolver.ts`): `undefined` explicit definition ⇒
  `{kind:"implicit_ephemeral_default", semanticVersion:1}`; an explicit
  definition compiles to its exact `{id, revision, digest}` ref (§45/§46).
- **Pure resolver** (`resolveBindingCore`): merges Architecture + Work + Binding
  hard requirements per subject (union of requirements ⇒ intersection of
  admissible candidates), then applies the frozen continuity semantics and
  reason order — pin (unavailable/incompatible) → capability satisfiability →
  persistent matching. Case E resolves against **ephemeral candidates only**
  (PF-04): a subject is never made durable merely because a point exists.
  Deterministic tie-breaking is lexicographic by canonical `DurableContinuityRef`
  under the spike policy `minimal.lexicographic@1` — an implementation choice,
  recorded as provenance, not a frozen universal policy.
- **Materialization** (`materializeResolutionResult`): separates artifact
  identity from semantic resolution (PF-03) — the caller supplies the opaque
  `resolutionId`; the resolution digest covers selections, provenance refs,
  snapshot identity, and policy identity, and **excludes** `resolutionId`.
  Unsatisfied results carry no id. `resolutionId ≠ digest` is preserved.
- **Freshness** (`freshness.ts`): pure `evaluateFreshness(result, basis)` →
  `current | stale` by comparing every provenance input (architecture, work,
  intent source, run-configuration digest, snapshot ref, resolver policy). The
  result is never mutated and never converted to unsatisfied; validation applies
  to satisfied and unsatisfied results alike (BIND1-INV-12 orthogonality).

## 3. Snapshot fixture (§51/§52)

The spike catalog is a plain fixture, **not** PersistentPoint storage:
`{ ref, ephemeralCapabilities, persistentCandidates[] }` where a candidate is
only `{ point, available, runtimeFeatures?, toolCapabilities? }`. The ephemeral
profile exists so the resolver can answer "can this subject run ephemerally
while satisfying the hard requirements?" — it does not represent a RuntimeAgent.
Snapshot ref is treated as an opaque provenance identity (supplied by fixtures;
not frozen whether it is computed). The resolver never mutates the snapshot and
has no code path that creates/allocates/promotes/registers a durable point.

## 4. Machine-proof table (§85)

| Proof | Statement | Test |
|---|---|---|
| B3-M01 | legacy no-binding ⇒ implicit ephemeral default source, ephemeral resolution, no fake definition/point | `binding_resolver` "legacy implicit default" |
| B3-M02 | explicit `continuity:{}` subject parses, survives canonicalization, resolves ephemerally | `binding_parser` PF-01 cases; `binding_resolver` "explicit Case E" |
| B3-M03 | invalid/redundant continuity states rejected (`false` flags, multi-field) | `binding_parser` "continuity canonical states" |
| B3-M04 | digest invariant to map/subject and set ordering | `binding_digest` ordering tests |
| B3-M05 | definition digest excludes lineage id/revision; changes on semantic change; explicit Case E ≠ subject absence | `binding_digest` |
| B3-M06 | pin semantics: exact-P selection; unavailable/incompatible reasons; no fallback | `binding_resolver` pin cases |
| B3-M07 | require semantics: deterministic selection; `no_matching_persistent_point` vs `required_capability_unavailable` | `binding_resolver` require cases |
| B3-M08 | prefer semantics: durable preferred, ephemeral fallback valid | `binding_resolver` prefer cases |
| B3-M09 | Architecture+Work+Binding hard requirements merged per subject; never copied back | `binding_resolver` capability-merge cases |
| B3-M10 | same inputs ⇒ same satisfiability/selections/digest; caller ids outside the digest | `binding_resolver` determinism |
| B3-M11 | `Current ≠ Stale` per provenance input, for satisfied **and** unsatisfied results | `binding_freshness` |
| B3-M12 | rebinding ⇒ new resolution + new plan-state fixture; nothing mutated | `binding_freshness` rebinding |
| B3-M13 | no runtime identity in kernel output | `binding_resolver` "no runtime identity fields" |
| B3-M14 | snapshot read-only; no point creation path | `binding_resolver` snapshot-immutability; purity audit |

Parser tests additionally cover: unknown-field rejection at definition/subject/
continuity/hard levels, duplicate semantic-set values, malformed revisions,
zero-subject definitions, meaningless empty entries, digest tampering, and
PF-02 coverage failures (`BindingConfigurationError` before resolution).

## 5. Audits (§86–§89)

- **Purity:** `src/binding/` references only `node:crypto` beyond pure code —
  no `Date`, `Math.random`, `randomUUID`, `fs`, `fetch`, `child_process`,
  database, Ordarium, or DSH usage.
- **Import boundary:** no dependency on `src/scheduler`, `src/effects`,
  `src/state`, `src/tools`; only self-imports within `src/binding/`.
- **Runtime identity:** no `agentId`/`sessionId`/`callId`/`attemptId`/`peerRef`
  anywhere in `src/binding/`.
- **Authority:** no authority/permission/grant/ownership/manager/commitment
  semantics; the only match is the firewall documentation comment in
  `contract.ts`.

## 6. Known deferred features

Everything PLMP-BIND-1 defers stays deferred: provider/model selections, tool
implementation selection, workspace locality vocabulary, RunConfiguration
binding-delta shape, negative constraints, cost/latency preferences,
PersistentPoint identity scheme and store, resolver-policy framework, monotonic
revision enforcement (store responsibility), and any runtime/ExecutionPlan
integration.

## 7. Verdict

The frozen contract was implemented as a small deterministic
parser/canonicalizer/digest/resolver kernel with **no semantic invention**: all
56 focused machine tests pass, all audits are clean, and no test required a
behavior absent from PLMP-BIND-1.

```text
BINDING IMPLEMENTATION SPIKE: PASS
```

Recommended next stage (not started): **A — G10-B4 Binding compiler /
ExecutionPlan integration** (integrate the frozen kernel into RunDefinition
compilation, keeping PersistentPoint storage/runtime out).
