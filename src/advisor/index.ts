/**
 * G10-S empirical architecture advisor barrel.
 *
 *   task_profile   — nine task features with value + provenance; untrusted profiler port
 *   evidence       — READ-ONLY empirical support / counter-evidence collection
 *   transferability— deterministic metadata comparison (no embeddings)
 *   advisor        — eligible plans + one plain-language recommendation (no scores)
 *
 * The advisor is read-only toward OrganizationMemory, holds no store mutator, and
 * exposes NO score/weight/health field anywhere.
 */

export * from "./task_profile.js";
export * from "./evidence.js";
export * from "./transferability.js";
export * from "./advisor.js";
