# One-request collaboration — how to use it

Baseline: `437d1c9a6e1dc9a9ff36754096aaad98e787a184`.
Stage: **UX-A — One-Request Local Multi-Agent Collaboration**.
Spec: `SPEC-PROMPT-UX-A.md` (§9, §17, §22, §23, §25, §26, §28, §32, §34).
Product model: `docs/product/PALIMPSEST-INTERACTION-MODEL.md`.
Gap assessment: `docs/engineering/audits/UX-A-INTERACTION-GAP-ASSESSMENT.md`.

This document is the task-oriented companion: how to ask for collaboration, what
comes back, and what the deployment will honestly refuse to do.

---

## 1. Where you call it

Three faces expose the same service. Pick the one that matches your integration.

| Face | Shape |
| --- | --- |
| Agent tool | `palimpsest_collaborate` with exactly two actions, `plan` and `run` |
| Application surface | `application.collaboration.plan(request)` / `.run(request)` |
| HTTP | `POST /api/collaboration/plan` / `POST /api/collaboration/run` |

The tool is defined at `src/tools/application_tools.ts:517-577`; the surface at
`src/application/surface.ts:471-474` (declared), `:1143-1149` (composed) and
`:1438` (returned); the routes at `src/application/http.ts:188-204`. Whether the
face exists at all is discoverable: `GET /api/application/surfaces` carries a
`collaboration` boolean (`src/application/http.ts:150,184`).

The tool description is meant to be reachable from what a user actually says — no
tool, recipe or cell name required. The ordinary-language triggers it exposes are, in
Chinese, `并行探索` / `给我多个相互独立的思路` / `同时研究多种方案` / `多角度分析` /
`比较几种方案` and, for the CHECK path, `检查当前项目状态`; and in English
`parallel investigation` / `several independent approaches` / `compare the options` /
`break this into independent parts`, and `check the current project state`. These are
truthful triggers only: they assert no authority, and Explore findings stay exploratory
while CHECK stays a check of the exact current Project Head.

The **request body is the request**. There is no wrapper, no action enum in the
body, and no second parse: the interaction layer's own strict parser is the only
one (`src/application/http.ts:189-200`).

### The request

```text
CollaborationRequest {
  task                string      the task, in the user's words
  intent?             AUTO | FOCUS | PARALLEL | CHECK | PARALLEL_AND_CHECK
  taskProfileOverrides?  partial map of the nine task features
  branchCountHint?    integer 2..8        advanced, bounded
  verifierRef?        string              a registered verifier ref
  requestedBy         string
}
```

Defined at `src/interaction/intent.ts:89-108`, parsed strictly at `:152-208`.

### The tool arguments

