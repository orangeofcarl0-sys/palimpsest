# G10-B4 — Binding Input Grounding Matrix

Stage 0 of the Binding Compiler / ExecutionPlan Integration. Every claim below
was verified against source on canonical `main` `8ac32ed48f024962ce77cd68903f2950756b7a8f`
by reading the code, not the docs. Nothing in this stage modified production
behavior; the matrix is the evidence base for the B4 integration decision.

---

## 1. The actual production compile path (§6)

Traced end to end on `main@8ac32ed`:

```text
Producer faces (all converge on one proposal face)
  ├─ CLI `architect` command            src/cli.ts:347-403
  │    presetDraft(--preset)            trusted kernel producer (presets.ts)
  │    parseProjectProposal(JSON file)  untrusted strict input (proposal.ts:175)
  ├─ serve declarations                 src/serve.ts:290-330, 406-462
  │    parseProjectProposal(body)       /api/proposal/*, /api/projects/*/declare
  │    canvasCompile(doc)               /api/canvas/compile (src/canvas/compile.ts:25)
  └─ AgentGraph IR                      src/graph/ir.ts
       parseAgentGraph → compileAgentGraph(graph) → ProjectProposal
       definitionId = agent node id (ir.ts:450-453)

Shared validation + compile
  validateProjectProposal(proposal, {knownGateIds})   src/architecture/proposal.ts:199
  proposalTaskSpecs(proposal) → TaskSpec[]            src/architecture/proposal.ts:334-350
      deterministic task ids `task-<n>` in declaration order
      definition_id passes through verbatim when present (proposal.ts:348)

Declaration (the only write channels)
  controller.start({projectId, goal, tasks})          src/tools/controller.ts:470-517
      buildProjectIr(...) revision 0 → PROJECT_CREATED event (payload.project_ir)
      genesis role table + declared stage graph; scheduler.registerTask per task
  controller.plan({tasks, changeClass, changedIds})   src/tools/controller.ts:589-647
      revision N+1 with parent_revision/parent_digest chain → PROJECT_REVISED

Scheduling (downstream of declaration; unchanged by B4)
  Scheduler.decide()  pure read → prepared event      src/scheduler/scheduler.ts:170
  Scheduler.commit(decision)  persists                src/scheduler/scheduler.ts:346
  controller.preview()  non-mutating decide()         src/tools/controller.ts:739-757
```

Key structural fact: **AgentGraph v1 is WorkGraph/task-bearing.** The IR's own
header (src/graph/ir.ts:14-18) states that the `agent` node kind is a
task-bearing node, that the **AgentDefinition / TaskDefinition split is frozen
for G10-A**, and that agent-side semantics (instructions/model policy/tools/
memory/context policy) "have no fields yet". `AgentTaskPayload` (ir.ts:74-80)
carries only task fields. There is no Architecture definition anywhere in
production.

## 2. Input inventory (§7 — mandatory table)

For every PLMP-BIND-1 resolution input:

| Required Binding input | Current authoritative source | Exact identity/digest | Status |
| --- | --- | --- | --- |
| Architecture DefinitionRevisionRef | **none** — no ArchitectureDefinition / AgentDefinition exists (PLMP-UAS-0 split frozen for G10-A; `AgentTaskPayload` is task-only) | — | **MISSING** |
| Work DefinitionRevisionRef | `ProjectIr` (src/schema/models.ts:451-467) — `project_id` + `revision` + `digest` via `projectIrDigestOf` (canonical digest over the whole IR incl. TaskSpec[]), with `parent_revision`/`parent_digest` chain | `project.project_id @ revision N / digest` | **GROUNDED** |
| participating ArchitectureSubjectRefs | **none** — there is no architecture identity to enumerate | — | **MISSING** |
| explicit BindingDefinition | kernel parser `parseBindingDefinition` (src/binding/parser.ts) — **caller-supplied only**; no production producer, store, or transport exists | `bindingDefinitionId @ revision / digest` (domain-separated canonical digest) | GROUNDED (kernel; caller-supplied) |
| implicit default | kernel `compileBindingIntentSource(undefined)` → `implicit_ephemeral_default@1` | `semanticVersion: 1` | GROUNDED |
| RunConfiguration digest | **none** — no RunConfiguration type, digest, or canonical representation exists anywhere in production (`grep RunConfiguration` hits only `src/binding/**`) | — | **MISSING** |
| resolution snapshot | **none** — `ResolverSnapshot` is a declared spike fixture; no PersistentPoint registry, no capability observation basis, no durable-candidate source exists | `SnapshotRef.ref` | **MISSING** (caller-supplied planning adapter only) |
| resolver policy | kernel `MINIMAL_RESOLVER_POLICY` | `minimal.lexicographic@1` | GROUNDED |
| Architecture hard requirements | **none** — see §5 firewall | — | **MISSING** (correctly absent → pass none) |
| Work hard requirements | **none** — see §5 firewall | — | **MISSING** (correctly absent → pass none) |

