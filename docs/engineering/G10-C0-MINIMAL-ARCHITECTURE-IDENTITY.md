# G10-C0 — Minimal Architecture Identity Realization

Status: **G10-C0 · MINIMAL ARCHITECTURE IDENTITY · IMPLEMENTATION REALIZATION UNDER PLMP-UAS-1 · NOT A NEW FROZEN CONTRACT · NO STORAGE · NO RUNTIME INTEGRATION**

Branch `experiment/g10-c0-minimal-architecture-identity`, from post-B4
canonical `main` `f1c4d2f1f959fe9588f692949eac73d80a9a0181` (after PR #16
merged normally). Source scope: `src/architecture/definition.ts` (new),
`src/architecture/index.ts` (additive exports), `src/binding/compiler.ts`
(architecture provenance now derived from the artifact),
`src/binding/index.ts` (additive exports), `test/architecture_definition.test.ts`
(new), `test/binding_compiler.test.ts` (updated + extended),
`docs/engineering/**`. Frozen contracts (PLMP-UAS-1, PLMP-BIND-1), the B3
kernel modules, `src/architecture/proposal.ts`, `src/graph/ir.ts`,
`src/schema/models.ts`, the scheduler, and the state/effects layers are
**unmodified**.

---

## 1. Stage 0 — B4 wording correction and canonicalization (done first)

- Frozen distinction recorded in the compiler header, grounding matrix, and
  integration record: `WellFormedExplicitProvenance ≠
  AuthoritativelyGroundedProvenance`. The B4 seam validated structure only; a
  well-formed `DefinitionRevisionRef` carrying e.g. `"fake-architecture"` was
  never recognizable as fake from shape alone.
- Code amendment: `requireRef` → `requireWellFormedRef` + reworded
  messages/docs. Zero behavior change.
- B4 gates re-run (unit 542/542, builds pass, e2e 21/21 locally; remote run
  `34703783070` hit the documented `E2E-DEBUG-01` flake → failed-job rerun →
  green; final HEAD `1acf66c` run `34703957637` first-run green).
- **PR #16 merged normally**: final head `1acf66c`, merge commit `f1c4d2f`,
  post-B4 canonical main `f1c4d2f1f959fe9588f692949eac73d80a9a0181`,
  canonical-main CI run `34704036237` **success** (first run).
- The B4 `PARTIAL` verdict stands unchanged.

## 2. Scope (§3) — what C0 establishes

```text
stable ArchitectureDefinition identity      ArchitectureDefinitionId (distinct namespace)
stable AgentDefinition identity             AgentDefinitionId (distinct namespace)
architecture revision                       local validation: safe integer >= 0
architecture content digest                 SHA-256, domain-separated
strict parser                               unknown fields rejected at every level
canonical representation                    membership is a semantic set
runtime immutability                        deep-frozen (B3C2 standard)
DefinitionRevisionRef adapter               architectureRefOf (binding side)
ArchitectureSubjectRef derivation           architectureSubjectRefsOf (binding side)
```

Identity first. Semantics later.

## 3. Identity model (§13–§18)

```ts
interface AgentDefinition {
  readonly agentDefinitionId: AgentDefinitionId;
}
interface ArchitectureDefinition {
  readonly schemaVersion: 1;
  readonly architectureDefinitionId: ArchitectureDefinitionId;
  readonly revision: ArchitectureRevision;       // safe integer >= 0
  readonly digest: ArchitectureDigest;
  readonly agentDefinitions: readonly AgentDefinition[];
}
```

- **AgentDefinition = StableArchitectureIdentity** at C0 — not
  Persona+Prompt+Model+Tools+Memory+Task. A one-field AgentDefinition is
  intentional (§14): agent-side semantics were frozen out of scope for G10-A
  and gain no fields here. The rejected-field list (§4) is honored: no task,
  role, model, provider, tools, memory, context, instructions, authority,
  PersistentPoint, runtime identity, or workspace fields.
- **No human-facing label** (§15): no name/label/description/metadata — no
  concrete ambiguity requires one.
- **Distinct namespaces** (§16/§17): the fields are named
  `agentDefinitionId`/`architectureDefinitionId` — never `definitionId`
  alone; no alias from `TaskSpec.definition_id`; no derivation from
  `project_id`, AgentGraph ids, or scope ids.
- **String equality is not identity** (§18): `TaskSpec.definition_id =
  "agent-A"` and `AgentDefinitionId = "agent-A"` imply no relation — identity
  semantics come from field/type namespace plus the authoritative owning
  artifact. Machine-tested (C0-M04 behavioral test and the §52 compiler
  collision test).
