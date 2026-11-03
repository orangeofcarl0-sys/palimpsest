/**
 * Trajectory-P2-E0 §11 — TYPE SURFACE for the `.mjs` benchmark fixture.
 *
 * `tsc` under `noImplicitAny` refuses an untyped `.mjs` import; the repository's convention for a bare-node
 * `.mjs` helper is a sibling `.d.mts` declaration (see `scripts/trajectory_p2b/rig.d.mts`).
 */
import type { GroundTruthKey, OracleResult } from "./mechanical-oracle.d.mts";

export interface FrozenConditions {
  readonly fixtureId: string;
  readonly family: string;
  readonly initialGitState: string;
  readonly task: string;
  readonly allowedTools: readonly string[];
  readonly writeScope: readonly string[];
  readonly contextBudget: { readonly capsuleMaxSerializedBytes: number; readonly sectionMaxBytes: number };
  readonly completionChecks: readonly string[];
  readonly experimentalAssignment: string;
  readonly oracle: string;
}

export declare const FIXTURE_ID: string;
export declare const FROZEN_CONDITIONS: FrozenConditions;
export declare const GROUND_TRUTH_KEY: GroundTruthKey;

export interface PresentationLike {
  readonly mode: "CONTROL" | "TREATMENT";
  readonly sectionDigest: string;
  readonly capsuleDigest: string | null;
  readonly sectionText: string;
}

export interface PreparedFixture {
  readonly owned: { readonly root: string };
  readonly cleanup: () => Promise<unknown>;
  readonly fixtureId: string;
  readonly consumerAttemptId: string;
  readonly originAttemptId: string;
  /** P2-E1 §13.2: the REAL commit of the fixture's own test-owned repository. */
  readonly gitHead: string;
  readonly capsule: unknown;
  readonly capsuleDigest: string;
  readonly coverage: string;
  readonly knownEventCount: number | null;
  readonly includedEventCount: number;
  readonly unreadHistory: string;
  readonly control: PresentationLike | null;
  readonly treatment: PresentationLike | null;
}

export declare function prepareFixture(): Promise<PreparedFixture>;
export declare function evaluateAnswer(answer: unknown): OracleResult | { readonly ok: false; readonly detail: string };
