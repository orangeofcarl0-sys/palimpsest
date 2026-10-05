/** R3-A0 fixture-content module type declarations (harness-only; consumed by the TypeScript tests). */
export declare const FIXTURE_SPECS: readonly {
  readonly fixtureId: string;
  readonly fixtureRevision: number;
  readonly mechanismFamily: string;
  readonly name: string;
  readonly sourceFile: string;
  readonly exportName: string;
  readonly acceptanceFile: string;
  readonly taskObjective: string;
  readonly projectGoal: string;
  readonly requirements: readonly string[];
  readonly hiddenNeedles: readonly string[];
  readonly files: Readonly<Record<string, string>>;
  readonly classStructure: Readonly<{ readonly independent: readonly string[]; readonly partiallyCoupled: readonly unknown[]; readonly derived: readonly unknown[] }>;
}[];