`palimpsest_collaborate` takes `action` (`plan` | `run`) plus:
`task`, `intent`, `branchCountHint`, `verifierRef`, `values` (`values` is the
tool's name for `taskProfileOverrides`). `requestedBy` is derived by the tool, not
supplied by the caller (`src/tools/application_tools.ts:564-573`).

HONEST: the tool exposes six properties, one more than the four named in spec §9's
tool sketch (it also carries `values` / `taskProfileOverrides`). That is the §9
request field surfacing through the tool; it introduces no authority. The tool's
action set is exactly `["plan", "run"]`.

### What a request may NOT carry

Raw recipe ids, plan objects, agent ids, arbitrary commands, authority flags,
caller-supplied `PeerRef`s and caller-supplied `VerificationResult`s are **rejected
as unknown fields**, never ignored (`src/interaction/intent.ts:110-161`; the list
of rejected names is pinned by `test/uxa_collaboration.test.ts`, UXA-N01). The tool
rejects an authority-bearing argument at its own boundary too
(`...rejects.toThrow(/unknown argument "recipeId"/)`).

## 2. The golden scenario, end to end (§32)

### Before UX-A — the audit's five-to-eight call path

The honest baseline, from `docs/engineering/audits/UX-A-INTERACTION-GAP-ASSESSMENT.md` §1:
the caller had to hold a `TaskProfile`, then an `ArchitectureRecommendation` (with
a `RecipePlan`), then a `CompiledRecipePlan`, then execute, then make a *separate*
read of the reasoning cell's frontier to see anything useful — and a second
hand-assembled plan if they also wanted a check. The DSH path
(`scripts/recipes/explore-e2e.mjs:171-221`) fabricated a `RecipePlan` by hand,
including its `rationaleDigest`.

```text
advisor.profile → advisor.recommend → compile → start → reasoning.frontier
                                                  (+ compile+start again for CHECK)
```

Nothing in that path returned useful accepted findings in one call.

### After UX-A — one call

User request:

```text
Parallel investigate two plausible approaches to this implementation and check the result.
```

One call:

```jsonc
// palimpsest_collaborate
{
  "action": "run",
  "task": "Parallel investigate two plausible approaches to this implementation and check the result.",
  "intent": "PARALLEL_AND_CHECK",
  "branchCountHint": 2
}
```

What happens:

1. The request is strict-parsed (`intent.ts:152`).
2. The task is profiled by the deterministic local profiler, then the caller's
   overrides are applied as `USER_DECLARED` (`collaboration.ts:275-285`).
3. The existing advisor is asked with `userRequestedMultiAgent = true`; it selects
   the structure (`collaboration.ts:679-683`).
4. The derived exploration availability is quoted from the advisor's own
   eligibility (`collaboration.ts:701-711`); then the derived verification
   availability (`collaboration.ts:722-724`).
5. An `explore.v1 + verify.v1` `RecipePlan` is materialized with the existing
   materializer and compiled by the **existing** compiler
   (`collaboration.ts:346-356, 860`).
6. The existing execution service runs it (`collaboration.ts:861`).
7. Admitted claims are read back from the accepted frontier and projected into
   findings (`collaboration.ts:891` → `result_view.ts:48-59`).
8. The result is composed with the five §18 answers, ids under `details`
   (`collaboration.ts:916-941`).

What you get back (shape; content is deployment data):

```jsonc
{
  "status": "COMPLETED",
  "verb": "Explore alternatives, then check independently",
  "executionKind": "LOCAL_EXPLORE_AND_VERIFY",
  "summary": "Ran a bounded local exploration ... 2 admitted findings emerged: ... Still unresolved: ... Independent verification ran: ... PASS means the named verifier protocol passed ...",
  "findings": [ { "claimId": "...", "type": { "typeId": "reasoning.statement", "version": "v1" }, "content": { "statement": "..." }, "source": "reasoning_cell" } ],
  "unresolved": [],
  "verification": { "verifierRef": "...", "verdict": "PASS", "independence": "...", "freshness": "...", "runRef": "...", "protocolNote": "PASS means ... not truth ..." },
  "capabilityWarnings": [],
  "details": { "cellId": "...", "branchIds": ["...","..."], "branchExecutions": 2, "planId": "...", "planDigest": "...", "recipeIds": ["explore.v1","verify.v1"], "runRefs": ["..."] },
  "at": "..."
}
```

Asserted end to end against the real install — real Work event store, real ProjectIR,
real ReasoningCell store, real verification history store — by UXA-N21 in
`test/uxa_collaboration.test.ts`. The same test also asserts: no durable peer
(`rig.sent === []`), no commitment, no ProjectIR revision, no Journal entry, no open
loop, and no chain-of-thought or branch machinery anywhere in the serialised
payload.

## 3. One worked example per intent

All examples are `palimpsest_collaborate` calls. `plan` is read-only and executes
nothing; `run` executes the governed path. The tests below run against a real
install or a real service composed from the real owners.

### FOCUS — "just do it"

```jsonc
{ "action": "run", "task": "Rename the settings flag and fix its two call sites.", "intent": "FOCUS" }
```

```text
status: PRINCIPAL_CONTINUES · verb: "Do it"
```

Nothing is executed: the execution service is never called, no cell is opened, no
finding is read (`test/uxa_collaboration.test.ts`, UXA-N09: `execution.calls` empty,
`activeClaimsCalls === 0`). FOCUS is the zero-extra-boundary baseline.

### AUTO — "you decide"

```jsonc
{ "action": "run", "task": "Explore two independent approaches to the request cache; each approach is isolated in one module and covered by a falsifiable test.", "intent": "AUTO" }
```

- High decomposability / low coupling / parallel-search benefit, with branch
  capability present → the advisor chooses `EXPLORE`, and with a durable `VERIFY`
  preference present and an independent verifier wired, the result is
  `LOCAL_EXPLORE_AND_VERIFY` (UXA-N11).
- A coupled, monolithic task → the advisor chooses `FOCUS` and no cell is created
  (UXA-N10).
- No advisor composed → `PRINCIPAL_CONTINUES` with a reason that says so
  (UXA-N10/N04).

AUTO reads the durable Work Mode preference as context and never rewrites it
(UXA-N02).

### PARALLEL — "explore a few independent approaches"

```jsonc
{ "action": "run", "task": "Explore two independent approaches to the request cache.", "intent": "PARALLEL", "branchCountHint": 2 }
```

```text
status: COMPLETED · verb: "Explore alternatives" · details.branchIds has 2 entries
```

Two ephemeral branches run against one reasoning cell; the admitted claims come back
as findings with their statements (UXA-N05, and the projection test). No durable peer
is minted, no peer message is sent, no commitment exists.

### CHECK — "check this independently"

```jsonc
{ "action": "run", "task": "Check the current head.", "intent": "CHECK" }
```

```text
status: COMPLETED · verb: "Check independently"
verification.verdict: "PASS" · verification.protocolNote: "... not truth ..."
details.runRefs: [ <one real durable run ref> ]
```

The run really exists in the durable verification history (UXA-N07). A verifier ref
this deployment does not have cannot be bound: the runtime refuses, the base mode
stays visible, and the result is `PARTIAL` with the typed reason `unknown_verifier_ref`
— never a fabricated verdict and never a silent fallback to another verifier
(UXA-N07).

### PARALLEL_AND_CHECK — the golden scenario

See §2. If the check half is unavailable, the exploration still runs and the result
is `PARTIAL` — the work is real, the check is **not** claimed
(`test/uxa_collaboration.test.ts`, UXA-N17 asymmetry test).

## 4. The host-adapter seam (§22)

The core service takes a **typed** intent. If your host receives a sentence, it can
map it first:

```ts
interface CollaborationIntentAdapter {
  readonly adapterId: string;
  deriveIntent(userRequest: string): Promise<{ task: string; intent: CollaborationIntent; confidence?: number }>;
}
```

`src/interaction/host_adapter.ts:47-58`.

- `nullCollaborationIntentAdapter` — the honest null object; always returns `AUTO`,
  never guesses (`:61-65`).
- `deterministicKeywordCollaborationIntentAdapter` — one documented, replaceable
  example built from a short ordered pattern list (`DETERMINISTIC_INTENT_RULES`,
  `:79-102`). It is the whole classifier; there is no model call.

The adapter output is **not** a request. Converting it is the host's job, and the
request parser refuses adapter-only fields (`confidence`) as unknown
(`test/uxa_collaboration.test.ts`, host-adapter seam). An adapter output grants no
authority: the advisor still selects, the compiler still compiles.

### The deterministic task profiler, and what it does NOT infer

UX-A supplies a real, local, no-LLM `TaskProfilerPort` as the install default
(`deterministicTaskProfiler()`, `src/interaction/host_adapter.ts:224-245`; wired at
`src/install.ts:1555`). Before UX-A the port was declared but never supplied, so
`advisor.profile({task})` returned nine `UNKNOWN` features.

Its complete signal table is `TASK_PROFILER_RULES` (`:153-214`). What it does:

- emits a value only for a feature whose text carries an **explicit lexical marker**;
- leaves a feature `UNKNOWN` when the text carries no marker;
- returns `UNKNOWN` for an **ambiguous** sentence (both a "high" and a "low" marker)
  rather than a coin flip;
- emits only values from the owner's `TASK_FEATURE_ALLOWED_VALUES`;
- declares no provenance of its own — the advisor re-sources every supplied feature
  as `UNTRUSTED_PROFILER`.

What it does **NOT** infer:

- `existingIndependentPeers` — whether an independent peer already exists is a
  **deployment** fact, not a lexical one, so the profiler never emits it
  (`host_adapter.ts:210-214`; asserted in UXA-N11's profiler test:
  `taskFeatureValue(profile, "existingIndependentPeers") === "UNKNOWN"`).
- Anything a model "would understand": this is keyword matching, and a paraphrase
  with no marker stays `UNKNOWN`. This is deliberate — a wrong profile is worse
  than an unknown one. The lexical limits are a recorded carry-forward.

## 5. Bounding fan-out (`branchCountHint`, §25/§26)

You may pass `branchCountHint` as an **advanced, bounded** option. It is not a
primary control, and there is no "Agents: 1…20" slider (§25).

```text
MIN_BRANCH_HINT = 2      MAX_BRANCH_HINT = 8
default when absent = MIN_BRANCH_HINT (2)
```

`src/interaction/intent.ts:52-55`. Out-of-range and non-integer hints are
**refused**, never clamped (`:173-189`, error reason `invalid_branch_count`), at the
service/parser boundary and at the tool boundary alike
(`test/uxa_collaboration.test.ts`, UXA-N23: `0`, `1`, `9`, `-3`, `2.5`, `NaN`,
`Infinity`, `"2"` are all refused with "refused rather than clamped" and nothing
runs).

HONEST: `MIN_BRANCH_HINT = 2` is reused from the compiler's own rule "safe integer
>= 2" (`src/recipes/compiler.ts:79-87`). **`MAX_BRANCH_HINT = 8` is UX-A's own
ceiling**, because the kernel has no maximum — the compiler's only branchCount rule
is a minimum. There is no existing fan-out bound to reuse. The 8 is a product
decision made explicit in this layer, and it is recorded as a carry-forward for the
kernel, not presented as a reused kernel bound. See
`docs/engineering/audits/UX-A-INTERACTION-ANTI-WASTE.md` §10.

## 6. The status vocabulary, in user terms (§28)

Six outcomes. Infrastructure failure is never a semantic failure.

| Status | What it means for you | How to react |
| --- | --- | --- |
| `COMPLETED` | The bounded work ran; findings and (if requested) a verification result are present. | Read `summary` / `findings`. |
| `PRINCIPAL_CONTINUES` | One locus is enough; nothing extra was created. | Just do the task. |
| `CAPABILITY_REQUIRED` | The request needs a capability this deployment does not have (branches or an independent verifier). Nothing was faked. | Supply the capability, or ask for a different intent. |
| `CROSS_PROJECT_REQUIRED` | The correct structure is cross-project, which UX-A does not implement. Zero peer/commitment mutation. | Wait for UX-B, or use the expert federation tools deliberately. |
| `PARTIAL` | Real local work ran, but a requested independent check could not (no recorded verifier run). The work is real; no claim about the project head is made. | Treat findings as provisional. |
| `ERROR` | Infrastructure failed. No semantic result was produced. | Retry / fix the deployment; do not read this as "unsupported". |

A malformed request is a **typed refusal** (`CollaborationError` with reason
`invalid_request | invalid_branch_count | invalid_intent | not_configured`), not a
semantic status (`src/interaction/intent.ts:67-83`). It never becomes
`CAPABILITY_REQUIRED` and never silently degrades
(`test/uxa_collaboration.test.ts`, UXA-N24).

At the **HTTP** face a `CollaborationError` resolves to **400** for the caller's own
mistakes (`invalid_request`, `invalid_branch_count`, `invalid_intent`) and to **500**
only for `not_configured`, which is a server-side condition. `CollaborationError`
therefore carries the reason under both names — `reason`, and `kind` so the shared
error mapper (`src/application/http.ts:113-123`) can classify it. The route's
"refused (400)" contract holds; this was the review's finding, now fixed and pinned
(`test/uxa_collaboration.test.ts`).

## 7. Reading a result

Prefer the `summary` and `findings` for display; treat `details` as diagnostic.

- `findings[]` are the admitted, **current** claims from the accepted frontier, with
  their content (`result_view.ts:48-59`). Only admitted/current claims appear.
- `unresolved[]` tells you what did not converge (branch candidate evaluations) or
  what could not run (a refused check), in plain language.
- `verification` is present **iff** an independent run was actually recorded. Its
  `protocolNote` is mandatory.
- `capabilityWarnings[]` quotes the **derived** availability, naming the capability
  (`intent.ts:262-264`) — so a plan cannot claim a mode is ready when the deployment
  has no runtime for it.

There is no chain-of-thought to read: the kernel has no field to carry it, and this
layer imports no store, so it could not project one by accident
(`result_view.ts:14-18`; UXA-N16).

---

## See also

- Product model: `docs/product/PALIMPSEST-INTERACTION-MODEL.md`.
- Claims and non-claims: `docs/engineering/audits/UX-A-INTERACTION-PRODUCT-CLAIMS.md`.
- What is deliberately left open: `docs/engineering/audits/UX-A-CARRY-FORWARD.md`.
