/**
 * R1-R — the type surface for `scripts/r1r/amendment.mjs`.
 *
 * The harness is plain JavaScript because it runs under bare `node`. The tests that pin it are
 * TypeScript, and this repository does not weaken `noImplicitAny` for test code, so each `.mjs` module
 * needs a declared surface rather than an implicit `any`. Declaring it here keeps the strictness where
 * it belongs instead of loosening a compiler flag to accommodate a harness.
 */

export declare const REPO_ROOT: string;
export declare const PARENT_PROTOCOL_PATH: string;
export declare const AMENDMENT_PATH: string;
/** §3: the parent digest this amendment amends. It must never move. */
export declare const PARENT_PROTOCOL_DIGEST: string;

export declare const AMENDMENT_FROZEN: Readonly<{
  amendmentId: string;
  parentProtocolDigest: string;
  primaryScenarios: readonly string[];
  secondaryScenario: string;
  trialsPerConditionPerScenario: number;
  conditions: readonly string[];
  scenarioACeiling: string;
}>;

export interface ParsedAmendment {
  readonly amendmentId: string;
  readonly amendmentDigest: string;
  readonly parentProtocolDigest: string;
  readonly primaryScenarios: readonly string[];
  readonly secondaryScenario: string;
  readonly trialsPerConditionPerScenario: number;
  readonly conditions: readonly string[];
}

/** The digest of the amendment document's bytes. */
export declare function amendmentDigest(): string;
/** The parent digest, recomputed from the parent's bytes — the guard against amending by rewriting. */
export declare function parentProtocolDigest(): string;
/** Parse the amendment and assert it still states the frozen facts; throws if it does not. */
export declare function parseAmendment(): ParsedAmendment;