- **Membership may be empty**: an architecture artifact with zero
  AgentDefinitions is honestly representable; its Binding subject set is then
  the already-adjudicated empty set (B4 grounding matrix §6).
- **Revision** (§19/§20): local validation only; cross-version monotonicity is
  a future architecture repository/store responsibility (documented in the
  module); no `parentRevision`/`parentDigest` — C0 needs a revisioned
  definition artifact, not a lineage chain.

## 4. Canonicalization and digest (§21–§23, §44/§45)

- Membership is a **semantic set**: canonical output is sorted by
  `AgentDefinitionId` (one lexicographic comparator, shared by authoring and
  parsing); duplicates are rejected by both the parser and the materializer.
  `[B, A]` and `[A, B]` produce identical canonical content and digest.
- Digest = SHA-256 over domain-separated canonical JSON content
  (`palimpsest.architecture-definition.v1`) — an **implementation choice,
  not a UAS freeze** (§76), reusing the repository's generic canonical-JSON
  utility (`src/schema/canonical.ts`, the only import of the module).
- Digest content = canonical AgentDefinition membership. Excluded:
  `architectureDefinitionId`, `revision`, timestamps, runtime/work state
  (content-identity semantics). Machine-proven: different membership →
  different digest; same membership with different id/revision → same digest.

## 5. Parser and materializer (§25–§27, §69)

- `parseArchitectureDefinition(raw: unknown)`: `schemaVersion` exactly 1;
  unknown fields rejected at the definition and agent level; non-empty ids;
  safe non-negative revision; the supplied digest must equal the computed
  canonical digest (**fail-closed — never silently replaced**); duplicates
  rejected; membership canonicalized; deep-frozen output. Errors are
  `ArchitectureDefinitionParseError` — distinct from `BindingUnsatisfied`,
  `BindingConfigurationError`, and `BindingParseError` (§74/§75).
- `materializeArchitectureDefinition({architectureDefinitionId, revision,
  agentDefinitionIds})`: validate → canonicalize → compute digest → freeze.
  Does not persist. Authoring and parsing remain distinct disciplines (§27).
- Empty membership is accepted by both (documented decision, §3 above).

## 6. Binding adapter and compiler rewiring (§30–§39, §62/§63/§71/§72)

Dependency direction (§29/§85): `src/architecture/definition.ts` imports only
the generic canonical utility — it does **not** import Binding, WorkGraph,
TaskSpec, or anything Work-semantic, and is machine-audited (import list
asserted to be exactly `["../schema/canonical.js"]`). The conversion lives on
the Binding side:

```text
architectureRefOf(architecture)         → DefinitionRevisionRef (id/revision/digest)
architectureSubjectRefsOf(architecture) → ArchitectureSubjectRef[] (from AgentDefinitionId)
```

The B4 compiler no longer accepts `architecture: DefinitionRevisionRef` or
`participatingArchitectureSubjects: string[]` — the well-formed-but-ungrounded
escape hatch is **removed** (§34/§39/§71; static machine test). Instead the
compiler requires exactly one of:

```text
rawArchitectureDefinition    → parseArchitectureDefinition at the boundary (§36)
trustedArchitectureDefinition → already parser/materializer output (§37)
```

(both simultaneously → `BindingConfigurationError`, §38), then **derives** the
architecture ref and subjects from the artifact. Subject-coverage semantics
are unchanged: an explicit BindingDefinition must still satisfy PF-02 exact
set equality, enforced by the existing kernel — not reimplemented (§43).
Missing/extra subjects, and membership changes between revisions, are
configuration outcomes — never silent repair (drop bindings / auto-create
Case E subjects / reuse task identities are all absent, §47).

Precise claim (§33): it is **not** frozen that `ArchitectureSubjectRef ≡
AgentDefinitionId`. C0's Binding-addressable Architecture subjects are the
AgentDefinitions; their refs are derived through the explicit adapter; future
Architecture schemas may add subject species.

**RunConfiguration firewall (§63)** and **snapshot firewall (§64)**: untouched.
`runConfigurationDigest` and `BindingPlanningSnapshot` remain explicit
caller-supplied inputs; no RunConfiguration type, no PersistentPoint storage,
no provider/tool/workspace realization (§65).

## 7. Firewalls and non-goals held (§5, §24, §41, §42, §52–§59)

- **No architecture-from-Work migration** (§5): no AgentGraph-agent-node →
  AgentDefinition path exists; historical WorkGraph content remains WorkGraph.
- **No edges** (§24): no dependencies/handoffs/delegations/manager relations.
- **Work remains independent** (§41/§42): `workRefOf(ProjectIr)` is unchanged;
  no work/task fields inside ArchitectureDefinition; the
  AgentDefinition ↔ WorkUnit/TaskDefinition relation stays unmodeled.
