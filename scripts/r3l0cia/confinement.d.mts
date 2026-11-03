/**
 * R3-L0C-I-A §3 — TYPES FOR PER-TRAJECTORY CONFINEMENT.
 */

export interface ProtectedRootManifest {
  readonly currentTrajectoryId: string;
  readonly ownWorld: string;
  readonly roots: readonly string[];
  readonly rootCount: number;
  readonly ownWorldExcluded: boolean;
  readonly ownWorldIncluded: boolean;
  readonly siblingWorldsIncluded: number;
  readonly siblingWorldsExpected: number;
  readonly missingSiblings: readonly string[];
  readonly allSiblingsProtected: boolean;
  readonly stateRootsProtected: number;
  readonly stateRootsExpected: number;
  readonly missingState: readonly string[];
  readonly allStateProtected: boolean;
  readonly hostPrivate: Readonly<Record<string, boolean>>;
  readonly allHostPrivateProtected: boolean;
  readonly law: string;
}

export interface ConfinementCase {
  readonly currentTrajectoryId: string;
  readonly ownWorld: string;
  readonly ownWorldExcludedFromProtectedRoots: boolean;
  readonly siblingWorldsProtected: number;
  readonly siblingWorldsExpected: number;
  readonly protectedRootCount: number;
  readonly allProtectedRootsExist: boolean;
  readonly manifest: ProtectedRootManifest;
  readonly fence: { readonly applied: boolean; readonly rootsVerified: boolean; readonly treesVerified: boolean; readonly supported: boolean; readonly roots: number; readonly detail: string | null };
  readonly probeRan: boolean;
  readonly probeError: string | null;
  readonly ownWorldRead: boolean;
  readonly ownWorldWrote: boolean;
  readonly isolationAttempts: number;
  readonly reachable: readonly string[];
  readonly notApplicable: readonly string[];
  readonly escapeAttempts: number;
  readonly escaped: readonly string[];
  readonly observations: Readonly<Record<string, unknown>>;
  readonly CONFINEMENT_CASE: string;
  readonly aclWeakenedToManufactureAPass: boolean;
  readonly reliedSolelyOnUnconfinedScriptedWorker: boolean;
}

export interface ConfinementSuite {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly trajectoryIds: readonly string[];
  readonly cases: readonly ConfinementCase[];
  readonly livenessControl: Readonly<Record<string, unknown>>;
  readonly everyOwnWorldExcluded: boolean;
  readonly everySiblingProtected: boolean;
  readonly everyOwnWorldWritable: boolean;
  readonly everyOwnWorldReadable: boolean;
  readonly noProtectedTargetReachable: boolean;
  readonly noEscapeSucceeded: boolean;
  readonly probeDiscriminates: boolean;
  readonly sandboxAvailable: boolean;
  readonly confidentialProfile: string;
  readonly ACTUAL_CONTAINMENT: string;
  readonly failing: readonly string[];
  readonly onUnsatisfiable: string;
  readonly aclWeakened: boolean;
  readonly modelCallsMade: number;
}

export function perTrajectoryProtectedRoots(runRoot: string, trajectoryIds: readonly string[], currentTrajectoryId: string): ProtectedRootManifest;
export function perTrajectoryTargets(runRoot: string, trajectoryIds: readonly string[], currentTrajectoryId: string): Readonly<Record<string, unknown>>;
export function writePerTrajectoryCanaries(runRoot: string, trajectoryIds: readonly string[]): { readonly nonces: Readonly<Record<string, string>>; readonly runRoot: string };
export function perTrajectoryProbeSource(targets: unknown, world: string, livenessPath: string): string;
export function runTrajectoryConfinementCase(input: { readonly runRoot: string; readonly trajectoryIds: readonly string[]; readonly currentTrajectoryId: string }): Promise<ConfinementCase>;
export function runPerTrajectoryConfinement(input: { readonly runRoot: string; readonly trajectoryIds: readonly string[] }): Promise<ConfinementSuite>;
export function runConfinementLivenessControl(input: { readonly runRoot: string; readonly trajectoryIds: readonly string[]; readonly currentTrajectoryId: string }): Promise<Record<string, unknown>>;
