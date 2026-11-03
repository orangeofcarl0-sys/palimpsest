/**
 * R2-U — the type surface for `scripts/r2u/scenarios.mjs`.
 *
 * One place defines what a trial varies and what it must hold constant, so the paired-state proof can hash
 * the constant half.
 */

export interface R2UScenarioDefinition {
  readonly id: string;
  readonly name: string;
  readonly projectId: string;
  readonly knownFailure: string;
  readonly knownFailureDetector: string;
  readonly sourceFile: string;
  readonly exportName: string;
  readonly acceptanceModule: string;
  readonly fixtureDir: string;
  readonly oracleCommand: readonly string[];
  readonly taskObjective: string;
  readonly projectGoal: string;
  readonly requirements: readonly string[];
  readonly hiddenNeedles: readonly string[];
}

/** Declared with NAMED keys rather than an index signature: the harness only ever knows two scenarios. */
export declare const SCENARIOS: Readonly<{ C: R2UScenarioDefinition; D: R2UScenarioDefinition }>;

export declare const PAIRED_STATE_COMPARABLE_FIELDS: readonly string[];

export declare function sha256(bytes: string | Uint8Array): string;
export declare function listFiles(root: string): string[];
export declare function buildWorld(scenario: R2UScenarioDefinition, dir: string): string;
export declare function assertOracleInaccessible(scenario: R2UScenarioDefinition, worldDir: string): { readonly checkedFiles: number; readonly needles: readonly string[] };
export declare function loadAcceptance(scenario: R2UScenarioDefinition): Promise<{ readonly HIDDEN_CASES: readonly unknown[]; readonly VISIBLE_CASES: readonly unknown[]; readonly materialize: (cases: readonly unknown[]) => readonly unknown[]; readonly runCases: (fn: (...args: never[]) => unknown, cases: readonly unknown[]) => { readonly results: readonly unknown[]; readonly passed: number; readonly total: number } }>;
export declare function judgeHidden(scenario: R2UScenarioDefinition, sourceText: string, scratchDir: string): Promise<{ readonly results: readonly { readonly id: string; readonly pass: boolean; readonly failureClass: string | null }[]; readonly passed: number; readonly total: number }>;
export declare function fileDigest(path: string): string;
export declare function pairedStateDigest(scenario: R2UScenarioDefinition, worldDir: string, task: { readonly objective: string; readonly write_paths: readonly string[] }): Readonly<Record<string, unknown>>;
