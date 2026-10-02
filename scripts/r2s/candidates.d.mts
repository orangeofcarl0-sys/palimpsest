/** R2-S candidates module type declarations (harness-only; consumed by the TypeScript tests). */
export declare const BUNDLE_IDS: readonly string[];
export declare const BUNDLE_ORIGIN_PROJECT: Readonly<Record<string, string>>;
export declare const BUNDLE_DOMAIN: Readonly<Record<string, string>>;
export declare function bundleCapital(bundleId: string): any;
export declare function candidateSetFor(scenarioId: string, distractorSet: Readonly<Record<string, string>>): any;
export declare function assertDistractorIndependent(scenarioId: string, candidateSet: any): { readonly ok: boolean; readonly problems: readonly string[]; readonly scenarioId: string };
