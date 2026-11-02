# PC1 — Architecture decision log

Decisions made inside the already-authorized implementation scope. Each entry states the owner, the boundary, and the change rule. None of these creates a new authority root.

## ADR-PC1-001 — One programme branch at the frozen baseline

- **Decision**: work on `palimpsest-product-convergence-v1` created at `044b080…` (tree `1b7caa1…`); do not rebase onto newer source during the programme.
- **Reason**: the pack fixes the baseline; mixing a moving source into the comparison cohort would invalidate provenance.
- **Change rule**: a new baseline needs a new programme decision and a new branch/cohort.

## ADR-PC1-002 — Tool visibility tiers, not a new registry

- **Decision**: add `toolProfile: "legacy" | "normal" | "expert" | "all"` to the install options. `installPalimpsest` keeps its historical default (`"all"`) for compatibility; the new product entry (`installProduct`) defaults to `"normal"`. Tiering filters tool definitions only; it never changes what a tool executes or what authority it has.
- **Reason**: S02 requires one coherent normal surface without breaking the 9-tool compatibility contract measured by existing tests.
- **Owner**: the install/assembly composition (presentation), not the controller.
- **Change rule**: if a normal-tier tool needs an authority it does not already have, add the authority to the existing owner first; do not widen the tier silently.

## ADR-PC1-003 — Export the result object before recording it

- **Decision**: every report path that records an observed `result_commit` must first make that object readable in the canonical repository's object database (object-only `git fetch` from the attempt world, then `cat-file -e`). Failure refuses the report; no ref or project revision moves.
- **Reason**: the C6-R P1 record shows a full OID that the canonical repository could not resolve; promotion then failed after dispatch and became uncertain. The world port already exists; the legacy report path was the gap.
- **Owner**: `ProjectController.report`, through the existing execution-world port. The export is object availability, not acceptance.
- **Change rule**: do not "fix" this by shortening or rewriting a historical ledger or by making promotion tolerate an unresolvable commit.

## ADR-PC1-004 — Structural evidence predicates are product-produced

- **Decision**: the agent-facing gate may record process predicates (`process_exit_zero`, `tests_pass`, `tests_fail`, `lint_pass`). `write_scope_valid` and `expected_files_exist` are refused on the caller-command path and are produced only from the product's own tree/artifact observation (finish/complete, or the delegated settlement evaluator).
- **Reason**: measured in C6-R P1: `node verify.mjs` (exit 0) was recorded as both structural predicates, and a gate then passed on evidence that did not observe scope or artifacts.
- **Owner**: controller gate/evidence writer; the predicate enum stays for historical replay.
- **Change rule**: a new structural predicate needs a registered producer and a subject digest; a caller string never self-authorizes.

## ADR-PC1-005 — Continuity is a derived facade

- **Decision**: implement `project.summary`, `project.explain`, and `project.contextCapsule` as a read-only facade over the existing ProjectIR/Work, workspace/journal, promotions, verification, and domain-outcome projections. No new store, no cached canonical truth. Caches, if any, are keyed by `(revision, head, digest)` and discarded on mismatch.
- **Reason**: S03 forbids a second truth library and requires basis/source for every standing.
- **Owner**: new `src/project_continuity/` read module; the existing owners remain the only writers.
- **Change rule**: if a fact is not available from an existing owner, report `unknown`/`unavailable`; do not reconstruct it from prose.

## ADR-PC1-006 — Proposal and review are non-authoritative metadata

- **Decision**: a proposal is a digest-addressed artifact recording purpose, sources, basis, action, scope, risk, dependencies, expected artifact, and required role. The review package binds an operator decision to that exact digest and currentness. Approval is applied only through the existing `ProjectIntentAdmissionPort` / Work / Promotion seams. No second ledger.
- **Reason**: S04 requires a usable operator path without inventing approval authority.
- **Owner**: `src/project_review/` (new facade) + existing intent/controller/promotion.
- **Change rule**: a model can create a proposal; only a host-supplied admission decision can apply it.

## ADR-PC1-007 — Business outcome is a projection, not a new enum

- **Decision**: report `executionStatus`, `workAcceptance`, and `businessOutcome` separately. The first two come from existing Work/Promotion state; the third is a domain-contract projection with an explicit evaluator identity and `supported | infeasible | uncertain | contested | partially_fulfilled | unknown`. No new canonical task state is introduced.
- **Reason**: S06 requires a negative investigation to be usable while the business objective stays unmet.
- **Owner**: `src/domain_outcome/` read facade over Work state, evidence, domain contracts, and Journal negatives.
- **Change rule**: never infer business success from file existence, exit 0, or `TASK_SATISFIED`.

## ADR-PC1-008 — Evaluation runners are gated, not faked

- **Decision**: ship deterministic staging/equivalence/analysis machinery for both scenarios, and a live runner that refuses to start without an explicit spend authorization and an isolated supported runtime. With no authorization the live result is `BLOCKED`; deterministic tests never write a "model behavior" verdict.
- **Reason**: S08 and the user instruction forbid manufacturing behavior or comparative value with scripts.
- **Owner**: `scripts/pc1/` + `research-evidence/pc1/`.
- **Change rule**: a provider/model change creates a new cohort; a code change after freeze creates a new freeze; no post-hoc rubric edits.
