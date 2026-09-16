# UX-A — Interaction gap assessment (UX-A0)

Baseline: `437d1c9a6e1dc9a9ff36754096aaad98e787a184` (canonical main after G10-AE-R).
Stage: `UX-A — One-Request Local Multi-Agent Collaboration` (product track).
Spec: `SPEC-PROMPT-UX-A.md` §5 mandates this audit; **no code was written before it.**

Method: read every listed module at the baseline, quote the real signatures and the
real payload shapes, and reproduce the current path end to end
(`scripts/recipes/explore-e2e.mjs` is the existing hand-assembled Explore harness).
`src/interaction/` does not exist; neither does `docs/product/`. Both §40 and §41 are
greenfield at this commit.

---

## 1. How many application calls does the current path require?

**Five round trips minimum through the surface/tools, seven to eight through the DSH
path — and the caller must hold three intermediate artifacts and two ids.**

```text
 1  advisor.profile({ task, values })          -> TaskProfile            (held by caller)
 2  advisor.recommend({ taskProfile, userRequestedMultiAgent })
                                               -> ArchitectureRecommendation
                                                  .recommendedPlan: RecipePlan   (held by caller)
 3  recipeExecution.compile(plan)              -> CompiledRecipePlan     (held by caller)
 4  recipeExecution.start(compiled, ctx)       -> RecipeExecutionOutcome
                                                  { status: "explored",
                                                    cellId, branchIds, admittedClaimIds, ... }
 5  reasoning.frontier(cellId)                 -> ReasoningFrontierView  (the CONTENT lives here)
 6  recipeExecution.compile(verifyPlan)        } only if the caller wants CHECK:
 7  recipeExecution.start(verifyCompiled)      } a SECOND plan the caller must assemble
```

Evidence: `src/application/surface.ts:431-435` (`AdvisorApplicationSurface`),
`:450-454` (`RecipeExecutionApplicationSurface`), `:300-309`
(`ReasoningApplicationSurface`); the tool equivalents are `palimpsest_advisor`
(`src/tools/application_tools.ts:456-487`, actions `profile/recommend/explain`),
`palimpsest_recipe` (`:492-512`, actions `compile/start/status`), and
`palimpsest_reasoning` (`:351-389`, actions `view/frontier/graph/brief/branch/candidate/evaluate/invalidate`).

The DSH path is worse and is the honest baseline: `scripts/recipes/explore-e2e.mjs:171-180`
imports `dist/src/recipes/index.js`, fabricates a `RecipePlan` by hand **including its
`rationaleDigest`**, compiles it, then at `:209-221` constructs
`makeRecipeExecutionService` with its own `localPeer`/`reasoning`/`branchExecution` triple,
executes, and finally makes three separate reads (`cellView`, `frontier`, `events`) to see
anything useful. **No single call returns useful accepted findings.**

**Gap:** steps 1–5 collapse into one request; the caller should never name a cell to read
its own findings.

---

## 2. What does `RecipeExecutionOutcome.explored` expose today?

**Ids and counts only — no claim content.** (`explored` is the `status` discriminant, not a
field.) `src/recipes/execution.ts:146-157`:

```ts
export type RecipeBaseOutcome =
  | { readonly status: "reused_principal" }
  | { readonly status: "explored";
      readonly cellId: string;
      readonly branchIds: readonly string[];
      readonly admittedClaimIds: readonly string[];
      readonly unresolved: number;
      readonly branchExecutions: number; }
  | { readonly status: "coordination_surfaced"; readonly contactNeedId?: string; readonly peerRefs: readonly PeerRef[] };
```

The caller learns the cell id, the branch ids, admitted claim **ids**, how many evaluations
stayed unresolved and how many branch executions ran. Not the objective, not the branch
questions, not the statements — and the id-only projection is not an accident of one
module: `AnalyzeEvidenceOutcome` (`src/proof_asset/extraction.ts:365-371`) returns
`{ cellId, branchCount, admittedClaimIds, candidateDigests }`, the same shape.

**Gap (§19):** UX-A must project `CollaborationFinding{ claimId, type, content, source }`
from the accepted frontier, because nothing in the product does.

---

## 3. Can admitted ReasoningCell claims be read back without CoT?

