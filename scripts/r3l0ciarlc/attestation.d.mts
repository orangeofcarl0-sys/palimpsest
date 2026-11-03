/**
 * R3-L0C-I-A-R-L-C §6 Gate D — TYPES FOR THE IN-RUN ATTESTATION.
 */

export interface BundleTargetComparison {
  readonly source: string;
  readonly installedName: string;
  readonly sourceExists: boolean;
  readonly installedExists: boolean;
  readonly sourceFileCount: number;
  readonly installedFileCount: number;
  readonly missingInInstall: readonly string[];
  readonly extraInInstall: readonly string[];
  readonly differing: readonly string[];
  readonly identical: boolean;
}

export interface InstalledBundleComparison {
  readonly kind: string;
  readonly nodeModules: string;
  readonly targets: readonly BundleTargetComparison[];
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
  readonly law: string;
}

export interface InRunAttestation {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly points: readonly { readonly id: string; readonly when: string; readonly compared: string }[];
  readonly s0Digest: string | null;
  readonly s1Digest: string;
  readonly s2Digest: string;
  readonly expectedBundle: InstalledBundleComparison;
  readonly s1MatchesExpectedBundle: boolean;
  readonly s2MatchesS1: boolean;
  readonly writer: CompetingWriterVerdict;
  readonly competingWriterDetected: boolean;
  readonly installedDuringRunSuppressesDetection: boolean;
  readonly compiledSource: Readonly<Record<string, unknown>> | null;
  readonly compiledVerificationEvaluated: boolean;
  readonly compiledVerificationSkipped: boolean;
  readonly coverageLimitations: readonly string[];
  readonly installerIsMitigationNotProof: boolean;
  readonly IN_RUN_ATTESTATION: string;
  readonly law: string;
}

export const INSTALLER_MARKER: string;
export const BUNDLE_TARGETS: readonly { readonly source: string; readonly installedName: string }[];
export const NL: string;

export function compareInstalledBundle(input: { readonly dshHomePath: string }): InstalledBundleComparison;
export function verifyCompiledSource(): Promise<Readonly<Record<string, unknown>>>;
export function sampleInstallationDigest(input: { readonly dshHomePath: string }): string;
export function competingWriterVerdict(input: {
  readonly s1Digest: string;
  readonly s2Digest: string;
  readonly s0Digest?: string | null;
  readonly installedDuringRun?: boolean;
}): CompetingWriterVerdict;
export function inRunAttestation(input: {
  readonly dshHomePath: string;
  readonly s1Digest: string;
  readonly s2Digest: string;
  readonly s0Digest?: string | null;
  readonly installedDuringRun?: boolean;
  readonly compiledVerification?: Readonly<Record<string, unknown>> | null;
}): Promise<InRunAttestation>;
export function digestOfMap(map: Readonly<Record<string, string>>): string;
export function treeDigests(root: string): Readonly<Record<string, string>>;
