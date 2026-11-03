/**
 * Trajectory-P2-E0 §7 — TYPE SURFACE for the `.mjs` DSH test-home helper.
 *
 * `tsc` under `noImplicitAny` refuses an untyped `.mjs` import; the repository's convention for a bare-node
 * `.mjs` helper is a sibling `.d.mts` declaration (see `scripts/trajectory_p2b/rig.d.mts`).
 */
export declare const REAL_DSH_HOME: string;
export declare const REAL_MODULES: string;
export declare const MEASURED_FULL_COPY_BYTES: number;
export declare const HEAVY_GATE_HEADROOM_MULTIPLIER: number;

export declare function hasFirstPartyDsh(): boolean;
export declare function hasBuiltDist(repo: string): boolean;
export declare function dshBin(): string;

export interface DiskPreflight {
  readonly targetPath: string;
  readonly freeBytes: number | null;
  readonly strategy: string;
  readonly copies: number;
  readonly estimatedRequiredBytes: number;
  readonly sufficient: boolean | null;
  readonly verdict: "SUFFICIENT" | "TEST_RUNTIME_BLOCKED_INSUFFICIENT_DISK" | "UNKNOWN_FREE_SPACE";
}

export declare function diskPreflight(targetPath: string, options?: { readonly strategy?: string; readonly copies?: number }): DiskPreflight;
export declare function installHostBundle(home: string, repo: string): void;
export declare function shareDshModules(home: string, options?: { readonly strategy?: "junction" | "copy" }): { readonly strategy: string; readonly entries: number; readonly reason?: string };

export interface DeterministicProfileInput {
  readonly home: string;
  readonly repo: string;
  readonly root: string;
  readonly profileName: string;
  readonly adapterUrl: string;
  readonly withModel?: boolean;
}

export declare function writeDeterministicProfile(input: DeterministicProfileInput): string;
export declare function readSessionByExactId(input: { readonly sessionsRoot: string; readonly sessionId: string }): Promise<readonly unknown[]>;
export declare function findSessionFile(sessionsRoot: string, sessionId: string): { readonly matches: readonly string[]; readonly unique: string | null };
