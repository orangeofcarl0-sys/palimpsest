# G10-B4 — Binding Compiler / ExecutionPlan Integration Record

Status: **G10-B4 · BINDING COMPILER SEAM · MINIMAL DERIVED PLAN ARTIFACT · NO STORAGE · NO RUNTIME REALIZATION · NO SCHEDULER CHANGE**

Branch `experiment/g10-b4-binding-compiler-plan-integration`, from canonical
`main` `8ac32ed48f024962ce77cd68903f2950756b7a8f`. Source scope:
`src/binding/compiler.ts` (new), `src/binding/index.ts` (additive exports),
`test/binding_compiler.test.ts` (new), `docs/engineering/**`. Frozen contracts
(`PLMP-UAS-1`, `PLMP-BIND-1`) and the B3 kernel (`src/binding/contract.ts`,
`parser.ts`, `digest.ts`, `resolver.ts`, `freshness.ts`) are **unmodified**.

---

## 1. The actual compile path B4 integrates with (Stage 0)

Full trace in `G10-B4-BINDING-INPUT-GROUNDING.md` §1. Summary:

```text
proposal producers (CLI architect / serve / presets / canvas→IR compile)
  → validateProjectProposal → proposalTaskSpecs → TaskSpec[]
  → controller.start() [ProjectIr rev 0, PROJECT_CREATED]
    or controller.plan() [ProjectIr rev N+1, PROJECT_REVISED, parent chain]
  → Scheduler.decide() (pure) / Scheduler.commit() (persists)
```

The authoritative Work lineage on this path is the `ProjectIr` revision chain
(`project_id` / `revision` / `digest` via `projectIrDigestOf`, with
`parent_revision`/`parent_digest`).

## 2. Identity boundaries (the central B4 invariant)

`WorkIdentity ≠ ArchitectureIdentity`, machine-proven:

- `src/binding/compiler.ts` contains **no** import of `TaskSpec`, `TaskProposal`,
  or `proposalTaskSpecs`, **no** occurrence of `definition_id`, and no
  parameter that accepts a task array (static tests read the comment-stripped
  source and assert all three — `test/binding_compiler.test.ts`, B4-M03).
- The only sanctioned Work-lineage mapping is `workRefOf(project: ProjectIr)`:
  `{definitionId: project.project_id, revision: project.revision, digest: project.digest}`.
  A behavioral test builds a ProjectIr whose task carries
  `definition_id: "node-a"` and asserts the ref contains exactly the project
  lineage fields and never `"node-a"`.
- `participatingArchitectureSubjects` exists only as an explicit caller-supplied
  compiler input (B4 §30): not WorkGraph, not inferred from tasks, not
  persisted, not new canonical architecture truth. It is the typed place where
  a future ArchitectureDefinition producer will supply grounded subjects.

**Architecture identity gate (§8/§73):**

```text
LIVE EXPLICIT BINDING:
DEFERRED — ARCHITECTURE SUBJECT IDENTITY NOT PRODUCTION-REALIZED
```

(plus the missing RunConfiguration digest and resolution snapshot — see §7).

## 3. Minimal plan artifact (§16–§20, §75)

