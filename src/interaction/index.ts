/**
 * UX-A §40 — the interaction layer barrel.
 *
 *   intent       — the non-canonical CollaborationIntent / CollaborationRequest
 *   collaboration— the thin, stateless composition of the existing owners
 *   result_view  — the user-facing projection (no CoT, ids under `details`)
 *   host_adapter — the (optional) NL→intent seam + the deterministic task profiler
 *
 * There is deliberately no interaction store, agent manager, collaboration graph
 * or autonomy engine here (§40).
 */

export * from "./intent.js";
export * from "./collaboration.js";
export * from "./result_view.js";
export * from "./host_adapter.js";
