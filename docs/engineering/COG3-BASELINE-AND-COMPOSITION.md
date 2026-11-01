# COG-3 — Baseline and Normal Host Composition

**Incoming baseline:** `2928adc187ea3598639c5bd1e42828448d6ce56d` (tree `77ba519540ba23dc982579b9eda85feee18bd274`), the COG-2 final HEAD on `palimpsest-cog2-project-native-continuity`.
**Development branch:** `palimpsest-cog3-native-synthesis`, created from that commit.
**Preflight:** clean working tree; `origin/main` = `044330b2e55198542d545edc42ed9c36e7ce896b`; `git rev-list --left-right --count origin/main...HEAD` = `0 359`; no stash; the pre-existing worktree registrations were not touched.

The branch was created only after the preflight and after reading the COG-2 reports. No `main`, protected ref, worktree or historical freeze was moved, pruned or rewritten.

---

## 1. What COG-2's diagnostic deployment did not compose

COG-2's rig called `launchDeployment(profile)` directly with:

- no `host.dshAgents`;
- `attention.activation: "none"`;
- no `host.branchExecution` or `host.branchExecutionFor`;
- no DSH `--profile` invocation, so `deriveBranchHost()` was never reached.

That is why COG-2 saw `CAPABILITY_REQUIRED` for PARALLEL and had no delegation delivery. It was a
true statement about that deployment, not about the packaged host.

## 2. What the normal host composes

The shipped plugin (`host/dsh/lib/index.js`) reads `--profile` and its own `process.argv[1]`, and
when `profile.reasoning` is present it derives:

- `branchExecution` — the blocking subprocess branch port for the live working directory;
- `branchExecutionFor` — the same adapter bound to a frozen snapshot's `workDir` for a delegation.

It also supplies the live DSH `agents` service, the host's own work-worker facts (`dshBin`,
`profile`) and `DSH_HOME`. `launchDeployment` then composes:

- the reasoning store and first-party exploratory policies when `reasoning` is present;
- the delegation service when reasoning + repository + `branchExecutionFor` exist;
- the terminal delivery seam when `host.dshAgents` exists **and** `attention.activation === "dsh"`;
- the attention adapter (`dsh-agents`, resume-capable).

A **live** `PALIMPSEST_HOST_READY` from the scored P run (`research-evidence/cog3/runs/P1/`) reports:

```json
{"application":"full",
 "collaboration":{"advisor":"AVAILABLE","localExplore":"AVAILABLE",
   "branchAdapter":"dsh-subprocess-branch:cog3-programme",
   "reasoningStore":"CONFIGURED","projectVerification":"AVAILABLE",
   "crossProject":"UNAVAILABLE","inboundPump":"CONFIGURED",
   "attention":"ACTIVE","coldResume":"AVAILABLE"},
 "toolNames":[...,"palimpsest_collaborate","palimpsest_delegate","palimpsest_project",...]}
```

That is a composition fact, not a behaviour claim; the behaviour is in §4.

## 3. The four execution modes, kept distinct

| mode | what runs | durability | exercised here |
| --- | --- | --- | --- |
| local EXPLORE (`palimpsest_collaborate` PARALLEL) | ephemeral reasoning branches under one ReasoningCell, executed **sequentially** by `RecipeExecution` | no durable agent, no peer | not exercised through `collaborate`; the same branch host is exercised through delegation |
| delegated RESEARCH (`palimpsest_delegate`) | one ephemeral branch over a **frozen detached worktree** of the committed HEAD, with a terminal result delivered to the principal | host job is in-memory; `INTERRUPTED` is honest after restart; v1 does not auto-rerun | **yes**, probes and scored P run |
| Managed Work (`palimpsest_begin`) | governed attempt in an execution world, evidence, settlement, promotion | durable canonical Work | attempted by the P principal and **refused**; no completion standard and the profile's work position is a worktree (see §5) |
| cross-project | explicit peer routing | durable transport | not composed (`crossProject: UNAVAILABLE`) |

The delegated branch is **not** an independently durable agent. It is an ephemeral cognition over a
frozen basis whose result is delivered as one follow-up turn.

## 4. The capability matrix

Columns: implemented / composed in the normal host / model-reachable / actually executed / result
delivered / consumed / limitations.

