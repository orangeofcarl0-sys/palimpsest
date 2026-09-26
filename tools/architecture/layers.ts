/**
 * SR-1 §6/§7 — the logical layer map the architecture checker enforces.
 *
 * This is a DESCRIPTIVE map of where each module lives in the logical architecture,
 * not a runtime registry and not a new ownership model. It exists so that a NEW edge
 * pointing in a forbidden direction can be caught in CI, while every legitimate edge
 * that already exists is recorded as an explicit exception (§6: "Do not enforce a fake
 * purity model that destroys valid ownership").
 *
 * Layers (§6):
 *   L1  Core Kernel            domain, schema, state, scheduler, effects, evidence, …
 *   L2  Semantic Capabilities  campaign, federation, reasoning_cell, verification, …
 *   L3  Product Interaction    interaction, advisor, recipes, management, operating, …
 *   L4  Application Facades    src/application/*
 *   L5  Host / Deployment      DSH tools, HTTP, CLI, deployment, install
 *   BARREL  root entry points that legitimately re-export from every layer
 *   UNCLASSIFIED  a module the map does not name — a VIOLATION, never a permission
 *
 * Allowed direction: L5 → L4 → L3/L2 → L1, with peers inside L1 and L2 allowed.
 *
 * SR-2 §五: UNCLASSIFIED exists because the old fallback ("unknown directory ⇒ BARREL")
 * handed every newly created `src/<name>/` the widest allowed-target set in the model —
 * a module nobody classified could import anything, silently. D5-d's continuation
 * orchestrator lived in exactly that escape hatch. An unclassified module is now its own
 * layer with NO allowed targets, and `checkArchitecture` reports it as its own violation
 * kind, so a forgotten classification fails CI instead of granting permission.
 */

export const LOGICAL_LAYERS = ["L1", "L2", "L3", "L4", "L5", "BARREL", "ENTRY", "UNCLASSIFIED"] as const;
export type LogicalLayer = (typeof LOGICAL_LAYERS)[number];

/** Directory-level defaults. A file path is matched by its directory under `src/`. */
const DIRECTORY_LAYERS: Readonly<Record<string, LogicalLayer>> = Object.freeze({
  // L1 — core kernel and substrate
  domain: "L1",
  schema: "L1",
  state: "L1",
  scheduler: "L1",
  effects: "L1",
  evidence: "L1",
  select: "L1",
  allocate: "L1",
  binding: "L1",
  // Definitional composites: pure data contracts and their validators, with no runtime
  // capability ownership. `run/definition.ts` composes ArchitectureDefinition + the Work
  // representative + a BindingDefinition, i.e. `architecture`, `run` and `binding` form ONE
  // definitional cluster. Keeping them in L1 is what makes the layer rule meaningful: an
  // upward edge OUT of it is a real signal.
  architecture: "L1",
  run: "L1",

  // L2 — semantic capability owners
  // SR-2d3 §十九: the STABLE IDENTITY contracts (peer / activation / attempt / organization /
  // accepted-boundary refs and the coordination parser contract). It sits BELOW Coordination
  // semantics and Federation transport, which is what makes their direction one-way.
  identity: "L2",
  // SR-2 §十四/§十五: RESULT identity, derivation, candidate storage and rematerialization.
  // `Result ≠ World`: World Consistency JUDGES a result's relation to the world; it does not own
  // the result. These modules are a semantic capability of their own.
  result: "L2",
  // SR-2 §九: the Work read owner. It answers Work projection questions (project, task,
  // attempt, current batch, envelope, attempt authorization, open attempt) and produces no
  // transitions — a semantic capability, not kernel substrate and not a host adapter.
  work: "L2",
  campaign: "L2",
  federation: "L2",
  reasoning_cell: "L2",
  proof_asset: "L2",
  project_verification: "L2",
  // PLMP-LEAN-1 §D3-a: the world-basis capability. It resolves a work's dependency
  // projection against the current world and stores the result append-once — a semantic
  // owner of execution provenance, not kernel substrate and not a host adapter.
  project_world: "L2",
  project_workspace: "L2",
  boundary_memory: "L2",
  monitor: "L2",
  attention: "L2",
  coordination: "L2",
  continuity: "L2",
  institution: "L2",
  organization: "L2",
  organization_dynamics: "L2",
  organization_evolution: "L2",
  organization_memory: "L2",
  runtime: "L2",
  runtime_evolution: "L2",
  runtime_scope: "L2",
  telemetry: "L2",
  context: "L2",
  experiment: "L2",
  external_assets: "L2",
  recovery: "L2",
  // The durable transport plane embeds PeerRef and BoundaryRemoteOperation, so it is bound
  // to those capabilities rather than being layer-free substrate: it is part of the L2
  // peer/boundary cluster (measured: transport ↔ boundary_memory ↔ coordination form one SCC).
  transport: "L2",

  // L3 — product interaction
  interaction: "L3",
  // PLMP-LEAN-1 §D5-d / SR-2 §五: the cross-kernel CONTINUATION orchestrator. It composes
  // World Consistency conclusions with the execution boundary, so it is product
  // interaction (L3) — never a World Kernel member (§四: Continuation is not part of OCC).
  continuation: "L3",
  advisor: "L3",
  recipes: "L3",
  project_management: "L3",
  project_operating: "L3",
  canvas: "L3",
  graph: "L3",

  // L4 — application facades
  application: "L4",

  // L5 — host / deployment adapters
  deployment: "L5",
  tools: "L5",
  // SR-1 §14/§34: the extracted host adapters (`src/adapters/dsh/**`, `src/adapters/http/**`).
  // Host-side wiring, exactly like `tools/` and `deployment/`: they may depend on anything and
  // nothing below may depend on them. The DSH and HTTP compatibility entries under `src/tools/`
  // and `src/application/` keep the import paths a caller already had (§10/§18).
  adapters: "L5",
  // SR-1 §11: the composition root's own modules. Composition is host/deployment-side wiring.
  composition: "L5",
});