## 3. Architecture identity gate (§8)

> Does current production Palimpsest have a real ArchitectureDefinition /
> AgentDefinition identity that can serve as `ArchitectureSubjectRef`?

**No.** Not counted (per §8): `TaskSpec.definition_id` (the AgentGraph node id —
work/task lineage), `task_id`, `scope_id` (runtime-subgraph membership),
`role` (slot/concurrency role), Canvas node keys, `WorkGraph` node ids. None of
these is architecture identity, and none of their producers claims to be.

```text
ARCHITECTURE SUBJECT IDENTITY: NOT YET PRODUCTION-REALIZED
```

This is not a failure of PLMP-BIND-1; it is the exact upstream gap UAS-0 froze
for a later stage.

## 4. `definition_id` firewall (§9) and Work identity gate (§10)

**Firewall (§9).** The chain is machine-verifiable and unchanged:

```text
TaskProposal.definitionId (proposal.ts:33)
  → proposalTaskSpecs (proposal.ts:348: definition_id passthrough)
  → TaskSpec.definition_id (models.ts:274-278: "the AgentGraph node id this
    task was compiled from; task_id remains the runtime entity id")
```

`definition_id` is Work/Task lineage. The B4 compiler seam (Stage 2) is
machine-proven never to feed it to `ArchitectureSubjectRef`: the compiler does
not import `TaskSpec`/`TaskProposal`/`proposalTaskSpecs`, has no field that
accepts a task array, and never derives subjects (regression tests
B4-M01/B4-M03 in `test/binding_compiler.test.ts`).

**Work identity (§10).** The current production representative of the UAS Work
dimension is the `ProjectIr` revision chain: `project_id` (work identity),
`revision` (work revision, monotonic via `parent_revision`), `digest`
(`projectIrDigestOf`, canonical digest over goal/requirements/decisions/
TaskSpec[]/head_commit). No new WorkDefinition object is invented; the exact
sanctioned mapping (used by the B4 seam and its tests) is:

```text
work ref = { definitionId: project.project_id, revision: project.revision, digest: project.digest }
```

`TaskSpec[]` is content inside ProjectIr, not a separate lineage; the plan
artifact stores the ref only (no content copy).

## 5. RunConfiguration gate (§11), Snapshot gate (§12), hard-requirement ownership (§13)

**RunConfiguration (§11).** No production `RunConfiguration` identity or
deterministic digest exists. Therefore B4 does **not** invent a persisted
RunConfiguration and does **not** hash arbitrary local options. The accepted
B4 outcome is: the compiler seam accepts a **caller-supplied deterministic
RunConfiguration digest** as a required grounded input; no live path can
supply it today, so live resolution is deferred on this input (§74).

**Snapshot (§12).** The B3 kernel consumes an immutable observation basis
(`ResolverSnapshot` — spike fixture). B4 implements no PersistentPoint storage
and no global discovery. The only valid source is an explicitly **caller-
supplied planning snapshot** (documented adapter semantics: an ephemeral
capability profile plus optional durable candidates, read-only). Test usage is
fixture snapshots; live usage is deferred until a real observation basis exists.

**Hard requirements (§13).** No automatic derivation is performed. Absent an
explicit semantic contract, none of the following is reinterpreted:

```text
suggested_skills ≠ toolCapabilities     role ≠ runtime capability
write_paths ≠ workspace locality        required_artifacts ≠ runtime feature
scope_id ≠ PersistentPoint
```

