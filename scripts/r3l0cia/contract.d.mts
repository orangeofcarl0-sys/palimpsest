/**
 * R3-L0C-I-A §0-§9 — TYPES FOR THE PAID-ACTIVATION BOUNDARY CONTRACT.
 *
 * These declarations describe the frozen values in `contract.mjs`. They exist so the test suite can import the
 * contract with real types rather than `any`, which is what keeps a renamed field a compile error instead of a
 * silently-undefined assertion.
 */

export interface EscapedDefect {
  readonly id: string;
  readonly gap: string;
  readonly baselineLocation: string;
  readonly property: string;
  readonly measuredBy: string;
}

export interface ActivationStep {
  readonly step: number;
  readonly id: string;
  readonly mutates: boolean;
  readonly requirement: string;
}

export interface ExecutionMode {
  readonly id: string;
  readonly realGenerationChild: boolean;
  readonly realPackagedWorkPath: boolean;
  readonly realIpcProtocol: boolean;
  readonly worker: string;
  readonly externalModelCallPermitted: boolean;
  readonly paidAuthorizationRequired: boolean;
}

export interface PullLayer {
  readonly id: string;
  readonly source: string;
  readonly answers: string;
  readonly isUptakeEvidence: boolean;
  readonly forbiddenReading: string;
}

export const BASELINE_COMMIT: string;
export const STAGE_BRANCH: string;
export const STAGE_CODE_PATH: string;
export const STAGE_EVIDENCE_PATH: string;
export const PRIOR_EVIDENCE_PATHS: readonly string[];
export const FROZEN_STAGES: readonly string[];
export const REPO_ROOT: string;
export const ESCAPED_DEFECTS: readonly EscapedDefect[];
export const ACTIVATION_ORDER: readonly ActivationStep[];
export const RUN_ROOT_REFUSAL_CONDITIONS: readonly { readonly id: string; readonly detail: string }[];
export const RUN_ROOT_VERDICTS: readonly string[];
export const QUARANTINE_HONESTY: {
  readonly legacyMatrixRemainsPhysicallyExecutable: boolean;
  readonly quarantineIsAGuardNotAnImpossibility: boolean;
  readonly forbiddenClaim: string;
  readonly enforcedBy: string;
  readonly legacyMatrixEdited: boolean;
};
export const EXECUTION_MODES: readonly ExecutionMode[];
export const EXECUTION_MODE_LAW: {
  readonly modeIsRequiredAndExplicit: boolean;
  readonly silentFallbackInEitherDirection: boolean;
  readonly callerSuppliedAuthorizedByIsNotProof: boolean;
  readonly callerSuppliedAuthorizedByNote: string;
  readonly thisStageEntersPrimary: boolean;
  readonly primaryRequiresExplicitPaidAuthorization: boolean;
};
export const PULL_LAYERS: readonly PullLayer[];
export const WORKER_PULL_TELEMETRY: {
  readonly prefix: string;
  readonly field: string;
  readonly supersededShape: string;
  readonly supersededShapeReadAsZeroPulls: boolean;
  readonly parserSource: string;
  readonly useShippedParser: boolean;
};
export const TREATMENT_NEGATIVE_CONTROLS: readonly {
  readonly id: string;
  readonly arm: string;
  readonly generation: string;
  readonly expectedVisible: number;
  readonly requiredRealization: string;
  readonly requiredUptake?: string;
  readonly requiredDisposition?: string;
  readonly requiredMatrixResponse?: string;
  readonly retryPermitted?: boolean;
  readonly matrixMustNotStopForTheDeclinedPull?: boolean;
}[];
export const WORKER_EXECUTION_BUDGET_MS: number;
export const SETTLEMENT_INTERVAL_MS: number;
export const OUTER_BUDGET_MARGIN_MS: number;
export const GENERATION_CHILD_BUDGET_MS: number;
export const BASELINE_TIMEOUT_BUDGETS: { readonly outerChildMs: number; readonly innerWorkerMs: number; readonly conflict: string };
export const OUTER_TERMINATION_VERDICTS: readonly { readonly id: string; readonly descendantDeathEstablished: boolean; readonly disposition: string }[];
export const DESCENDANT_TERMINATION_LAW: {
  readonly killIsNotProofOfExit: boolean;
  readonly onUnestablished: string;
  readonly forbiddenRepair: string;
  readonly law: string;
};
export const PRE_TRIAL_REQUIREMENTS: readonly string[];
export const FORBIDDEN_PRE_TRIAL_SHORTCUTS: readonly string[];
export const FROZEN_SCHEDULE_SHAPE: { readonly pairedBlocks: number; readonly arms: number; readonly generations: number; readonly sessions: number; readonly matchedComparisons: number };
export const RECONSTRUCTION_COST_FIELDS: readonly string[];
export const ARTIFACT_ATTRIBUTION_LAW: {
  readonly oneArtifactPerScheduledSession: boolean;
  readonly rejectAmbiguousAttribution: boolean;
  readonly selectLatestByConvenience: boolean;
  readonly fixtureInstrumentationSeparatelyLabeled: boolean;
  readonly law: string;
};
export const INTERRUPTED_MATRIX_VERDICTS: {
  readonly CAUSAL_EXPERIMENT_VALID: string;
  readonly RECONSTRUCTION_COMPRESSION: string;
  readonly NET_COGNITIVE_COST: string;
  readonly partialObservationsPreservedForAudit: boolean;
  readonly combinesInvalidOldRun1WithNewMatrix: boolean;
};
export const RUNTIME_MANIFEST_MODULES: readonly string[];
export const RUNTIME_MANIFEST_LAW: {
  readonly reason: string;
  readonly narrowExplicitManifest: boolean;
  readonly buildsGeneralBundlerOrDependencySystem: boolean;
  readonly mutationRequired: string;
  readonly deterministicEmitVerification: boolean;
  readonly toolchainVersionBinding: boolean;
  readonly recordsConfiguredAndObserved: boolean;
  readonly checkpointEquivalenceFromFamilyName: boolean;
  readonly hashesOrExposesSecretValues: boolean;
};
export const ACCEPTANCE_TESTS: readonly string[];
export const ACCEPTANCE_LAW: {
  readonly eachHardGateNeedsAPositiveControlAndAMutantThatFailsThePreRepairImplementation: boolean;
  readonly testDeclarationsAreNotASubstituteForMeasuringTheActualBoundary: boolean;
  readonly law: string;
};
export const COMMIT_STRUCTURE: readonly string[];
export const COMMIT_LAW: {
  readonly planCommittedAfterAllIntegrationChanges: boolean;
  readonly planCommittedBeforeAnyPaidModelExposure: boolean;
  readonly supersedesRatherThanAmendsPriorPlan: boolean;
  readonly forcePush: boolean;
  readonly amendHistoricalCommits: boolean;
  readonly editFrozenHistoricalPlans: boolean;
  readonly preservePriorEvidenceImmutably: boolean;
  readonly finalClosureComputedAfterFinalBuild: boolean;
};
export const FINAL_VERDICTS: Record<string, readonly string[]>;
export const STAGE_STOP: {
  readonly ranPaidMatrix: boolean;
  readonly beganR3L1: boolean;
  readonly beganFusion: boolean;
  readonly modelCallsMade: number;
  readonly law: string;
};
export const NL: string;
export function contractSummary(): Record<string, unknown>;
