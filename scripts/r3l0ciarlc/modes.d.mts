/**
 * R3-L0C-I-A-R-L-C §5 — TYPES FOR THE AUTHORITATIVE-PATH GUARD AND MODE RESOLUTION.
 */

export const AUTHORITATIVE_PLAN_ID: string;
export const NL: string;
export const REPO_ROOT: string;

export function assertAuthoritativePath(input: { readonly caller?: string; readonly authorizedBy?: string }): {
  readonly authorized: boolean;
  readonly caller: string;
  readonly authoritativePath: string;
  readonly priorPipelinesQuarantined: boolean;
  readonly priorPipelinesStillExecutable: boolean;
};
export function resolveExecutionMode(input: { readonly mode?: string; readonly paidAuthorization?: boolean }): Promise<Readonly<Record<string, unknown>>>;
export function resolveShippedDshBinAsync(): Promise<Readonly<Record<string, unknown>>>;
