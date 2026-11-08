/** R3-A2 manifest module type declarations (harness-only; consumed by the TypeScript tests). */
export declare const ANTI_OVERFIT_PROCESSES: Readonly<{ COMPLIANT: string; NON_COMPLIANT: string }>;
export declare const CONTAMINATION: Readonly<{ INDEPENDENT: string; SHARED_MODEL_FAMILY: string; UNKNOWN: string }>;
export declare const PORTFOLIO_MANIFESTS: readonly {
  readonly fixtureId: string;
  readonly fixtureRevision: number;
  readonly contentDigest: string;
  readonly antiOverfitProcess: string;
  readonly antiOverfitBasis: string;
  readonly constructionActor: string;
  readonly constructionModelId: string;
  readonly constructionModelFamily: string;
  readonly evaluationModelFamiliesKnownAtConstruction: boolean;
  readonly evaluationModelFamilies: readonly string[];
  readonly contamination: string;
  readonly heldOut: boolean;
  readonly heldOutReason: string;
}[];
export declare function portfolioManifestFor(fixtureId: string): any;
export declare function portfolioCountsTowardGraph(fixtureId: string): boolean;
export declare function portfolioClaimCeiling(fixtureId: string): string;
