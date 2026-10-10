/**
 * R3-L0C-I-A-R-L-C-F §4/§5 — TYPES FOR THE AUTHORITATIVE TERMINAL ADMISSION.
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
  readonly durableTrialConsistency: boolean;
  readonly durableSessionSet: readonly string[] | null;
  readonly retries: number;
  readonly unplannedLaunches: readonly string[];
  readonly freshness: Readonly<Record<string, any>> | null;
  readonly freshClosureDigest: string | null;
  readonly preflightClosureDigest: string | null;
  readonly boundClosureDigest: string | null;
  readonly routeIdentity: string | null;
  readonly measurementBasis: string | null;
  readonly detail: string;
  readonly onRed: Readonly<Record<string, any>>;
  readonly thisReducerIsTheFirstSightingOfACausalValidityFailure: boolean;
  readonly frozenStateMachineUnchanged: boolean;
  readonly law: string;
}

export const REQUIRED_TERMINAL_CONDITIONS: readonly { readonly id: string; readonly detail: string }[];
export const TERMINAL_DECISION_VALUES: { readonly GREEN: string; readonly RED: string };
export const NL: string;

export function authoritativeTerminalAdmission(input: Readonly<Record<string, any>>): Promise<TerminalAdmission>;
