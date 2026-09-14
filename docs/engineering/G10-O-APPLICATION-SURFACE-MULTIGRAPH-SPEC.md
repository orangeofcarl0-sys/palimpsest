# G10-O — Unified Application Surface, Agent Tools & MultiGraph Debugger (Spec)

Baseline: `main @ d1e128e`. Status: implemented; see
`docs/engineering/audits/G10-O-APPLICATION-SURFACE-MULTIGRAPH-DELIVERY.md`.

## Mission

> Make the existing AI-organization kernel operable by agents and inspectable by humans without
> creating a second semantic system.

```text
existing semantic services → ONE composed application surface → agent tools · typed HTTP · MultiGraph UI
```

## Red lines

```text
ApplicationSurface/Tool/HTTP/UI ≠ CanonicalStore     UI State ≠ CanonicalTruth
GraphProjection ≠ CanonicalGraph                     UI/Tool/HTTP action ≠ AuthorityGrant
graph edit gesture ≠ organization/runtime/boundary/epistemic mutation
WorkGraph ≠ OrganizationGraph ≠ CollaborationGraph ≠ RuntimeGraph ≠ ReasoningGraph
ProjectController ≠ global controller   caller ≠ caller-supplied PeerRef authority
Read model ≠ mutation path   presentation node id ≠ canonical identity   layout ≠ semantic state
Missing optional surface ≠ empty known state   Unknown ≠ empty   Error ≠ unknown   Stale ≠ current
```

## Application surface

`PalimpsestApplicationSurface` with optional sub-surfaces `work`, `federation`, `boundary`,
`runtime`, `organization`, `campaign`, `dynamics`, `evolution`, `reasoning`, `projections`.
It exposes ONLY read-only and high-level-safe-mutation service methods; raw store mutators,
authority/admission ports, and verification ports are never reachable. Local actor identity is
derived from installation wiring — a tool/HTTP caller can never supply `from`, `acceptedBy`,
`localPeer`, or `authenticated`. `ProjectController` remains Work-scoped; the composition lives
above it. `installed.application` is always present (Work-only on a bare install).

## Agent tools

`definePalimpsestTools(controller)` keeps the nine Work tools byte-compatible. Additive cohesive
tools appear **only when their surface exists**: `palimpsest_surfaces`, `palimpsest_federation`,
`palimpsest_boundary`, `palimpsest_runtime_view`, `palimpsest_organization_view`,
`palimpsest_campaign_view`, `palimpsest_dynamics`, `palimpsest_evolution`,
`palimpsest_reasoning`, `palimpsest_graph`. Every tool is a strict object schema
(`additionalProperties: false`) with a discriminated `action`, and unknown fields/second
authority verbs are rejected.

## Typed HTTP routes

`serveOrchestration(controller, { application? })` — additive. When an application is supplied,
namespaced strict routes are served: `/api/application/surfaces`,
`/api/federation/*`, `/api/boundary/*`, `/api/runtime/*`, `/api/organization/*`,
`/api/campaign/*`, `/api/dynamics/*`, `/api/evolution/*`, `/api/reasoning/*`,
`/api/projection/{work|organization|collaboration|runtime|reasoning}`. There is no generic
`POST /api/advanced {service, method}` tunnel and no raw-store endpoint. Errors map to honest
statuses (400 invalid, 403 not admitted / unauthorized, 404 unknown, 409 stale/conflict,
501 surface absent). The bearer token admits a request to the server only — never semantic
authority.

## MultiGraph projections

Typed per species (`work | organization | collaboration | runtime | reasoning`), each an envelope
`schemaVersion · species · projectionDigest · sourceBases · knowledge · nodes · edges`. A
projection is derived and read-only, with canonical refs on every node and a presentation id that
is never written back. `knowledge ∈ {known, unknown, error, stale}` — an unavailable source is an
honest `unknown`/`error`, never an empty known graph. Internal membership and external
representation edges are distinct; a pending/rejected candidate is never rendered as an admitted
claim; a commitment is a distinct visual species from a message edge; a RuntimeScope parent is
never labelled a manager.

## Web debugger

An additive MultiGraph view (species switcher, typed graph shell over `@xyflow/react`, typed
inspector showing the canonical ref, an honest surfaces/knowledge panel, and two governed safe
actions: reasoning candidate evaluation and boundary accept/reject — both through the SAME typed
routes as the tools). Work canvas/live-draft behaviour is unchanged.
