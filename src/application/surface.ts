/**
 * SR-1D R2 §11 — the COMPATIBILITY surface.
 *
 * The implementation monolith that used to live here is now eight cohesive cluster modules under
 * `surfaces/`, composed by `factory.ts`. This file keeps the old import path working: the
 * aggregate types, every façade interface and the factory are re-exported; nothing is implemented
 * here.
 */

export { makePalimpsestApplicationSurface } from "./factory.js";
export type { ApplicationSurfaceDeps, PalimpsestApplicationSurface } from "./factory.js";
export * from "./surfaces/work.js";
export * from "./surfaces/product.js";
export * from "./surfaces/federation.js";
export * from "./surfaces/cognition.js";
export * from "./surfaces/proof.js";
export * from "./surfaces/project.js";
export * from "./surfaces/organization.js";
export * from "./surfaces/projections.js";
