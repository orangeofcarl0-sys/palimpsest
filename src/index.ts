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