**Yes — and the kernel structurally cannot leak chain-of-thought, because no field exists to
carry it.** `ReasoningCellService.frontier({cellId})` → `ReasoningFrontierView { basis;
claims: readonly AdmittedClaimView[] }` with `AdmittedClaimView = { ref; claim }`
(`src/reasoning_cell/service.ts:51-54, 125-128, 637-645`). `ReasoningClaim` is
`{ schemaVersion, type, content: unknown, dependencies, claimDigest }`
(`src/reasoning_cell/claims.ts:116-122`), and for the two builtin types `content` is a
schema-validated structured object — `reasoning.statement.v1 → { statement: string }`,
`reasoning.dead-end.v1 → { description, conditions[], reason }` (`:64-75`).

- The **branch brief is deliberately frontier-only**: its `acceptedClaims` field holds
  `readonly ReasoningClaimRef[]` — refs, not even content — and its doc comment states it
  exposes "never pending sibling candidates, sibling branches, a verification queue, or any
  private reasoning" (`src/reasoning_cell/artifacts.ts:111-123`).
- A grep for `scratchpad|chainOfThought|hidden_reasoning|raw_reasoning` across
  `src/reasoning_cell/**` matches only doc comments; `body|transcript|messages` matches one
  doc comment. There is no field to populate.
- The **ids-only** view is `cellView()` (`admittedClaimIds`/`activeClaimIds`/…) — which is
  exactly what `palimpsest_reasoning action:"view"` returns, so the *tool* read is the one
  that yields nothing useful.

**"Current accepted frontier"** in code = the **accepted frontier**: `frontierBasisOf({cellId,
frontierRevision, activeClaimIds})` plus the ACTIVE admitted claims. Currency is recomputed on
every read from the append-only replay: a claim is inactive if root-invalidated or
transitively dependent on an inactive claim (`service.ts:326-352`), and admission commits
only if the basis is unchanged across the pre-verify, post-verify and pre-admission checks
(otherwise `stale_evaluation`, `:509-562`).

**Conclusion:** §19's projection is `activeClaims(cellId)` (or `frontier(cellId).claims`) —
the same data, with no CoT surface to suppress.

---

## 4. What happens today if the Advisor recommends COORDINATE?

The advisor emits COORDINATE as `recommendedPlan` (a `RecipePlan` whose
`baseRecipeRef.recipeId === "coordinate.v1"`), and **only ever when an independent peer
already exists**: `shouldCoordinate = !shouldExplore && hasPeers && (wantsBoundary ||
couplingHigh)` (`src/advisor/advisor.ts:304-320`). With no peers it adds the
non-overridable blocker `"no independent sovereign peer"`
(`:61, 343, 367-369`) and recommends FOCUS instead.

**A zero-mutation cross-project signal already exists.** Executing a COORDINATE plan returns
exactly `{ status: "coordination_surfaced", contactNeedId?, peerRefs }`
(`src/recipes/execution.ts:157, 290-299`) — it does not declare a ContactNeed, offer a
commitment, propose a boundary revision or mint a peer. The peers are already in the
recommendation: `existingSubjectRefs` carries the raw `peerId` strings
(`src/advisor/advisor.ts:420`), and after compilation the steps carry real `PeerRef`s
(`src/recipes/compiler.ts:89-113`, which throws `coordinate_requires_independent_peer` if
that list is empty).

**Gap:** UX-A must detect `recommendedPlan.baseRecipeRef.recipeId === "coordinate.v1"`
*before* executing and answer `CROSS_PROJECT_REQUIRED` with those peers and the
recommendation's own `blockers`/`rationale` as the plain-language reason — never executing
the coordinate plan, never touching federation. Federation(`src/federation/federation_service.ts:47-93`)
stays untouched for UX-B.

---

## 5. What happens today if VERIFY is requested with no independent verifier?

**It fails honestly, with a typed reason, and writes nothing.** Two layers:

- **Recipe layer** (`src/recipes/execution.ts:391-398`): with the `VERIFY` modifier
  compiled and no verification port resolved, `execute` returns
  `{ status: "capability_required", capability: "project.verification", detail: "no Project
  Verification runtime is configured; a registered, versioned verifier protocol cannot
  execute here" }` — and the base mode does not run. If a runtime exists but refuses, the
  base outcome stays visible with `verificationUnresolved: { typedReasonCode, detail }`
  attached (advisory, not a silent downgrade).
