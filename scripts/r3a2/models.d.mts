/** R3-A2 models module type declarations (harness-only; consumed by the TypeScript tests). */
export declare const COMMON_RENDERER: Readonly<{ rendererId: string; rendererVersion: number; familySpecific: boolean; note: string }>;
export declare const SENTINEL_MODEL_IDS: readonly string[];
export declare const EXCLUDED_MODEL_IDS: readonly string[];
export declare const MODEL_ROUTES_SENTINEL: readonly any[];
export declare const DECLARED_PRICES: Readonly<Record<string, Readonly<{ usdPerMillionInputTokens: number | null; usdPerMillionOutputTokens: number | null; usdPerMillionCachedTokens: number | null; source: string | null; reason: string }>>>;
export declare function sentinelRouteFor(modelId: string): any;
export declare function rendererRecordFor(route: any): Readonly<{ rendererId: string; rendererVersion: number; familySpecific: boolean; modelId: string; modelFamily: string; providerId: string; routeId: string }>;
export declare function sentinelFamilies(): readonly string[];
