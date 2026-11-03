/** R3-L0C-G1 / R3-L0C-G1-B — TYPES FOR scripts/r3l0c_g1/observation-correlation.mjs. */

export const OBSERVATION_RECORD_SCHEMA_VERSION: number;
export const HOST_OBSERVATION_DIRECTORY: string;
export const RECORDER_ORIGIN: string;
export const LIFECYCLE_KINDS: Readonly<Record<string, string>>;
export const CLASSIFICATION: Readonly<Record<string, string>>;
export const NL: string;
export const REPO_ROOT: string;

export function recordDigest(record: Record<string, unknown>): string;
export function observationFileName(invocationId: string): string | null;

export function inspectUntrustedRecord(record: unknown): Readonly<{
  wellFormed: boolean;
  problems: readonly string[];
  originRelationship: string;
  mayPromoteToHostOrigin: boolean;
  note?: string;
}>;
export function createObservationRecorder(input?: { invocationId?: string }): Readonly<{
  invocationId: string;
  sink: (observation: any) => void;
  captured: () => readonly any[];
  rejected: () => readonly Readonly<{ reason: string }>[];
}>;
export function classifyEventStream(events: readonly any[]): Readonly<Record<string, any>>;
export function buildObservationRecord(input: Record<string, any>): Readonly<Record<string, any>>;
export function writeObservationRecord(input: { runRoot: string; record: Record<string, any> }): Readonly<Record<string, any>>;
export function readObservationRecord(input: { runRoot: string; invocationId?: string; expected?: Record<string, unknown> }): Readonly<Record<string, any>> | null;
export function listObservationRecords(runRoot: string): readonly string[];
export function detectInterruptedWrites(runRoot: string): readonly string[];
export function readRunIdentity(input: { journalRecords?: readonly any[] }): Readonly<Record<string, any>>;
export function readTrialIdentities(input: { journalRecords?: readonly any[] }): Readonly<{ bySession: Map<string, any>; duplicates: readonly string[]; total: number }>;
export function readVerifiedJournal(input: { journalPath: string }): Promise<Readonly<Record<string, any>>>;
export function verifyRunClaim(input: { runRoot: string; runId: string; claimNonce?: string | null }): Promise<Readonly<Record<string, any>>>;
export function correlateObservationRecord(input: Record<string, any>): Promise<Readonly<Record<string, any>>>;
