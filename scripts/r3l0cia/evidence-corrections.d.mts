/**
 * R3-L0C-I-A §9 — TYPES FOR THE EVIDENCE CORRECTIONS.
 */
export const PRIOR_TEST_COUNTS: { readonly stage: string; readonly baseline: string; readonly unitTests: number; readonly unitFiles: number };
export const LIVE_GATE_DISCLOSURE: {
  readonly gates: readonly string[];
  readonly status: string;
  readonly priorStageMeasurement: string;
  readonly requiresAModelRoute: boolean;
  readonly belongsAfterPaidAuthorization: boolean;
  readonly outsideThePrimarySixteenSessions: boolean;
  readonly presentedAsPassed: boolean;
  readonly thisStageReMeasuredIt: boolean;
};
export function testCountCorrection(input?: { readonly currentUnitTests?: number | null; readonly currentUnitFiles?: number | null }): {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly correctionId: string;
  readonly prior: typeof PRIOR_TEST_COUNTS;
  readonly current: Readonly<Record<string, unknown>>;
  readonly delta: { readonly tests: number | null; readonly files: number };
  readonly addedTestFiles: readonly string[];
  readonly addedTestFileCount: number;
  readonly reason: string;
  readonly priorEvidenceEdited: boolean;
  readonly law: string;
};
export function liveGateDisclosureMeasurement(input?: { readonly logPaths?: readonly string[] }): {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly disclosure: typeof LIVE_GATE_DISCLOSURE;
  readonly observations: readonly { readonly path: string; readonly present: boolean; readonly recordCount: number | null; readonly verdict: string; readonly matchesPriorMeasurement?: boolean; readonly firstRecordKind?: string | null }[];
  readonly logsRead: number;
  readonly zeroRequestLogs: number;
  readonly presentedAsPassed: boolean;
  readonly requiresAModelRoute: boolean;
  readonly thisStageEnteredPrimary: boolean;
  readonly note: string;
};
export function evidenceCorrections(input?: Readonly<Record<string, unknown>>): {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly testCount: ReturnType<typeof testCountCorrection>;
  readonly liveGates: ReturnType<typeof liveGateDisclosureMeasurement>;
  readonly priorEvidenceEdited: boolean;
  readonly oldCommitsRewritten: boolean;
  readonly forcePush: boolean;
  readonly law: string;
};
export const NL: string;
