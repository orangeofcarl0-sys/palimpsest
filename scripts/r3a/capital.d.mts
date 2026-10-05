/** R3-A0 capital module type declarations (harness-only; consumed by the TypeScript tests). */
export declare const CAPITAL_ITEMS: readonly {
  readonly capitalId: string;
  readonly appliesToFixture: string;
  readonly kind: string;
  readonly title: string;
  readonly purpose: string;
  readonly provenance: string;
  readonly clauses: readonly string[];
  readonly applicability: readonly string[];
  readonly limitations: readonly string[];
}[];
export declare const CAPITAL_RELATIONSHIPS: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>>;
export declare const TRANSFER_HYPOTHESES: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
export declare function capitalFor(fixtureId: string): any;
export declare function directClasses(fixtureId: string, capitalId: string): readonly string[];
export declare function relationshipOf(fixtureId: string, classId: string, capitalId: string): string;
