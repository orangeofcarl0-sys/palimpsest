/**
 * R3-L0C-I-A-R-L §2 — TYPES FOR THE FRESH POSTFLIGHT EVIDENCE.
 */

export interface JournalCounts {
  readonly kind: string;
  readonly launchesBySession: Readonly<Record<string, number>>;
  readonly totalLaunches: number;
  readonly retries: number;
  readonly replacements: number;
  readonly unplannedLaunches: readonly string[];
  readonly sessionsNeverLaunched: readonly string[];
  readonly noRetries: boolean;
  readonly noReplacements: boolean;
  readonly derivedFromCallerSuppliedNumbers: boolean;
  readonly law: string;
}

export interface SessionIdentities {
  readonly kind: string;
  readonly recorded: number;
  readonly uniqueRecorded: number;
  readonly planned: number;
  readonly identityMismatches: readonly { readonly sessionId: string; readonly field: string; readonly recorded: unknown; readonly planned: unknown }[];
  readonly unplannedSessions: readonly string[];
  readonly missingSessions: readonly string[];
  readonly distinctTrajectories: number;
  readonly distinctBlocks: number;
  readonly allIdentitiesExact: boolean;
  readonly allSixteenUnique: boolean;
  readonly eightTrajectories: boolean;
  readonly fourBlocks: boolean;
  readonly law: string;
}

export interface PostflightEvidence {
  readonly kind: string;
  readonly preflightClosureDigest: string | null;
  readonly freshClosureDigest: string | null;
  readonly boundClosureDigest: string | null;
  readonly closureMatchesPlan: boolean;
  readonly runtimeMovedAfterPreflight: boolean;
  readonly routeIdentity: string | null;
  readonly routeMatchesPlan: boolean;
  readonly runtimeConfiguration: Readonly<Record<string, unknown>> | null;
  readonly systemValid: string | null;
  readonly environmentValid: string | null;
  readonly POSTFLIGHT_FRESHNESS: string;
  readonly law: string;
}

export const EXPECTED_SHAPE: Readonly<Record<string, number>>;
export const NL: string;

export function deriveCountsFromJournal(input: { readonly journalRecords: readonly Readonly<Record<string, unknown>>[]; readonly plannedSessions: readonly string[] }): JournalCounts;
export function compareSessionIdentities(input: { readonly records: readonly Readonly<Record<string, unknown>>[]; readonly schedule: readonly Readonly<Record<string, unknown>>[] }): SessionIdentities;
export function freshPostflight(input: {
  readonly plan: unknown;
  readonly preflightClosureDigest: string | null;
  readonly recompute: () => Promise<Readonly<Record<string, unknown>>>;
}): Promise<PostflightEvidence>;
export function readJournalRecords(journalPath: string): readonly Readonly<Record<string, unknown>>[];