- Machine-proven firewalls: architecture code imports no Work semantics and
  only the canonical utility (C0-M05, §53/§85); Work compilation
  (`proposal.ts`, `graph/ir.ts`, `schema/models.ts`) imports no
  ArchitectureDefinition (§54); `TaskSpec`/`AgentGraph v1`/Canvas unchanged
  (§55–§58 — no-diff + byte-stability test); no storage/tables/events (§59);
  no CLI/UI surface required (§60).

## 8. Machine proof inventory (§68)

`test/architecture_definition.test.ts` (17) + `test/binding_compiler.test.ts`
(31):

| Proof | Subject |
| --- | --- |
| C0-M01 | strict parsing: valid identity-only input, unknown fields, duplicates, bad version/revision/digest, empty membership (§69) |
| C0-M02 | canonical membership: `[B,A]` ≡ `[A,B]`, stable order (§23) |
| C0-M03 | digest determinism; membership change → different digest; id/revision excluded (§44/§45) |
| C0-M04 | identity namespace firewall: string equality with Work `definition_id` implies no relation; distinct field names (§16–§18) |
| C0-M05 | static firewalls: no Work semantics import; only canonical utility; reverse firewall; purity (§53/§54/§84/§85) |
| C0-M13 | runtime immutability: deep freeze, `TypeError` on nested mutation, no caller-input aliasing (§28/§70) |
| C0-M06 | `architectureRefOf` derivation; provenance carries the artifact ref (§31) |
| C0-M07 | `architectureSubjectRefsOf` derivation from membership only (§32) |
| C0-M08 | arbitrary caller architecture-ref/subject-ref seams removed; raw/trusted discipline; parse-error distinctness (§34–§39/§71/§73/§74) |
| C0-M09 | implicit ephemeral default over the real (non-empty) subject set; empty-architecture case (§48) |
| C0-M10 | explicit A→pin P / B→Case E through the kernel, no Work identity involved (§49) |
| C0-M11 | exact subject coverage: missing-subject and extra-subject rejections (§50/§51) |
| C0-M12 | architecture r1→r2 advance → prior resolution stale via the existing freshness gate; re-resolution carries r2 (§46) |
| C0-M14 / B4-M01 | legacy Work compile byte-stability; no architecture or binding fields in TaskSpec (§55) |
| §52 | Work-ID collision adversarial test: shared string forms no relation; subjects come only from the ArchitectureDefinition |
| §47 | membership change with an old binding → configuration outcome, never silent repair |

## 9. What "production-realized" means here (§61)

C0 claims exactly:

```text
Architecture identity semantic artifact exists in production code
Binding compiler consumes that artifact directly
Binding provenance is derived from artifact identity/revision/digest
Binding subjects are derived from actual AgentDefinition identity
```

C0 does **not** claim: architecture is persisted, UI-editable, automatically
generated, or bound to runtime agents. C0 is an implementation realization
under PLMP-UAS-1 — not PLMP-UAS-2, not a new frozen contract (§77).

## 10. Post-C0 grounding status (§62/§93)

```text
Architecture DefinitionRevisionRef     GROUNDED BY ArchitectureDefinition artifact
ArchitectureSubjectRefs                GROUNDED BY AgentDefinition membership
RunConfiguration digest                still MISSING (not production-grounded)
resolution snapshot                    still MISSING (not production-grounded)
```

Therefore **Binding live integration remains PARTIAL — but for fewer
reasons**. B4's historical PARTIAL verdict is not rewritten (§62); the B4
grounding matrix carries an additive post-C0 status note. Product-level
Binding execution is not live (§94).

## 11. Verdict (§89/§90)

Every PASS condition of §90 holds: ArchitectureDefinition and AgentDefinition
production types exist with distinct namespaces; strict parser; canonical
materializer; deterministic digest; runtime-immutable artifacts; no Work
identity inferred; no task fields embedded; the Binding compiler derives
architecture provenance and subjects from the artifact; the arbitrary caller
seams are removed; legacy Work compilation is unchanged; RunConfiguration and
snapshot remain deferred; no storage/runtime integration was added.

```text
ARCHITECTURE IDENTITY REALIZATION: PASS
```

## 12. Recommended next stage (§95)

```text
G10-C1 — Minimal RunDefinition / RunConfiguration Grounding
```

Goal: ArchitectureDefinition + authoritative Work ref +
BindingDefinition/default + RunConfiguration → a RunDefinition-level compile
input with a deterministic RunConfiguration digest. Snapshot grounding stays
`G10-C2` by default. Per §88: STOP — draft PR open, final-head CI green, no
C1 started.
