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
