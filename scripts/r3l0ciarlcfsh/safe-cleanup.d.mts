/** R3-L0C-I-A-R-L-C-F-S-H — TYPES FOR safe-cleanup.mjs. */

export const NL: string;

export const DISPOSABLE_MARKER: string;
export const MARKER_STAGE_IDENTITY: string;
export const EXPECTED_LINK_NAMES: readonly string[];
export const MAX_ENUMERATION_DEPTH: number;
export const REMOVAL_STATES: Readonly<Record<"REMOVED_CONFIRMED" | "STILL_PRESENT" | "STATE_UNKNOWN", string>>;
export const CLEANUP_THREAT_MODEL: Record<string, unknown>;
export function disposableRoot(): string;
export function realFilesystemAdapter(): Record<string, any>;
export function realGitAdapter(): Record<string, any>;
export function classifyRemovalState(input: { path: string; fs: any }): Record<string, any>;
export function verifyRootContainment(input: { root: string; expectedRoot: string; fs: any }): Record<string, any>;
export function verifyOwnership(input: Record<string, any>): Record<string, any>;
export function enumerateLinks(input: { root: string; fs: any; depth?: number }): Record<string, any>;
export function reinspectLink(input: { path: string; fs: any }): Record<string, any>;
export function destroyDisposableCheckout(input: Record<string, any>): Record<string, any>;
export function createDisposableCheckout(input?: Record<string, any>): Record<string, any>;
export function isDirectoryPath(path: string): boolean;
export function readFileSync(path: string, encoding?: string): any;
