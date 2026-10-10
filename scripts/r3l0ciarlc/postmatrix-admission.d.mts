/**
 * R3-L0C-I-A-R-L-C §4 Gate B — TYPES FOR THE AUTHORITATIVE TERMINAL ADMISSION.
 */

export interface TerminalCondition {
  readonly id: string;
  readonly holds: boolean;
  readonly detail: string | null;
}

export interface TerminalAdmission {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly green: boolean;
  readonly decision: string;
  readonly conditions: readonly TerminalCondition[];
  readonly failing: readonly string[];
  readonly requiredConditions: readonly string[];
  readonly journalReadAtAdmission: boolean;
  readonly journalIntact: boolean;
  readonly identitiesExact: boolean;
  readonly retries: number;
  readonly unplannedLaunches: readonly string[];
  readonly freshClosureDigest: string | null;
  readonly boundClosureDigest: string | null;
  readonly routeIdentity: string | null;
  readonly detail: string;
  readonly onRed: Readonly<Record<string, unknown>>;
  readonly thisReducerIsTheFirstSightingOfACausalValidityFailure: boolean;
  readonly frozenStateMachineUnchanged: boolean;
  readonly law: string;
}

export const REQUIRED_TERMINAL_CONDITIONS: readonly { readonly id: string; readonly detail: string }[];
export const NL: string;

export function authoritativeTerminalAdmission(input: {
  readonly completed: readonly string[];
  readonly records: readonly Readonly<Record<string, unknown>>[];
  readonly plannedSessions: readonly string[];
  readonly schedule: readonly Readonly<Record<string, unknown>>[];
  readonly plan: Readonly<Record<string, unknown>> | null;
  readonly journalPath: string;
  readonly journalReader: (path: string) => Readonly<Record<string, unknown>>;
  readonly liveEvidenceContinuity: Readonly<Record<string, unknown>> | null;
  readonly costAttribution: Readonly<Record<string, unknown>> | null;
  readonly recompute: () => Promise<Readonly<Record<string, unknown>>>;
  readonly attestation: Readonly<Record<string, unknown>> | null;
  readonly postMatrixValidity: Readonly<Record<string, unknown>> | null;
}): Promise<TerminalAdmission>;
