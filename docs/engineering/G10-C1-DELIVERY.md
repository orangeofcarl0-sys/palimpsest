# G10-C1 — Delivery Report

Status: **G10-C1 · RUNCONFIGURATION + RUNDEFINITION REALIZATION · COMPLETE · NO SNAPSHOT WORK · NO PERSISTENCE · NOT A FROZEN CONTRACT**

Branch `experiment/g10-c1-run-definition-grounding`, from post-C0 canonical
`main` `637f153594793377acc6a35a80c2ab5f10b6d31d` (PR #17 merged normally;
canonical-main CI run `34706984010` success). Merged normally at stage close.

## Key answers

1. **What closed in C1?** `RunConfiguration digest: MISSING` → **GROUNDED**:
   the compiler now derives the provenance digest from a required
   raw/trusted RunConfiguration artifact; arbitrary caller digest strings are
   removed (C1-M10).
2. **Stage-0 inventory outcome (§14)?** No production field qualifies as
   RunConfiguration-owned (role capacity/stage concurrency = Work-declared
   scheduler facts; model/provider = Runtime-owned/deferred; attempt budgets =
   effect-owned). See `G10-C1-RUN-CONFIGURATION.md` §1.
3. **Minimality decision (§15)?** No field passes the gate question → the
   canonical **default configuration** was implemented (`{schemaVersion: 1,
   digest}`; content = no run-scoped specialization; domain
   `palimpsest.run-configuration.v1`) — a real semantic state, not a
   placeholder.
4. **RunConfiguration identity?** Digest-only (run-scoped); no
   RunConfigurationId/revision — no durable-lineage requirement exists (§18).
5. **RunDefinition shape?** `{schemaVersion, digest, architecture ref, work
   ref, bindingIntentSource, runConfigurationDigest}` — refs-only composite
   (§21–§23); digest-only identity (`RunDefinitionRef { digest }` prepared for
   the C3 plan upgrade); no RunDefinitionId invented.
6. **What does the RunDefinition digest cover?** Architecture ref + work ref +
   binding intent source + runConfiguration digest, domain-separated
   (`palimpsest.run-definition.v1`). No snapshot state (observation ≠
   definition).
7. **Work grounding (§26)?** `materializeRunDefinition` takes the actual
   `ProjectIr` and derives the ref via `workRefOf` — the composite carries no
   caller-invented work ref. The lower-level compiler seam keeps ref inputs
   (generic kernel-adjacent plumbing); the artifact-grounded boundary is the
   composite materializer.
8. **Binding intent (§27)?** Derived via the existing kernel helper
   (`compileBindingIntentSource`): explicit → ref; omitted →
   `implicit_ephemeral_default@1`. No new default ontology.
9. **Immutability?** Deep-frozen composites/configurations; nested
   intent-source binding ref frozen; no caller aliasing (C1-M03 + §28 tests).
10. **Adversarial review (§32)?** All nine attack classes attempted; all
    closed (see `G10-C1-RUN-DEFINITION.md` §8). One test-side finding during
    review (static regex scoped too broadly) fixed in-stage; no
    implementation defects found.
11. **Snapshot untouched (§30)?** Yes — `BindingPlanningSnapshot` and the
    snapshot blocker remain exactly as B4/C0 left them (C2 closes it).
12. **Source scope (§92)?** New: `src/run/{configuration,definition,index}.ts`,
    `src/binding/refs.ts` (adapter extraction), tests
    (`run_configuration`, `run_definition`), docs. Modified:
    `src/binding/compiler.ts` (runconfig seam), `test/binding_compiler.test.ts`.
    **Untouched**: scheduler, state, effects, DSH tools, Canvas, TaskSpec
    schema, AgentGraph, frozen contracts, B3 kernel modules.

## Gates (§89)

- Focused: `run_configuration` (6) + `run_definition` (10) + compiler suite.
- Full unit: **69 files / 587 tests passed** (post-C0 baseline 67/571).
- `pnpm build` + `pnpm build:web`: pass. `git diff --check`: clean.
- Local e2e (`retries = 0`): **21 passed**.
- Remote CI on the actual final HEAD: recorded below; every pushed HEAD has
  its own green workflow (or a documented failed-job rerun).

## Remote CI history

- Implementation HEAD `ea6b4e0` (branch push): run **34708046251** on PR #18 —
  **first-run green** (unit PASS + e2e PASS, no rerun needed).
- The tip-at-close workflow is cited in the PR description (an in-repo record
  always lags its own commit by one).

## Verdict

```text
G10-C1 RUNCONFIGURATION + RUNDEFINITION REALIZATION: COMPLETE
```

Grounding matrix after C1:

```text
Architecture ref          GROUNDED (ArchitectureDefinition artifact)
Architecture subjects     GROUNDED (AgentDefinition membership)
Work ref                  GROUNDED (ProjectIr artifact)
Binding intent            GROUNDED (kernel helper)
RunConfiguration digest   GROUNDED (RunConfiguration artifact)

resolution snapshot       MISSING (C2 closes it)
```

Next: **G10-C2 — Binding observation snapshot grounding** (campaign §35–§55),
run automatically per the campaign execution rule.
