/** R3-L0C-I-A-R-L-C-F-S-H — TYPES FOR qualification.mjs. */

export const NL: string;

export function reduceDeterministicQualification(input: Record<string, any>): Record<string, any>;
export function deterministicArtifactFixture(input: { artifactRoot: string; invalidSessionIds?: readonly string[] }): Promise<(args: { session: any }) => Record<string, any>>;
export function runQualification(input?: Record<string, any>): Promise<Record<string, any>>;
export function writeQualification(input?: Record<string, any>): Promise<Record<string, any>>;
