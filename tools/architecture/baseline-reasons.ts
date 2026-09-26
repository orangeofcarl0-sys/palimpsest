/**
 * SR-1 §10, repaired by SR-1C §4 — the recorded reason for every exception in the architecture
 * baseline.
 *
 * Exceptions are keyed by CONCRETE IMPORT EDGE (`from -> to`), never by layer pair, so that a
 * fifth upward import cannot slip in under the same layer pair. The reasons live in code (not
 * only in the generated JSON) so that `--write` is deterministic and a reason change shows up in
 * the diff. An exception without a reason is not allowed to exist.
 */

const UPWARD_EDGE_REASON =
  "One of the four historical upward imports recorded at the SR-1 baseline: a capability module reads a PROJECTION or " +
  "the durable operating posture. These are real edges, not misclassifications, and each is enumerated individually so " +
  "that no NEW one may appear. Removing them is SR-2 work (the projection should depend on the owner, not the other way " +
  "round), not part of a structural refactor that must not change semantics.";


/** Forbidden import edges that exist at the SR-1 baseline, keyed `fromFile -> toFile`. */
export const BASELINE_EDGE_REASONS: ReadonlyMap<string, string> = new Map([
  ["src/monitor/driver.ts -> src/project_operating/posture.ts", UPWARD_EDGE_REASON],
  ["src/monitor/driver.ts -> src/project_operating/work_mode_profile.ts", UPWARD_EDGE_REASON],
  ["src/project_workspace/view.ts -> src/tools/graph.ts", UPWARD_EDGE_REASON],
  ["src/tools/controller.ts -> src/tools/graph.ts", UPWARD_EDGE_REASON],
]);

/** Cycles that exist at the SR-1 baseline, keyed by the sorted file list joined with `|`. */
export const BASELINE_CYCLE_REASONS: ReadonlyMap<string, string> = new Map([
]);

/* ================================================================== *
 * SR-2e §21/§22/§23 — the CONSTRAINT tables
 *
 * These are DECLARED rules, not observed exceptions: the firewalls and allowlists are stated as
 * policy and `baselineFrom` copies them, so a `--write` can never derive a rule from the graph it
 * is meant to constrain (that would permit exactly what it found).
 * ================================================================== */

import type {
  DependencyFirewall,
  HotspotRatchet,
  ImporterAllowlist,
} from "./rules.js";

/**
 * §21 — CONCRETE DEPENDENCY FIREWALLS.
 *
 * Each answers a question the LAYER model cannot: two modules whose layers permit the edge in
 * general, where the concrete pair is nonetheless wrong.
 */
export const DEPENDENCY_FIREWALLS: readonly DependencyFirewall[] = Object.freeze([
  {
    id: "continuation-not-world-internals",
    from: ["src/continuation/"],
    to: [
      "src/state/",
      "src/tools/controller.ts",
      "src/project_world/issuance.ts",
      "src/project_world/observation_authority.ts",
      "src/project_world/admission_store.ts",
      "src/deployment/source_change_observer.ts",
    ],
    reason:
      "the continuation layer reaches the world through its own consumer-owned ports; naming an " +
      "authority module directly is exactly the dependency knowledge SR-2a removed. The port wall " +
      "is a RULE now, not a convention a future slice may quietly reopen.",
    exclusions: [],
  },
  {
    id: "identity-not-its-consumers",
    from: ["src/identity/"],
    to: ["src/coordination/", "src/federation/", "src/organization/", "src/boundary_memory/"],
    reason:
      "the stable-identity layer sits BELOW Coordination semantics and Federation transport, which " +
      "is what makes their direction one-way. Importing an upper layer would rebuild the ten-file " +
      "cycle SR-2d3 removed.",
    exclusions: [],
  },
  {
    id: "work-not-host",
    from: ["src/work/"],
    to: ["src/tools/controller.ts", "src/deployment/", "src/composition/"],
    reason:
      "a Work owner answers Work questions; the controller is one of its CONSUMERS, and the host " +
      "bundle runs a worker. An upward edge from the owner to either inverts the ownership SR-2b " +
      "established.",
    exclusions: [],
  },
  {
    id: "context-not-host",
    from: ["src/context/"],
    to: ["src/tools/controller.ts", "src/deployment/", "src/composition/"],
    reason:
      "the context owner produces a manifest from owners it consumes; the host RUNS a worker and " +
      "the controller is a consumer. SR-2b4 already moved one such edge (the worker-context " +
      "contract is declared structurally) and this keeps it moved.",
    exclusions: [],
  },
  {
    id: "result-not-world-internals",
    from: ["src/result/"],
    to: ["src/tools/controller.ts", "src/state/", "src/deployment/"],
    reason:
      "Result ≠ World, and SR-2c made that a module boundary. The result plane judges nothing about " +
      "the world's consistency and must not reach the Work owner, the log or the host to do its job.",
    exclusions: [],
  },
]);

