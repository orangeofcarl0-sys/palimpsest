/** R3-L0C-R contract module type declarations (harness-only). */
export declare const REPO_ROOT: string;
export declare const STAGE_EVIDENCE_PATH: string;
export declare const SOURCE_STAGE_EVIDENCE_PATH: string;
export declare const VALIDITY_DIMENSIONS: readonly any[];
export declare function causalExperimentValidFrom(dimensions: any): any;
export declare const CLAIM_ADMISSION: any;
export declare const TELEMETRY_FIELDS: readonly any[];
export declare const TELEMETRY_READING_RULE: any;
export declare function treatmentTelemetry(input: any): any;
export declare const SELECTION_CONTRACT_FINDING: any;
export declare function buildExpectationManifest(input: any): any;
export declare function expectationDigest(manifest: any): string;
export declare function verifyRealization(manifest: any, telemetry: any): any;
export declare const EXECUTION_CLOSURE_INPUTS: readonly string[];
export declare function closureDigest(fileDigests: any): string;
export declare function verifyClosure(frozen: any, recomputed: any): any;
export declare function createHashOf(text: string): string;
export declare function contractSummary(): any;
