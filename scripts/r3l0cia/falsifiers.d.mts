/**
 * R3-L0C-I-A §1 — TYPES FOR THE EIGHT ESCAPED-DEFECT FALSIFIERS.
 */

export interface FalsifierResult {
  readonly id: string;
  readonly property: string;
  readonly PROPERTY_VIOLATED_BY_BASELINE: boolean;
  readonly detail: string;
  readonly [key: string]: unknown;
}

export interface EscapedDefectReport {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly baseline: string;
  readonly falsifiers: readonly FalsifierResult[];
  readonly ESCAPED_DEFECTS_PRESENT: number;
  readonly ALL_EIGHT_VIOLATED_BY_BASELINE: boolean;
  readonly violated: readonly string[];
  readonly notViolated: readonly string[];
  readonly modelCallsMade: number;
  readonly law: string;
}

export function falsifierSchedule(): readonly {
  readonly sessionId: string;
  readonly block: number;
  readonly arm: string;
  readonly generation: string;
  readonly trajectoryId: string;
  readonly scheduleIndex: number;
  readonly requiresResolved: string | null;
}[];
export function falsifyF1(input: { readonly prehistory: { readonly world: string; readonly state: string }; readonly trajectoryIds: readonly string[] }): Promise<FalsifierResult>;
export function falsifyF2(input: { readonly runRoot: string; readonly trajectoryIds: readonly string[] }): Promise<FalsifierResult>;
export function falsifyF3(input: { readonly expectation: unknown; readonly observedHandles: readonly string[] }): Promise<FalsifierResult>;
export function falsifyF4(input: { readonly expectation: unknown; readonly transcriptPath: string | null; readonly visibleHandles: readonly string[] }): Promise<FalsifierResult>;
export function falsifyF5(): Promise<FalsifierResult>;
export function falsifyF6(input: { readonly schedule: readonly { readonly sessionId: string }[] }): Promise<FalsifierResult>;
export function falsifyF7(): Promise<FalsifierResult>;
export function falsifyF8(): Promise<FalsifierResult>;
export function runEscapedDefectFalsifiers(input: {
  readonly prehistory: { readonly world: string; readonly state: string };
  readonly trajectoryIds: readonly string[];
  readonly expectation: unknown;
  readonly observedHandles: readonly string[];
  readonly visibleHandles: readonly string[];
  readonly transcriptPath: string | null;
  readonly runRoot: string;
}): Promise<EscapedDefectReport>;
export function digestRunRootState(runRoot: string, trajectoryIds: readonly string[]): {
  readonly digest: string;
  readonly files: readonly string[];
  readonly digests: Readonly<Record<string, string>>;
  readonly fileCount: number;
};
export const NL: string;
export function readFileSync(path: string, encoding: string): string;
export const tmpdir: () => string;
