/**
 * G10-AD — Independent Project Verification Runtime.
 *
 * A narrow product plane: verify the EXACT current ProjectIR head under a named,
 * registered, versioned verifier protocol and remember the result — with explicit
 * independence provenance and derivation-based freshness — without ever turning
 * "a verifier passed" into truth, Work Evidence, Proof publication, Reasoning
 * admission, task state or authority.
 *
 *   src/project_verification/artifacts.ts          strict digest-bound artifacts
 *   src/project_verification/independence.ts       the five-class independence model
 *   src/project_verification/registry.ts           verifier config (no store)
 *   src/project_verification/provider.ts           §4 read seam + §7 execution port
 *   src/project_verification/experiment_adapter.ts §9 reuse of the validator primitives
 *   src/project_verification/store.ts              append-only crash-honest history
 *   src/project_verification/status.ts             §13 derived status/freshness
 *   src/project_verification/service.ts            orchestration
 */

export * from "./artifacts.js";
export * from "./independence.js";
export * from "./provider.js";
export * from "./attempt_result_source.js";
export * from "./registry.js";
export * from "./experiment_adapter.js";
export * from "./store.js";
export * from "./status.js";
export * from "./service.js";
