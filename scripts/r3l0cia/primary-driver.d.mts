/**
 * R3-L0C-I-A §5 — TYPES FOR THE REPAIRED PRIMARY MATRIX DRIVER.
 */

export function preparePrimaryCase(input: {
  readonly runRoot: string;
  readonly prehistory: { readonly world: string; readonly state: string };
  readonly trajectoryIds: readonly string[];
}): {
  readonly runRoot: string;
  readonly worlds: Readonly<Record<string, { readonly world: string; readonly paths: Readonly<Record<string, string>> }>>;
  readonly layout: Readonly<Record<string, unknown>>;
};

export interface PrimaryMatrixRun {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly MODE_RESOLUTION: string;
  readonly GATE_INPUTS?: string;
  readonly reason?: string;
  readonly missing?: readonly string[];
  readonly runId?: string;
  readonly runRoot?: string;
  readonly mode: Readonly<Record<string, unknown>> | null;
  readonly scheduleLength?: number;
  readonly trajectoryCount?: number;
  readonly launches: readonly unknown[];
  readonly faultsInjected?: readonly unknown[];
  readonly run: Readonly<Record<string, unknown>> | null;
  readonly maxLaunchesPerSession?: number;
  readonly terminalState?: string;
  readonly completedSessions?: readonly string[];
  readonly sessionsAfterFault?: readonly string[];
}

export function runPrimaryMatrix(input: {
  readonly runId: string;
  readonly runRoot: string;
  readonly prehistory: { readonly world: string; readonly state: string };
  readonly admittedRefs: readonly unknown[];
  readonly installHostBundle: unknown;
  readonly dshHome: unknown;
  readonly authorizedBy?: string | undefined;
  readonly caller?: string | undefined;
  readonly mode?: string | undefined;
  readonly paidAuthorization?: boolean | undefined;
  readonly plan?: unknown | undefined;
  readonly closure?: unknown | undefined;
  readonly containment?: unknown | undefined;
  readonly validityGate?: ((input: unknown) => Promise<unknown>) | undefined;
  readonly faultAt?: string | undefined;
  readonly faultKind?: string | undefined;
  readonly artifactRoot?: string | null | undefined;
  readonly timeoutMs?: number | undefined;
  readonly trustedClaimNonce?: string | null | undefined;
  readonly profileId?: string | undefined;
}): Promise<PrimaryMatrixRun>;

export function faultEnvironment(fault: string): { readonly R3L0CIA_FAULT: string };
export const NL: string;
export const REPO_ROOT: string;
export function readFileSync(path: string, encoding: string): string;
export function frozenPrimarySchedule(): Promise<readonly unknown[]>;
export function perTrajectoryProtectedRoots(runRoot: string, trajectoryIds: readonly string[], currentTrajectoryId: string): unknown;
export const PRIMARY_FAULTS: Readonly<Record<string, string>>;
