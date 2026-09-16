# UX-A — Interaction anti-waste audit

Baseline: `437d1c9a6e1dc9a9ff36754096aaad98e787a184` (canonical main after G10-AE-R).
Stage: **UX-A — One-Request Local Multi-Agent Collaboration** (product track).
Spec: `SPEC-PROMPT-UX-A.md` §37 (the nine proofs), §40 (no forbidden modules),
§39 (INT-A01…A19).
Gap assessment: `docs/engineering/audits/UX-A-INTERACTION-GAP-ASSESSMENT.md`.

Spec §37 asks UX-A to **prove** nine negative properties, not to assert them. Each
section below is a claim, the mechanism that enforces it, and the exact
read-only check a reader can run against this tree to falsify it. Every command was
run on this worktree with the shipped implementation present.

The implementation under audit is `src/interaction/`:

```text
src/interaction/intent.ts        302 lines
src/interaction/collaboration.ts 1111 lines
src/interaction/result_view.ts   254 lines
src/interaction/host_adapter.ts  245 lines
src/interaction/index.ts          16 lines
```

plus four modified faces (`src/application/surface.ts`,
`src/tools/application_tools.ts`, `src/install.ts`, `src/application/http.ts`) and
one new suite (`test/uxa_collaboration.test.ts`, 39 tests).

---

## 1. No new store

**Claim.** UX-A owns no durable store, no table, no migration and no persistence of
its own.

**Mechanism.** Every `CollaborationService` dependency is a thunk or an optional
*existing* service (`CollaborationDeps`, `src/interaction/collaboration.ts:82-99`).
The service keeps no state between calls; everything is per-call. The only state a
run produces is state an existing owner already owns — a ReasoningCell and a
verification run (`src/interaction/collaboration.ts:19-23`).

**Check.**

```bash
grep -rn "CREATE TABLE" src/interaction/            # expect: no output
grep -rniE "class .*Store|sqlite|\.db\b" src/interaction/   # expect: no output
ls src/interaction/                                 # expect: the five §40 modules only
```

Observed: no output for both greps; the directory holds exactly
`collaboration.ts`, `host_adapter.ts`, `index.ts`, `intent.ts`, `result_view.ts`.

**Corroborating tests.** UXA-N02 asserts the durable Work Mode store's digest, base
mode, modifiers and history are unchanged after a run; the golden-path test asserts
the ProjectIR head, Journal and open loops are unchanged.

## 2. No canonical event

**Claim.** UX-A introduces no canonical event type and writes no canonical event.

**Mechanism.** `src/interaction/**` imports nothing from `src/state`,
`src/domain`, or any event store. Its complete import surface is:

```text
../advisor/advisor.js, ../advisor/task_profile.js
../organization_memory/artifacts.js   (TASK_FEATURE_NAMES / allowed values — read-only vocabulary)
../project_operating/posture.js       (type)
../project_verification/status.js     (type)
../reasoning_cell/service.js, ../reasoning_cell/claims.js   (types)
../recipes/artifacts.js, ../recipes/compiler.js, ../recipes/execution.js, ../recipes/registry.js
../schema/canonical.js                (canonicalDigest, for one rationale digest)
```

**Check.**

```bash
grep -rn "from \"" src/interaction/*.ts          # inspect the import list
grep -rniE "event_store|eventStore|WorkEvent|appendEvent|input\.kind" src/interaction/   # expect: no output
```

Observed: no output for the second grep. The only digest UX-A computes is
`rationaleDigest` for a `RecipePlan` it materializes
(`src/interaction/collaboration.ts:66,336`) — a descriptive plan field, not a
canonical event.

**Honest note.** `canonicalDigest` is the shared hashing util from
`src/schema/canonical.ts`. Using it is not owning a canonical plane: nothing is
stored and the plan is compiled by the existing compiler.

## 3. No authority

**Claim.** A collaboration request grants no authority and mints none.

