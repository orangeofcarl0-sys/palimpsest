/** R3-L0C-F closure module type declarations (harness-only). */
export declare function fileDigest(relative: string): string;
export declare function digestOfMap(map: Record<string, string>): string;
export declare function partFileDigests(partId: string, files?: readonly string[]): any;
export declare function partDigest(partId: string, files?: readonly string[]): string;
export declare function toolchain(): any;
export declare function verifyCompiledAgainstSource(): any;
export declare function executorConfiguration(): Promise<any>;
export declare function modelIdentityEvidence(): Promise<any>;
export declare function computeExecutionClosure(input?: any): Promise<any>;
export declare function scheduleDigests(): Promise<any>;
export declare function checkExecutionClosure(frozen: any, current: any): any;
export declare const NL: string;
