/** R3-L0C analyse module type declarations (harness-only). */
export declare const DIRECTIONS: Readonly<Record<string, string>>;
export declare const NET_COST: Readonly<Record<string, string>>;
export declare const COMPRESSION: Readonly<Record<string, string>>;
export declare function isExcessCompletionFailure(session: any): boolean;
export declare function pairBlock(block: number, sessions: readonly any[]): any;
export declare function pairAllBlocks(sessions: readonly any[]): readonly any[];
export declare function compressionVerdict(pairs: readonly any[]): any;
export declare function netCostVerdict(pairs: readonly any[]): any;
export declare function reliabilityReport(sessions: readonly any[]): any;
export declare function completionReport(sessions: readonly any[]): any;
export declare function contrastStatement(): any;
export declare const NL: string;
