# Semantic owner map (SR-1 R0)

Descriptive, **not** a runtime registry (§9). Every row answers: who owns the semantics, where
the durable state lives, which application surface exposes it, which host adapters carry it,
and who composes it. Where a capability has no application surface or no adapter, the row says
so rather than inventing one.

Companion documents: `MODULE-ARCHITECTURE-BASELINE.md` (measured dependency facts),
`APPLICATION-ADAPTER-MATRIX.md` (surface → DSH tool → HTTP route → CLI).

## 1. How to read this

| column | meaning |
| --- | --- |
| capability | the product-level capability a user or host thinks in terms of |
| canonical semantic owner | the module that owns the meaning and the invariants — the only place that may decide |
| durable store(s) | the append-only ledger(s)/table(s) it owns, when it owns one |
| application surface | the façade in `src/application/` that exposes it (composition root wires it) |
| DSH / HTTP | the adapters that carry it to a host, if any |
| composition owner | where `install.ts` wires it today (R1 replaces this column with a `compose*()` module) |

## 2. Kernel

| capability | canonical semantic owner | durable store | application surface | adapters | composition owner |
| --- | --- | --- | --- | --- | --- |
| Event log / replay | `src/state/` (`EventStore`) | orchestration sqlite (append-only) | — (consumed by façades and projections) | — | `install.ts` (caller-supplied or derived) |
| ProjectIR / stage graph / state machine | `src/domain/`, `src/schema/` | — (pure) | — | — | none (pure) |
| Scheduling & ready-set | `src/scheduler/` | — (derived from the log) | `application/surface.ts` (via controller) | — | `install.ts` |
| Evidence graph & gates DSL | `src/evidence/` | — (pure) + gate results on the log | `DisclosureSurface`, `EmpiricalSurface` | HTTP (`/api/evidence…`) | `install.ts` |
| Effects (Ordarium Safe Actions) | `src/effects/{actions,executor,git_port}.ts` | Ordarium ledger | — | — | `install.ts` (`createPalimpsestEffects`) |
| Promotion authority | `src/effects/promotion.ts` (`PromotionManager`) | Ordarium ledger + project-head row | via `WorkSurface`/`WorkCli` | — | `install.ts` |
| Recovery (startup reconciliation) | `src/recovery/recovery.ts` | reads the promotion ledger | — | — | `install.ts` |
| Binding / run / architecture definitions | `src/binding/`, `src/run/`, `src/architecture/` | — (definitional digests) | `application/surface.ts` (architect mode) | DSH (`palimpsest_start`, `palimpsest_plan`) | `install.ts` |
| Selection / allocation | `src/select/`, `src/allocate/` | Ordarium telemetry | `PerformanceTable` projections | — | `install.ts` |

## 3. Semantic capabilities

