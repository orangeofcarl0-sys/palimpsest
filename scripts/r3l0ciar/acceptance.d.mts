/**
 * R3-L0C-I-A-R §3-§8 — TYPES FOR THE PRODUCTION-PATH CONTROLS.
 */

export interface ControlResult {
  readonly id: string;
  readonly PASS: boolean;
  readonly positiveControl: Readonly<Record<string, unknown>>;
  readonly mutant: Readonly<Record<string, unknown>>;
  readonly negatives?: readonly Readonly<Record<string, unknown>>[];
  readonly allNegativesRefused?: boolean;
  readonly allNegativesFailClosed?: boolean;
  readonly allSixRefused?: boolean;
  readonly allSixStopTheMatrix?: boolean;
  readonly fiveRefusedByTheGate?: boolean;
  readonly behaviouralStillAdmitted?: boolean;
}

export const NL: string;
export const tmpdir: string;
export const readFileSync: typeof import("node:fs").readFileSync;

export function controlPreTrialReducer(input: { readonly healthy: Readonly<Record<string, unknown>> }): Promise<ControlResult>;
export function controlRouteIdentity(input: { readonly healthy: Readonly<Record<string, unknown>> }): Promise<ControlResult>;
export function controlAdmission(): Promise<ControlResult>;
export function controlUptakeProvenance(input: { readonly expectation: unknown }): Promise<ControlResult>;
export function controlCostAttribution(input: Readonly<Record<string, unknown>>): Promise<ControlResult>;
export function controlPostMatrixGate(input: Readonly<Record<string, unknown>>): Promise<ControlResult>;
export function controlTimeoutAndAuthorization(input: Readonly<Record<string, unknown>>): Promise<ControlResult>;
export function writeFixtureArtifact(): Buffer;
export function digestRoot(root: string): string;
