/** R3-L0C-G1 — TYPES FOR scripts/r3l0c_g1/artifact-locator.mjs. */

export const DSH_SESSION_FILE: string;
export const WORKER_DIR_PREFIX: string;
export const SLUG_DELIMITER: string;
export const WORLDS_SEGMENT: string;
export const ATTEMPT_PREFIX: string;
export const ATTEMPT_HEX_LENGTH: number;
export const NL: string;
export const sep: string;

export const LOCATOR_OUTCOMES: Readonly<Record<string, string>>;

export function normalizeAttemptIdentity(value: string): Readonly<{ ok: boolean; bare: string | null; canonical: string | null; reason: string | null }>;
export function decodeCwdSlug(name: string): string | null;
export function attemptIdFromSlug(slug: string): string | null;
export function attemptIdFromArtifactPath(path: string): string | null;
export function isInsideRoot(input: { root: string; child: string }): boolean;
export function discoverScheduledArtifact(input: { dshHomePath?: string | null; expectedAttemptId?: string | null; maxDepth?: number }): Readonly<Record<string, any>>;
export function locatorEvidenceLevel(): Readonly<Record<string, any>>;