**Mechanism.** The request parser is strict and closed (`REQUEST_KEYS`,
`src/interaction/intent.ts:110-117`). An authority-bearing field is an **unknown
field** and is rejected (`:157-161`). The plan view has exactly the §11 fields and
carries no authority field (`:242-254`); UXA-N01 serialises the plan and asserts it
does not match `/authorit|commitment|peerRef|admission|proof/i`.

**Check.**

```bash
grep -rniE "authority|admission|commitment|proof|grant|approved" src/interaction/ | grep -v "^\s*\*"
```

Observed: the only hits are doc comments ("an intent grants nothing", "owns NO
authority", the verification protocol note) and the task-feature *name*
`"authoritySeparationNeed"` in the profiler's signal table
(`host_adapter.ts:190`). No field stores or returns authority.

**Corroborating tests.** UXA-N01 (rejects `authority`, `flags`, `approved`,
`peerRef`, `verificationResult`, …), UXA-N03 (management involvement unchanged).

## 4. No Agent identity

**Claim.** UX-A creates no `PeerRef`, no `PersistentPoint`, no durable
`AgentDefinition`, no project principal.

**Mechanism.** The words `PeerRef`, `PersistentPoint` and `AgentDefinition` appear
in `src/interaction/**` only in doc comments stating that none is created. There is
no import of `src/federation`, `src/boundary_memory`, `src/runtime_scope`, or any
identity materializer.

**Check.**

```bash
grep -rniE "PeerRef|persistentPoint|agentDefinition|createPeer" src/interaction/
grep -rn "from \"" src/interaction/*.ts | grep -iE "federation|boundary|runtime_scope|organization/"
```

Observed: the first prints only comments; the second prints nothing.

**Corroborating tests.** UXA-N05: after a real PARALLEL run, `rig.sent === []`, the
peer directory was never observed, `federation.commitments() === []`, and the local
peer's inbox is byte-identical. UXA-N12/N13/N14: the same for a
`CROSS_PROJECT_REQUIRED` outcome.

## 5. No duplicate Advisor policy

**Claim.** Architecture selection remains Advisor-owned; UX-A re-implements no
`shouldExplore` / `shouldCoordinate` rule.

**Mechanism.** UX-A calls `deps.advisor.recommend(...)` and consumes the result. The
selection rule exists in exactly one place in the tree,
`src/advisor/advisor.ts:314-320`.

**Check.**

```bash
grep -rn "shouldExplore\|shouldCoordinate" src/ --include=*.ts
grep -rniE "shouldExplore|shouldCoordinate|prefersExplore|requestedExploreFallback|buildCandidate" src/interaction/
grep -n "advisor.recommend" src/interaction/collaboration.ts
```

Observed: the policy identifiers appear only in `src/advisor/advisor.ts`; the
interaction grep is empty; UX-A reaches the advisor at
`collaboration.ts:459,577,681` and the compiler at `:860`.
`test/uxa_collaboration.test.ts` (UXA-N04) asserts the source contains none of the
five forbidden identifiers and does contain `advisor.recommend` + `compileRecipePlan`.

HONEST: `reasoningCapabilityFrom` (`collaboration.ts:224-245`) reads the advisor's
`eligiblePlans` and `blockers` to learn whether EXPLORE is eligible, and matches a
blocker by a phrase regex (`/reasoning branches capability is not available/iu`).
That is *reading the advisor's own output*, not a second selection rule — but the
phrase match is a coupling to the advisor's blocker wording. Recorded as a
carry-forward.

## 6. No duplicate Recipe compiler

**Claim.** Plan compilation remains Recipe-compiler-owned; UX-A composes the
existing compiler.

**Mechanism.** `compileRecipePlan` is imported from `src/recipes/compiler.js`
(`collaboration.ts:36`) and called at `:860`. The plan is *materialized* with the
existing `materializeRecipePlan` (`:331`, imported at `:35`) — materialization is
not compilation and not selection (`:315-320`).

**Check.**

```bash
grep -rn "export function compileRecipePlan" src/            # expect: src/recipes/compiler.ts:150 only
grep -rn "compileRecipePlan" src/ --include=*.ts | grep -v "recipes/compiler.ts"
```

Observed: the compiler is defined at `src/recipes/compiler.ts:150`. Callers are
`src/application/surface.ts:1130`, `src/project_management/service.ts:670` and
`src/interaction/collaboration.ts:860` — all delegating, none defining a second
compiler.

## 7. No AgentGraph primary UX

**Claim.** UX-A does not make an AgentGraph the primary UX and does not touch the
graph/canvas planes.

**Mechanism.** The AgentGraph/IR/canvas code lives in `src/graph/**`,
`src/canvas/**`, `src/architecture/**` and `src/tools/graph.ts`. `src/interaction/**`
imports none of them; the product face is a plan view, a summary and findings.

**Check.**

```bash
grep -rniE "AgentGraph|agentGraph|canvas|graph/ir" src/interaction/     # expect: no output
grep -rn "from \"" src/interaction/*.ts | grep -iE "graph|canvas|architecture"   # expect: no output
```

Observed: no output. `AgentGraph` lives in `src/graph/ir.ts`, `src/canvas/**`,
`src/architecture/**`, `src/tools/graph.ts`, `src/serve.ts`, `src/schema/models.ts`
— outside the interaction layer. A `details.branchIds` array is an id list, not a
graph UI: it is under `details` by §18 and the UXA-N16 test asserts the primary
payload carries no graph/branch machinery.

## 8. No PIAS / external-asset scope

**Claim.** UX-A adds no Personal Intellectual Asset System and no external-asset
retrieval or bridge scope.

**Mechanism.** `src/interaction/**` imports nothing from `src/external_assets`.
`PIAS` appears nowhere in the layer. The External Asset Library bridge remains
exactly what G10-AE delivered.

**Check.**

```bash
grep -rni "PIAS|personal.intellectual.asset" src/interaction/          # expect: no output
grep -rni "external_assets|externalAssets|assetLibrary" src/interaction/   # expect: no output
```

Observed: no output for either. The stage modifies no file under
`src/external_assets/**`.

## 9. No cross-project protocol in UX-A

**Claim.** UX-A ships no cross-project protocol. COORDINATE is a **signal**, not an
action; federation is untouched.

**Mechanism.** `src/interaction/**` does not import `src/federation`. On an advisor
recommendation of COORDINATE, `resolveFromRecommendation` returns
`CROSS_PROJECT_REQUIRED` **before compiling or executing the coordinate plan**
(`collaboration.ts:478-496`). The peers it reports come from the recommendation's own
`existingSubjectRefs` (`:494`). The run path for that kind makes no call that could
send a message, create a commitment or mutate a boundary
(`collaboration.ts:1008-1016`).

**Check.**

```bash
grep -rn "federation" src/interaction/          # expect: no output
grep -rn "from \"" src/interaction/*.ts | grep -i federation   # expect: no output
grep -c "shouldExplore" src/advisor/advisor.ts
```

Observed: no `federation` reference anywhere in `src/interaction/**`; the advisor is
the only place the coordinate decision is made.

**Corroborating tests.** UXA-N12/N13/N14 on a real install with a known independent
peer: the plan is `CROSS_PROJECT_REQUIRED`, `result.details.peers ===
["peer-independent-1"]`, `rig.sent === []`, the peer directory was never observed,
`federation.commitments() === []`, the inbox is unchanged, and the ProjectIR head is
unchanged.

---

## 10. Residual costs, recorded honestly

The nine proofs above are negative properties. These are the real costs and
compromises UX-A accepts in order to get them. None is hidden; each is carried in
`docs/engineering/audits/UX-A-CARRY-FORWARD.md`.

### 10.1 `MAX_BRANCH_HINT = 8` is UX-A's own bound, not a reused kernel bound

Spec §26 says to reuse existing budgets/compiler bounds. The compiler's only
`branchCount` rule is a **minimum** ("must be a safe integer >= 2",
`src/recipes/compiler.ts:79-87`) with **no maximum**. `MIN_BRANCH_HINT = 2` is that
compiler rule; `MAX_BRANCH_HINT = 8` has no kernel source
(`src/interaction/intent.ts:43-55` documents this). UX-A therefore introduces its own
explicit ceiling and refuses out-of-range hints rather than clamping
(`intent.ts:173-189`). **Cost:** the product layer, not the kernel, is where fan-out
is bounded today; a different product face could ask the compiler for an unbounded
branch count. **Carried:** the missing kernel branch ceiling.

### 10.2 Retained-but-inert request fields

Three request fields are accepted and are inert or narrowed in ways a reader must be
told:

1. **`verifierRef` is honoured only by `CHECK`.** `resolveCheck` passes it into the
   plan (`collaboration.ts:660-665` via `verifyParameters`, `:358-362`), but
   `explorePlan` builds parameters from `{ question, branchCount }` only
   (`:346-356`), so for `AUTO` with a durable VERIFY rider and for
   `PARALLEL_AND_CHECK` the compiler emits its explicit `project-default` sentinel
   (`src/recipes/compiler.ts:126-140`) and the request's `verifierRef` is **not**
   bound. The field is documented as "the verifier a CHECK may bind"
   (`intent.ts:104-106`), so this is by-design scoping — but a caller may reasonably
   expect it to bind in `PARALLEL_AND_CHECK` too, and it does not. **Carried.**
2. **`taskProfileOverrides` are inert for `FOCUS` and `CHECK`.** Profiling happens
   only in the AUTO/PARALLEL/`PARALLEL_AND_CHECK` paths (`profileOf`,
   `collaboration.ts:275-285`); FOCUS and CHECK never call it, so overrides are
   parsed and discarded for those intents. **Carried** (low impact: FOCUS/CHECK do
   not consume a profile by design).
3. **The advisor `preferences` argument is inert.** `preferencesFrom` builds an
   `ArchitecturePreferences` from the durable work-mode preference
   (`collaboration.ts:293-299`), but `EmpiricalArchitectureAdvisor.recommend`
   declares `preferences?` (`src/advisor/advisor.ts:115`) and never reads it
   (`grep -n "\.preferences" src/advisor/advisor.ts` → no use). The code comment at
   `collaboration.ts:288-292` states this plainly. UX-A itself consumes the durable
   preference for the VERIFY rider, so the field is a forward seam, not a working
   input today. **Carried.**

### 10.3 AUTO without a composed advisor is always FOCUS

The advisor is composed only when an organization-memory store is supplied
(`src/install.ts:1582-1585`). On a plain install, `AUTO` has no architecture
selector and takes the documented FOCUS fallback
(`collaboration.ts:450-457`). This is the honest §7 fallback, but it means "AUTO
decides" collapses to "FOCUS" on any deployment that has not wired organization
memory. **Carried**, with the trigger "a deployment that wants AUTO to be able to
reach EXPLORE."

### 10.4 The COORDINATE signal is keyed to the recommendation, reachable via AUTO

The `CROSS_PROJECT_REQUIRED` branch is taken when the advisor's `recommendedPlan` is
`coordinate.v1` (`collaboration.ts:475-496`). The explicit-intent paths
(`PARALLEL`, `PARALLEL_AND_CHECK`) consult the advisor but do not re-check for a
COORDINATE recommendation before exploring locally — they honour the user's explicit
"local" request. Spec §14 scopes the COORDINATE rule to AUTO, while §2/§34's wording
is broader ("if the existing Advisor recommends COORDINATE"). This is a documented
boundary, not a shipped bug, but the wording is ambiguous and only AUTO is tested
(UXA-N12). **Carried** with the trigger "a deployment that wants an explicit
PARALLEL request to be refused/redirected when the advisor recommends COORDINATE."

### 10.5 The HTTP refusal status is 500, not 400

`CollaborationError` (`src/interaction/intent.ts:75-83`) carries `reason`, not
`kind`, and sets `name = "CollaborationError"`. The application error mapper
(`src/application/http.ts:113-123`) keys on `kind` / `name === "InvalidRequest"`, so
a malformed collaboration body resolves to **500** even though the route comment
says "refused (400)" (`http.ts:189-195`). The refusal itself is correct: the body
names the reason and no state is touched. Only the status code is misleading, and
the tool/surface paths behave as intended. **Carried.**

### 10.6 The deterministic profiler is lexical

`deterministicTaskProfiler` matches keywords (`host_adapter.ts:153-214`). A
paraphrase with no marker is `UNKNOWN`; an ambiguous sentence is `UNKNOWN` rather
than guessed. This is the honest choice, but AUTO's reach depends on the task
sentence containing the profiler's vocabulary. **Carried**, with the trigger "a host
that wants a model-backed profiler" (the port is the seam; the output stays
untrusted and re-sourced).