- **Runtime layer**: `ProjectVerificationOutcome = { status: "recorded" | "blocked";
  typedReasonCode; detail; run: ProjectVerificationRun | null; statusView }`
  (`src/project_verification/service.ts:66-72`) over the closed code set
  `PROJECT_VERIFICATION_REASON_CODES` (`:86-98`), where "no independent verifier" is
  `no_registered_verifier`, `verifier_runtime_unavailable` or `unknown_verifier_ref`.

Availability is **derived, not declared**: `runtimeAvailable =
executableVerifierRefs.length > 0`, `independentVerifyAvailable = runtimeAvailable &&
independentVerifierRefs.length > 0`, where executable means a port is bound and independent
means `countsAsIndependent(definition)` (`src/project_verification/status.ts:214-219,
232-233`); `verify.v1` is `CONDITIONAL` with `capabilityRequirements:
["project.verification"]` (`src/recipes/registry.ts:56-76`); and the posture row turns that
into `AVAILABLE`/`UNAVAILABLE` with an honest note, where a bare
`independentVerifier: true` declaration is at best `CONDITIONAL`
(`src/project_operating/posture.ts:196-218`).

**Gap:** UX-A's CHECK must consult the SAME derived availability and answer
`CAPABILITY_REQUIRED` — not run a "same-context" fallback (§34, UXA-N08).

---

## 6. Which persistent Work Mode preference is available as default context?

Exactly one, and it grants nothing: `ProjectWorkModePreference` =
`{ schemaVersion, projectId, baseMode: "FOCUS"|"EXPLORE"|"COORDINATE", modifiers:
("VERIFY"|"MONITOR")[], updatedAt, updatedBy, digest }` behind
`UserWorkModeControlPort.get(projectId) → EffectiveWorkModePreference { preference; source:
"stored"|"safe_default"; degradedReason? }` (`src/project_operating/work_mode_profile.ts:24-62,
205-214`).

The product read is **`application.projectManagement.posture()`** (the only surface member
that exposes it — `src/application/surface.ts:1239`; there is no `projectOperating` surface),
returning `ProjectOperatingPostureView` whose `workMode.preferred` is the durable preference
plus its `source`, with the derived `effectiveStatus` rows per capability
(`src/project_operating/posture.ts:47-84`). Reading it mutates nothing; the write path is
operator-only. The safe default is `FOCUS` with no modifiers, and when no port is wired the
view says so through `degradedReason` (`src/project_management/service.ts:958-995`).

**Use:** AUTO reads `posture().workMode.preferred.baseMode` as *preference context* (§8/§31)
and never writes it back.

---

## 7. Which current surfaces require ids a user should not need?

| Surface | Caller must already know |
| --- | --- |
| `recipes.inspect(recipeId)` / `palimpsest_recipes` | a **recipe id** (`focus.v1`/`explore.v1`/`coordinate.v1`/`verify.v1`/`monitor.v1`) |
| `recipeExecution.compile(plan)` / `palimpsest_recipe action:"compile"` | a whole **`RecipePlan`**: `planId`, `baseRecipeRef{recipeId,version,digest}`, `modifierRefs[]`, `parameters`, `requiredCapabilities`, `existingSubjectRefs`, `rationaleDigest`, `digest` (`src/recipes/artifacts.ts:330-340`) |
| `recipeExecution.start(compiled, ctx)` | a whole **`CompiledRecipePlan`**, plus an optional **cell id** (`:483-493`) |
| `advisor.recommend({taskProfile})` | a **`TaskProfile`** structure (`{schemaVersion, features:[{feature,value,source}]}`) |
| `reasoning.*` (all 8) | **cell id** everywhere, **branch id**, **candidate digest**, **target claim id** |
| `verification.verifyCurrentHead` | an optional registered **verifier ref**, and **run refs** when reading history |
| `monitor.*`, `campaign.view`, `runtime.view`, `organization.view` | **campaign / scope / organization ids** |
| CLI | `palimpsest work-mode <BASE> [--modifiers VERIFY,MONITOR]`, `palimpsest architect --preset <preset>` |

