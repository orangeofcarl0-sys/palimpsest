/** R3-A2 fixture-content module type declarations (harness-only; consumed by the TypeScript tests). */
export declare const FC_SOURCE_H0: string;
export declare const FC_VISIBLE_ORACLE: string;
export declare const FC_ACCEPTANCE: string;
export declare const FC_PACKAGE_JSON: string;
export declare const FC_README: string;
export declare const FD_SOURCE_H0: string;
export declare const FD_VISIBLE_ORACLE: string;
export declare const FD_ACCEPTANCE: string;
export declare const FD_PACKAGE_JSON: string;
export declare const FD_README: string;
export declare const PORTFOLIO_SPECS: readonly {
  readonly fixtureId: string;
  readonly fixtureRevision: number;
  readonly shortId: string;
  readonly mechanismFamily: string;
  readonly name: string;
  readonly sourceFile: string;
  readonly exportName: string;
  readonly acceptanceFile: string;
  readonly classesExport: string;
  readonly casesExport: string;
  readonly taskObjective: string;
  readonly projectGoal: string;
  readonly requirements: readonly string[];
  readonly hiddenNeedles: readonly string[];
  readonly files: Readonly<Record<string, string>>;
  readonly classStructure: Readonly<{ readonly independent: readonly string[]; readonly partiallyCoupled: readonly unknown[]; readonly derived: readonly unknown[] }>;
}[];
