/**
 * Trajectory-P2-E0 §7 — TYPE SURFACE for the `.mjs` owned-root lifecycle.
 *
 * `tsc` under `noImplicitAny` refuses an untyped `.mjs` import, and the repository's established convention
 * for a bare-node `.mjs` helper is a sibling `.d.mts` declaration (see `scripts/trajectory_p2b/rig.d.mts`).
 */
export declare const REPO: string;
export declare const GATE_ROOT: string;
export declare const OWNERSHIP_MARKER: string;

export interface OwnedRoot {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly root: string;
  readonly canonicalRoot: string;
  readonly gateRoot: string;
  readonly prefix: string;
  readonly runIdentity: string;
  readonly owningProcessId: number;
  readonly createdAt: string;
  readonly markerFile: string;
  readonly containmentProven: boolean;
  readonly rootIsReparsePoint: boolean;
  ownsSelf(): boolean;
}

export interface CleanupResult {
  readonly cleaned: boolean;
  readonly reason?: string;
  readonly preserved?: boolean;
  readonly removedLinks?: readonly string[];
  readonly failedLinks?: readonly { readonly link: string; readonly detail: string }[];
  readonly descendantReparsePointsFound?: number;
  readonly scanState?: "COMPLETE";
  readonly scanErrors?: readonly { readonly path: string; readonly detail: string }[];
  readonly attempts?: number;
}

export interface OwnedRootReport {
  readonly root: string;
  readonly canonicalRoot: string;
  readonly runIdentity: string;
  readonly owningProcessId: number;
  readonly containmentProven: boolean;
  readonly rootIsReparsePoint: boolean;
  readonly cleanupPolicy: string;
  readonly cleanup: CleanupResult;
}

export type OwnedRootOutcome<T> =
  | { readonly ok: true; readonly value: T; readonly report: OwnedRootReport }
  | { readonly ok: false; readonly error: unknown; readonly report: OwnedRootReport };

export declare function containedIn(parent: string, child: string): boolean;
export type ReparseScan =
  | { readonly state: "COMPLETE"; readonly links: readonly string[]; readonly count: number }
  | { readonly state: "INCOMPLETE"; readonly errors: readonly { readonly path: string; readonly detail: string }[]; readonly links: readonly string[]; readonly count: number };
export declare function findDescendantReparsePoints(root: string): ReparseScan;
export declare function snapshotDependencyRoot(root: string): { readonly present: boolean; readonly canonical?: string; readonly entries?: number; readonly reparsePoints?: number; readonly entrypoints?: readonly string[] };
export declare function freeBytesAt(path: string): number | null;
export declare function allocateOwnedRoot(prefix: string, runIdentity?: string): OwnedRoot;
export declare function safeCleanup(owned: OwnedRoot | undefined | null): Promise<CleanupResult>;
export declare function isOwnedByThisStage(path: string): boolean;
export declare function withOwnedRoot<T>(prefix: string, runIdentity: string | undefined, body: (owned: OwnedRoot) => Promise<T> | T): Promise<OwnedRootOutcome<T>>;
