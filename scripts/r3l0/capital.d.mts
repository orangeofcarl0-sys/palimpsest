/** R3-L0 capital module type declarations (harness-only). */
export declare const CAPITAL_BODIES: Readonly<Record<string, any>>;
export declare const PREHISTORY_SOURCES: Readonly<Record<string, any>>;
export declare const REASONING_FRAMES: Readonly<Record<string, any>>;
export declare const ARMS: Readonly<Record<string, any>>;
export declare function frozenBundle(): any;
export declare function bundleDigest(bundle?: any): string;
export declare function futureOracleLeakage(bodies?: any): any;
export declare function armSelectsCapital(armId: string): boolean;
export declare function knowledgeSelectionFor(armId: string, refs: any): any;
export declare function perrOf(generationVectors: any, eligibleByGeneration: any): any;
export declare function repeatedLessonCount(generationVectors: any, eligibleByGeneration: any): number;
