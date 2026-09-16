# UX-C — Host-runtime anti-waste

Baseline: `a36d37b` (canonical main after UX-B).
Stage: **UX-C — Host-Native Zero-Config Collaboration Runtime** (product track).
Spec: `SPEC-PROMPT-UX-C.md` §48 (the twelve proofs), §2 (what packaging may/may not
add), §21, §28, §29, §44.
UXC0 audit: `docs/engineering/audits/UX-C-HOST-RUNTIME-ASSESSMENT.md` (SC-5…SC-13).
Delivery: `docs/engineering/audits/UX-C-DELIVERY.md`.

§48 asks UX-C to *prove* twelve negatives. Each one below states the mechanism that
makes it true and a `grep` (or `git diff`) a reader can run. **Every command and every
output in this document was executed against the final tree while writing it**;
`exit=1` from `grep` means "no matches", which is the wanted result. Path separators in
outputs are normalised to `/`.

The UX-C packaging modules under test are exactly these (the branch environment plus the
deployment bundle, readiness view and host wiring):

```bash
UXC_NEW="src/deployment/reasoning_bundle.ts src/deployment/branch_host.ts src/deployment/readiness.ts"
UXC_HOST="host/dsh/lib/index.js host/dsh/lib/runner.js"
```

---

## 1. No new canonical store

**Mechanism.** The only new durable artefact is a `SqliteReasoningCellStore` at a derived
path — an EXISTING store type, not a new one (`src/deployment/launch.ts:308-311`). Every
other piece of readiness/ownership state is derived in-process, and the branch environment
holds no store at all (`src/deployment/branch_host.ts:14-19`).

```bash
$ grep -rn "CREATE TABLE\|class .*Store\b" $UXC_NEW src/recipes/execution.ts src/interaction/result_view.ts
exit=1
$ git status --porcelain src/deployment | grep -i "store"
exit=1
$ grep -rn "new Sqlite\|DatabaseSync\|better-sqlite3\|node:sqlite" $UXC_NEW
exit=1
```

No new store module, table or handle exists. The two policy implementations write
nothing; the store is created and closed only by the deployment that owns it
(`src/deployment/launch.ts:517-528`).

## 2. No new semantic event

**Mechanism.** The bundle implements two EXISTING policy ports
(`ReasoningVerificationPolicyPort`, `ReasoningEpistemicAdmissionPolicyPort`); the kernel
still records the pre-existing event species. No coordination, transport, federation,
attention or workspace source changed.

```bash
$ git diff --name-only a36d37b -- src/coordination src/transport src/federation src/attention src/project_workspace | wc -l
0
$ grep -rn "CoordinationEventType\|appendCoordination\|coordinationStore\|COORDINATION_STORE_DOMAIN\|MESSAGE_PREPARED\|MESSAGE_RECEIVED" $UXC_NEW src/recipes/execution.ts
exit=1
```

The new modules name no event species: they return policy results through existing
seams, and the kernel derives `VERIFICATION_RECORDED` / `ADMISSION_DECIDED` itself.

## 3. No new Agent identity

**Mechanism.** A branch is explicitly not an agent identity: it creates no `PeerRef`, no
`PersistentPoint` and no durable session, and the branch tool records a statement, not an
identity (`src/deployment/branch_host.ts:14-19`).

```bash
$ grep -rn "AgentId\|agentId\|agent_id\|AGENT_CREATED\|createAgent\|PersistentPoint\|materializePeerRef" $UXC_NEW | grep -v ':[0-9]*: *\*'
exit=1
```

The single unfiltered hit is the docstring that *denies* the coupling
(`src/deployment/branch_host.ts:17`). The DSH branch process creates a host session
(`host/dsh/lib/runner.js`), but it is a fresh agent over no Palimpsest identity - no
PeerRef, no PersistentPoint, no durable principal - and it is restricted to one tool.

**HONEST (gate review F2).** It is NOT true that a branch leaves nothing on disk: the DSH
host writes a durable session artifact per branch
(`$DSH_HOME/sessions/<cwd-key>/branch-*/session.v3.jsonl.zstd`) containing the session
header and, for a branch that ran turns, `request/header` (the tool catalogue it was
offered), `assistant/message`, `tool/call` and `tool/result`. That artifact is a HOST
record, not a Palimpsest store - no Palimpsest semantic store is written by a branch -
but the earlier claim that a branch is never persisted was false and is corrected here.
Whether that host-level persistence can be disabled for an ephemeral branch is a DSH
host decision, carried forward.