| capability | canonical semantic owner | durable store | application surface | adapters | composition owner |
| --- | --- | --- | --- | --- | --- |
| Work orchestration (tasks, attempts, gates, promotion flow) | `src/tools/controller.ts` (`ProjectController`) — deliberately NOT decomposed in SR-1 (§25) | the event log | `WorkSurface` + `ControlSurface` | DSH Work tools, HTTP `/api/*`, `palimpsest` CLI | `install.ts` |
| Federation (peers, threads, inbox, messages) | `src/federation/` | transport ledger + cursors | `FederationSurface` | DSH `palimpsest_federation`, HTTP | `install.ts` |
| Federation transport (durable envelopes) | `src/transport/` | Ordarium transport ledger | via federation | — | `install.ts` |
| Boundary memory (cross-org memory/routes) | `src/boundary_memory/` | boundary store | via federation/attention | HTTP (boundary routes) | `install.ts` |
| Coordination (participation, membership) | `src/coordination/` | coordination store | `OrganizationSurface` | HTTP | `install.ts` |
| Institutions / organizations / dynamics / evolution / memory | `src/institution/`, `src/organization*.ts` | organization store | `OrganizationSurface` | HTTP | `install.ts` |
| Campaign | `src/campaign/` | campaign store | `CampaignSurface` | HTTP | `install.ts` |
| Reasoning cell (branches, claims, frontier, admission) | `src/reasoning_cell/` | cell store | `ReasoningSurface` | DSH `palimpsest_reasoning` (expert) | `install.ts` / `deployment/reasoning_bundle.ts` (packaged) |
| Proof assets & disclosure | `src/proof_asset/` | proof store (optional) | `ProofSurface`, `DisclosureSurface` | HTTP | `install.ts` (only when a store is supplied) |
| Project verification | `src/project_verification/` — CHECK delegates here; collaboration never owns verification truth | verification store | `VerificationSurface` | DSH `palimpsest_verification` (expert) | `install.ts` |
| Project workspace (journal, assets, view) | `src/project_workspace/` | project journal + associations | `WorkspaceSurface` | DSH `palimpsest_project`, HTTP | `install.ts` |
| External asset library bridge | `src/external_assets/` | receipt store (append-only) | `ExternalAssetsSurface` | HTTP | `install.ts` (only when a provider is configured) |
| Project management (work mode, registry, activity) | `src/project_management/` | management store | `ManagementSurface` | DSH `palimpsest_manage`, HTTP | `install.ts` |
| Project operating posture | `src/project_operating/` | posture on the log | `OperatingSurface` | HTTP | `install.ts` |
| Monitor runtime (long-horizon observation) | `src/monitor/` | monitor store | `MonitorSurface` | HTTP | `install.ts` |
| Attention (signals, policy, activation) | `src/attention/` | marks store | `AttentionSurface` | host adapters (`deployment/host_activation.ts`, DSH runner) | `install.ts` |
| Continuity (epistemic wait/resume) | `src/continuity/` | continuity store | via campaign/organization | — | `install.ts` |
| Runtime identity / evolution / scope | `src/runtime/`, `src/runtime_evolution/`, `src/runtime_scope/` | runtime stores | `RuntimeSurface` | HTTP, DSH (`palimpsest_run`) | `install.ts` |
| Context retrieval (compile/pull/embed) | `src/context/` | — (derived) | via Work/HTTP context routes | HTTP | `install.ts` |
| Telemetry & performance tables | `src/telemetry/` | telemetry state | `PerformanceTable` projections | HTTP | `install.ts` |
| Empirical evaluation | `src/experiment/` | run artifacts | `EmpiricalSurface` | HTTP | `install.ts` |
| Canvas (documents, mutation, presentation) | `src/canvas/` | — (documents are caller-held; server holds none) | canvas routes via `serve.ts` | HTTP (`/api/canvas…`), CLI | `install.ts` |
| Agent graph IR & patch protocol | `src/graph/` | — (pure) | via canvas | HTTP, DSH (`palimpsest_graph`) | `install.ts` |

## 4. Product interaction (UX line)

| capability | canonical semantic owner | product interaction | application surface | adapters |
| --- | --- | --- | --- | --- |
| Local collaboration (one request → Explore/Check) | `src/interaction/collaboration.ts` over the EXISTING recipe/reasoning/verification owners | UX-A | `CollaborationSurface` | DSH `palimpsest_collaborate` |
| Cross-project Ask (one request → another project) | `src/interaction/cross_project.ts` over the EXISTING federation/transport/attention owners | UX-B | `CrossProjectSurface` | DSH `palimpsest_cross_project`, HTTP cross-project routes |
| Host attention text (`AttentionSignal` → host text) | `src/interaction/cross_project_host_adapter.ts` (formats routing metadata only) | UX-C, RC-1E | — | DSH runner |
| Architecture advisor (AUTO/FOCUS/EXPLORE decisions) | `src/advisor/` | UX-A | via `CollaborationSurface` | — |
| Recipe compilation & execution | `src/recipes/` | UX-A | `RecipesSurface` | DSH `palimpsest_recipe(s)` |
| Cross-project intent handoff (remote local collaboration) | product surface only: attention text + tool description; the WORK is done by the remote project's own `CollaborationService` | RC-1E | — | DSH tool descriptions |

**No vertical is duplicated here.** In particular: CHECK delegates to `project_verification`
and collaboration owns no verification truth; a cross-project response composes through the
remote project's own collaboration service rather than re-implementing Explore; and the
attention formatter owns no content and no policy.

## 5. What SR-1 is allowed to change (and what it is not)

| allowed | forbidden |
| --- | --- |
| where a capability is *wired* (composition modules) | who owns a capability's semantics |
| where a façade *physically lives* (`src/application/surfaces/*`) | what a façade returns or how it fails |
| how a host adapter is *split into files* | what a tool/route accepts, returns or is named |
| the shape of `install.ts` | `installPalimpsest()`'s inputs, outputs, absence or disposal semantics |
