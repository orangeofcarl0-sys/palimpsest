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
  {
    id: "context-not-knowledge-owner-internals",
    from: ["src/context/"],
    to: ["src/proof_asset/", "src/reasoning_cell/"],
    reason:
      "E1-K: the context owner consumes admitted knowledge through its own consumer-owned read ports " +
      "(`ContextKnowledgePorts`), and composition adapts the canonical owners into them. Naming Proof " +
      "or Reasoning directly would make context a SECOND reader of their semantics — the drift SR-2a " +
      "removed for the world plane. This rule is what keeps 'composition knows wiring; context knows " +
      "context semantics' machine-checked rather than aspirational.",
    exclusions: [],
  },
  {
    id: "kernel-not-knowledge-owners",
    from: ["src/work/", "src/domain/", "src/state/", "src/scheduler/"],
    to: ["src/proof_asset/", "src/reasoning_cell/"],
    reason:
      "E1-K §16: admitted knowledge informs COGNITION and authorizes nothing. No path may carry a " +
      "Proof or Reasoning standing into Work authority — not promotion eligibility, not Work " +
      "admission, not verification admission, not effect authority. The strongest place to hold that " +
      "is at the import: the Work owner, the pure rules, the log and the scheduler appear nowhere in " +
      "the knowledge planes' consumer set, and this rule keeps it that way.",
    exclusions: [],
  },
  {
    id: "project-intent-not-knowledge-owner-internals",
    from: ["src/project_intent/"],
    to: ["src/proof_asset/", "src/reasoning_cell/", "src/project_workspace/"],
    reason:
      "E2-I §9/§30: the intent owner grounds a proposal in admitted knowledge through its own " +
      "consumer-owned read ports (`ProjectIntentPorts`), and composition adapts Proof, Reasoning and " +
      "ProjectWorkspace into them. Naming a concrete owner would make intent a SECOND reader of its " +
      "semantics and — worse — put a mutation API one import away from the module that proposes " +
      "top-down change. Grounding must be observation, never authorship.",
    exclusions: [],
  },
  {
    id: "work-kernel-not-project-intent",
    from: ["src/work/", "src/domain/", "src/state/", "src/scheduler/"],
    to: ["src/project_intent/"],
    reason:
      "E2-I §2/§30: a proposal may PROPOSE top-down change but may never mutate top-down intent, and " +
      "the Work kernel may not consume a proposal as if it were authority. The only sanctioned path " +
      "from an accepted proposal into Work truth is `planReconciled`, which lives in the Work owner's " +
      "façade — so no kernel module, pure rule, log or scheduler may name the intent module at all.",
    exclusions: [],
  },
  {
    id: "management-not-intent-authority",
    from: ["src/project_management/"],
    to: ["src/project_intent/"],
    reason:
      "E2-I §18: ManagementMode grants ZERO project-intent authority. The management layer may later " +
      "recommend, prepare or surface a proposal, but it must never become the authority because the " +
      "mode changed — `DIRECT`/`ASSIST`/`MANAGE`/`DELEGATE` are not a semantic authority. Holding the " +
      "import out is the strongest form of that rule: the layer cannot reach the decision even by " +
      "accident, and its existing refusal to change goal/requirements is preserved.",
    exclusions: [],
  },
  {
    id: "project-collaboration-not-owner-internals",
    from: ["src/project_collaboration/"],
    to: ["src/proof_asset/", "src/reasoning_cell/", "src/boundary_memory/", "src/project_workspace/", "src/work/"],
    reason:
      "E3-C §30/§34: the collaboration-need owner observes Project reality through its own " +
      "consumer-owned read ports and declares a need through the EXISTING Federation port. It must not " +
      "name a concrete Proof/Reasoning/Boundary/Workspace owner (a second reader of their semantics, " +
      "and a mutation API one import away from the module that proposes a need), and it must not name " +
      "the Work kernel at all — `NeedCandidate ≠ ContactNeed` and `ContactNeed ≠ Assignment`, so the " +
      "module that authors a need can never reach a task, an attempt or the scheduler.",
    exclusions: [],
  },
  {
    id: "project-collaboration-not-event-store",
    from: ["src/project_collaboration/"],
    to: ["src/coordination/", "src/state/"],
    reason:
      "E3-C §4/§30: a `CollaborationNeedCandidate` is NON-CANONICAL and there is deliberately NO " +
      "candidate store. The durable `ContactNeed` is Federation-owned coordination history, reached " +
      "only through the declaration port, so the candidate module may not touch the coordination store " +
      "(or the Work event log) directly. Holding the import out is what makes 'no candidate store' " +
      "machine-checked rather than a promise in a comment.",
    exclusions: [],
  },
  {
    id: "work-kernel-not-project-collaboration",
    from: ["src/work/", "src/domain/", "src/state/", "src/scheduler/"],
    to: ["src/project_collaboration/"],
    reason:
      "E3-C §2/§34: `ContactNeed ≠ Assignment` and `Commitment ≠ Work ownership`. The Work kernel may " +
      "not consume a collaboration need as if it were work authority, and a project condition may not " +
      "silently become a scheduled obligation. The only sanctioned direction is the collaboration owner " +
      "READING Work facts; the kernel never reaches back into the module that authors needs.",
    exclusions: [],
  },
  {
    id: "federation-not-work-kernel",
    from: ["src/federation/"],
    to: ["src/work/", "src/scheduler/"],
    reason:
      "E3-C §2/§34: 'Project A may request and accept a contribution from Project B. Project A NEVER " +
      "obtains authority over Project B's Work ledger.' Federation owns peers, needs, contact, " +
      "commitments and fulfillment — never Work. If federation could name the Work kernel it could " +
      "schedule, mutate or observe a project's tasks, which is exactly the global-scheduler / " +
      "remote-Work-ownership failure this stage exists to prevent. There is no `assignPeerToTask`.",
    exclusions: [],
  },
  {
    id: "management-not-collaboration-authority",
    from: ["src/project_management/"],
    to: ["src/project_collaboration/"],
    reason:
      "E3-C §8: ManagementMode grants ZERO contact-need admission authority. `managementMode == " +
      "DELEGATE` must not imply an admitted need, and no caller boolean (`approved: true`) may stand in " +
      "for the independent authority. Holding the import out means the management layer cannot reach " +
      "the admission decision even by accident.",
    exclusions: [],
  },
  {
    id: "institutional-learning-not-mutation-internals",
    from: ["src/institutional_learning/"],
    to: ["src/organization_evolution/", "src/runtime_evolution/", "src/runtime_scope/", "src/organization/"],
    reason:
      "E4-L §23/§30: the learning layer OBSERVES structural change and never makes it. `Memory ≠ " +
      "Structure mutation` and `Evaluation ≠ Governance`: if this module could name an evolution " +
      "service, a runtime scope or an Organization, an empirical result would be one import away from " +
      "mutating the structure it merely studied — which is exactly the automatic self-modification loop " +
      "the ruling forbids. It reads evolution history through its own consumer-owned port instead, and " +
      "the composition adapter is the only place that sees both sides.",
    exclusions: [],
  },
  {
    id: "organization-memory-not-evolution-authority",
    from: ["src/organization_memory/"],
    to: ["src/organization_evolution/", "src/runtime_evolution/"],
    reason:
      "E4-L §28/§30: this is the G-13 WRONG EDGE held out at the import. `OrganizationMemory` is " +
      "empirical history — it is not, and must never become, a structural authority. If memory could " +
      "name an evolution plane it could execute a transformation, and `ArchitectureRecommendation → " +
      "OrganizationDynamicsProposal` would return indirectly through the back door. The direction is " +
      "one-way by construction: evolution writes its own truth, learning reads it.",
    exclusions: [],
  },
  {
    id: "advisor-not-structural-authority",
    from: ["src/advisor/"],
    to: ["src/organization_evolution/", "src/runtime_evolution/", "src/organization_dynamics/", "src/runtime_scope/"],
    reason:
      "E4-L §21/§28: the empirical architecture advisor RECOMMENDS and nothing more. `Architecture " +
      "recommendation ≠ OrganizationDynamicsProposal` and `Historical winner ≠ Future authority` — a " +
      "recommendation must not be convertible into a proposal or a mutation, not even by reaching the " +
      "owner that would accept one. The advisor consumes OrganizationMemory and returns text; the " +
      "governed structural path still begins with an independently authored DynamicsProposal.",
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