## 4. No new authority

**Mechanism.** The bundle is composed capability, not authority. Neither policy grants
anything; the admission policy's `ADMIT` is frozen to mean "include a cell-local
hypothesis in the frontier" (`src/deployment/reasoning_bundle.ts:99-143`); the branch
tool holds no authority at all.

```bash
$ grep -rnE "AuthorityPort|AuthorityKind|authorityId|grantAuthority|AuthorityGrant|new .*Authority" $UXC_NEW src/recipes/execution.ts
exit=1
```

The single unfiltered `authority` word is the branch tool description that states it has
none (`src/deployment/branch_host.ts:244`). The profile parser refuses any authority-like
`reasoning` field as unknown (`src/deployment/profile.ts:305-318`).

## 5. No duplicate Advisor

**Mechanism.** The advisor type and its factory are defined once, and composed once. UX-C
change is the composition *condition*, not a second advisor (`src/install.ts:1623-1640`).

```bash
$ grep -rn "new EmpiricalArchitectureAdvisor\|class EmpiricalArchitectureAdvisor\|makeEmpiricalArchitectureAdvisor" src/ | grep -v test
src/advisor/advisor.ts:287:export function makeEmpiricalArchitectureAdvisor(...)
src/install.ts:121:import { makeEmpiricalArchitectureAdvisor } from "./advisor/advisor.js";
src/install.ts:1626:      : makeEmpiricalArchitectureAdvisor({
```

One definition, one composition site.

## 6. No duplicate Recipe compiler

**Mechanism.** `RecipeExecution` still compiles through the existing compiler; UX-C only
exports two existing policy refs so the deployment policy can recognise them
(`src/recipes/execution.ts:180-188`) and forwards the branch's cited evidence refs
(`:286-305`). No second compiler exists.

```bash
$ grep -rn "export function compileRecipePlan\|class RecipeCompiler\|export function compileRecipe" src/recipes/compiler.ts
src/recipes/compiler.ts:150:export function compileRecipePlan(...)
```

## 7. No duplicate ReasoningCell

**Mechanism.** The packaged bundle creates one store and lets `installPalimpsest` compose
the one `ReasoningCellService`; the branch environment composes **no** ReasoningCell at
all. This is the structural half of the branch-ownership fix
(`docs/engineering/audits/UX-C-BRANCH-OWNERSHIP-EVIDENCE.md`).

```bash
$ grep -rn "export function makeReasoningCellService\|export class ReasoningCellService" src/reasoning_cell/service.ts
src/reasoning_cell/service.ts:208:export function makeReasoningCellService(...)
$ grep -rn "makeReasoningCellService" src/ | grep -v test
src/install.ts:112:import { makeReasoningCellService } from "./reasoning_cell/index.js";
src/install.ts:1542:      service: makeReasoningCellService({
src/reasoning_cell/service.ts:208:export function makeReasoningCellService(...)
$ grep -rn "ReasoningCellService\|submitCandidate\|evaluateCandidate" src/deployment/branch_host.ts
exit=1
```

One service factory, one composition site; the branch names none of it.

## 8. No duplicate federation protocol

**Mechanism.** The cross-project face rides the EXISTING UX-B protocol; UX-C only routes
it to the product formatter. No federation source changed.

```bash
$ git diff --name-only a36d37b -- src/federation | wc -l
0
$ grep -rn "federation\|peer_message\|PeerMessage\|sendMessage\|CrossProject" $UXC_NEW | grep -v ':[0-9]*: *\*'
exit=1
```

The single unfiltered hit is the docstring that denies composing federation
(`src/deployment/branch_host.ts:10`).

## 9. No second attention truth

**Mechanism.** `AttentionService` stays the one derivation owner; UX-C adds only a
formatter (a pure function of signal routing metadata) and a resume-capable activation
adapter (`host/dsh/lib/runner.js:205-230`). The branch composes no attention.

```bash
$ grep -rn "export class AttentionService\|export function makeAttentionService" src/attention/*.ts
src/attention/service.ts:97:export function makeAttentionService(...)
$ grep -rn "Attention" src/deployment/branch_host.ts
exit=1
```

## 10. No hidden cross-project send

