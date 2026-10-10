/**
 * R3-L0C-I-A-R-L-C-F §7 — TYPES FOR THE IN-RUN ATTESTATION.
 */

export interface InstalledBundleComparison {
  readonly kind: string;
  readonly nodeModules: string;
  readonly targets: readonly Readonly<Record<string, any>>[];
  readonly allIdentical: boolean;
  readonly excludedInstallerBookkeeping: string;
  readonly comparedFileByFile: boolean;
}

export interface CompetingWriterVerdict {
  readonly s0Digest: string | null;
  readonly s1Digest: string;
  readonly s2Digest: string;
  readonly installedDuringRun: boolean;
  readonly changedAfterInstall: boolean;
  readonly changedSinceStart: boolean;
  readonly competingWriterDetected: boolean;
  readonly installedDuringRunSuppressesDetection: boolean;
  readonly s0ToS1IsThisRunsOwnInstall: boolean;
  readonly note: string;
}

export interface InRunAttestation {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly s0Digest: string | null;
  readonly s1Digest: string;
  readonly s2Digest: string;
  readonly expectedBundle: InstalledBundleComparison;
  readonly s1MatchesExpectedBundle: boolean;
  readonly s2MatchesS1: boolean;
  readonly writer: CompetingWriterVerdict;
  readonly competingWriterDetected: boolean;
  readonly installedDuringRunSuppressesDetection: boolean;
  readonly compiledSource: Readonly<Record<string, any>> | null;
  readonly compiledVerificationEvaluated: boolean;
  readonly compiledVerificationSkipped: boolean;
  readonly compiledInputIdentity: string | null;
  readonly compiledBoundToInputs: boolean;
  readonly coverageLimitations: readonly string[];
  readonly installerIsMitigationNotProof: boolean;
  readonly IN_RUN_ATTESTATION: string;
  readonly law: string;
}

export const INSTALLER_MARKER: string;
export const BUNDLE_TARGETS: readonly { readonly source: string; readonly installedName: string }[];
export const NL: string;
export const REPO_ROOT: string;

export function verifyCompiledSource(): Promise<Readonly<Record<string, any>>>;
export function compareInstalledBundle(input: { readonly dshHomePath: string }): InstalledBundleComparison;
export function sampleInstallationDigest(input: { readonly dshHomePath: string }): string;
export function competingWriterVerdict(input: Readonly<Record<string, any>>): CompetingWriterVerdict;
export function inRunAttestation(input: Readonly<Record<string, any>>): Promise<InRunAttestation>;
export function digestOfMap(map: Readonly<Record<string, string>>): string;
export function treeDigests(root: string): Readonly<Record<string, string>>;