/**
 * File-level overrides, each with a reason. A directory default is a convenience; where a
 * directory genuinely mixes concerns the FILE wins and the reason is recorded here.
 */
const FILE_LAYER_OVERRIDES: Readonly<Record<string, { readonly layer: LogicalLayer; readonly why: string }>> =
  Object.freeze({
    "src/tools/controller.ts": {
      layer: "L2",
      // The ProjectController owns the Work event log, ProjectIR revisioning and gate
      // authority. It lives under `src/tools/` for historical reasons; SR-1 §25 explicitly
      // does NOT decompose it. Classifying it as an adapter would make its legitimate
      // semantic imports look like L5→L2 violations in reverse.
      why: "Work/ProjectIR orchestration owner living under the tools directory (SR-1 §25 keeps it intact)",
    },
    "src/application/http.ts": {
      layer: "L5",
      // §23: the HTTP route table is an adapter, not a façade, even though it sits in
      // `src/application/` next to the surfaces it calls.
      why: "HTTP adapter (SR-1 §23)",
    },
    "src/descriptor.ts": {
      layer: "L5",
      why: "host-facing session panel descriptor generator (route B)",
    },
    // `src/tools/` mixes the DSH adapter with semantic helpers and projections. The
    // directory stays L5 by default; each non-adapter file is named here.
    "src/tools/gate_runner.ts": {
      layer: "L2",
      why: "executes gate commands through the effects runtime (semantic execution helper, not an adapter)",
    },
    "src/tools/parallel.ts": {
      layer: "L2",
      why: "role-slot and budget policy for parallel work (semantic policy, no durable store)",
    },
    "src/tools/graph.ts": {
      layer: "L3",
      why: "orchestration graph projection (derived view, consumed by façades and the control surface)",
    },
    "src/tools/control_surface.ts": {
      layer: "L3",
      why: "control-surface projection over gate/scheduler/graph facts (derived view)",
    },
    // `src/effects/` is the Ordarium effect plane. Its generic substrate (executor, ports,
    // generic Safe Actions, errors) is kernel; the capability-specific action modules belong
    // to the capability whose outbound contract they define.
    "src/effects/promotion.ts": {
      layer: "L2",
      why: "owns the promotion state machine, its ledger operations and the project-head row (a semantic owner, not kernel substrate)",
    },
    "src/effects/federation_actions.ts": {
      layer: "L2",
      why: "the federation capability's outbound Safe Actions",
    },
    "src/effects/runtime.ts": {
      layer: "L2",
      why: "the runtime capability's effect runtime port",
    },
    "src/effects/runtime_actions.ts": {
      layer: "L2",
      why: "the runtime capability's outbound Safe Actions",
    },
  });

