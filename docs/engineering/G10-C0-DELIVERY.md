# G10-C0 — Delivery Report

Status: **G10-C0 · MINIMAL ARCHITECTURE IDENTITY REALIZATION · PASS · NOT A NEW FROZEN CONTRACT · NO STORAGE · NO RUNTIME INTEGRATION**

Branch `experiment/g10-c0-minimal-architecture-identity`, from post-B4
canonical `main` `f1c4d2f1f959fe9588f692949eac73d80a9a0181`. Draft PR (not
merged — C0 §88).

## Answers (30)

1. **Was PR #16 corrected for the well-formed-vs-grounded wording?** Yes —
   `WellFormedExplicitProvenance ≠ AuthoritativelyGroundedProvenance` frozen in
   the compiler header/messages (`requireWellFormedRef`) and B4 docs
   (additive amendments). Zero behavior change; B4 gates re-run.
2. **Was PR #16 merged?** Yes — marked ready, merged normally (no squash, no
   force, no bypass).
3. **What is the post-B4 canonical main SHA?** `f1c4d2f1f959fe9588f692949eac73d80a9a0181`
   (PR #16 merge commit `f1c4d2f`; canonical-main CI run `34704036237`
   success). PR #16 final head `1acf66c`, merge commit `f1c4d2f`.
4. **Did a production ArchitectureDefinition already exist before C0?** No —
   verified by inspection on `f1c4d2f` (only the frozen-split doc comment in
   `src/graph/ir.ts`).
5. **What exact ArchitectureDefinition shape was implemented?**
   `{schemaVersion: 1, architectureDefinitionId, revision, digest,
   agentDefinitions: readonly AgentDefinition[]}` — identity/revision/digest +
   canonical membership; empty membership representable; no parent linkage.
6. **What exact AgentDefinition shape was implemented?**
   `{agentDefinitionId}` — one field, deliberately (§14).
7. **Why were no model/tool/memory/context fields added?** C0 realizes the
   frozen semantic entity, not future concerns: AgentDefinition =
   StableArchitectureIdentity at this stage; agent-side semantics remain out
   of scope per PLMP-UAS-0/1.
8. **What is ArchitectureDefinitionId?** A distinct string identity namespace
   owned by the ArchitectureDefinition artifact (`architectureDefinitionId`
   field); never derived from Work identity.
9. **What is AgentDefinitionId?** A distinct string identity namespace owned
   by the AgentDefinition (`agentDefinitionId` field); membership key of the
   owning ArchitectureDefinition.
10. **Can either reuse `TaskSpec.definition_id`?** No — machine-proven
    (namespace firewall, collision adversarial test §52, static firewalls).
11. **Can either reuse ProjectIr.project_id?** No — same evidence.
12. **How is Architecture revision represented?** A safe non-negative integer
    on the artifact; local validation only.
13. **Is revision monotonicity persisted/enforced?** No — documented as a
    future architecture repository/store responsibility (C0 §19); no lineage
    persistence was built.
14. **What semantic content enters the Architecture digest?** Canonical
    AgentDefinition membership (sorted, deduplicated), under the domain
    separator `palimpsest.architecture-definition.v1`.
15. **What does the digest exclude?** `architectureDefinitionId`, revision,
    timestamps, runtime/work state (content-identity semantics — machine-tested).
16. **What canonicalization is performed?** Membership is a semantic set:
    sorted by one shared lexicographic comparator at materialization and
    parsing; duplicates rejected; `[B,A]` ≡ `[A,B]`.
17. **Are duplicate AgentDefinitionIds rejected?** Yes — in both the parser
    and the materializer.
18. **Are Architecture artifacts runtime immutable?** Yes — definition,
    membership array, and every AgentDefinition deep-frozen (B3C2 standard);
    no caller-input aliasing; nested mutation throws.
19. **Does architecture code depend on WorkGraph or TaskSpec?** No — import
    list machine-asserted to be exactly `["../schema/canonical.js"]` (generic
    canonical utility).
20. **Does architecture code depend on Binding?** No — the conversion lives on
    the Binding side (`architectureRefOf`, `architectureSubjectRefsOf` in
    `src/binding/compiler.ts`); reverse firewall machine-proven (Work
    compilation imports no ArchitectureDefinition).
21. **How does Binding obtain its Architecture DefinitionRevisionRef now?**
    Derived from the required ArchitectureDefinition artifact via
    `architectureRefOf` — no caller-invented ref is accepted.
22. **How does Binding obtain its ArchitectureSubjectRefs now?** Derived from
    the artifact's AgentDefinition membership via `architectureSubjectRefsOf`.
23. **Is `ArchitectureSubjectRef ≡ AgentDefinitionId` frozen universally?**
    No — documented precisely: C0's Binding-addressable subjects are the
    AgentDefinitions, derived through the explicit adapter; future subject
    species stay open (C0 §33).
24. **Does Binding compiler still accept an arbitrary caller architecture
    ref?** No — removed (§34/§39/§71; static machine test); exactly one
    raw/trusted ArchitectureDefinition source is required.
25. **Does Binding compiler still accept arbitrary caller subject refs?** No —
    removed together with the ref seam.
26. **Did legacy ProjectProposal→TaskSpec output change?** No — B4-M01
    byte-stability re-proven; `src/architecture/proposal.ts` untouched.
27. **Did TaskSpec schema change?** No — `src/schema/models.ts` untouched.
28. **Did AgentGraph v1 semantics change?** No — `src/graph/ir.ts` untouched.
29. **Which B4 grounding blockers remain?** RunConfiguration digest and
    resolution snapshot (both still not production-grounded, per §63/§64).
    Architecture ref + subjects are now artifact-grounded. Binding live
    integration remains PARTIAL — but for fewer reasons (§93).
30. **What exact next stage is recommended?** `G10-C1 — Minimal RunDefinition /
    RunConfiguration Grounding` (deterministic RunConfiguration digest into a
    RunDefinition-level compile input); snapshot grounding stays `G10-C2` by
    default.

## Gates (§86)

- `git diff --check`: clean.
- Binding-focused: kernel suites unchanged (88) + `binding_compiler` **31**;
  `architecture_definition` **17**.
- Full unit: **67 files / 569 tests passed** (post-B4 baseline 66/542).
- `pnpm build` + `pnpm build:web`: pass.
- Local `pnpm test:e2e` (`retries = 0`): **21 passed** on the clean run, after
  three consecutive documented `E2E-DEBUG-01`/`E2E-RUNTIME-03` flake runs
  (local machine load; C0 touches no UI/runtime code — failures preserved
  honestly, no flake-masking change).
- Remote CI on the actual final HEAD: recorded below.

## Remote CI history

Known `E2E-DEBUG-01`/`E2E-RUNTIME-03` nondeterminism is handled by failed-job
reruns exactly as in prior stages, with every failure preserved. Every pushed
HEAD of this branch has its own green workflow (or a documented rerun); the
tip-at-close workflow is cited in the PR description (an in-repo record always
lags its own commit by one).

- (finalized on the branch once the draft PR's workflows complete.)

## Verdict

```text
ARCHITECTURE IDENTITY REALIZATION: PASS
```
