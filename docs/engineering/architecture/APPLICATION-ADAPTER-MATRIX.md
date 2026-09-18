# Application adapter matrix (SR-1 §24/§34 — after R3)

Documentation only — a description of how each capability reaches a host today and which module now
owns that adapter surface. It is **not** a runtime registry and nothing reads it at runtime.

## 1. Entries

| entry | file | contract |
| --- | --- | --- |
| DSH aggregate tools | `src/tools/application_tools.ts` → `defineApplicationTools(application)` | the agent-facing tool set (compatibility path; the aggregate lives in `src/adapters/dsh/index.ts`) |
| DSH legacy Work tools | `src/tools/tools.ts` → `definePalimpsestTools(controller)` | the nine Work tools |
| HTTP | `src/application/http.ts` → `handleApplicationRequest(input)` | the local orchestration API (compatibility path; the manifest lives in `src/adapters/http/router.ts`) |
| CLI | `src/cli.ts` → `palimpsest …` | operator/expert CLI |
| Serve | `src/serve.ts` → `serveOrchestration(options)` | the local UI + API server |
| Descriptor | `src/descriptor.ts` | the session panel descriptor (route B) |

The two entries that changed in R3 changed only their *location*, never their signature, and each
old import path still resolves (§10/§18).

## 2. Capability → surface → DSH tool → HTTP route → adapter module

The last two columns are the point of R3: a change to one capability's adapter surface touches one
file per host, not a switchboard.

| capability | application cluster | DSH tool | HTTP prefix | DSH module | HTTP module |
| --- | --- | --- | --- | --- | --- |
| installation discovery | `work.ts` | `palimpsest_surfaces` | `/api/application/surfaces` | `dsh/work.ts` | `http/work.ts` |
| Work / ProjectIR | `work.ts` | legacy `definePalimpsestTools` set | `/api/work*`, `/api/status`, `/api/graph` | `tools/tools.ts` (unchanged) | — |
| Collaboration (UX-A) | `product.ts` | `palimpsest_collaborate` | `/api/collaboration/*` | `dsh/product.ts` | `http/product.ts` |
| Cross-project (UX-B/RC-1E) | `product.ts` | `palimpsest_cross_project` | `/api/cross-project/*` | `dsh/product.ts` | `http/product.ts` |
| Advisor | `cognition.ts` | `palimpsest_advisor` | `/api/advisor/recommend` | `dsh/cognition.ts` | `http/cognition.ts` |
| Recipes + execution | `cognition.ts` | `palimpsest_recipe`, `palimpsest_recipes` | `/api/recipes*` | `dsh/cognition.ts` | `http/cognition.ts` |
| Reasoning cell | `cognition.ts` | `palimpsest_reasoning` | `/api/reasoning/*` | `dsh/cognition.ts` | `http/cognition.ts` |
| Empirical memory | `cognition.ts` | `palimpsest_experiments` | `/api/experiments*`, `/api/memory/*` | `dsh/cognition.ts` | `http/cognition.ts` |
| Projections / graph | `projections.ts` | `palimpsest_graph` | `/api/projection/*` | `dsh/graph.ts` | `http/projections.ts` |
| Project workspace | `project.ts` | `palimpsest_project` | `/api/project/*` | `dsh/project.ts` | `http/project.ts` |
| Project management | `project.ts` | `palimpsest_manage` | `/api/manage/*` | `dsh/project.ts` | `http/project.ts` + `http/management.ts` |
| Project verification | `project.ts` | `palimpsest_verification` | `/api/verification/*` | `dsh/project.ts` | `http/project.ts` |
| Monitor | `project.ts` | — (read-only, no tool) | `/api/monitor/*` | — | `http/project.ts` |
| External assets | `project.ts` | `palimpsest_external_assets` | `/api/external-assets/*` | `dsh/project.ts` | `http/external_assets.ts` |
| Attention | `federation.ts` | `palimpsest_attention` | `/api/attention` | `dsh/federation.ts` | `http/federation.ts` |
| Federation | `federation.ts` | `palimpsest_federation` | `/api/federation/*` | `dsh/federation.ts` | `http/federation.ts` |
| Boundary memory | `federation.ts` | `palimpsest_boundary` | `/api/boundary/*` | `dsh/federation.ts` | `http/federation.ts` |
| Runtime identity | `organization.ts` | `palimpsest_runtime_view` | `/api/runtime/*` | `dsh/organization.ts` | `http/organization.ts` |
| Organization / institution | `organization.ts` | `palimpsest_organization_view` | `/api/organization/*` | `dsh/organization.ts` | `http/organization.ts` |
| Campaign | `organization.ts` | `palimpsest_campaign_view` | `/api/campaign/view` | `dsh/organization.ts` | `http/organization.ts` |
| Dynamics | `organization.ts` | `palimpsest_dynamics` | `/api/dynamics/*` | `dsh/organization.ts` | `http/organization.ts` |
| Evolution (both planes) | `organization.ts` | `palimpsest_evolution` | `/api/evolution/*` | `dsh/organization.ts` | `http/organization.ts` |
| Proof / evidence | `proof.ts` | `palimpsest_proof`, `palimpsest_proof_source` | `/api/proof/*` | `dsh/proof.ts` | `http/proof.ts` |
| Disclosure | `proof.ts` | `palimpsest_disclosure` | `/api/proof/disclosure/*` | `dsh/proof.ts` | `http/proof.ts` |