The seam accepts explicit caller-supplied Architecture/Work hard requirements
(typed, subject-keyed) so a future contract has a place to ground them, but
passes **none** by default and no production path supplies any today.

## 6. Empty-subject adjudication (§32 — tested, not assumed)

Question: with the implicit ephemeral default and an **empty** grounded subject
set, is a resolution permitted by the frozen kernel/contract?

Tested facts (machine-asserted in `test/binding_compiler.test.ts`):

- `validateSubjectCoverage([], {bindings:{}})` passes — both coverage loops are
  vacuous. PF-02's ≥1-subject rule applies to **explicit** definitions (parser
  rejects an empty explicit map); the implicit default's totality is validated
  against the participating set and is vacuously satisfied when that set is
  empty.
- `resolveBindingCore` with zero participating subjects returns a satisfied
  resolution with `continuity: {}` — a trivially-satisfied implicit resolution.

PLMP-BIND-1 is therefore **not ambiguous**: an empty grounded subject set under
the implicit default is representable. It is nevertheless unreachable in the
live legacy path, because the frozen provenance also requires
`architecture: DefinitionRevisionRef`, `runConfigurationDigest`, and a
snapshot ref — none of which production can supply truthfully. No hidden fake
architecture subject is introduced.

## 7. Stage-0 verdict (§14)

```text
B4 INPUT GROUNDING: PARTIAL
```

> Terminology amendment (added additively by G10-C0 Stage 0; the verdict above
> is unchanged):
>
> ```text
> WellFormedExplicitProvenance ≠ AuthoritativelyGroundedProvenance
> ```
>
> The B4 compiler seam validates explicit provenance inputs **structurally**
> (well-formed `DefinitionRevisionRef` shape, non-empty required inputs). It
> cannot recognize a well-formed but fabricated value (e.g. a ref carrying the
> string `"fake-architecture"`) as fake from its shape alone. Authoritative
> live grounding must come from an upstream canonical producer — which is
> exactly why the matrix above still records the architecture/run-configuration/
> snapshot rows as MISSING and why live resolution stays deferred.

The kernel can be integrated behind an explicit compiler seam (Work ref,
intent sources, and resolver policy are grounded; the seam's input contract is
definable truthfully), but **no current live path can truthfully produce all
frozen provenance inputs**:

- Architecture `DefinitionRevisionRef` — no production source (§3)
- participating `ArchitectureSubjectRef`s — no production source (§3)
- RunConfiguration digest — no production source (§5)
- resolution snapshot — no production source (§5; caller-supplied adapter only)

Forcing COMPLETE would require inventing provenance (§2 forbids). BLOCKED does
not apply: the frozen semantics represent every needed input; the missing
facts are upstream production gaps, not contract contradictions.

## 8. Post-G10-C0 status (added additively by G10-C0; §62/§93)

```text
Architecture DefinitionRevisionRef     GROUNDED BY ArchitectureDefinition artifact
ArchitectureSubjectRefs                GROUNDED BY AgentDefinition membership
RunConfiguration digest                still MISSING (not production-grounded)
resolution snapshot                    still MISSING (not production-grounded)
```

The compiler seam now derives architecture provenance and subjects from an
actual ArchitectureDefinition artifact (raw/trusted) — the arbitrary
caller-supplied architecture ref and subject list were removed. Binding live
integration remains PARTIAL, but for fewer reasons. The original §7 verdict
above is B4's historical record and is not rewritten.

## 9. G10-C campaign closure (added additively at campaign end; §96)

```text
C0 closed Architecture provenance        (ArchitectureDefinition artifact)
C1 closed RunConfiguration provenance    (RunConfiguration artifact)
C2 closed Snapshot provenance            (BindingObservationSnapshot artifact)
C3 closed compiler grounding             (compileGroundedBindingPlan: artifacts in,
                                          derived provenance, ref-only plan
                                          {runDefinitionRef, resolutionRef})
```

Every freshness-critical Binding input is now derived from an owning semantic
artifact; the high-level planning boundary exposes no caller-invented
provenance. History: the §7 PARTIAL verdict and §8's intermediate status are
preserved as written. Final state: `G10-C-RUN-GROUNDING-CAMPAIGN.md` (§2/§8).
