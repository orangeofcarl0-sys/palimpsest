/** R3-L0C-G1 — TYPES FOR scripts/r3l0c_g1/contract.mjs. */

export const BASELINE_COMMIT: string;
export const STAGE: string;
export const STAGE_BRANCH: string;
export const REPO_ROOT: string;
export const NL: string;

export const ARCHIVED_IDENTITIES: Readonly<Record<string, string>>;

export const PRODUCER_HIERARCHY: readonly Readonly<{
  fact: string;
  producer: string;
  producerLocation: string;
  canonical: boolean;
  durable: boolean;
  evidenceBoundary: string;
  g1Consumes: boolean;
  g1Owns: boolean;
  note?: string;
}>[];

export const PRODUCER_GAPS: readonly Readonly<{
  id: string;
  gap: string;
  sourceLocation: string;
  closedByG1: boolean | string;
  closure: string;
}>[];

export const OBSERVATION_EVENT_KINDS: readonly string[];
export const PROCESS_ROLES: readonly string[];
export const OBSERVATION_PROVES: readonly string[];
export const OBSERVATION_DOES_NOT_PROVE: readonly string[];
export const OBSERVATION_SCHEMA_VERSION: number;
export const OBSERVATION_FIELDS: readonly string[];
export const EVIDENCE_STATES: readonly string[];
export const EVIDENCE_STATE: Readonly<Record<string, string>>;
export const CORRELATION_CHAIN: readonly Readonly<{ step: string; owner: string }>[];
export const ARTIFACT_LOCATOR_RULES: readonly string[];
export const LOCATOR_EVIDENCE_LEVELS: Readonly<{ TESTED: string; REAL: string; realRequiresAuthenticEvidence: boolean }>;
export const FINAL_VERDICTS: readonly string[];
export const VERDICT_STATES: readonly string[];
export const LOCAL_EVIDENCE_CLASS: Readonly<{ PASS: string; scope: string; doesNotProve: string }>;
export const UNEARNED_VERDICTS: readonly string[];
export const PROHIBITIONS: readonly string[];
export const STUB_BOUNDARY: Readonly<{ permitted: string; forbidden: string; modelCallsMade: number }>;
export const CLOSURE_CONSEQUENCE: Readonly<Record<string, unknown>>;

export function contractSummary(): Readonly<Record<string, unknown>>;
