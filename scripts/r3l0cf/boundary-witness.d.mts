/** R3-L0C-F boundary-witness module type declarations (harness-only). */
export declare function sha256(text: string): string;
export declare function scriptedBoundaryWorker(input: any): any;
export declare function runBoundaryControl(input: any): Promise<any>;
export declare function runBoundaryWitnessSuite(input: any): Promise<any>;
export declare const NL: string;
export declare const PREFLIGHT_LAW: any;
