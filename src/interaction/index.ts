/**
 * UX-A §40 — the interaction layer barrel.
 *
 *   intent       — the non-canonical CollaborationIntent / CollaborationRequest
 *   collaboration— the thin, stateless composition of the existing owners
 *   result_view  — the user-facing projection (no CoT, ids under `details`)
 *   host_adapter — the (optional) NL→intent seam + the deterministic task profiler
 *
 * UX-B §72 — the cross-project product layer (SC-22: named so it never collides
 * with `src/federation/directory.ts`):
 *
 *   project_peer_directory         — the READ-ONLY project↔peer deployment directory
 *   cross_project_protocol         — the strict, versioned `PeerMessage.body` envelope
 *   cross_project_result           — the user-facing projection of an Ask
 *   cross_project_host_adapter     — the DSH/Pi attention text + the untrusted resolver seam
 *   cross_project                  — the service: `projects/prepareAsk/ask/status/pending/respond/receive`
 *
 * There is deliberately no interaction store, agent manager, collaboration graph
 * or autonomy engine here (§40), and no cross-project request store, no
 * project-federation store, no remote agent manager, no project router truth and
 * no cross-project scheduler (§72).
 */

export * from "./intent.js";
export * from "./collaboration.js";
export * from "./result_view.js";
export * from "./host_adapter.js";
export * from "./project_peer_directory.js";
export * from "./cross_project_protocol.js";
export * from "./cross_project_result.js";
export * from "./cross_project_host_adapter.js";
export * from "./cross_project.js";