Stage 0 searched production source for `RunDefinition` / `ExecutionPlan` /
`CompiledPlan` / `PlanDefinition`: **none exists** (the only hits are inside
`src/binding/**` itself — the frozen contract's `ExecutionPlanBindingRef` and
the kernel's provenance fields). Per B4 §18, B4 introduces only the smallest
derived, immutable, ref-only, non-persisted plan-side carrier:

```ts
interface CompiledBindingPlan {
  readonly work: DefinitionRevisionRef;              // ProjectIr lineage ref
  readonly bindingResolution: BindingResolutionRef;  // { resolutionId, digest }
}
```

Decisions recorded:

- **EXECUTION PLAN: MINIMAL DERIVED REF-ONLY ARTIFACT INTRODUCED** (§75). It is
  *not* the full UAS ExecutionPlan ontology; no RunDefinition is invented.
- **No second Work truth (§19):** the plan stores the Work *ref* only — no
  TaskSpec[] copy, no ProjectIr content copy.
- **No second Binding truth (§20/§56/§57):** the plan stores
  `resolutionId + digest` only. A structural test asserts the plan's own keys
  are exactly `["bindingResolution", "work"]`, the ref's keys exactly
  `["digest", "resolutionId"]`, and the serialized plan contains no
  `provenance`/`continuity`/`intentSource`/`schemaVersion` — the
  `{bindingResolutionRef, bindingResolution}` double-truth shape is
  structurally unrepresentable.
- **Plan identity (§39):** no durable ExecutionPlanId is invented; the plan is
  an immutable value. No current plan identity/revision exists to reuse.
- **Immutability (§60):** the plan is deep-frozen (`plan`, `plan.work`,
  `plan.bindingResolution` all `Object.isFrozen`), mutation attempts throw
  `TypeError`, and mutating a caller-supplied ref after compile does not reach
  the plan (no aliasing).

## 4. The seam: `compileBindingPlan` (§21, §34, §49)

One explicit high-level pure function; input contains only grounded or
explicitly caller-supplied facts; output is a structured planning result:

```text
validate configuration        → BindingConfigurationError on missing/invalid
                                explicit inputs (never collapsed into
                                unsatisfied, §23)
resolve                       → frozen B3 kernel (resolveBindingCore);
                                no semantic reimplementation (§36)
├─ unsatisfied                → { status: "binding_unsatisfied", result }
│                               NO plan, no task, no event, no attempt (§22)
└─ satisfied
   → freshness gate           → evaluateFreshness against the admission basis
     ├─ stale                 → { status: "stale", resolution } — no plan; the
     │                          pre-materialization semantic result is returned
     │                          (no id is attached to an inadmissible artifact)
     └─ current               → materialize (caller-supplied resolutionId, PF-03)
                                → { status: "planned", plan, resolution }
```

Required explicit inputs (each a named, message-precise configuration error
when absent — §2): `work` ref, `architecture` ref,
`runConfigurationDigest`, `planningSnapshot` (non-empty ref), `resolutionId`.
Optional: `participatingArchitectureSubjects` (defaults to the empty grounded
set — adjudicated in the grounding matrix §6), `architectureHard`/`workHard`
(keys must be participating subjects; no production source exists — pass
none, §13), `rawBindingDefinition` (parsed at this trust boundary via
`parseBindingDefinition`, §37) or `trustedBindingDefinition` (already parsed;
supplying both is a configuration error), `resolverPolicy` (validated by the
kernel's BC-04 rule), `admissionBasis` (§24).

Reused untouched from the kernel: continuity selection, reason ordering,
subject equality, intent coherence, policy validation, digests, freshness
(§36). The compiler adds no new error ontology (§50) — only
`BindingConfigurationError`, `BindingParseError`, `BindingUnsatisfiedReason`,
and `Freshness` are used.

## 5. Pure core / stateful adapter split (§62, §63)

The compile core is pure and deterministic: no clock, no randomness, no
filesystem, no network, no database (static purity test on comment-stripped
source, plus behavioral determinism test — identical inputs yield identical
plan semantic content; `resolutionId` stays outside the resolution digest,
identity ≠ digest). **No stateful adapter is wired in B4**: the live paths
(CLI/serve/`start()`/`plan()`) are untouched and cannot truthfully supply the
missing provenance inputs. The future adapter shape is fixed by this stage's
contract: read ProjectIr/projections → construct grounded compile input (via
`workRefOf` + real architecture/run-configuration/snapshot producers) → call
the pure `compileBindingPlan`. The pure core never reaches into state.

## 6. Scheduler firewall (§25/§26/§64) and legacy compatibility (§27/§28/§65)

- `scheduler.ts` is **byte-unchanged**; `Scheduler.decide()` remains a pure
  read and `commit()` the only persistence point. Binding planning occurs
  before scheduler admission and outside the scheduler by construction — the
  compiler is a planning-time module the scheduler never imports.
- No event schema change (§46), no storage/migration (§45), no Canvas truth
  (§66), no DSH/Ordarium integration (§4 non-goals).
- `proposalTaskSpecs` legacy output is proven byte/structurally unchanged
  (B4-M01 exact deep-equality on a representative proposal covering
  `task_id`, `definition_id`, `depends_on`, `write_paths`,
  `required_artifacts`, `role`, `suggested_skills`, `scope_id`; plus a
  no-binding-leak assertion). The legacy no-binding path maps to
  `implicit_ephemeral_default@1` at the seam (B4-M02); the legacy Work
  compiler (`ProjectProposal → TaskSpec[]`) itself is untouched, satisfying
  "unchanged unless an additive wrapper is explicitly invoked" — no wrapper is
  wired into any live path in B4.

## 7. Live-wiring classification (§73/§74) and B4 invariants (§71)

```text
LIVE EXPLICIT BINDING:     DEFERRED — ARCHITECTURE SUBJECT IDENTITY NOT
                           PRODUCTION-REALIZED (also missing: RunConfiguration
                           digest; resolution snapshot)
LEGACY IMPLICIT BINDING:   COMPILER SEAM READY, LIVE RESOLUTION DEFERRED —
                           missing provenance: Architecture
                           DefinitionRevisionRef (empty grounded subject set is
                           permitted and tested), RunConfiguration digest,
                           resolution snapshot
EXECUTION PLAN:            MINIMAL DERIVED REF-ONLY ARTIFACT INTRODUCED
```

Implementation integration invariants (machine-asserted; not a frozen semantic
contract):

| Invariant | Proof |
| --- | --- |
| B4-INV-01 Work identity is never reinterpreted as Architecture identity | static + behavioral firewall tests (B4-M03) |
| B4-INV-02 BindingResolution is produced only from grounded provenance inputs | required-input configuration errors; no placeholder constructible |
| B4-INV-03 Plan state stores only BindingResolutionRef, never a second full resolution truth | plan structural test (§57) |
| B4-INV-04 BindingUnsatisfied produces no executable plan | `binding_unsatisfied` result has no `plan` (§58) |
| B4-INV-05 Stale BindingResolution is not admissible into a current plan | `stale` result has no `plan`; re-resolution required (§59) |
| B4-INV-06 Rebinding produces a new immutable plan state | P1 frozen/unchanged, P2 references R2 (§44) |
| B4-INV-07 Legacy Work compilation remains unchanged when Binding is not explicitly used | B4-M01 byte-stability + untouched `src/architecture/` |
| B4-INV-08 Binding planning occurs before runtime realization and outside `Scheduler.decide()` | scheduler byte-unchanged; compiler is planning-time-only |

## 8. Machine proof inventory

All in `test/binding_compiler.test.ts` (21 tests; suite 109 binding-focused,
542 full-unit — see the delivery report for exact counts):

| Proof | Test |
| --- | --- |
| B4-M01 legacy compile byte-stability | `B4-M01: legacy proposal compile is structurally unchanged` |
| B4-M02 implicit ephemeral default at the seam | `B4-M02: legacy no-binding resolves under the implicit ephemeral default` + empty-subject adjudication |
| B4-M03 definition_id firewall (§72) | `workRefOf` mapping test + three static firewall tests |
| explicit-binding seam (§55) | raw-boundary parse, trusted variant, Case E satisfied, `requirePersistent` unsatisfied, pin, explicit-without-subjects rejection |
| config invalid ≠ unsatisfied (§23) | missing/placeholder provenance, duplicate subjects, non-participating hard requirements, foreign policy, raw+trusted ambiguity, malformed raw |
| single truth (§56/§57) | plan-shape structural test |
| stale admission / rebinding (§59/§44) | S1→S2 refusal + re-resolution; no pointer mutation |
| immutability (§60) | deep freeze + `TypeError` + no aliasing |
| determinism (§61) | identical inputs → identical output; identity ≠ digest |
| purity (§62) / fixture escape (§35) | static source tests |

## 9. Verdict (§79–§81)

```text
BINDING COMPILER INTEGRATION: PARTIAL — UPSTREAM IDENTITY/PROVENANCE BLOCKER
```

The pure compiler/plan seam works, the frozen kernel integration works, and
all tests pass — but live production cannot truthfully provide three
frozen-contract provenance inputs without semantic invention:

1. **Architecture `DefinitionRevisionRef` + participating
   `ArchitectureSubjectRef`s** — no ArchitectureDefinition/AgentDefinition
   exists (PLMP-UAS-0 froze the split; AgentGraph v1 is task-bearing).
2. **RunConfiguration digest** — no production RunConfiguration identity.
3. **Resolution snapshot** — no PersistentPoint registry or capability
   observation basis exists; only caller-supplied planning adapters.

PARTIAL names the exact missing sources above; PASS was not forced.

## 10. Recommended next stage (§83/§84)

> Terminology amendment (added additively by G10-C0 Stage 0): the B4 compiler
> seam validates explicit provenance inputs **structurally** —
> `WellFormedExplicitProvenance ≠ AuthoritativelyGroundedProvenance`. A
> well-formed `DefinitionRevisionRef` cannot be distinguished from a fabricated
> one by shape alone (e.g. one carrying the string `"fake-architecture"`); no
> behavioral change was made for this amendment — the internal helper is now
> `requireWellFormedRef` and messages/docs state the structural-vs-grounded
> distinction. Authoritative live grounding must come from an upstream
> canonical producer (realized for the Architecture side by G10-C0).

Follow the evidence: the binding plan is blocked on **Architecture identity**,
not on continuity storage. The smallest upstream realization stage is:

```text
Minimal ArchitectureDefinition / AgentDefinition identity realization
```

(a real producer of `ArchitectureDefinitionRevisionRef` +
`participatingArchitectureSubjects`, realizing the split UAS-0 already froze) —
together with the minimal RunConfiguration-digest and planning-snapshot
grounding seams. PersistentPoint storage remains out of scope and would not
unblock the plan (Architecture identity ≠ Continuity locus, §84). Only after
those exist does `G10-B5 — Binding Plan Admission / Runtime-Realization
Boundary` become meaningful.