| capability | implemented | composed | model-reachable | executed | delivered | consumed | limitations |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Project Workspace Journal (read) | yes | yes (journal store + workspace) | yes (`palimpsest_project action=journal_entries`) | yes (P1: 3 project calls; bodies returned) | in the tool result | yes (plan uses the 2024 pilot) | count-only launch hint; the branch does not see the journal |
| Project Workspace Journal (write) | yes | yes | yes (`action=journal`) | not in COG-3 (seeded by the operator) | in the tool result | n/a | write fence requires the current project |
| local FOCUS | yes | yes | yes (`palimpsest_collaborate`) | not selected in COG-3 | in-band plan | n/a | the advisor still decides |
| local EXPLORE / PARALLEL | yes | **yes** (branch adapter present, `localExplore: AVAILABLE`) | yes | not through `collaborate`; the identical branch host ran via delegation | delegation terminal, not the recipe result | yes (P1 finding) | sequential branch execution; ephemeral; exploratory standing |
| `palimpsest_collaborate` | yes | yes | yes | no | n/a | n/a | no COG-3 trial asked for it; COG-2's PARALLEL refusal was a deployment limitation |
| `palimpsest_delegate` | yes | **yes** (reasoning + repository + `branchExecutionFor` + dsh activation) | yes | **yes** (P1 and probes) | **yes** (`PALIMPSEST_DELEGATION delivered:true`) | **yes** (plan uses the delivered range/basis) | exploratory only; no Evidence/Proof; delivery is in-memory and not crash-durable |
| long-lived principal | yes | yes (`dsh --profile` without `--once`) | n/a | yes (P1 stayed alive through delivery and a second turn) | n/a | n/a | process lifetime is the host's durability boundary |
| terminal delivery | yes | yes | n/a | yes (P1) | yes | yes | one delivery per ref per process; a delivery failure does not rewrite the result |
| cold resume | yes | yes (`coldResume: AVAILABLE`) | n/a | **yes** (P1 phase 2 resumed the same session with the update) | n/a | yes | a resume is a new process, not asynchronous continuity |
| Attention activation | yes | **yes now** (`attention: ACTIVE`) | n/a | not exercised (no peer signal in COG-3) | n/a | n/a | COG-2's `none` was the deployment, not the product |
| Managed Work (`palimpsest_begin`) | yes | yes, but no confirmed standard here | yes | attempted, refused | refusal | n/a | profile `execution` defaults to worktree; principal bootstrap v1 requires in-place; no completion standard |
| Project Intent | yes | yes | **no model-facing tool** | no | n/a | n/a | unchanged from COG-1/COG-2 |
| Trajectory projection | yes | worker-prompt-facing | **no model-facing tool** | no | n/a | n/a | unchanged |
| native DSH subagents (F baseline only) | installed | enabled in the F profile | yes (`subagent`, `subagent_fork`, workflow) | see the F run | the headless runner waits for children | see the F run | a native baseline, not a Palimpsest capability |

## 5. Managed Work: two independent refusals, not one

The P principal called `palimpsest_begin` and received:

> this deployment's work position is an isolated worktree; direct principal bootstrap v1 supports
> in-place execution only — worktree execution belongs to the D2 worker path

This is an honest refusal. The deployment profile omitted `execution`, so it defaulted to
`worktree`; the principal bootstrap path requires `in-place`. Independently, the profile has no
`standard` sentence, so no completion standard could be confirmed. COG-3 did not change either
field to make the call succeed, because no COG-3 result depends on formal Work.

## 6. G0 verdict: ESTABLISHED

The ordinary packaged DSH Host configuration used for COG-3 provides the capabilities the
experiment needs: a real model-facing `palimpsest_delegate`, a host-derived subprocess branch port,
a frozen snapshot, a reasoning store, terminal delivery, and a long-lived principal with cold
resume. The required missing seam is **not** a new runtime.

The COG-2 discrepancy is resolved: `CAPABILITY_REQUIRED` was a property of the diagnostic
deployment, not of the packaged host.

## 7. G1 verdict: ESTABLISHED after one bounded correction

Before the correction, the chain ran end to end but the branch produced an ungrounded
`undetermined` conclusion: it made exactly one tool call (`palimpsest_branch_result`) and never
opened its frozen basis, because its prompt said it had "exactly ONE tool" and to reason "using ONLY
the material above". The finding was delivered and consumed, but it was not evidence-bearing.

The correction is documented in [`COG3-ENGINEERING-REPORT.md`](COG3-ENGINEERING-REPORT.md). After
it, the same host path produced a branch that read seven files, settled as ADMITTED, delivered a
grounded conclusion naming its sources, and was consumed by the principal. The pre-correction run
is preserved as the failure that justified the change.
