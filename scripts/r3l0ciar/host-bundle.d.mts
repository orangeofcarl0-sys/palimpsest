/**
 * R3-L0C-I-A-R §2 — TYPES FOR THE RACE-TOLERANT HOST-BUNDLE INSTALLER.
 */

export interface BundleDescription {
  readonly repo: string;
  readonly sources: Readonly<Record<string, { readonly relative: string; readonly mtimeMs: number | null }>>;
}

export interface InstallResult {
  readonly nodeModules: string;
  readonly marker: BundleDescription;
  readonly installed: readonly { readonly name: string; readonly action: string; readonly copied: boolean }[];
  readonly raceTolerant: boolean;
  readonly idempotent: boolean;
}

export const INSTALL_MARKER: string;
export const BUNDLE_SOURCES: readonly { readonly relative: string; readonly name: string }[];
export const NL: string;

export function installHostBundleSafely(input: { readonly repo: string; readonly realDshHome: string }): InstallResult;
export function describeBundle(repo: string): BundleDescription;
