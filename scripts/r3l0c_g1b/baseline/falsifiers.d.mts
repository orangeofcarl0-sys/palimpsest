/** R3-L0C-G1-B — TYPES FOR scripts/r3l0c_g1b/baseline/falsifiers.mjs. */

export const NL: string;

export interface Falsifier {
  readonly id: string;
  readonly requirement: string;
  readonly observed: Readonly<Record<string, unknown>>;
  readonly defectPresent: boolean;
  readonly classification: string;
  readonly evidenceClass: string;
}

export function runRealStack(): Promise<Readonly<{
  jobId: string;
  attemptId: string | null;
  jobPhase: string | null;
  correlated: readonly any[];
  modelCallsMade: number;
}>>;
export function falsifierTwoInvocationProducers(stack: any): Falsifier;
export function falsifierFalseDurability(stack: any): Promise<Falsifier>;
export function falsifierWrongJournalSchema(): Promise<Falsifier>;
export function falsifierForgedOrigin(): Promise<Falsifier>;
export function falsifierLocatorMismatch(): Promise<Falsifier>;
export function runBaselineFalsifiers(): Promise<Readonly<{
  schemaVersion: number;
  stage: string;
  kind: string;
  controls: readonly Falsifier[];
  measuredDefectIds: readonly string[];
  allDefectsMeasured: boolean;
  modelCallsMade: number;
  law: string;
}>>;