/**
 * §22 — HOTSPOT RATCHETS, measured AFTER SR-2.
 *
 * A known hotspot may not silently grow again. The ceiling is the measured post-SR-2 value, so the
 * rule reads "no worse than where SR-2 left it" rather than an aspirational number nobody verified.
 * `null` means "not ratcheted on this axis" — spelled out so it cannot be misread as a ceiling of 0.
 */
export const HOTSPOT_RATCHETS: readonly HotspotRatchet[] = Object.freeze([
  {
    file: "src/tools/controller.ts",
    maxLoc: 4830,
    maxFanOut: 39,
    maxFanIn: 19,
    reason:
      "the Work orchestration façade and the measured hotspot SR-2 exists for. It was 5378 LOC / " +
      "fanOut 35 / fanIn 20 at the SR-2 start snapshot and 4828 / 39 / 19 after the b-slices: the " +
      "KNOWLEDGE it owns fell even though its fan-out rose (it now composes its owners). The ceiling " +
      "is where SR-2 left it — it may fall, and it may not grow back.",
  },
  {
    file: "src/composition/install_contract.ts",
    maxLoc: 700,
    maxFanOut: 40,
    maxFanIn: null,
    reason:
      "the aggregate install contract, at the §25 size ceiling. It is a composition surface, so its " +
      "fan-out is expected — what may not grow is its SIZE, because a contract that keeps absorbing " +
      "fields stops being reviewable. A new cohesive contract belongs in its own module.",
  },
  {
    file: "src/application/factory.ts",
    maxLoc: null,
    maxFanOut: 36,
    maxFanIn: null,
    reason:
      "the application factory composes every face; its fan-out is the assembly. Ratcheted on " +
      "fan-out only, because that is the number that grows when a face is added without a decision.",
  },
  {
    file: "src/advanced.ts",
    maxLoc: null,
    maxFanOut: 40,
    maxFanIn: null,
    reason:
      "the public entry barrel. Its fan-out is the public surface itself, so a NEW re-export is a " +
      "public API change and should be visible as a ratchet breach rather than as an incidental diff.",
  },
]);

/**
 * §23 — CONCRETE IMPORTER ALLOWLISTS.
 *
 * `module` may be imported ONLY by the listed prefixes. This is the rule the ruling singled out for
 * the E plane, and it is the strongest of the three: a new semantic module fails on the IMPORT
 * itself rather than on a symptom three layers away.
 */
export const IMPORTER_ALLOWLISTS: readonly ImporterAllowlist[] = Object.freeze([
  {
    module: "src/tools/controller.ts",
    allowedImporters: [
      // The composition root wires it; the application/HTTP surfaces and the DSH adapters are its
      // faces; the interaction services are its consumers. Everything else must depend on the
      // OWNER it needs (the Work read model, the head service, the execution owner), not on the
      // façade that happens to expose it.
      "src/composition/",
      "src/application/",
      "src/tools/",
      "src/interaction/",
      "src/deployment/",
      "src/install.ts",
      "src/cli.ts",
      "src/serve.ts",
      "src/tui.ts",
      "src/descriptor.ts",
      // The public entry barrels re-export the surface, which is what a barrel is for.
      "src/index.ts",
      "src/advanced.ts",
      "src/monitor/",
      "src/project_management/",
      "src/project_workspace/",
      "src/project_verification/",
      "src/external_assets/",
      "src/recipes/",
      "src/advisor/",
      "src/campaign/",
      "src/collaboration/",
      "src/attention/",
      "src/reasoning_cell/",
      "src/coordination/",
      "src/institution/",
      "src/organization_evolution/",
      "src/runtime_evolution/",
      "src/continuity/",
      "src/federation/",
      "src/organization_dynamics/",
      "src/boundary_memory/",
      "src/evidence/",
    ],
    reason:
      "the controller is a COMPATIBILITY FAÇADE over owners, not an implementation nexus. Existing " +
      "consumers are recorded so this slice changes nothing; the point is the NEXT module — a new " +
      "semantic or E-plane module must reach the owner it needs (src/work/, src/context/, " +
      "src/result/, src/identity/) rather than this façade, and that now fails on the import.",
  },
  {
    module: "src/state/event_store.ts",
    allowedImporters: [
      // The log's writers and readers that already exist: the projection/state layer itself, the
      // composition root, the domain's aggregate validation, the scheduler, and the stores that
      // are its peers. A NEW module must reach a semantic owner instead.
      "src/state/",
      "src/composition/",
      "src/domain/",
      "src/scheduler/",
      "src/tools/",
      "src/effects/",
      "src/recovery/",
      "src/coordination/",
      "src/evidence/",
      "src/install.ts",
      "src/cli.ts",
      "src/serve.ts",
      "src/tui.ts",
      "src/descriptor.ts",
      "src/index.ts",
      "src/advanced.ts",
      "src/continuity/",
      "src/boundary_memory/",
    ],
    reason:
      "the Event Log is the deepest owner in the system. SR-2a removed the continuation layer's " +
      "direct reach into it; recording the current readers keeps that removal from being undone " +
      "while making a NEW reader a deliberate, reviewable act.",
  },
]);
