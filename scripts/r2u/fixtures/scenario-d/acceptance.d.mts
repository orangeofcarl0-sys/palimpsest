/**
 * R2-U §10 — the type surface for `scripts/r2u/fixtures/scenario-d/acceptance.mjs`.
 *
 * The hidden acceptance. This module never enters a worker's world; the harness and the tests are its
 * only consumers.
 */

export interface DCacheNode {
  readonly value: unknown;
  readonly deps: readonly string[];
}

export interface DCase {
  readonly id: string;
  readonly invariant: string;
  /** The CALLER'S cache, which a rejection must leave untouched. */
  readonly cache: Record<string, DCacheNode>;
  readonly changed: readonly unknown[];
  readonly expect: "accept" | "reject";
  readonly digest?: string;
  readonly expected?: Record<string, DCacheNode>;
}

export interface DJudgement {
  readonly id: string;
  readonly invariant: string;
  readonly pass: boolean;
  readonly failureClass: string | null;
  readonly detail: string;
}

export declare const VISIBLE_CASES: readonly DCase[];
export declare const HIDDEN_CASES: readonly DCase[];

export declare class CacheError extends Error {
  readonly code: string;
}

export declare function canonical(value: unknown): string;
export declare function digestOf(value: unknown): string;
export declare function invalidateCacheReference(cache: Record<string, DCacheNode>, changed: readonly unknown[]): Record<string, DCacheNode>;
export declare function firstDifference(left: unknown, right: unknown, path?: string): string | null;
export declare function judgeCase(invalidate: (cache: Record<string, DCacheNode>, changed: readonly unknown[]) => unknown, testCase: DCase): DJudgement;
export declare function materialize(cases: readonly DCase[]): readonly DCase[];
/** The WORKER-VISIBLE form: no `invariant` field, so the case file cannot reveal the method. */
export declare function materializeVisible(cases: readonly DCase[]): readonly Omit<DCase, "invariant">[];
export declare function runCases(invalidate: (cache: Record<string, DCacheNode>, changed: readonly unknown[]) => unknown, cases: readonly DCase[]): { readonly results: readonly DJudgement[]; readonly passed: number; readonly total: number };
