/**
 * R3-L0C-I-A-R-L-C-F-S §9/§12 — TYPES FOR THE QUALIFICATION ORCHESTRATOR.
 */

export const NL: string;

export function deterministicArtifactFixture(input: { artifactRoot: string }): Promise<(input: { session: any; outcome: any }) => { readonly path: string; readonly attemptId: string; readonly hostJobId: string }>;
export function runQualification(input?: Record<string, unknown>): Promise<any>;
export function writeQualification(input?: Record<string, unknown>): Promise<any>;
