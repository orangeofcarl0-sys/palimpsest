/**
 * palimpsest-dsh — P0 contract core.
 *
 * Frozen phase0-2 unified baseline contracts (schema, domain, durable state)
 * ported from the Python runtime. The DSH tool surface and Ordarium effect
 * wiring arrive in P1/P2; this entry exposes the contract core only.
 */

export * from "./schema/index.js";
export * from "./domain/index.js";
export * from "./state/index.js";
export * from "./scheduler/index.js";

/**
 * Revision-safe Work evolution: the PURE plan-revision reconciliation, plus the
 * atomic multi-event append it commits through. Explicit additive exports (the
 * domain barrel predates them).
 */
export * from "./domain/plan_reconciliation.js";
export { AtomicAppendError } from "./state/event_store.js";
export type { AtomicFaultHook } from "./state/event_store.js";

/**
 * G10-X canonical project-head evolution (additive): the pure head derivation
 * (`deriveProjectHeadStatus`), the pure reconciliation compiler
 * (`compileProjectHeadReconciliation`) and the typed `ProjectHeadError`.
 * No second ProjectIR, no git-head database, no second promotion ledger.
 */
export * from "./domain/project_head.js";