## 3. The delivered partition

```text
src/adapters/dsh/                    src/adapters/http/
  common.ts      87  helpers            common.ts          190  contract + wire helpers
  work.ts        52                    router.ts          105  manifest + dispatch
  graph.ts       34                    work.ts             57
  organization.ts 106                  projections.ts      56
  proof.ts       135                   management.ts       89
  federation.ts  139                   product.ts         121
  product.ts     148                   organization.ts    164
  cognition.ts   183                   federation.ts      206
  project.ts     317                   external_assets.ts 213
  index.ts        31  aggregate        proof.ts           234
                                       cognition.ts       305
                                       project.ts         369
```

Each module owns only: tool/route metadata, its own argument parsing, and the application façade
call. No adapter imports a durable store or a semantic service — the only imports from below the
application layer are definitional vocabularies and pure parsers, pinned symbol by symbol in
`test/architecture/{dsh,http}_adapter_clusters.test.ts`.

## 4. Why the partition differs from the §17 sketch

- **`graph.ts` / `projections.ts`** — the spec listed `graph.ts` for the DSH side and no projections
  module for HTTP. The DSH tool is named `palimpsest_graph`; the HTTP routes are `/api/projection/*`.
  Each file is named after the host surface it fronts, which is what a reader greps for.
- **`external_assets.ts` and `management.ts` (HTTP)** — the spec's HTTP list did not separate them.
  They are separate because `/api/external-assets/*` is a closed set with a surface-first 501 rule
  and `/api/manage/*` is the confirmable management tail: one file each keeps every cluster well
  under the §29 review flag (the largest is 369 lines).
- **`project.ts` is the largest on both sides** (317 / 369) and that is the honest measurement: the
  project workspace, its management plane, its monitor and its verification face are one capability
  area. Splitting them further would put one concern's routes in three files.

## 5. Frozen by test, not by convention

| invariant | test |
| --- | --- |
| DSH tool set, mode, description, full parameter schema, digest | `test/architecture/application_parity.test.ts` |
| HTTP route set, GET/POST outcome classes, accepted-method sets | `test/architecture/application_parity.test.ts` |
| HTTP static manifest equals the canonical route set | `test/architecture/http_adapter_clusters.test.ts` |
| no two route descriptors can match the same pathname (§21) | `test/architecture/http_adapter_clusters.test.ts` |
| adapters do not bypass the façade | `test/architecture/{dsh,http}_adapter_clusters.test.ts` |
| `src/adapters/**` is L5; `L1/L2/L3 → adapters` is rejected | `test/architecture/module_architecture_rules.test.ts` + a live probe |
| the aggregates stay shallow and declare nothing | `test/architecture/change_radius.test.ts` |
