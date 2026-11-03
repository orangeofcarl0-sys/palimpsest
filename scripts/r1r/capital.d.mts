/**
 * R1-R — the type surface for `scripts/r1r/capital.mjs`.
 *
 * §8 forbids authoring the Procedure from the scenario specification, so every clause names the
 * generation whose OBSERVED failure forced it, and `deriveCapital` throws if one does not.
 */

export interface ProcedureClause {
  readonly instruction: string;
  /** The exploration generation whose recorded observation forced this clause. */
  readonly forcedBy: string;
  readonly observed: string;
}

export interface ScenarioCapital {
  readonly scenario: string;
  readonly exploration: Readonly<Record<string, unknown>>;
  readonly proof: Readonly<{ statement: string; supporting: readonly string[] }>;
  readonly reasoning: Readonly<{ statement: string; branchQuestion: string }>;
  readonly procedureClauses: readonly ProcedureClause[];
}

export declare const PROCEDURE_CLAUSES: Readonly<{ B: readonly ProcedureClause[]; C: readonly ProcedureClause[] }>;
export declare const PROOF_CONTENT: Readonly<{ B: Readonly<{ statement: string; supporting: readonly string[] }>; C: Readonly<{ statement: string; supporting: readonly string[] }> }>;
export declare const REASONING_CONTENT: Readonly<{ B: Readonly<{ statement: string; branchQuestion: string }>; C: Readonly<{ statement: string; branchQuestion: string }> }>;

/** Derive the capital, asserting §8 traceability; throws if a clause has no forcing generation. */
export declare function deriveCapital(): Readonly<{ B: ScenarioCapital; C: ScenarioCapital }>;
/** The ordered method as the Procedure's step list — METHOD, never the final source code. */
export declare function procedureSteps(key: string): readonly Readonly<{ instruction: string }>[];
