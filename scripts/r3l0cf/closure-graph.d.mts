/** R3-L0C-I closure-graph module type declarations (harness-only). */
export declare const CLOSURE_ENTRY_POINTS: readonly string[];
export declare function importSpecifiersOf(sourceText: string): readonly string[];
export declare function walkImportGraph(input?: any): any;
export declare function packageNameOf(specifier: string): string;
export declare function verifyClosureCompleteness(input?: any): any;
export declare const NL: string;
