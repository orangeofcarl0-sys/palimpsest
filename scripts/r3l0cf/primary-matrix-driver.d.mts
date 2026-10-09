/** R3-L0C-I primary-matrix-driver module type declarations (harness-only). */
export declare const SCRIPTED_WORKER: string;
export declare const PRIMARY_FAULTS: Readonly<Record<string, string>>;
export declare function preparePrimaryCase(input: any): any;
export declare function runPrimaryMatrix(input: any): Promise<any>;
export declare function faultEnvironment(fault: string): any;
export declare const NL: string;