/** Package barrels: entry points that legitimately re-export across their own package. */
const PACKAGE_BARRELS: readonly string[] = Object.freeze([
  "src/application/index.ts",
  "src/tools/index.ts",
  "src/effects/index.ts",
]);

/**
 * Root entry points: they re-export the whole public surface, are imported by hosts and
 * tests, and must NEVER be imported by a semantic module (that edge would close a cycle
 * through the composition root). Enforced by the allowed-target lists below.
 */
const ROOT_ENTRIES: readonly string[] = Object.freeze(["src/index.ts", "src/advanced.ts"]);

/**
 * Decide the logical layer of a repo-relative path (POSIX separators).
 *
 * First-party HOST code (SR-1C §9) is L5 exactly like the deployment and DSH adapters under
 * `src/`: it is host-side wiring, it may depend on anything, and nothing may depend on it from
 * below. There are zero file-level host exceptions at this baseline.
 */
export function layerOf(relativePath: string): { readonly layer: LogicalLayer; readonly why: string } {
  const override = FILE_LAYER_OVERRIDES[relativePath];
  if (override !== undefined) return { layer: override.layer, why: override.why };
  if (ROOT_ENTRIES.includes(relativePath)) {
    return { layer: "ENTRY", why: "root entry point re-exporting the public surface" };
  }
  if (PACKAGE_BARRELS.includes(relativePath)) {
    return { layer: "BARREL", why: "package barrel re-exporting its own package's surfaces and adapters" };
  }
  const parts = relativePath.split("/");
  if (parts[0] === "host") {
    return { layer: "L5", why: "first-party DSH host bundle (host/**): host-side wiring (SR-1C §9)" };
  }
  // src/<something> — either a directory or a top-level file.
  if (parts[0] !== "src") return { layer: "BARREL", why: "outside src and host" };
  const second = parts[1];
  if (second === undefined) return { layer: "BARREL", why: "src root" };
  if (parts.length === 2) {
    // A top-level file: install.ts, cli.ts, serve.ts, tui.ts are host-side entry points.
    const known = new Set(["install.ts", "cli.ts", "serve.ts", "tui.ts"]);
    return known.has(second)
      ? { layer: "L5", why: "host/deployment entry point" }
      : { layer: "UNCLASSIFIED", why: `unclassified src-root file src/${second}` };
  }
  const directory = second;
  const mapped = DIRECTORY_LAYERS[directory];
  if (mapped !== undefined) return { layer: mapped, why: `directory default for src/${directory}/` };
  return { layer: "UNCLASSIFIED", why: `unclassified directory src/${directory}/` };
}

/** Layers a module may legitimately depend on (§6 allowed direction). */
const ALLOWED_TARGETS: Readonly<Record<LogicalLayer, readonly LogicalLayer[]>> = Object.freeze({
  // A host entry point may import the product's public entry point; nothing else may, which
  // is what keeps a semantic module from closing a cycle through the composition root.
  L5: ["L5", "L4", "L3", "L2", "L1", "BARREL", "ENTRY"],
  L4: ["L4", "L3", "L2", "L1", "BARREL"],
  L3: ["L3", "L2", "L1", "BARREL"],
  L2: ["L2", "L1", "BARREL"],
  L1: ["L1"],
  // Barrels and entry points are re-export surfaces, not semantic modules.
  BARREL: ["L5", "L4", "L3", "L2", "L1", "BARREL", "ENTRY"],
  ENTRY: ["L5", "L4", "L3", "L2", "L1", "BARREL", "ENTRY"],
  // SR-2 §五: a module nobody classified may depend on NOTHING. This is deliberately not
  // "the strictest useful set" — it is the refusal to guess. The violation reported for an
  // unclassified module is its classification, not each of its edges, so an unclassified
  // module with no imports still fails.
  UNCLASSIFIED: [],
});

export function isAllowedEdge(from: LogicalLayer, to: LogicalLayer): boolean {
  return ALLOWED_TARGETS[from].includes(to);
}

/** Human-readable rule text for a forbidden pair, used in reports and failure messages. */
export function forbiddenEdgeRule(from: LogicalLayer, to: LogicalLayer): string {
  return `${from} → ${to} is forbidden (allowed: ${ALLOWED_TARGETS[from].join(", ")})`;
}
