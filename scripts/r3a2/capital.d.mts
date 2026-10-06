/** R3-A2 capital module type declarations (harness-only; consumed by the TypeScript tests). */
export declare const SOURCE_ANALOGUES: readonly {
  readonly sourceAnalogueId: string;
  readonly forTargetFixture: string;
  readonly surfaceDomain: string;
  readonly name: string;
  readonly mechanism: string;
  readonly targetSurfaceDomain: string;
  readonly mechanismCorrespondence: readonly unknown[];
  readonly frozenBefore: string;
}[];
export declare function sourceAnalogueFor(fixtureId: string): any;
export declare const PORTFOLIO_CAPITAL_ITEMS: readonly {
  readonly capitalId: string;
  readonly appliesToFixture: string;
  readonly kind: string;
  readonly title: string;
  readonly purpose: string;
  readonly provenance: string;
  readonly provenanceNote: string;
  readonly sourceAnalogueId: string;
  readonly clauses: readonly string[];
  readonly applicability: readonly string[];
  readonly limitations: readonly string[];
}[];
export declare function portfolioCapitalFor(fixtureId: string): any;
export declare const PORTFOLIO_CAPITAL_RELATIONSHIPS: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>>;
export declare function portfolioDirectClasses(fixtureId: string, capitalId: string): readonly string[];
export declare function portfolioRelationshipOf(fixtureId: string, classId: string, capitalId: string): string;
export declare function portfolioTransferHypotheses(): readonly { readonly fixtureId: string; readonly classId: string; readonly capitalId: string; readonly relationship: string }[];
