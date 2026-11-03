/**
 * R3-L0C-I-A-R-L-C §3-§6 — TYPES FOR THE PRODUCTION-PATH CONTROLS.
 */

export interface ControlRecord {
  readonly id: string;
  readonly authorityBearingFunction: string;
  readonly durableEvidence: string;
  /* eslint-disable @typescript-eslint/no-explicit-any -- the controls return heterogeneous measurement shapes */
  readonly positiveControl: Record<string, any>;
  readonly mutations: Record<string, any>;
  readonly mutant: Readonly<Record<string, unknown>>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  readonly PASS: boolean;
}

export const NL: string;

export function controlDurableCostBridge(): Promise<ControlRecord>;
export function controlTerminalAdmission(): Promise<ControlRecord>;
export function controlTrustBoundary(input?: { readonly dshHomePath?: string }): Promise<ControlRecord>;
export function controlInRunAttestation(input: { readonly repo?: string; readonly compiledVerification?: unknown }): Promise<ControlRecord>;
export function createHash(algorithm: string): { update(data: unknown): { digest(encoding: string): string } };
export function existsSync(path: string): boolean;
export function mkdirSync(path: string, options?: { readonly recursive?: boolean }): void;
export function mkdtempSync(prefix: string): string;
export function readFileSync(path: string, encoding?: string): string;
export function rmSync(path: string, options?: { readonly recursive?: boolean; readonly force?: boolean; readonly maxRetries?: number; readonly retryDelay?: number }): void;
export function writeFileSync(path: string, data: unknown, encoding?: string): void;
