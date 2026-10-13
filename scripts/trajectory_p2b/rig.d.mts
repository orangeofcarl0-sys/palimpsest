/**
 * Trajectory-P2-D2 — the type surface for `scripts/trajectory_p2b/rig.mjs` (the shared test rig).
 *
 * The rig is `.mjs` (it runs under bare `node`), the tests are TypeScript under `noImplicitAny`, and the
 * declaration here is preferable to loosening the compiler for test code — the same convention the R1/R3
 * harnesses use.
 */

/** The repository root the rig resolves from its own location. */
export declare const REPO: string;
/** The real DSH home (from `DSH_HOME` or `~/.dsh`), forward-slashed. */
export declare const REAL_DSH_HOME: string;
/** The shared first-party DSH modules root inside the real home. */
export declare const REAL_MODULES: string;
/** The gate root the rig allocates owned directories under. */
export declare const GATE_ROOT: string;

/** True when a first-party DSH tree is installed. */
export declare function hasFirstPartyDsh(): boolean;
/** True when `dist/src/advanced.js` exists (the build ran). */
export declare function hasBuiltDist(): boolean;
/** The DSH bin path the rig drives. */
export declare function dshBin(): string;

export interface OwnedRoot {
  readonly root: string;
  readonly contained: boolean;
  readonly isReparse: boolean;
}

/** Allocate a UNIQUE per-run directory inside the gate root and PROVE containment. */
export declare function allocateOwnedRoot(prefix: string): OwnedRoot;

export interface CleanupResult {
  readonly cleaned: boolean;
  readonly reason?: string;
  readonly preserved?: boolean;
}

/** Delete ONLY the directory this run created, after re-proving containment. */
export declare function safeCleanup(owned: OwnedRoot): Promise<CleanupResult>;

/** Install the CURRENT branch's host bundle where the DSH profile loader resolves it. */
export declare function installHostBundle(home: string): void;

/** Link the SHARED first-party DSH packages into the test home. */
export declare function linkSharedModules(home: string): void;

/** Write the test-owned profile carrying the CURRENT host entry and the refusal probe. */
export declare function writeProbeProfile(home: string, rig: string, profileName: string, projectId: string): string;

export interface OfficialReaderMeasurement {
  readonly readState: string;
  readonly counts: { readonly total: number; readonly turnStart: number; readonly stepStart: number; readonly requestHeader: number } | null;
  readonly headerSessionId?: string | null;
  readonly persistedEventCount?: number | null;
}

/** Read ONE session through the OFFICIAL reader and count logical events. */
export declare function measureSessionThroughOfficialReader(sessionsRoot: string, sessionId: string): Promise<OfficialReaderMeasurement>;
