# COG1 — Capability and Product-Path Audit

**Stage:** COG-1 (P0)
**Baseline:** `61b0757dea988daa10a00c220dee34e2d4c72028` (CI3 Evidence Freeze), branch `palimpsest-cog1-real-task-compounding`
**Runtime:** `0.2.1-rc.3` (installed, verified); model route `deepseek-official` / `deepseek-flash`
**Method:** source audit of this tree. Every claim below cites the file that decides it. Claims marked **[PROBED]** were additionally exercised against the real runtime during this stage's feasibility work; everything else is a source-level finding and is labelled as such.

This audit exists because COG-1 asks what a real model can do through the *ordinary product surface*. The answer is not "what modules exist" but "what a model-driven principal can reach, and what happens when it reaches it".

---

## 0. What was actually verified live in this stage

| probe | result |
|---|---|
| Real model call through the DSH runtime | **PASS** — `dsh --profile headless "Reply with exactly one word: READY"` returned `READY`, exit 0, ~9 s |
| Isolated runtime home | **PASS** — with both accepted home variables pointing at a test directory, the run created `profiles/`, `sessions/`, `storages/` there and did not touch the owner's `~/.dsh` |
| Real principal with the Palimpsest host bundle | **PASS** — `PALIMPSEST_HOST_READY` reported `application: "full"`, `localExplore: AVAILABLE`, `branchAdapter: dsh-subprocess-branch:cog1-probe-p`, and **25** `palimpsest_*` tools |
| The model can see and name those tools | **PASS** — asked to list them, it printed all 25 names |
| The principal can read and write the project world | **PASS** — it created `REPORT.md` containing exactly `PROBE_OK` in the project working directory |

The feasibility gate is therefore satisfied: a real model-driven principal, composed with the shipped product, in an isolated runtime home, can act on a project.

---

## 1. The capability ladder, per mechanism

§4 of the ruling asks for six rungs. They are not interchangeable, and a lower rung is never evidence of a higher one.

