/**
 * R1-R §6 — the type surface for `scripts/r1r/fixtures/scenario-c/acceptance.mjs`.
 *
 * The hidden acceptance. This module never enters a worker's world; the harness and the tests are its
 * only consumers.
 */

export interface CCase {
  readonly id: string;
  readonly invariant: string;
  /** The CALLER'S state, which a rejection must leave untouched. */
  readonly state: Record<string, unknown>;
  readonly input: readonly Record<string, unknown>[];
  readonly expect: "accept" | "reject";
  readonly digest?: string;
  readonly expected?: Record<string, unknown>;
}

export interface CJudgement {
  readonly id: string;
  readonly invariant: string;
  readonly pass: boolean;
  readonly failureClass: string | null;
  readonly detail: string;
}

export declare const VISIBLE_CASES: readonly CCase[];
export declare const HIDDEN_CASES: readonly CCase[];

export declare class StreamError extends Error {
  readonly code: string;
}

export declare function canonical(value: unknown): string;
export declare function digestOf(value: unknown): string;
export declare function applyEventStreamReference(state: Record<string, unknown>, events: readonly unknown[]): Record<string, unknown>;
export declare function firstDifference(left: unknown, right: unknown, path?: string): string | null;
export declare function judgeCase(apply: (state: Record<string, unknown>, events: readonly unknown[]) => unknown, testCase: CCase): CJudgement;
export declare function materialize(cases: readonly CCase[]): readonly CCase[];
/** The WORKER-VISIBLE form: no `invariant` field, so the case file cannot reveal the method. */
export declare function materializeVisible(cases: readonly CCase[]): readonly Omit<CCase, "invariant">[];
export declare function runCases(apply: (state: Record<string, unknown>, events: readonly unknown[]) => unknown, cases: readonly CCase[]): { readonly results: readonly CJudgement[]; readonly passed: number; readonly total: number };
