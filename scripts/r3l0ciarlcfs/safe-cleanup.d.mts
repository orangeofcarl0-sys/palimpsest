/**
 * R3-L0C-I-A-R-L-C-F-S §4 — TYPES FOR THE FAIL-CLOSED CLEANUP.
 */

export interface LinkClassification {
  readonly path: string;
  readonly kind: string;
  readonly isLink: boolean | null;
  readonly canReferOutside?: boolean;
  readonly isUnclassifiable?: boolean;
  readonly reason?: string;
}

export interface CleanupStep {
  readonly step: number;
  readonly id: string;
  readonly observation: Record<string, unknown>;
}

export interface CleanupResult {
  readonly outcome: string;
  readonly blocked: boolean;
  readonly destructiveFallbackExecuted: boolean;
  readonly root: string | null;
  readonly preserved: boolean;
  readonly steps: readonly CleanupStep[];
  readonly linksRemoved: readonly string[];
  readonly linksRemaining: readonly string[];
  readonly unclassified?: readonly string[];
  readonly reason: string | null;
  readonly worktreeRemoved: boolean;
  readonly diagnosticLocation?: string | null;
  readonly gitWorktreeRemoveForceExecuted?: boolean;
  readonly recursiveRemoveExecuted?: boolean;
  readonly attemptedUnlinkFailed?: boolean;
  readonly safetyOrdering?: readonly string[];
  readonly law?: string;
}

export interface DisposableCheckout {
  readonly root: string;
  readonly head: string | null;
  readonly links: readonly { readonly name: string; readonly linkPath: string; readonly target: string; readonly unexpected?: boolean }[];
  readonly owned: boolean;
  readonly marker: string;
  readonly withinExpectedRoot: boolean;
}

export interface FilesystemAdapter {
  exists(path: string): boolean;
  lstat(path: string): any;
  readdir(path: string): readonly any[];
  unlinkLink(path: string): void;
  removeTree(path: string): void;
}

export const DISPOSABLE_MARKER: string;
export const EXPECTED_LINK_NAMES: readonly string[];
export const NL: string;

export function disposableRoot(): string;
export function realFilesystemAdapter(): FilesystemAdapter;
export function realGitAdapter(): { removeWorktreeForce(root: string): void };
export function classifyEntry(input: { path: string; fs: FilesystemAdapter }): LinkClassification;
export function destroyDisposableCheckout(input: { checkout: any; fs?: FilesystemAdapter; git?: { removeWorktreeForce(root: string): void }; expectedRoot?: string }): CleanupResult;
export function createDisposableCheckout(input?: { injectLink?: (input: { root: string; join: (...parts: string[]) => string }) => { name: string; linkPath: string; target: string } | null }): DisposableCheckout;
export function isDirectoryPath(path: string): boolean;