**Mechanism.** The readiness view and the bundle are pure; the only send sites are the
explicit UX-B `ask` and `respond` paths. AUTO still stops at a non-mutating
`CROSS_PROJECT_REQUIRED` handoff.

```bash
$ grep -rn "sendMessage\|transport.submit\|federation.send" $UXC_NEW
exit=1
$ grep -rn "deps.federation.sendMessage" src/interaction/cross_project.ts
src/interaction/cross_project.ts:773:    const sent = await deps.federation.sendMessage({ to: rebound.peer, threadId, body });
src/interaction/cross_project.ts:1259:      const sent = await deps.federation.sendMessage({ to, threadId, body });
```

`ask` and `respond` are the only callers, and both are explicit product paths
(UXC-N21/N22).

## 11. No PIAS scope

**Mechanism.** UX-C neither searches, attaches nor resolves external assets or PIAS
content. No new module names a bridge, provider or PIAS concept.

```bash
$ grep -rniE "pias|external.?asset|provider|bridge" $UXC_NEW src/interaction/result_view.ts src/interaction/intent.ts | grep -v ':[0-9]*: *\*' | grep -v ':[0-9]*: *//'
exit=1
```

## 12. No default Monitor activation

**Mechanism.** The packaged bundle composes no Monitor at all; the profile gained no
Monitor field, and nothing ticks.

```bash
$ grep -rniE "monitor" $UXC_NEW src/deployment/profile.ts | grep -v ':[0-9]*: *\*'
exit=1
```

---

## 13. Residual costs and limits, stated honestly

These are costs, not defects. Each is on record so the true price of the packaging is
visible. None is a hidden capability.

### 13.1 `MAX_BRANCH_HINT = 8` is still the product's own bound

The kernel has **no** branch ceiling. The compiler only enforces a minimum
(`branchCount >= 2`), and the ceiling lives in the interaction layer:

```bash
$ grep -n "MAX_BRANCH_HINT" src/interaction/intent.ts
47: * `MAX_BRANCH_HINT` is UX-A's explicit ceiling, because the compiler has NO
53:export const MAX_BRANCH_HINT = 8;
$ grep -n "branchCount" src/recipes/compiler.ts
79:      const rawBranchCount = parameterOf(plan, "branchCount");
80:      let branchCount = 2;
83:          throw new RecipeCompileError("missing_parameter", "EXPLORE parameter \"branchCount\" must be a safe integer >= 2");
```

Out-of-range hints are refused, never clamped (local dogfood
`fan_out_bound_refused_not_clamped`, `fan_out_bound_holds`). `CF-UXA-01` remains open;
no document may claim the kernel bounds fan-out.

### 13.2 The packaged branch environment is DSH-specific by construction

`composeBranchHostEnvironment` returns a host tool and consumes DSH tool types
(`src/deployment/branch_host.ts:27`, `:231-233`, `:240-268`), and the only shipped branch
wiring is `host/dsh/**` (`host/dsh/lib/index.js:98-129`). There is no packaged Pi branch
runner. This does not block UX-C PASS (`SPEC-PROMPT-UX-C.md` §45); it is recorded as new
carry-forward work.

### 13.3 The deterministic profiler is lexical

AUTO/PARALLEL reach Explore only when the task text carries the profiler's explicit
keyword markers (`src/interaction/host_adapter.ts:153-214`, factory at `:224`). A
paraphrase with no marker stays all-UNKNOWN and AUTO stays Focus. `CF-UXA-04` remains
open. The optimistic reading of AUTO is bounded by this cost.

### 13.4 The packaged dogfood is in-process

The two UX-C dogfoods drive the deployment lifecycle **in-process**; every branch is a
real DSH subprocess, but no live model-driven principal turn is spawned through the
shipped runner. The runner's scheduling is proven structurally and through the
cold-resume section, not by a recorded live principal conversation. See
`docs/engineering/audits/UX-C-PACKAGED-DOGFOOD-EVIDENCE.md` §5.

### 13.5 What the twelve greps do NOT prove

For completeness: a `grep` proves a *name* is absent from the named files; it does not by
itself prove a capability is unreachable. The structural reachability claims rest on the
suite and dogfoods (the branch environment enumerating exactly one tool, UXC-N07/N08;
zero idle work, UXC-N26/N27), not on the greps alone. The greps and the runs answer
different halves of the same question.
