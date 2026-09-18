# Public API assessment (SR-1 §27)

Audit, not redesign. SR-1 **must not make a breaking export change**: this document classifies
what exists at the baseline (`a30a328` / tree `83ef6ba`) so that a refactor can be checked
against it. Cleaning the surface up is **SR-3**, explicitly not this stage.

## 1. The three entry points, as shipped

| entry | declaration | contents |
| --- | --- | --- |
| `palimpsest-dsh` (`.`) | `main: ./dist/src/index.js`, `types: ./dist/src/index.d.ts`, `exports["."]` | "P0 contract core": `schema`, `domain`, `state`, `scheduler` barrels + additive G10-X exports (`plan_reconciliation`, `project_head`, `AtomicAppendError`, `AtomicFaultHook`) |
| `palimpsest-dsh/advanced` | `exports["./advanced"]` | 44 re-export blocks covering the whole product and expert surface, accumulated across G10-D5 → … → UX-C |
| `palimpsest` (bin) | `bin.palimpsest: ./dist/src/cli.js` | the CLI, including the operator-only path |

`src/index.ts` still describes itself as the *early* P0 contract core. That comment is
**historical**, not a claim about the product's current surface; the audit keeps it as a
documented legacy marker rather than rewriting history in a structural stage.

## 2. Classification

### 2.1 Product surface — the documented v1 path

These are what README, `docs/user-guide.md` and the DSH skill tell a user to use. SR-1 may move
their *files* but must keep their *names, shapes and behaviour*.

| export | owner | notes |
| --- | --- | --- |
| `installPalimpsest`, `InstallPalimpsestOptions`, `InstalledPalimpsest` | `src/install.ts` | the advanced golden path; R1 must keep it byte-compatible |
| `launchDeployment`, `parseDeploymentProfile`, `DeploymentProfileError` | `src/deployment/` | the packaged path used by the DSH host and every dogfood |
| `makePalimpsestApplicationSurface`, `PalimpsestApplicationSurface`, `ApplicationSurfaceDeps` | `src/application/surface.ts` | the aggregate façade type; R2 must keep it aggregate |
| `defineApplicationTools`, `DshToolDefinition` | `src/tools/application_tools.ts`, `dsh_types.ts` | the DSH aggregate entry; R3 must keep it the entry |
| `handleApplicationRequest`, `ApplicationRouteInput`, `ApplicationRouteResult`, `applicationErrorStatus` | `src/application/http.ts` | the HTTP aggregate entry; R3 must keep it the entry |
| `serveOrchestration`, `ServeOptions`, `ServeHandle`, `isClientForbiddenPort`, `staticBundleFiles` | `src/serve.ts` | the local serve face |
| collaboration types (`CollaborationRequest/Result/PlanView`, `CollaborationError`, `CapabilityRead`) | `src/interaction/` | UX-A product contract |
| cross-project types (`CrossProjectCollaborationResult`, `ProjectAnswerStatus`, `CrossProjectError`) | `src/interaction/` | UX-B product contract |
| host text constants (`CROSS_PROJECT_INBOUND_REQUEST_TEXT`, `CROSS_PROJECT_INBOUND_ANSWER_TEXT`, `crossProjectAttentionText`) | `src/interaction/cross_project_host_adapter.ts` | RC-1E product-surface contract; asserted by tests as *content* |
| `ProjectController` | `src/tools/controller.ts` | product-level Work orchestration; SR-1 §25 forbids decomposing it |

### 2.2 Kernel surface

`schema`, `domain`, `state`, `scheduler`, `evidence`, `select`, `allocate`, `effects`
(re-exported by both entry points). Stable, append-only in practice; SR-1 changes nothing here.

### 2.3 Advanced / expert surface

`reasoning_cell`, `proof_asset`, `recipes` (registry/execution internals), `federation`
internals, `transport`, `boundary_memory`, `coordination`, `institution`, `organization*`,
`campaign`, `continuity`, `monitor`, `project_operating`, `project_management`, `project_workspace`,
`project_verification`, `external_assets`, `runtime*`, `context`, `telemetry`, `experiment`,
`canvas`, `graph`, `attention`, `allocate`, `select`, `tools/graph`, `tools/control_surface`,
`descriptor.ts` (route-B session panel descriptor). Documented as expert/advanced; retained
verbatim by SR-1.

### 2.4 Legacy compatibility surface

| export / marker | why it is legacy |
| --- | --- |
| `src/index.ts`'s "P0 contract core" doc block | describes the phase0-2 baseline, not today's product; kept as a marker, not rewritten |
| `FakeGitPort`, `MockExecutor` (via `effects`) | test/embedding doubles shipped in the product surface |
| `setWorkModePreference` | operator-only; deliberately absent from the agent tool surface (asserted by `test/ab_adversarial.test.ts`) |
| `definePalimpsestTools` | the legacy Work tool set; superseded by `defineApplicationTools` for the product path |
| `tui.ts` | the terminal renderer line (PLMP-TUI-1) |
| `Callback*TransportPort` | embedding/test transport adapters |

## 3. Rules SR-1 must respect

```text
no export may disappear
no export may change shape, name or failure type
no NEW export may be added to the root entry (.); advanced may gain re-exports of the new
  composition modules only if they are genuinely useful to embedders (documented in the PR)
package.json "exports"/"main"/"types"/"bin" stay byte-identical
```

Deferred to SR-3 (recorded in `SR-1-CARRY-FORWARD.md`): splitting `advanced` into
named subpath exports, retiring the embedding doubles from the product surface, and
reconciling the root entry's historical doc block with the current surface.

## 4. How SR-1 proves it (SR1-A14)

`test/architecture/public_api_parity.test.ts` snapshots the export surface of both entry points
from the **installed build** (`dist/src/index.d.ts`, `dist/src/advanced.d.ts`) and asserts that
every name present at the baseline is still present, with the same kind (value vs type), after
every work package. The snapshot is captured from the canonical baseline and committed as
`architecture/public-api-baseline.json`.
