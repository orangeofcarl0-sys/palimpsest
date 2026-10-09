/**
 * R3-L0C-I-A-R-L §4 — TYPES FOR THE EXECUTABLE AND ENVIRONMENTAL ATTESTATION.
 */

export interface CompiledAttestation {
  readonly kind: string;
  readonly requested: boolean;
  readonly evaluated: boolean;
  readonly deterministic: string;
  readonly method: string;
  readonly pairs: number;
  readonly missing: readonly string[];
  readonly diverged: readonly unknown[] | null;
  readonly stale: readonly unknown[] | null;
  readonly COMPILED_MATCHES_SOURCE: boolean;
  readonly unsupportedReason?: string | null;
}

export interface BundleTargetAttestation {
  readonly source: string;
  readonly installedName: string;
  readonly sourceExists: boolean;
  readonly installedExists: boolean;
  readonly sourceFileCount: number;
  readonly installedFileCount: number;
  readonly installerMarkerPresent?: boolean;
  readonly missingInInstall: readonly string[];
  readonly extraInInstall: readonly string[];
  readonly differing: readonly string[];
  readonly identical: boolean;
}

export interface BundleAttestation {
  readonly kind: string;
  readonly nodeModules: string;
  readonly targets: readonly BundleTargetAttestation[];
  readonly allIdentical: boolean;
  readonly excludedInstallerBookkeeping?: string;
  readonly installerIsMitigationNotProof: boolean;
  readonly comparedFileByFile: boolean;
  readonly law: string;
}

export interface CompetingWriter {
  readonly beforeDigest: string | null;
  readonly afterDigest: string;
  readonly changed: boolean | null;
  readonly installedDuringRun: boolean;
  readonly competingWriterDetected: boolean;
  readonly note: string;
}

export interface RuntimeAttestationResult {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly compiledSource: CompiledAttestation;
  readonly installedBundle: BundleAttestation;
  readonly competingWriter: CompetingWriter;
  readonly verifiedClosureDigest: string | null;
  readonly verifiedClosureCompiledMatchesSource: boolean | null;
  readonly EXECUTABLE_RUNTIME_ATTESTATION: string;
  readonly installerIsMitigationNotProof: boolean;
  readonly law: string;
}

export const INSTALLER_MARKER: string;
export const NL: string;
export const REPO_ROOT: string;

export function verifyCompiledSource(): Promise<CompiledAttestation>;
export function attestInstalledBundle(input: { readonly dshHomePath: string }): BundleAttestation;
export function sampleInstallationDigest(input: { readonly dshHomePath: string }): string;
export function competingWriterVerdict(input: { readonly beforeDigest: string | null; readonly afterDigest: string; readonly installedDuringRun: boolean }): CompetingWriter;
export function digestOfMap(map: Readonly<Record<string, string>>): string;
export function treeDigests(root: string): Readonly<Record<string, string>>;
export function runtimeAttestation(input: Readonly<Record<string, unknown>>): Promise<RuntimeAttestationResult>;
