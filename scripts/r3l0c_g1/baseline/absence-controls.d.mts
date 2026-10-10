/** R3-L0C-G1 — TYPES FOR scripts/r3l0c_g1/baseline/absence-controls.mjs. */

export interface AbsenceControl {
  readonly id: string;
  readonly requirement: string;
  readonly authorityBearingFunction?: string;
  readonly authorityBearingFunctions?: readonly string[];
  readonly observed: Readonly<Record<string, unknown>>;
  readonly gapPresent: boolean;
  readonly evidenceClass: string;
}

export function controlPortDiscardsProcessObservation(): AbsenceControl;
export function controlNoAttemptCorrelationSeam(): AbsenceControl;
export function controlNoDurableObservationRecord(): AbsenceControl;
export function controlArtifactParsersDisagree(input?: { realPath?: string }): Promise<AbsenceControl>;
export function controlNoExecutionWitnessProducer(): AbsenceControl;
export function runAbsenceControls(input?: { realPath?: string }): Promise<Readonly<{
  schemaVersion: number;
  stage: string;
  kind: string;
  declaredGapIds: readonly string[];
  controls: readonly AbsenceControl[];
  measuredGapCount: number;
  measuredGapIds: readonly string[];
  allDeclaredGapsMeasured: boolean;
  modelCallsMade: number;
  law: string;
}>>;

export const NL: string;
