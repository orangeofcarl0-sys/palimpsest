# G10-S Product Anti-Hype Audit

Each required question is answered against the actual product surface; any "yes" is either fixed or
explicitly dispositioned. No claim of autonomy that the system does not have.

| # | Question | Answer | Evidence / disposition |
| --- | --- | --- | --- |
| 1 | Does onboarding primarily expose agent count? | **No** | There is no agent-count control anywhere. EXPLORE is parameterised by `branchCount` (default "Auto" = 2) in advanced parameters only; the recipe model has no `agentCount` field. |
| 2 | Does it ask users to design graphs? | **No** | The recipe model is `Plan = Recipe_k(theta)`; `compileRecipePlan` emits a small closed set of steps over existing services. No graph DSL exists; arbitrary graph synthesis is forbidden by tests (S-N01). |
| 3 | Does it imply multi-agent is always smarter? | **No** | The advisor's faithful reading of R says an artificial same-context role split added overhead at equal measured quality, and federation was a non-dominated trade-off, not a universal win. Counter-evidence is surfaced alongside support. |
| 4 | Does it hide coordination cost? | **No** | Recommendations carry `empiricalSupport`, `empiricalCounterEvidence` and `transferabilityWarnings`; federation rationale explicitly shows the observed higher coordination/token overhead. Coordination metrics are labelled `proxy`. |
| 5 | Does it call branches durable agents? | **No** | `ReasoningBranchExecutionPort` documents branches as EPHEMERAL; the DSH adapter creates no durable session, no PeerRef and no PersistentPoint; the Explore E2E asserts zero new PeerRefs/PersistentPoints. |
| 6 | Does it claim unsupported autonomy? | **No** | MONITOR is `PREVIEW_ONLY` (no background condition source); VERIFY states that same-model verification is not independent; recommendations never mutate the organization and cannot create a Dynamics proposal. |
| 7 | Does it call limited evidence "proven"? | **No** | Every `EmpiricalSupport` carries `LIMITED_EMPIRICAL_BASIS` (n=3, single provider/model); quality for REASONING_CELL is `INSUFFICIENT_EMPIRICAL_EVIDENCE`, never 0 and never a tie. |

## Wording discipline

- No `FocusScore`/`ExploreScore`/weighted sum exists; the advisor returns eligibility clauses, plain
  rationale, observed trade-offs, Pareto relations, limitations and unavailable-evidence markers
  (strict parse rejects any injected score/weight/health field).
- MultiGraph remains labelled a debugger ("MultiGraph 调试器") and stays a derived, read-only surface;
  it is not the primary onboarding concept.
- The product narrative is Focus / Explore / Coordinate (+ Verify / Monitor), not an arbitrary
  multi-agent organization builder.

## Honest UI disposition

The primary agent/API surface is complete (tools `palimpsest_recipes` / `palimpsest_advisor` /
`palimpsest_recipe`, HTTP routes, application surfaces). A dedicated mode-selector onboarding panel was
not built in S; MultiGraph already carries debugger wording, and no UI exposes agent count or graph
editing. Building the mode panel (with "Why this mode?") is carried forward as CF-S-01 rather than
claimed as delivered.
