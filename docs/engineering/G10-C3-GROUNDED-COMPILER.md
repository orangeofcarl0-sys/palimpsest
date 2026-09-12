# G10-C3 — Fully-Grounded Binding Compiler and Plan Closure

Status: **G10-C3 · FULLY-GROUNDED BINDING PLAN · ARTIFACTS IN → DERIVED PROVENANCE → REF-ONLY PLAN · NO PERSISTENCE · NOT A FROZEN CONTRACT**

## 1. The grounded boundary (§57)

One high-level production planning function, `compileGroundedBindingPlan`
(`src/binding/grounded.ts`):

```ts
compileGroundedBindingPlan({
  architecture,        // ArchitectureDefinition artifact
  work,                // ProjectIr (authoritative Work artifact)
  rawBindingDefinition? | trustedBindingDefinition?,
  runConfiguration,    // RunConfiguration artifact
  observationSnapshot, // BindingObservationSnapshot artifact
  resolutionId,        // artifact-layer allocation input (PF-03)
})
→
  { status: "planned", runDefinition, resolution, plan }
  | { status: "binding_unsatisfied", result }
  | { status: "stale", resolution }
```

Every Binding freshness input is derived from the owning artifact:

| Provenance input | Derived from | Adapter |
| --- | --- | --- |
| Architecture ref | ArchitectureDefinition | `architectureRefOf` |
| participating subjects | AgentDefinition membership | kernel (via the compiler seam) |
| Work ref | ProjectIr | `workRefOf` |
| Binding intent | BindingDefinition / implicit default | kernel `compileBindingIntentSource` |
| RunConfiguration digest | RunConfiguration | artifact digest |
| SnapshotRef | BindingObservationSnapshot | `observationRefOf` |
| resolver policy | actual kernel policy | `MINIMAL_RESOLVER_POLICY` (no caller claim) |

The caller supplies **semantic artifacts, never derived provenance strings**.

## 2. Escape hatches removed from the high-level boundary (§58)

The grounded input exposes NO independent architecture/work refs, no subject
list, no run-configuration digest string, no SnapshotRef, no admission
`FreshnessBasis`, no resolver-policy claim, and no arbitrary
Architecture/Work hard-requirement maps. Architecture/Work hard requirements
have no production semantic owner, so the grounded compiler passes none (§59);
an explicit BindingDefinition's own hard requirements remain valid. The
lower-level `compileBindingPlan` stays generic ref-level kernel plumbing
(explicitly NOT the production planning boundary); the kernel itself is
untouched. Machine-proven (C3-M02..M07 static input-block audit).

## 3. RunDefinition becomes the planning composite (§61–§66)

One RunDefinition is materialized from the artifacts **before** resolution;
the planned result returns it as the authoritative composite together with
the authoritative resolution, while the plan stores refs only:

```ts
interface CompiledBindingPlan {
  readonly runDefinition: RunDefinitionRef;       // { digest } — no id invented
  readonly bindingResolution: BindingResolutionRef; // { resolutionId, digest }
}
```

This supersedes B4's `{work, bindingResolution}` shape: the Work ref lives
inside the RunDefinition digest content, so Work staleness is detectable
through the ref without the plan duplicating Work identity (ownership review
per §63 — no independent drift is possible; coherence machine-proven,
C3-M08: materialized composite digest == plan ref == resolution provenance on
every definition input, and the snapshot is absent from the RunDefinition).
The plan-level ref-only rule and no-second-truth rules carry over unchanged
(§65; C3-M09).

## 4. Grounded freshness admission (§68/§69)

No arbitrary admission basis is exposed:

- `evaluateGroundedResolutionFreshness(resolution, current: GroundedPlanningState)`
  derives the kernel freshness basis internally from the CURRENT artifacts
  (reusing `compileBindingIntentSource`, `observationRefOf`, and the kernel
  `evaluateFreshness`). A caller-written basis cannot lie about current state.
- `evaluateGroundedPlanFreshness(plan, resolution, current)` adds the plan's
  RunDefinition-ref check (definition drift) on top of resolution freshness
  (observation drift).

In-stage defect (campaign §2/§3, recorded honestly): the first derivation
omitted the resolver policy from the basis, so same-state admission was
"stale" — caught test-first by the C3 suite and fixed by deriving the basis
with the actual kernel policy. No unresolved defects.

## 5. Machine proofs (§80)

`test/binding_grounded.test.ts` (15) — with C3-M19 riding the carried B4-M01
proof and C3-M20 riding the no-diff scheduler + green scheduler suite:

| Proof | Subject |
| --- | --- |
| C3-M01/M08 | artifact-derived provenance; RunDefinition coherence (composite == plan ref == provenance) |
| C3-M02..M07 | static input-block audit: artifacts only, no escape hatches (incl. policy/hard-maps/admission-basis) |
| C3-M09 | plan ref-only ownership (shape + forbidden content) |
| C3-M10 | unsatisfied → no plan (frozen result) |
| C3-M11 | stale → no current plan via grounded freshness evaluation |
| C3-M12/§71 | architecture revision freshness; membership-change configuration outcome |
| C3-M13/§72 | work revision freshness; no task-id reinterpretation |
| C3-M14/§75 | binding revision freshness; no in-place retarget |
| C3-M15/§73 | run-configuration freshness meaning: digest freshness-live in RunDefinition + provenance + kernel gate; with default-only configuration RC1 == RC2 and a second valid configuration is unconstructible (honestly stated) |
| C3-M16 | same-state admission current (derived basis == provenance, policy included) |
| C3-M17 | rebinding immutability (P1/R1/RD1 byte-stable, frozen) |
| C3-M18/§76 | legacy implicit default grounded over real Architecture subjects |
| C3-M19/§77 | Work compiler non-regression (byte-stable, no grounding fields in TaskSpec) |
| C3-M20/§78 | scheduler purity/non-regression (no-diff; suite green) |
| red team §81 | fabricated RunConfiguration rejected by its parser; trusted boundary documented as trusted API (not unforgeable) |

## 6. End-to-end rebinding (§70)

RD1 + S1 → R1 → P1; current snapshot S2 → R1 stale AND P1 stale (grounded
admission), RunDefinition digest unchanged (snapshot ≠ definition); re-resolve
→ R2 → P2 with a new resolution ref; P1/R1/RD1 frozen and byte-stable
throughout. Architecture, Work, and Binding drift each produce a NEW
RunDefinition digest plus resolution staleness (§71/§72/§75) — no hidden
in-place retarget, no auto-healing.
