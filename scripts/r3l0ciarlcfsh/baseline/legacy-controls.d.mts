/**
 * R3-L0C-I-A-R-L-C-F-S-H §2 — TYPES FOR THE MEASURED BASELINE CONTROLS.
 */

export const NL: string;

export const BASELINE_SOURCE: {
  readonly revision: string;
  readonly stage: string;
  readonly files: readonly string[];
  readonly note: string;
};

export function writeRealArtifact(input: { directory: string; attemptId: string; records: readonly unknown[] }): {
  readonly path: string;
  readonly attemptId: string;
  readonly records: number;
};

export function controlValidatorNotConsumed(): Promise<{
  readonly id: string;
  readonly requirement: string;
  readonly authorityBearingFunction: string;
  readonly durableEvidence: string;
  readonly validatorIsAbsentFromTheChain: boolean;
  readonly observed: Record<string, any>;
  readonly defectPresent: boolean;
  readonly defectDetail: string;
  readonly correctionMustLiveIn: string;
}>;

export function controlCleanupDefects(): Promise<{
  readonly id: string;
  readonly requirement: string;
  readonly authorityBearingFunction: string;
  readonly durableEvidence: string;
  readonly observed: Record<string, any>;
  readonly defectPresent: boolean;
  readonly defectDetail: string;
  readonly correctionMustLiveIn: string;
}>;

export function controlContradictoryPersistedSeal(): {
  readonly id: string;
  readonly requirement: string;
  readonly authorityBearingFunction: string;
  readonly durableEvidence: string;
  readonly observed: Record<string, any>;
  readonly calculationOrder: readonly string[];
  readonly defectPresent: boolean;
  readonly defectDetail: string;
  readonly correctionMustLiveIn: string;
};

export function controlIdentityEvidenceLevel(): {
  readonly id: string;
  readonly requirement: string;
  readonly authorityBearingFunction: string;
  readonly durableEvidence: string;
  readonly observed: Record<string, any>;
  readonly evidenceLevelDemonstrated: Record<string, boolean>;
  readonly highestLevelDemonstrated: string;
  readonly defectPresent: boolean;
  readonly defectDetail: string;
  readonly correctionMustLiveIn: string;
};

export function controlUnconditionalQualification(): {
  readonly id: string;
  readonly requirement: string;
  readonly authorityBearingFunction: string;
  readonly durableEvidence: string;
  readonly observed: Record<string, any>;
  readonly defectPresent: boolean;
  readonly defectDetail: string;
  readonly correctionMustLiveIn: string;
};

export function runBaselineControls(): Promise<{
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly baseline: string;
  readonly source: Record<string, unknown>;
  readonly controls: readonly any[];
  readonly declared: number;
  readonly reproduced: number;
  readonly ALL_DEFECTS_REPRODUCED: boolean;
  readonly reproducedIds: readonly string[];
  readonly notReproduced: readonly string[];
  readonly modelCallsMade: number;
  readonly law: string;
}>;
