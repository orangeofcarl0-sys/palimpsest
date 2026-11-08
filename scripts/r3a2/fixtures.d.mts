/** R3-A2 fixtures module type declarations (harness-only; consumed by the TypeScript tests). */
export declare const COMBINED_SPECS: readonly any[];
export declare const NEW_FAMILIES: readonly string[];
export declare const HISTORICAL_FAMILIES: readonly string[];
export declare function specFor(fixtureId: string): any;
export declare function oracleExports(spec: any): Readonly<{ classes: string; cases: string }>;
export declare function oracleOf(spec: any, acceptanceUrl: string): Promise<any>;
export declare function contentDigestOf(spec: any): string;
export declare function allContentDigests(): Readonly<Record<string, string>>;
export declare function materialize(spec: any, root?: string): Promise<any>;
