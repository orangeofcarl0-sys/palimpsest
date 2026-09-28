/**
 * R1-R — the type surface for `scripts/r1r/scenarios.mjs`.
 *
 * One place defines what a trial varies and what it must hold constant, so the paired-state proof can
 * hash the constant half.
 */

export interface ScenarioDefinition {
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
}

/**
 * Declared with NAMED keys rather than an index signature: the harness only ever knows two scenarios,
 * and an index signature would make every read possibly-undefined under `noUncheckedIndexedAccess`,
 * pushing non-null assertions into the tests for no real safety.
 */
export declare const SCENARIOS: Readonly<{ B: ScenarioDefinition; C: ScenarioDefinition }>;

export declare const PAIRED_STATE_COMPARABLE_FIELDS: readonly string[];

export interface OracleInaccessibility {
  readonly checkedFiles: number;
  readonly needles: readonly string[];
}

export interface VisibleOracleResult {
  readonly exitCode: number;
  readonly stdout: string;
}

export declare function sha256(bytes: Buffer | string): string;
export declare function listFiles(root: string): readonly string[];
export declare function buildWorld(scenario: ScenarioDefinition, dir: string): string;
export declare function assertOracleInaccessible(scenario: ScenarioDefinition, worldDir: string): OracleInaccessibility;
export declare function loadAcceptance(scenario: ScenarioDefinition): Promise<Record<string, unknown>>;
export declare function judgeHidden(
  scenario: ScenarioDefinition,
  sourceText: string,
  scratchDir: string,
): Promise<{ readonly results: readonly unknown[]; readonly passed: number; readonly total: number }>;
export declare function runVisibleOracle(scenario: ScenarioDefinition, worldDir: string): VisibleOracleResult;
export declare function fileDigest(path: string): string;
export declare function pairedStateDigest(
  scenario: ScenarioDefinition,
  worldDir: string,
  task: Readonly<{ objective: string; write_paths: readonly string[] }>,
): Readonly<Record<string, unknown>>;
export declare function ordinaryTaskDigest(promptText: string, indexHeading: string): string;
