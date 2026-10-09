/**
 * R3-L0C-I-A-R §4 — TYPES FOR THE CHILD/WORKER ADMISSION GATE.
 */

export interface AdmissionFault {
  readonly cause: string;
  readonly detail: string;
}

export interface GateAdmission {
  readonly disposition: string;
  readonly cause: string | null;
  readonly controlId: string | null;
  readonly missingSignals: readonly string[];
  readonly observations: readonly unknown[];
  readonly trialRecorded: boolean;
  readonly matrixResponse: string;
  readonly detail: string;
  readonly gateFired: boolean;
}

export const ADMISSION_CONTROL_OUTCOMES: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
export const ADMISSION_POSITIVE_OUTCOME: Readonly<Record<string, unknown>>;
export const NL: string;

export function admissionFault(outcome: unknown): AdmissionFault | null;
export function admitThroughGate(outcome: unknown, options?: Readonly<Record<string, unknown>>): Promise<GateAdmission>;