| # | Mechanism | Implemented | Composed in a normal deployment | Model-reachable | Actually exercised (this stage) | Consumed downstream |
|---|---|---|---|---|---|---|
| 1 | `palimpsest_collaborate` (AUTO/FOCUS/PARALLEL/CHECK) | yes `src/interaction/collaboration.ts:469,603,667,808` | always (needs `localPeer`) `src/install.ts:229-246` | **yes** `src/adapters/dsh/product.ts:20` | P2 | P2 |
| 2 | ReasoningCell + ephemeral branches | yes `src/reasoning_cell/service.ts:169` | `"reasoning": {}` → store + policies `src/deployment/launch.ts:521-532`; branch port from the host `host/dsh/lib/index.js:101-112` | yes (`palimpsest_reasoning`; branch *execution* only via collaborate/delegate) | P2 (if C chooses PARALLEL) | P2 |
| 3 | `PROJECT_READ_ONLY` branch profile | yes `src/deployment/branch_host.ts:100-113,329-347` | host-derived, not a profile field | **indirectly only** — fixed by `palimpsest_delegate` `src/interaction/delegation.ts:517` | not exercised | n/a |
| 4 | Knowledge Selection / Context Manifest | yes `src/context/knowledge.ts:96-109,386` | context compilation always; explicit selection is a HOST argument | **NO tool accepts it**; with no capability ports it would refuse `KNOWLEDGE_CAPABILITY_UNAVAILABLE` (`knowledge.ts:395-397`) | not reachable | n/a |
| 5 | Proof / Reasoning / Procedure standing | yes (`src/proof_asset`, `src/reasoning_cell`, `src/procedures`) | Reasoning yes; **Proof and Procedure have no profile field** (`src/composition/collaboration.ts:104`, `src/install.ts:394-405`) | Reasoning yes; Proof/Procedure tools are absent with their surfaces | Reasoning only (P2) | P2 |
| 6 | Project Workspace journal + asset association | yes `src/project_workspace/service.ts:184-199` | only with `databases.projectAssociations` / `projectJournal` (`src/deployment/launch.ts:331-338`) | **journal yes** (`palimpsest_project` action `journal`, `src/adapters/dsh/project.ts:26,74`); **asset association is HTTP-only** (`src/adapters/http/project.ts:145-162`) | P2 | P2 |
| 7 | Project Intent prepare/assess/apply | yes `src/project_intent/service.ts:88-95` | composes when any of proof/reasoning/workspace does `src/install.ts:442-450` | **NO tool, no route, no application surface** — `installed.intent` only (`src/install.ts:597`) | not reachable | n/a |
| 8 | Collaboration Need/Contact/Commitment/Fulfillment | yes `src/federation/federation_service.ts:176,243,288` | always via federation `src/composition/collaboration.ts:222-270` | **partly**: `palimpsest_federation` exposes offer/accept/reject/release/handoff and `contact`; request/commitment-for-need/fulfillment are trimmed (`src/application/surfaces/federation.ts:27-52`) | not exercised | n/a |
| 9 | Work / Task / Attempt / Result | yes `src/tools/controller.ts`, `src/work/*` | always `src/composition/core.ts:342` | **yes** — `palimpsest_start/plan/next/preview/run/claim/report/gate/status` + `begin/finish/surfaces` | P2 | P2 |
| 10 | Trajectory context / historical projection | yes `src/trajectory/*` | `installed.trajectory` always; model-visible section needs `"trajectory": {}` (default OFF) `src/deployment/launch.ts:574-581` | **NO tool**; delivered into a *worker* prompt only | not exercised | n/a |
| 11 | Management involvement / work mode | yes `src/project_management/service.ts:203-237` | only with a workspace (`src/composition/governance.ts:449-451`) | `palimpsest_manage` exists then; `applyOperatorModeChange` is CLI-only `src/cli.ts:626` | P2 (C may call it) | P2 |
| 12 | Cold resume / attention / activation | yes `src/attention/*`, `src/continuation/*`, `src/recovery/*` | needs `"attention"` with `activation:"dsh"` `src/deployment/launch.ts:514-520`; also `dshAgents` | host-side; only `palimpsest_attention` (read-only) is a tool | not exercised (see §4) | n/a |
| 13 | Verification + promotion | yes `src/evidence/gate_dsl.ts:86`, `src/effects/promotion.ts:448` | always | verification **yes** (`palimpsest_verification`); **promotion has NO tool** — `palimpsest_run` returns `needs_promotion`, `palimpsest_finish` never promotes | not exercised | n/a |
| 14 | Organization memory / institution / learning | yes (`src/organization_memory`, `src/institution`, `src/institutional_learning`) | **no profile field** → absent in a normal deployment | **no** | not reachable | n/a |

---

## 2. The decisive structural constraint: Work is git-shaped

This is the single most important finding for a *non-software* project, and it was confirmed independently by two audits of `src/work/*` and `src/effects/*`.

- `src/deployment/profile.ts:152` — `repository` is **optional**, so a deployment can exist without one.
- `src/composition/core.ts:126,141` — but the controller then falls back to `process.cwd()`, and the execution-world port is `gitRepositoryWorldPort`; without a repository no world port is composed (`core.ts:297-304`).
- `src/work/attempt_execution.ts:205-211` — `assertWorktreePlacement` refuses any placement other than `worktree`.
- `attempt_execution.ts:336-352` — `assertNoUnownedWork` and `observedHead` shell out to `git`; head must equal `ProjectIR.head_commit`, the proven effect head and `TaskEnvelope.base_commit`.
- `src/tools/controller.ts:2241-2249` → `src/effects/actions.ts:96-122` → `src/effects/git_port.ts:523-578` — claiming an attempt materialises a **git clone** of the canonical repository at `<repository>/.palimpsest/worlds/<attemptId>`.
- `attempt_execution.ts:404-430` — settlement requires a commit, changed files, and changed files inside `write_paths`.
- `src/effects/promotion.ts:448-515` + `git_port.ts:1123-1148` — promotion is `git merge --no-ff`.

