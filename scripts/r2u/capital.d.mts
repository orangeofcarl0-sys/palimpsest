/**
 * R2-U — the type surface for `scripts/r2u/capital.mjs`.
 *
 * §12 forbids authoring the Procedure from the scenario specification, so every clause names the generation
 * whose OBSERVED failure forced it, and `deriveCapital` throws if one does not.
 */

export interface R2UProcedureClause {
  readonly instruction: string;
  /** The exploration generation whose recorded observation forced this clause. */
  readonly forcedBy: string;
  readonly observed: string;
}

export interface R2UExplorationObservation {
  readonly generation: string;
  readonly note: string;
  readonly passed: number;
  readonly total: number;
  readonly failedCaseIds: readonly string[];
  readonly failureClasses: readonly string[];
  readonly failedInvariants: readonly string[];
  readonly details: readonly string[];
}

export interface R2UExplorationRecord {
  readonly scenario: string;
  readonly generations: readonly string[];
  readonly observations: readonly R2UExplorationObservation[];
  readonly discoveries: readonly Readonly<{ generation: string; discovery: string; forcedBy: readonly string[]; detail: string }>[];
}

export interface R2UScenarioCapital {
  readonly scenario: string;
  readonly exploration: R2UExplorationRecord;
  readonly proof: Readonly<{ statement: string; supporting: readonly string[] }>;
  readonly reasoning: Readonly<{ statement: string; branchQuestion: string }>;
  readonly procedureClauses: readonly R2UProcedureClause[];
}

export declare const PROCEDURE_CLAUSES: Readonly<{ D: readonly R2UProcedureClause[] }>;
export declare const PROOF_CONTENT: Readonly<{ D: Readonly<{ statement: string; supporting: readonly string[] }> }>;
export declare const REASONING_CONTENT: Readonly<{ D: Readonly<{ statement: string; branchQuestion: string }> }>;

/**
 * Scenario C's capital is R1-R's own derivation, imported rather than re-authored; Scenario D's is derived
 * here from this stage's generation ladder.
 */
export declare function deriveCapital(): Readonly<{ C: R2UScenarioCapital; D: R2UScenarioCapital }>;
/** The ordered method as the Procedure's step list — METHOD, never the final source code. */
export declare function procedureSteps(scenarioId?: string): readonly Readonly<{ instruction: string }>[];
