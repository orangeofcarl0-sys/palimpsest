/**
 * palimpsest-dsh/advanced — P1/P2 surfaces.
 *
 * Ordarium effect wiring, git ports, promotion manager, attempt executors,
 * the ProjectController, the seven DSH tools, and the installPalimpsest
 * golden path. This is the explicit opt-in path for embedding and framework
 * authors.
 */

export * from "./effects/index.js";
export * from "./evidence/index.js";
export * from "./select/index.js";
export * from "./allocate/index.js";
export * from "./telemetry/index.js";
export * from "./tools/index.js";
export { installPalimpsest, trustedDefaultPolicy } from "./install.js";
export type { InstallPalimpsestOptions, InstalledPalimpsest, InstalledRuntime } from "./install.js";

/**
 * G10-D5: the runtime/continuity grounding surface — advanced opt-in only
 * (the root contract-core export intentionally stays free of runtime
 * mutators). The golden path is the high-level `installed.runtime` service;
 * the low-level kernel helpers below remain for framework authors and are
 * NOT the recommended production API.
 */
export * from "./runtime/index.js";
export * from "./continuity/index.js";
export * from "./coordination/index.js";
export * from "./federation/index.js";

/**
 * G10-F2: the organization grounding surface — advanced opt-in only. The
 * immutable OrganizationDefinition artifact and its canonical lineage store;
 * no WorkGraph, coalition, runtime, or institution equivalence.
 */
export * from "./organization/index.js";

/**
 * G10-F4: the durable institution continuity kernel — advanced opt-in only.
 * Stable institution identity, versioned charter, explicit continuation
 * authority, and authorized epoch lineage. Not the full PLMP-PAG-0 stack.
 */
export * from "./institution/index.js";

/**
 * G10-G1: the Campaign temporal surface — advanced opt-in only. Durable
 * long-horizon Campaign identity, commitments, and the append-only
 * CampaignStore. Campaign ≠ Project ≠ Institution ≠ RuntimeAgent.
 */
export * from "./campaign/index.js";

/**
 * G10-H: the runtime-organization surface — advanced opt-in only. Recursive
 * RuntimeScope identity (canonical store) and the derived Holon view.
 * RuntimeScope ≠ Organization ≠ Work scope ≠ PeerRef ≠ PersistentPoint
 * ≠ Activation ≠ Campaign; Holon is an external view, not a new identity.
 */
export * from "./runtime_scope/index.js";

/**
 * G10-I: Organization Dynamics — advanced opt-in only, READ-ONLY. Deterministic
 * observation, typed structural diagnosis, and NON-canonical proposals. Zero
 * canonical mutation authority; never in the root contract core.
 */
export * from "./organization_dynamics/index.js";

/**
 * G10-J: Governed Dynamic Evolution — advanced opt-in only. Compiles a fresh
 * DynamicsProposal into an F3-typed candidate, requires independent evolution
 * authority and (where applicable) institution continuation governance, and
 * activates through the existing F3/F5 mutation paths.
 */
export * from "./organization_evolution/index.js";

/**
 * G10-K: Collaborative Boundary Memory & LivingSpec — advanced opt-in only.
 * Durable, versioned, multi-peer shared boundary state: workspaces, typed
 * artifacts, branching candidate revisions, explicit acceptance, immutable
 * accepted lineage, and governed formalization. Conversation ≠ SharedBoundaryState
 * ≠ Commitment ≠ Evidence ≠ Organization.
 */
export * from "./boundary_memory/index.js";

/**
 * G10-M: Runtime Structural Evolution & Retirement — advanced opt-in only. Governed
 * runtime topology evolution (ENCAPSULATE/COLLAPSE/RETIRE_SCOPE) applied as atomic
 * multi-scope transitions. RuntimeScope topology ≠ Organization transformation;
 * close ≠ retirement; internal refactoring is cheap only while external contracts hold.
 */
export * from "./runtime_evolution/index.js";

/**
 * G10-N: Collaborative Reasoning Cells & Epistemic Admission — advanced opt-in only.
 * A durable cell whose independent branches receive only a frozen accepted frontier,
 * submit structured composable candidate claims, and pass explicit verification plus a
 * SEPARATE epistemic-admission policy. Accepted claims are cell-local admitted epistemic
 * state: never Evidence, truth, commitment, boundary acceptance, or effect authority.
 */
export * from "./reasoning_cell/index.js";

/**
 * G10-O: Unified Application Surface, agent tools & MultiGraph organizational debugger —
 * advanced opt-in only. One composed safe façade behind every product entry; no second truth
 * store, no universal graph ontology, no authority bypass.
 */
export * from "./application/index.js";
export { defineApplicationTools } from "./tools/application_tools.js";

/**
 * G10-P: live federated workforce & attention loop — advanced opt-in only. A durable
 * mechanical transport (Ordarium state + StateChangeFeed) with a deployment-local cursor
 * and an inbound pump that strictly parses envelopes before handing them to the canonical
 * federation/boundary services; a deterministic attention derivation; and separate host
 * activation adapters. TransportTruth ≠ CollaborationTruth; Notification ≠ Activation.
 */
export * from "./transport/index.js";
export * from "./attention/index.js";
export * from "./deployment/index.js";
