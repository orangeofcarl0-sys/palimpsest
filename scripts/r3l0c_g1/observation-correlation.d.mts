/** R3-L0C-G1 — TYPES FOR scripts/r3l0c_g1/observation-correlation.mjs. */

export const OBSERVATION_RECORD_SCHEMA_VERSION: number;
export const HOST_OBSERVATION_FILE: string;
export const NL: string;
export const REPO_ROOT: string;

export function recordDigest(record: Record<string, unknown>): string;
export function createObservationRecorder(input?: { invocationId?: string }): Readonly<{
  invocationId: string;
  sink: (observation: any) => void;
  captured: () => readonly any[];
  rejected: () => readonly Readonly<{ reason: string }>[];
}>;
export function buildObservationRecord(input: Record<string, any>): Readonly<Record<string, any>>;
export function writeObservationRecord(input: { runRoot: string; record: Record<string, any> }): Readonly<Record<string, any>>;
export function readObservationRecord(input: { runRoot: string }): Readonly<{ record: Record<string, any>; digestOk: boolean; contentBindingFailed: boolean }> | null;
export function readRunIdentity(input: { journalRecords?: readonly any[] }): Readonly<Record<string, any>>;
export function readTrialIdentities(input: { journalRecords?: readonly any[] }): Map<string, any>;
export function correlateObservationRecord(input: { record: Record<string, any>; journalRecords?: readonly any[]; expectedRunId?: string | null; expectedAttemptId?: string | null }): Readonly<Record<string, any>>;
