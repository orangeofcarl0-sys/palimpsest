# Application adapter matrix (SR-1 §24)

Documentation only — a description of how each capability reaches a host today, and the
intended R3 partition. It is **not** a runtime registry and nothing reads it at runtime.

## 1. Entries (unchanged by SR-1)

| entry | file | contract |
| --- | --- | --- |
| DSH aggregate tools | `src/tools/application_tools.ts` → `defineApplicationTools(application)` | the agent-facing tool set |
| DSH legacy Work tools | `src/tools/tools.ts` → `definePalimpsestTools(controller)` | the nine Work tools |
| HTTP | `src/application/http.ts` → `handleApplicationRequest(input)` | the local orchestration API |
| CLI | `src/cli.ts` → `palimpsest …` | operator/expert CLI |
| Serve | `src/serve.ts` → `serveOrchestration(options)` | the local UI + API server |
| Descriptor | `src/descriptor.ts` | the session panel descriptor (route B) |

## 2. Current exposure by capability

`DSH` = agent tool name(s); `HTTP` = route prefix; `CLI` = command group.

| capability | application surface | DSH | HTTP | CLI |
| --- | --- | --- | --- | --- |
| Work / ProjectIR | `application.surface.ts` (WorkSurface) | `palimpsest_start`, `palimpsest_plan`, `palimpsest_next`, `palimpsest_status`, `palimpsest_run`, `palimpsest_report`, `palimpsest_claim`, `palimpsest_gate`, `palimpsest_preview` (legacy set) | `/api/work*`, `/api/status`, `/api/graph` | `new`, `plan`, `next`, `status`, `report` |
| Collaboration (UX-A) | CollaborationSurface | `palimpsest_collaborate` | `/api/collaboration/*` | — |
| Cross-project (UX-B/RC-1E) | CrossProjectSurface | `palimpsest_cross_project` | `/api/cross-project/*` | — |
| Advisor | via CollaborationSurface | `palimpsest_advisor` | — | — |
| Recipes | RecipesSurface | `palimpsest_recipe`, `palimpsest_recipes` | `/api/recipes*` | — |
| Reasoning cell | ReasoningSurface | `palimpsest_reasoning` | — | — |
| Project verification | VerificationSurface | `palimpsest_verification` | `/api/project/verification*` | — |
| Project workspace | WorkspaceSurface | `palimpsest_project` | `/api/project/*` | — |
| Project management | ManagementSurface | `palimpsest_manage` | `/api/management/*` | — |
| Project operating | OperatingSurface | — | `/api/project/operating*` | — |
| Monitor | MonitorSurface | — | `/api/monitor*` | — |
| Attention | AttentionSurface | `palimpsest_attention` | `/api/attention*` | — |
| Federation | FederationSurface | `palimpsest_federation` | `/api/federation/*` | — |
| Campaign | CampaignSurface | — | `/api/campaign*` | — |
| Organization / institution | OrganizationSurface | `palimpsest_graph` (projection) | `/api/organization*` | — |
| Runtime identity | RuntimeSurface | `palimpsest_run` (expert) | `/api/runtime*` | — |
| Proof / disclosure | ProofSurface, DisclosureSurface | — | `/api/proof*`, `/api/disclosure*` | — |
| External assets | ExternalAssetsSurface | `palimpsest_external_assets` | `/api/external-assets/*` | — |
| Canvas / graph | projections + canvas routes | `palimpsest_graph`, `palimpsest_surfaces` | `/api/canvas*` | `architect` |
| Telemetry / performance | PerformanceTable projections | — | `/api/performance` | — |
| Empirical evaluation | EmpiricalSurface | — | `/api/empirical*` | — |

## 3. Intended R3 partition (not done in this stage)

```text
src/adapters/dsh/            src/adapters/http/
  common.ts                    common.ts
  work.ts                      router.ts
  collaboration.ts             work.ts
  cross_project.ts             collaboration.ts
  workspace.ts                 cross_project.ts
  management.ts                workspace.ts
  verification.ts              management.ts
  reasoning.ts                 verification.ts
  proof.ts                     external_assets.ts
  external_assets.ts           …
  federation.ts
  index.ts
```

Each module owns only: tool/route names, descriptions, argument validation, translation to an
application call, result wrapping. Nothing in the partition may query a semantic store, and the
aggregate entries (`defineApplicationTools`, `handleApplicationRequest`) stay the public entry
points (§21/§23). The DSH catalogue and the HTTP route table are frozen by
`application_tools.ts`'s action enum and `http.ts`'s route list, both asserted by existing tests;
R3 must keep them byte-identical (§31/§32).

## 4. Why this is still one file today

`src/tools/application_tools.ts` (1,090 lines) and `src/application/http.ts` (1,126 lines) are
both giant switchboards. R0 measured their fan-out as 8 and 10 — low, because each one talks
only to the application surface — but their *change radius* is the whole file: any new tool or
route edits the same 1,000-line file. That is what R3 is for, and it is why SR-1 is PARTIAL as
delivered: the adapter split has not happened yet.
