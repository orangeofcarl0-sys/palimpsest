/** R3-L0 envelope module type declarations (harness-only). */
export declare const STAGE_EVIDENCE_PATH: string;
export declare const PROTECTED_ROOT: string;
export declare const REPO_ROOT: string;
export declare function sha256(text: string): string;
export declare function digestHistoricalEvidence(): any;
export declare function compareHistoricalEvidence(baseline: any, current: any): any;
export declare function systemValidityEnvelope(): any;
export declare function runLoadBearingSystemGates(): any;
export declare function systemValidFrom(gates: any): any;
export declare function writeEnvelope(record: any): string;
