/**
 * G10-O Unified Application Surface — advanced-only.
 *
 *   ApplicationSurface ≠ CanonicalStore   UI/Tool/HTTP ≠ AuthorityGrant
 *
 * One safe high-level façade behind agent tools, typed HTTP routes, and the human MultiGraph
 * debugger. No product surface creates a second truth store, a universal graph ontology, or an
 * authority bypass.
 */

export * from "./projection_types.js";
export * from "./projections.js";
export * from "./surface.js";
export * from "./http.js";
