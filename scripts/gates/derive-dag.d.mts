/**
 * Type surface for `derive-dag.mjs` (R0 §18/§20).
 *
 * The derivation is deliberately plain JavaScript — it is harness code that runs under bare `node`,
 * not through the TypeScript build. Its test is TypeScript, so the shape is declared here rather than
 * weakening the build's `noImplicitAny`.
 */

export interface MethodClause {
  readonly id: string;
  readonly describe: string;
  readonly matches: (step: string) => boolean;
}

export interface ProcedureStep {
  readonly instruction: string;
}

export interface ProcedureContentLike {
  readonly steps: readonly ProcedureStep[];
}

export interface DerivationClauses {
  readonly normalizes: boolean;
  readonly detectsCycle: boolean;
  readonly cycleBeforeOrder: boolean;
  readonly tieBreak: boolean;
  readonly tieBreakAfterNormalization: boolean;
  readonly verifies: boolean;
  readonly closeLoop: boolean;
  readonly unrecognized: number;
}

export interface DerivationTraceEntry {
  readonly instruction: string;
  readonly clause: string;
}

export interface Derivation {
  readonly source: string;
  readonly trace: readonly DerivationTraceEntry[];
  readonly clauses: DerivationClauses;
}

export declare const METHOD_CLAUSES: readonly MethodClause[];
export declare function classifyStep(instruction: unknown): string;
export declare function deriveImplementation(content: ProcedureContentLike, options?: { readonly closeLoop?: boolean }): Derivation;
