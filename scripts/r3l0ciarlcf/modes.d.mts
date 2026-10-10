/**
 * R3-L0C-I-A-R-L-C-F §6 — TYPES FOR THE AUTHORITATIVE-PATH GUARD AND MODE RESOLUTION.
 */

export interface AuthoritativePathGuard {
  readonly authorized: boolean;
  readonly caller: string;
  readonly authoritativePath: string;
  readonly priorPipelinesQuarantined: boolean;
  readonly priorPipelinesStillExecutable: boolean;
}

export const AUTHORITATIVE_PLAN_ID: string;
export const NL: string;
export const REPO_ROOT: string;

export function assertAuthoritativePath(input: Readonly<Record<string, any>>): AuthoritativePathGuard;
export function resolveExecutionMode(input: Readonly<Record<string, any>>): Promise<Readonly<Record<string, any>>>;
export function resolveShippedDshBinAsync(): Promise<Readonly<Record<string, any>>>;
