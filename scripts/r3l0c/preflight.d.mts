/** R3-L0C preflight module type declarations (harness-only). */
export declare function checkEvidenceMode(runRoot: string): any;
export declare function checkBaselineDerivedImmutability(): any;
export declare function checkPerRunTempRoot(runRoot: string): any;
export declare function runPreflight(input: any): Promise<any>;
export declare function runValidityGates(input: any): Promise<any>;
export declare function runContainmentGate(input: any): Promise<any>;
export declare function runPlumbingCheck(input: any): Promise<any>;
export declare const NL: string;
export declare const existsSync: any;
export declare const listRunRoots: any;
