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
export * from "./tools/index.js";
export { installPalimpsest, trustedDefaultPolicy } from "./install.js";
export type { InstallPalimpsestOptions, InstalledPalimpsest } from "./install.js";
