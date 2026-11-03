/** R3-L0C capital module type declarations (harness-only). */
export declare const sha256: (text: string) => string;
export declare const STANDING_BODIES: Readonly<Record<string, any>>;
export declare const STANDING_SOURCES: Readonly<Record<string, any>>;
export declare const REASONING_FRAMES: Readonly<Record<string, any>>;
export declare function futureCaseLeakage(): any;
export declare function frozenBundle(): any;
export declare function bundleDigest(bundle?: any): string;
export declare const ARMS: { readonly H: any; readonly C: any };
export declare function selectionFor(arm: string, generationId: string, refs: readonly any[]): any;
export declare const GENERATION_EXPOSURES: Readonly<Record<string, readonly string[]>>;
export declare function frozenHandlesFor(arm: string, generationId: string, refs: readonly any[]): readonly string[];
export declare function treatmentDelta(): any;
