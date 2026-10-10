/** R3-L0C-I-A-R-L-C-F-S-H — TYPES FOR artifact-validity.mjs. */

export const NL: string;

export const ARTIFACT_VALIDATOR_SOURCE: Record<string, unknown>;
export const ARTIFACT_ENVELOPE: Record<string, unknown>;
export const ARTIFACT_VALIDITY_STATES: readonly any[];
export function isInvalidMeasurementState(state: unknown): boolean;
export function validateArtifactEnvelope(input: unknown): Record<string, any>;
export function validityState(id: string): Record<string, any>;