So: **a Work attempt cannot run in a project that is not a git repository.** A folder of documents is a valid *project* for planning, federation and reasoning, but it cannot host a Work attempt. Any COG-1 cognitive treatment that uses Work must place its documents in a git repository. That is not a workaround invented here — it is the product's own execution contract, and the scenario below uses a git repository as the document container for exactly that reason.

There is no `executionRoot`, no non-git world backend, and no deployment mode that changes this. A model cannot choose otherwise.

---

## 3. What "the ordinary product path" means in this tree

Condition C is defined by the shipped principal and its tools, not by the harness.

**[PROBED]** the 25 tools a real principal received with a representative deployment profile:

`palimpsest_start`, `plan`, `next`, `preview`, `run`, `claim`, `report`, `gate`, `status`, `surfaces`, `finish`, `begin`, `attention`, `federation`, `boundary`, `runtime_view`, `reasoning`, `recipes`, `advisor`, `recipe`, `collaborate`, `project`, `manage`, `verification`, `graph`.

Not present in that same deployment: `palimpsest_proof`, `palimpsest_proof_source`, `palimpsest_disclosure`, `palimpsest_experiments`, `palimpsest_organization_view`, `palimpsest_campaign_view`, `palimpsest_dynamics`, `palimpsest_evolution`, `palimpsest_delegate`, `palimpsest_cross_project`, `palimpsest_external_assets`, `palimpsest_manage` (composed only with a workspace, which this profile has).

That list is the product surface this experiment can honestly evaluate. Nothing outside it may be called "ordinary product behaviour".

---

## 4. Where the product path is thinner than the documentation suggests

These are recorded, not fixed. Each one is a candidate bottleneck for Stage D and each is measured rather than assumed in P2.

1. **Knowledge selection is host-side.** The durable knowledge that makes compounding possible is selected by a `KnowledgeSelectionRequest` supplied by the host (`src/interaction/work_delegation.ts:552-560`, `src/tools/controller.ts:4528-4547`). A model cannot select capital. On a deployment without capability ports, even the host's explicit selection would refuse (`knowledge.ts:395-397`). E-LIVE recorded the same friction.
2. **Project Intent has no model surface at all.** The whole prepare/assess/apply loop exists and composes, and no tool reaches it. §12's "use existing `project_intent` capabilities when reachable" is therefore answered by the source: **not reachable**.
3. **Asset association is HTTP-only.** `associateAsset` has no `palimpsest_project` action, so a principal cannot link its reasoning/proof assets to the project through the tool surface.
4. **Promotion is operator-only.** A model can run a gate and read `needs_promotion`; it cannot promote. That is a *safety* property and must not be weakened for a demonstration.
5. **Delegation needs a repository + reasoning + a host branch factory, and delivery needs `activation:"dsh"`.** With the probe profile `coldResume` was `UNAVAILABLE`; the principal can start a delegation but the terminal result has no delivery path in that composition.
6. **Trajectory is a worker-prompt feature, not a readable artifact.** A principal cannot query what earlier attempts delivered.
7. **The repository requirement (§2).** Any cognitive project must live in git.

---

## 5. The distinctions this audit keeps

- **Implemented ≠ composed ≠ reachable ≠ used ≠ effective.** Every row above is recorded at the rung it was actually observed at.
- **A probe that composes a capability is not a demonstration that a model uses it.** The probes in §0 show reachability; P2 measures use.
- **`PALIMPSEST_HOST_READY` proves composition, not cognition.** It was reported by a probe whose only task was to list tool names.
- **Explore findings are not verified truth; a Gate PASS is project-state verification, not a verification of findings.** This distinction is preserved in the scenario's deliverables and in how they are scored.
- **The audit is source-level except where marked [PROBED].** The probes are cheap, and they were run before any trial so that a "capability absent" result could not be confused with a harness defect.
