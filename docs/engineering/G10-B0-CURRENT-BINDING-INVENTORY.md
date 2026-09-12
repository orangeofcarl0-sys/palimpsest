# G10-B0 — Current Binding-Related Implementation Inventory

Status: **DRAFT · POST-UAS-1 · inventory of canonical `main` @ `b18b08b`**

Purpose: prevent designing a parallel binding architecture unaware of current
code. Every entry was read from the repository (paths/symbols verified on the
G10-B0 branch, which is canonical `main` + docs). "Binding relevance" = how the
surface relates to the Binding seam; "Migration" = what a future implementation
would need to touch (nothing is changed in this stage).

Headline: **`main` contains no binding concept at all** — no `BindingDefinition`,
`PersistentPoint`, `PeerRef`, `RuntimeAgent`, or resolved-binding type. The seam
is greenfield; the inventory below is what the seam will have to coexist with.

| # | Path / symbol | Current meaning | UAS-1 dimension / concern | Binding relevance | Migration implication |
|---|---|---|---|---|---|
| 1 | `src/architecture/proposal.ts` — `TaskProposal.definitionId?`, `TaskProposal.scopeId?`, `ProjectProposal` compile | Work/task definition identity carried from canvas/graph into proposals; `DUPLICATE_DEFINITION_ID` fail-closed | Work / Definition | The work-side lineage a binding would hang *requirements* on — never the binding identity itself | Binding gets a **new identity namespace**; `definition_id` untouched (`UAS1-INV-05`) |
| 2 | `src/schema/models.ts` — `TaskSpec.definition_id?` (persisted) | Persisted Work/Task definition lineage (spec 30) | Work / Definition | Same as #1, durable side | No reinterpretation; new fields only |
| 3 | `src/graph/ir.ts` — AgentGraph IR, node `mode:"runtime"`, capability gate (`UNSUPPORTED_NODE_KIND/EDGE_KIND/EDGE_ENDPOINT/PARALLEL_DATA_EDGE/RUNTIME_CYCLE`) | Renderer/runtime-decoupled Work graph IR; "declarable ≠ runnable" fails closed | Work / Definition (+capability gate) | The existing model for requirement-vs-satisfaction semantics; binding's requirement/unsatisfied semantics should be its sibling | A binding requirement layer would be new code beside the gate, not inside it |
| 4 | `src/graph/patch.ts` — GraphPatch | Formal edit protocol over the Work graph; freshness anchors (`baseGraphDigest`, `STALE_GRAPH_BASE`) | Work / Definition | Pattern donor for binding revision/freshness discipline | Future typed patch families stay open (PLMP-UAS-1 §14); no reuse of GraphPatch for binding |
| 5 | `src/serve.ts`, `src/canvas/derive.ts` — `/api/graph` Definition+Runtime+Trace projections; satellite attempts (`task.attempts`), `traceRows` | Unified runtime graph: definition, runtime instance and trace projections | Work / Runtime / Execution | Where a future resolved-binding artifact would become visible (runtime projection), never the definition projection | New projection fields would be additive; no reinterpretation |
| 6 | `src/scheduler/scheduler.ts` — `decide()` pure (returns prepared event), `commit()` persists | ReadySet scheduler; graph decides which transition fires | Work / Runtime | Hard placement constraint: binding **resolution is supplied state**; realization is effectful and outside `decide()` | Resolver sits before scheduling; scheduler code unchanged |
| 7 | `src/tools/controller.ts` — attempt attribution `{model, cost}`, `modelCandidates`, `bestModel` advisory | Per-attempt model attribution and R6 best-model advisory | Runtime / Execution (+advisory) | Concrete provider/model selection **already lives at runtime/advisory level** — independent evidence for `LogicalNeed ≠ ConcreteProvider` | Future provider binding plugs in beside this; nothing reinterpreted |
| 8 | `src/tools/dsh_types.ts` — `DshToolRunContext` (`callId`, `rootCallId`, `agent?: unknown`, `parent?`, `signal`, `concludeTurn?`) | Structural stand-in for the DSH host tool contract; agent identity deliberately opaque | Runtime / Execution | The runtime-carrier integration seam where "runtime attachment" would eventually be typed | Keep structural until a real contract exists; no runtime identity invented here |
| 9 | `src/state/database.ts` — `defaultStatePath(canonicalRepository)` (resolved host path), state store | Repository identity = host-resolved path; dual-ledger topology (DSH/Ordarium) | Continuity (weak) / Effect substrate | Workspace locality is currently a **host path**, not a durable logical identity | Logical workspace requirement vs host path split (design §9); no path semantics change |
| 10 | `src/install.ts`, `src/cli.ts`, `src/effects/runtime.ts`, `src/effects/git_port.ts` — worktree/scratch allocation and effect runtime | Task execution allocates worktrees/scratch via effects (Ordarium-governed effect side) | Effect / Runtime | This is **resource allocation**, distinct from binding semantics (design §12/§48) | Realization/attachment would extend this side; allocation stays separate from intent |
| 11 | `src/canvas/*` (`mutate.ts`, `lift.ts`, `diff.ts`, `compile.ts`), CanvasDoc v3 (`identity` families `n:<ns>:<k>`) | Work authoring surface; stable graph identity; presentation preservation | Work / Definition | Authoring source of the Work side; canvas is not a truth store for organization/binding | Binding authoring, if ever visualized, shares renderer only (`UAS1-INV-08`) |
| 12 | `src/domain/*` (`stage_graph.ts`, `gate_clause.ts`, `policy.ts`, `state_machine.ts`) | Contract-disciplined stage/gate/policy definitions (PARSE-INV, WIRE-INV) | Work / Governance | Style donor for fail-closed contract parsing of a future BindingDefinition schema | Future binding schema should follow the same reject-unknown-fields discipline |
| 13 | `src/context/manifest.ts` (+ CTX-2/3/4 retrieval/boot/pull) | Per-run context retrieval over worktree texts; manifest distribution | Work / Runtime | Today context is **worktree-scoped per run**; a PersistentPoint's long-lived context would be a new continuity concern | Binding selects *which* locus participates; it does not embed context (design §10/§62-63) |
| 14 | `src/architecture/presets.ts` — preset library (PLMP-ARCH-3) | Approximate architecture presets (UAS-0 fidelity: approximate) | Architecture / Definition | Presets may one day carry binding *requirements*; they are not bindings themselves | No change; fidelity labels stay |
| 15 | `src/telemetry/*`, `src/tools/control_surface.ts`, `src/tools/parallel.ts` | Telemetry/management state kinds; control surface; bounded parallel execution | Runtime / Effect | Operational surfaces adjacent to realization; no binding semantics today | No change |
| 16 | `src/evidence/*` | Evidence-side machinery for worker outputs (evidence governance direction) | Governance / Epistemic | Confirms `WorkerReport ≠ Evidence` is already operationally respected; binding grants no evidence status | No change |

## Explicit non-exhaustive notes

- There is **no** DSH Agent/Session registry, provider catalog, or
  PersistentPoint-like table anywhere in `src/` — nothing to migrate or deprecate.
- `definition_id` / `definitionId` appear only in the Work-lineage sense (#1/#2)
  plus their projections (`src/serve.ts`, `src/canvas/diff.ts`, `src/state/projector.ts`,
  `src/state/migrations.ts`, `src/tools/graph.ts`) — all Work-concern; none is
  overloaded with architecture/binding meaning.
- The PAL-FED federation runtime (`src/federation/…`, `PeerRef`, six collab
  tools, admission gate) exists only on experimental branches and is **not** on
  `main`; per §51 none of it is inherited. PeerRef appears in this inventory
  only as a frozen-open relation in the identity matrix.
