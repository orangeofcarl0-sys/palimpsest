/**
 * R1-R §5 — the type surface for `scripts/r1r/fixtures/scenario-b/acceptance.mjs`.
 *
 * The hidden acceptance. This module never enters a worker's world; the harness and the tests are its
 * only consumers.
 */

export interface BCase {
  readonly id: string;
  readonly invariant: string;
  readonly input: Record<string, unknown>;
  readonly expect: "accept" | "reject";
  readonly digest?: string;
  readonly expected?: Record<string, unknown>;
}

export interface BJudgement {
  readonly id: string;
  readonly invariant: string;
  readonly pass: boolean;
  readonly failureClass: string | null;
  readonly detail: string;
}

export declare const ALIAS_GROUPS: Readonly<Record<string, readonly string[]>>;
export declare const DEFAULT_RETRIES: number;
export declare const DEFAULT_TIMEOUT_MS: number;
export declare const VISIBLE_CASES: readonly BCase[];
export declare const HIDDEN_CASES: readonly BCase[];

export declare class ConfigError extends Error {
  readonly code: string;
}

export declare function normalizeKey(key: string): string;
export declare function canonical(value: unknown): string;
export declare function digestOf(value: unknown): string;
export declare function migrateConfigReference(input: Record<string, unknown>): Record<string, unknown>;
export declare function firstDifference(left: unknown, right: unknown, path?: string): string | null;
export declare function judgeCase(migrate: (input: Record<string, unknown>) => unknown, testCase: BCase): BJudgement;
export declare function materialize(cases: readonly BCase[]): readonly BCase[];
/** The WORKER-VISIBLE form: no `invariant` field, so the case file cannot reveal the method. */
export declare function materializeVisible(cases: readonly BCase[]): readonly Omit<BCase, "invariant">[];
export declare function runCases(migrate: (input: Record<string, unknown>) => unknown, cases: readonly BCase[]): { readonly results: readonly BJudgement[]; readonly passed: number; readonly total: number };