### 10.7 Branch count and no durable fan-out governance

Beyond UX-A's own `MAX_BRANCH_HINT`, branch execution is governed only by the
existing recipe execution budgets. UX-A adds no scheduler, no queue and no durable
fan-out ledger — by design (§27: no stateless-interaction store). The consequence is
that two concurrent collaboration requests are two ordinary governed runs; there is
no cross-request fan-out admission. This matches the existing kernel behaviour; it is
recorded so it is not mistaken for UX-A governance. **Carried.**

### 10.8 No web face

The stage ships no web UI for UX-A: the product faces are the tool, the application
surface and the two HTTP routes. `web/src/api.ts:193`'s `"collaboration"` is a
MultiGraph *species*, unrelated to this stage. The §42 gates include `build:web` and
Playwright as **regression** gates, not as a UX-A feature gate. **Recorded**, not
carried: spec §41 requires no web doc and the stage mandates none.

---

## 11. INT-A invariant disposition

| Invariant | Disposition | Evidence |
| --- | --- | --- |
| INT-A01 owns no durable truth | held | §1, §2; UXA-N02/N19/N20 |
| INT-A02 owns no store | held | §1 |
| INT-A03 owns no authority | held | §3; UXA-N01 |
| INT-A04 owns no Agent identity | held | §4; UXA-N05/N13/N14 |
| INT-A05 architecture selection Advisor-owned | held | §5; UXA-N04 |
| INT-A06 plan compilation Recipe-compiler-owned | held | §6 |
| INT-A07 reasoning ReasoningCell-owned | held | findings read via `activeClaims` only |
| INT-A08 verification ProjectVerification-owned | held | `verificationStatus` derives from the real status read |
| INT-A09 request intent != persistent posture | held | UXA-N02 |
| INT-A10 Focus remains zero-extra-boundary baseline | held | UXA-N09 |
| INT-A11 Explore branches remain ephemeral | held | UXA-N05 |
| INT-A12 Coordinate requires future cross-project adapter | held | §9; UXA-N12 |
| INT-A13 no fake multi-Agent fallback | held | UXA-N06/N08 |
| INT-A14 user need not know recipe ids | held | ids under `details`; §18 test |
| INT-A15 user need not know ReasoningCell ids | held | ids under `details`; §18 test |
| INT-A16 result projection contains no CoT | held | `result_view.ts:14-18`; UXA-N16 |
| INT-A17 one high-level call executes local collaboration | held | UXA-N21 |
| INT-A18 full regression green | gate-level | not faked here; see the delivery report |
| INT-A19 required CI green | gate-level | not faked here; see the delivery report |

INT-A18/INT-A19 are full-suite/CI properties and are deliberately **not** asserted
inside this document. They are recorded as gate-level checks in
`docs/engineering/audits/UX-A-DELIVERY.md`, never as faked in-suite assertions.
