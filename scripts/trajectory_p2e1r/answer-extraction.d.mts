/**
 * Trajectory-P2-E1R §10 — TYPE SURFACE for the `.mjs` DSH benchmark answer extraction.
 */
export declare const BENCHMARK_ANSWER_SCHEMA_VERSION: number;

export declare function findSessionFile(sessionsRoot: string, sessionId: string): string | null;
export declare function readSessionEventsByExactId(input: { readonly sessionsRoot: string; readonly sessionId: string }): Promise<readonly Readonly<Record<string, unknown>>[]>;
export declare function assistantTextOf(event: unknown): string;

export type BenchmarkAnswerExtraction =
  | { readonly ok: true; readonly answer: Record<string, unknown>; readonly rawText: string; readonly bytes: number; readonly seq: number; readonly assistantMessageCount: number }
  | { readonly ok: false; readonly detail: string; readonly assistantMessageCount: number; readonly rawText?: string };

export declare function extractBenchmarkAnswer(events: readonly unknown[]): BenchmarkAnswerExtraction;
