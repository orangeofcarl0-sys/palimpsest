export interface RunHistoryEntry {
  at: string;
  from: string | null;
  to: string;
  reason: string | null;
  detail: unknown;
}

export interface ConditionRecord {
  preparedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  sessionId: string | null;
  exit: { code: number | null; signal: string | null } | null;
  usage: { totalTokens: number; inputTokens: number; outputTokens: number } | null;
  classification: string | null;
  evidence: string | null;
  [key: string]: unknown;
}

export interface RunRecord {
  schema: "c6r-run/v1";
  runId: string;
  createdAt: string;
  dir: string;
  codeFreeze: { commit: string; tree: string };
  scenario: { t1: string; t2: string; visibleSetDigest: string | null; source: string | null };
  state: string;
  history: RunHistoryEntry[];
  conditions: { P1: ConditionRecord; F1: ConditionRecord; P3: ConditionRecord; F2: ConditionRecord };
  authorization: unknown;
  effects: unknown;
  evaluation: unknown;
}

export declare const RUN_STATES: readonly string[];
export declare function validateRunId(runId: string): string;
export declare function runDirFor(root: string, runId: string): string;
export declare function createRun(input: {
  root: string;
  runId: string;
  codeFreeze: string;
  codeTree: string;
  t1: string;
  t2: string;
  visibleSetDigest?: string;
  scenarioSource?: string;
}): RunRecord;
export declare function writeRun(run: RunRecord): RunRecord;
export declare function loadRun(dir: string): RunRecord;
export declare function transition(
  run: RunRecord,
  to: string,
  detail?: { reason?: string; detail?: unknown },
): RunHistoryEntry;
export declare function setCondition(
  run: RunRecord,
  condition: "P1" | "F1" | "P3" | "F2",
  patch: Partial<ConditionRecord>,
): ConditionRecord;
export declare function setAuthorization(run: RunRecord, record: unknown): unknown;
export declare function setEffects(run: RunRecord, record: unknown): unknown;
export declare function setEvaluation(run: RunRecord, record: unknown): unknown;
export declare function allowedNext(run: RunRecord): string[];
