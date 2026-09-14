# G10-S Organization Recipes & Empirical Architecture Advisor — Delivery

Baseline: `main @ d1fb28a3daf6f4f2ee3dd1efdb473b911e6d0146`. Ordarium v1.3.1. Host: DSH 0.1.5-rc.2.

## Delivered

| Area | Files |
| --- | --- |
| Recipe model | `src/recipes/artifacts.ts` (RecipeDefinition/RecipePlan/CompiledRecipePlan; digest-derived `planId`), `registry.ts` (5 recipes, honest readiness, no store), `compiler.ts` (transparent steps, no mutation), `execution.ts` (existing services only; ephemeral branches) |
| Advisor | `src/advisor/task_profile.ts` (unknown-aware, provenance, untrusted profiler), `evidence.ts` (EmpiricalSupport, LIMITED basis, INSUFFICIENT marker, faithful R reading), `transferability.ts` (deterministic metadata matching, out-of-distribution warnings), `advisor.ts` (eligibility ≠ preference, no score) |
| Memory annotations | `src/organization_memory/*` additive `ScenarioFeatureAnnotation` + `SCENARIO_ANNOTATED` (append-only, no LWW) |
| Explore execution | `src/reasoning_cell/branch_execution.ts` (host-neutral port + `dshSubprocessBranchExecutionPort`), `host/dsh` `--branch` mode (ephemeral branch agent), `scripts/recipes/explore-e2e.mjs` |
| Product surface | `src/install.ts` (`recipeRegistry`/`knownIndependentPeers`/`verificationCapabilityRef`/`reasoningBranchExecution`; `installed.recipes|advisor|recipeExecution`), `src/application/{surface,http}.ts`, `src/tools/application_tools.ts` (`palimpsest_recipes|palimpsest_advisor|palimpsest_recipe`), `src/advanced.ts` |
| Tests | `test/s_recipes.test.ts` (16), `test/s_advisor.test.ts` (10), `test/s_adversarial.test.ts` (6) |
| Docs | readiness assessment, R disposition, readiness matrix, anti-hype, spec, campaign, carry-forward, this delivery |

## Golden proofs

- **Focus**: a real Work-only install compiles/executes `focus.v1` → `reused_principal`, and no advanced
  surface is conjured.
- **Explore (real host)**: `node scripts/recipes/explore-e2e.mjs` → **2 real DSH ephemeral branch
  executions** over the same frozen brief, structured candidates submitted through the real
  `palimpsest_reasoning` tool, verification + separate epistemic admission ran, frontier advanced to 2
  admitted claims, and **zero new PeerRefs / zero new PersistentPoints** (`.dogfood/g10s-explore-e2e.json`).
- **Coordinate**: reuses the G10-Q production path (two host-backed persistent principals, boundary
  negotiation, explicit commitment decision, cold resume); the recipe only surfaces an existing
  ContactNeed/boundary context and never accepts a commitment or creates a peer.
- **Advisor golden scenarios A–D** produce FOCUS / COORDINATE / EXPLORE / EXPLORE-with-ephemeral-branches
  respectively, with COORDINATE hard-blocked when no independent peer exists.

## Local gates

| Gate | Result |
| --- | --- |
| `pnpm run build` | PASS |
| `pnpm exec vitest run` | PASS — **136 files / 1199 tests** (baseline 133 / 1167) |
| `pnpm run build:web` | PASS |
| `pnpm exec playwright test` | PASS — **24 / 24** |
| `node scripts/recipes/explore-e2e.mjs` | PASS — 2 real branches, 0 new PeerRefs, 0 new PersistentPoints |

## Deviations (honest)

1. No mode-selector onboarding panel; MultiGraph already carries debugger wording and no UI exposes
   agent count (CF-S-01).
2. EXPLORE is `CONDITIONAL` — real branch execution works, but quality transfer is
   `INSUFFICIENT_EMPIRICAL_EVIDENCE` (R had no ReasoningCell quality validator).
3. VERIFY defaults to deterministic only; independent-model/human verifiers are adapters gated by
   `verificationCapabilityRef` (CF-S-02).
4. MONITOR is `PREVIEW_ONLY`: no background condition source / host-wake binding (CF-S-03).
5. No learned retriever; transferability is deterministic metadata matching.
6. The R statistical/provider limits remain and are surfaced as mandatory transferability warnings; S
   does not claim to have solved them.

## Required CI

See the canonical gate recorded after the implementation PR run (filled in the closure commit).
