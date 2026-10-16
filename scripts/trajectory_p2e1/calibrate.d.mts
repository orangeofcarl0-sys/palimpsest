/**
 * Trajectory-P2-E1R §11 — TYPE SURFACE for the `.mjs` calibration launch gate.
 *
 * The repository's convention for a bare-node `.mjs` helper is a sibling `.d.mts` declaration.
 */
export interface CalibrationCheck {
  readonly id: string;
  readonly statement: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface CalibrationDryRunReport {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly stage: string;
  readonly baseline: string;
  readonly mode: string | null;
  readonly verdict: "DETERMINISTIC_ASSAY_GO" | "DETERMINISTIC_ASSAY_NO_GO";
  readonly checks: readonly CalibrationCheck[];
  readonly failedChecks: readonly string[];
  readonly oracleVersion: string;
  readonly officialOracle: string;
  readonly legacyOracle: Readonly<Record<string, unknown>>;
  readonly fixtureId: string;
  readonly r2vrQualificationRequirements: readonly Readonly<Record<string, string>>[];
  readonly futureCalibrationParameters: readonly string[];
  readonly baselineOnlyDiscipline: string;
  readonly stochasticCalibrationExecuted: boolean;
  readonly treatmentTrialsExecuted: boolean;
  readonly externalModelRequestOccurred: boolean;
  readonly paidModelRequestOccurred: boolean;
  readonly modelCallsMade: number;
  readonly elapsedMs: number;
  readonly note: string;
}

export declare const R2_VR_QUALIFICATION_REQUIREMENTS: readonly Readonly<Record<string, string>>[];
export declare const FUTURE_CALIBRATION_PARAMETERS: readonly string[];
