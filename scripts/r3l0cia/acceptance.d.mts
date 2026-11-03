/**
 * R3-L0C-I-A §8 — TYPES FOR THE ACCEPTANCE SUITE.
 */

export const ACCEPTANCE_VERDICTS: { readonly PASS: string; readonly FAIL: string; readonly NOT_RUN: string };

export interface AcceptanceEntry {
  readonly id: string;
  readonly positiveControl: Readonly<Record<string, unknown>>;
  readonly mutant: Readonly<Record<string, unknown>>;
  readonly PASS: boolean;
}

export function acceptanceA01A03(input: { readonly plan: unknown; readonly closure: unknown }): Promise<{ readonly results: readonly AcceptanceEntry[] }>;
export function acceptanceA02(): Promise<AcceptanceEntry>;
export function acceptanceA05A06(input: { readonly expectation: unknown; readonly uptakeTranscriptPath: string | null }): Promise<{ readonly results: readonly AcceptanceEntry[] }>;
export function acceptanceA07(input: { readonly transcriptPath?: string | null }): Promise<AcceptanceEntry>;
export function acceptanceA08A09(input: Readonly<Record<string, unknown>>): Promise<{ readonly results: readonly AcceptanceEntry[] }>;
export function acceptanceA10(): Promise<AcceptanceEntry>;
export function acceptanceA11(input: { readonly slowWorkerObservation?: unknown }): Promise<AcceptanceEntry>;
export function acceptanceA12A13(input: Readonly<Record<string, unknown>>): Promise<{ readonly results: readonly AcceptanceEntry[] }>;
export function acceptanceA14(input: Readonly<Record<string, unknown>>): Promise<AcceptanceEntry>;
export function acceptanceA15A16(input: Readonly<Record<string, unknown>>): { readonly results: readonly AcceptanceEntry[] };
export const NL: string;
export const ACCEPTANCE_TESTS: readonly string[];
