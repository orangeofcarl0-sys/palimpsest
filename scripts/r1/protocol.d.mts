/**
 * R1 §33 — the type surface for `scripts/r1/protocol.mjs`.
 *
 * The harness is plain JavaScript because it runs under bare `node`, like the gates it borrows its
 * discipline from. The tests that pin it are TypeScript, and this repository does not weaken
 * `noImplicitAny` for test code, so the `.mjs` module needs a declared surface rather than an implicit
 * `any`. Declaring it here keeps the strictness where it belongs instead of loosening a compiler flag
 * to accommodate a harness.
 */

/** §6: the values the protocol freezes. A test may read them; nothing may write them. */
export declare const FROZEN: Readonly<{
  conditions: readonly string[];
  scenarios: readonly string[];
  trialsPerConditionPerScenario: number;
  exploratoryFloor: number;
  protocolSeed: number;
  populations: readonly number[];
  relevantCount: number;
  primaryMatrixStatus: string;
}>;

/** §6: the sha256 of the protocol document's bytes. */
export declare function protocolDigest(): string;

export interface ParsedProtocol {
  readonly digest: string;
  readonly conditions: readonly string[];
  readonly scenarios: readonly string[];
  readonly trialsPerConditionPerScenario: number;
  readonly exploratoryFloor: number;
  readonly protocolSeed: number;
  readonly populations: readonly number[];
  readonly relevantCount: number;
  readonly primaryMatrixStatus: string;
}

/** §6: parse and assert the frozen values; throws if the document is not the frozen one. */
export declare function parseProtocol(): ParsedProtocol;

export interface ProtocolBlock {
  readonly block: number;
  readonly order: readonly string[];
}

/** §15: the pre-registered block ordering, reproducible from the one seed. */
export declare function blockOrder(blocks: number): readonly ProtocolBlock[];

export interface TrialPlan {
  readonly blocks: number;
  readonly perScenario: number;
  readonly total: number;
}

/** §14: 2 scenarios × 3 conditions × 5 trials. */
export declare function trialPlan(): TrialPlan;
