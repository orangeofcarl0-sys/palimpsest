/** R3-L0C corpus module type declarations (harness-only). */
export declare const CORPUS_ROOT: string;
export declare const CORPUS_DOCUMENTS: readonly any[];
export declare function documentsOf(category: string): readonly any[];
export declare function corpusFiles(): Readonly<Record<string, string>>;
export declare function corpusDigestMaterial(): string;
export declare function corpusCoverage(): any;
export declare function declaredCorpusPaths(): readonly string[];
export declare function isDeclaredCorpusPath(path: string): boolean;
