# G10-S — Opinionated Organization Recipes & Empirical Architecture Advisor (Campaign)

Stage nature: product simplification + empirical advisor + recipe execution. No new ontology; no
arbitrary AgentGraph auto-generation.

| Step | Deliverable |
| --- | --- |
| S0 | Readiness audit + R carry-forward → `audits/G10-S-RECIPE-ADVISOR-ASSESSMENT.md`, `audits/G10-S-R-CARRY-FORWARD-DISPOSITION.md` |
| S1 | Recipe model / registry / compiler / execution → `src/recipes/{artifacts,registry,compiler,execution}.ts` |
| S2 | TaskProfile + capabilities → `src/advisor/task_profile.ts` |
| S3 | OrganizationMemory empirical adapter → `src/advisor/evidence.ts` |
| S4 | Scenario feature annotations + transferability → `src/organization_memory` additive + `src/advisor/transferability.ts` |
| S5 | Advisor eligibility/rationale → `src/advisor/advisor.ts` |
| S6 | RecipeCompiler → `src/recipes/compiler.ts` |
| S7 | Real Explore branch execution seam + DSH adapter → `src/reasoning_cell/branch_execution.ts`, `host/dsh/**` |
| S8/S9 | Focus / Explore / Coordinate flows + capability-gated Verify / Monitor |
| S10 | tools / HTTP / application surfaces |
| S11 | Advisor golden scenarios A–D |
| S12 | Anti-hype / adversarial / backcompat closure |

## Truth ownership (unchanged)

Recipes are versioned immutable product config (no store). The advisor reads OrganizationMemory
read-only and holds no store mutator. `OrganizationMemoryStore` still owns empirical history only.
`ProjectController` stays Work-scoped; MultiGraph stays a derived debugger.

## Red lines held

Recipe ≠ OrganizationDefinition/RuntimeScope/ReasoningCell/Campaign/PeerRef; Recommendation ≠
Proposal/Authority/Truth; RecipePlan ≠ Activation; Coordinate creates no peer and is blocked without an
independent peer; Explore creates no PeerRef/PersistentPoint; a branch cannot admit claims; Verify is not
a truth oracle; Monitor is not a scheduler; no hidden score; no arbitrary graph synthesis.
