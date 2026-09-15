/**
 * G10-AC — the long-horizon Campaign monitor runtime.
 *
 * MONITOR stops being only a stored preference: a host-driven tick re-evaluates
 * the project's SCOPED dormant Campaign watches, records canonical triggers
 * through the existing prospective service, enters the existing single-wake
 * lifecycle, runs the existing deterministic reconciliation, and emits an
 * at-least-once host wake signal.
 *
 * The driver is not a scheduler, not a planner and not an agent: it owns no
 * canonical store, mints no identity, and stops before semantic next-action
 * compilation.
 */

export * from "./scope.js";
export * from "./tick_source.js";
export * from "./lifecycle_derivation.js";
export * from "./activation.js";
export * from "./delivery_marks.js";
export * from "./driver.js";