There is **no** surface or tool that takes a user-meaningful phrase and returns a plan or an
executed result. `RecipeExecutionStatus { localPeerId, reasoningCell, branchExecution,
federation }` (`src/application/surface.ts:438-443`) is the closest "what can this
deployment do" read, and it answers nothing about VERIFY.

---

## 8. Design consequences — and where the spec's assumptions do not hold

The audit changes the design in eight concrete ways. Each is recorded so the implementation
does not quietly paper over it.

1. **`advisor.profile({task})` is dead on a real installation.** `ApplicationSurfaceDeps.taskProfiler`
   is declared (`src/application/surface.ts:724`) but **`install.ts` never supplies it** — grep
   for `taskProfiler` matches only `surface.ts`. So `profile({task})` returns
   `unknownTaskProfile()` (nine `UNKNOWN` features) unless the caller hand-declares `values`.
   §3 requires UX-A to compose `TaskProfilerPort`, and §10 leaves the natural-language mapping
   to a host adapter, so **UX-A wires a real profiler into the install** rather than
   pretending AUTO can profile a sentence.
2. **The advisor only exists when an organization-memory store is supplied**
   (`src/install.ts:1547-1549`). AUTO therefore has no architecture selector on a plain
   install, and §7's FOCUS fallback is the *normal* path, not an edge case. The audit's AUTO
   tests must wire `organizationMemoryStore` to exercise EXPLORE.
3. **COORDINATE is unreachable without a pre-existing peer**, so `CROSS_PROJECT_REQUIRED` is
   produced from the recommendation's own plan identity, carrying
   `existingSubjectRefs` (peer ids) — never by executing the coordinate plan.
4. **There is no fan-out bound to reuse.** §26 says to reuse existing budgets; the compiler's
   only `branchCount` rule is "safe integer **>= 2**" with **no maximum**
   (`src/recipes/compiler.ts:79-86`), and `RoleSlotPolicy`/`BudgetLedger`
   (`src/tools/parallel.ts:15-24`) are Work *claim*-time caps, not branch-time. UX-A must
   therefore introduce its OWN explicit bound on `branchCountHint` and refuse out-of-range
   values, and record the missing kernel ceiling as a carry-forward rather than claiming it
   was reused.
5. **Recipe `readiness` is a hand-written literal**, not derived from wiring; the derived
   truth is the posture's `availability` (`src/project_operating/posture.ts:273-329`). The
   plan view quotes **availability** and names the capability, so it cannot claim a mode is
   ready when the deployment has no runtime.
6. **Both Explore-shaped projections return ids only**, so §19's finding projection needs a
   new read of the accepted frontier. This is the single most user-visible gap and the
   reason a one-call Explore is worth building.
7. **The branch host bundle composes a partial surface** (`host/dsh/lib/index.js:130-132`
   passes only `{reasoning}` and deliberately forbids `openBranch`/`evaluate`/`invalidate`),
   so a collaboration tool must never assume it is registered inside a branch host.
8. **Nothing to reuse for "did it run":** `RecipeExecutionOutcome` carries
   `verificationUnresolved` but no `freshness`/`independence` when VERIFY did not run at all —
   they live in `RecipeVerificationSummary` only when it did.

## 9. What UX-A must therefore be

A **thin, stateless composition** (`src/interaction/`, §40) that:

1. takes a typed `CollaborationIntent` (never a sentence — the classifier is a host adapter,
   §10/§22) plus a task and optional bounded hints;
2. reads the durable Work Mode preference as *context only* (§8);
3. delegates architecture selection to the existing Advisor (§12) and reports
   `CROSS_PROJECT_REQUIRED` when it says COORDINATE (§14);
4. compiles and executes through the EXISTING compiler and execution service (§3) — one
   `explore.v1 + VERIFY` plan is how `PARALLEL_AND_CHECK` reuses the governed path;
5. projects the accepted frontier into `CollaborationFinding[]` without CoT (§19);
6. reports verification with the honest protocol note (§20) or `CAPABILITY_REQUIRED` (§34);
7. owns no store, no truth, no authority, no Agent identity (§37, INT-A01…A04).

Nothing else: no AgentGraph UX, no cross-project protocol, no PIAS/external-asset scope.
