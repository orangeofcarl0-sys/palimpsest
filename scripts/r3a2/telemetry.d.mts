/** R3-A2 telemetry module type declarations (harness-only; consumed by the TypeScript tests). */
export declare function decompressFrames(path: string): Readonly<{ text: string; frames: number; failedFrames: number }>;
export declare function sessionRecords(text: string): readonly any[];
export declare function findSessionArtifacts(home: string): readonly string[];
export declare function readSessionTelemetry(home: string, route: any): Readonly<{ usage: any; cost: any; note: string; artifacts: readonly string[] }>;
