/** R3-L0C-G1 — TYPES FOR scripts/r3l0c_g1/acceptance.mjs. */

export const NL: string;

export function writeCommittingStub(directory: string): string;
export function writeHangingStub(directory: string): string;
export function prepareProject(root: string): { repo: string; head: string };
export function runIntegratedValidation(input?: { runId?: string | null; sessionId?: string | null; journalRecords?: readonly any[] }): Promise<Readonly<Record<string, any>>>;
