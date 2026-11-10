import { canonicalDigest } from "./canonical.js";

export interface TaskObligations {
  readonly schemaVersion: 1;
  readonly mayWrite: readonly string[];
  readonly mustChange: readonly string[];
  readonly mustExist: readonly string[];
  readonly mustPreserve: readonly string[];
}

export interface BoundTaskObligations {
  readonly rules: TaskObligations;
  readonly digest: string;
}

export type WorkRevisionCheckKind = "WRITE_SCOPE" | "MUST_CHANGE" | "MUST_EXIST" | "MUST_PRESERVE";

export interface WorkRevisionCheck {
  readonly kind: WorkRevisionCheckKind;
  readonly path: string;
  readonly passed: boolean;
  readonly basisBlob: string | null;
  readonly candidateBlob: string | null;
}

export interface WorkRevisionBinding {
  readonly taskId: string;
  readonly attemptId: string;
  readonly envelopeId: string;
  readonly basis: string;
  readonly writePaths: readonly string[];
  readonly obligations: BoundTaskObligations;
}

export function workRevisionBinding(envelope: {
  readonly task_id: string;
  readonly envelope_id: string;
  readonly base_commit: string;
  readonly write_paths: readonly string[];
  readonly obligations?: WorkRevisionBinding["obligations"] | undefined;
}, attemptId: string): WorkRevisionBinding | undefined {
  if (!envelope.obligations) return undefined;
  return { taskId: envelope.task_id, attemptId, envelopeId: envelope.envelope_id,
    basis: envelope.base_commit, writePaths: envelope.write_paths, obligations: envelope.obligations };
}

export interface WorkRevisionReceipt {
  readonly schemaVersion: 1;
  readonly phase: "PREVIEW" | "SETTLED";
  readonly receiptId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly envelopeId: string;
  readonly obligationsDigest: string;
  readonly basis: string;
  readonly candidate: string;
  readonly checks: readonly WorkRevisionCheck[];
}

export type WorkRevisionNext = "CORRECT_PLAN" | "FIX_CANDIDATE" | "REOBSERVE" | "WAIT" | "REQUEST_OPERATOR";

export interface WorkRevisionRefusal {
  readonly reason: string;
  readonly detail: string;
  readonly paths: readonly string[];
  readonly candidate: string | null;
  readonly nextAction: WorkRevisionNext;
}

export interface WorkRevisionApproval {
  readonly actor: string;
  readonly basis: string;
  readonly candidate: string;
  readonly receiptId: string;
}

export function parseWorkRevisionApproval(value: unknown): WorkRevisionApproval {
  const raw = object(value);
  if (Object.keys(raw).length !== 4 || typeof raw.actor !== "string" || raw.actor.trim() === "" ||
      !isFullCommit(raw.basis) || !isFullCommit(raw.candidate) ||
      typeof raw.receiptId !== "string" || !/^[0-9a-f]{64}$/u.test(raw.receiptId)) {
    throw revisionError("APPROVAL_SHA_MISMATCH", "Supply the full basis and candidate and the settled receipt ID.", "REQUEST_OPERATOR");
  }
  return { actor: raw.actor, basis: raw.basis, candidate: raw.candidate, receiptId: raw.receiptId };
}

export interface WorkRevisionReceiptQuery {
  readonly attemptId: string;
  readonly basis?: string | undefined;
  readonly candidate?: string | undefined;
  readonly path?: string | undefined;
}

export function projectRevisionReceipt(receipt: WorkRevisionReceipt | undefined, query: WorkRevisionReceiptQuery): WorkRevisionReceipt {
  if (!receipt) throw revisionError("REVISION_RECEIPT_UNAVAILABLE", "Wait for the Attempt to settle and read its receipt.", "WAIT");
  if ((query.basis !== undefined && query.basis !== receipt.basis) ||
      (query.candidate !== undefined && query.candidate !== receipt.candidate) ||
      (query.path !== undefined && (query.basis === undefined || query.candidate === undefined))) {
    throw revisionError("REVISION_RECEIPT_SHA_MISMATCH", "Use both full SHAs from the recorded receipt.", "REOBSERVE", [], receipt.candidate);
  }
  if (query.path === undefined) return receipt;
  const checks = receipt.checks.filter(check => check.path === query.path);
  if (checks.length === 0) throw revisionError("REVISION_RECEIPT_PATH_UNKNOWN", "Choose a file checked by this receipt.",
    "REOBSERVE", [query.path], receipt.candidate);
  return { ...receipt, checks };
}

export class WorkRevisionError extends Error {
  constructor(readonly refusal: WorkRevisionRefusal) {
    super(`${refusal.reason}: ${refusal.detail}`);
    this.name = "WorkRevisionError";
  }
}

export function revisionError(
  reason: string,
  detail: string,
  nextAction: WorkRevisionNext,
  paths: readonly string[] = [],
  candidate: string | null = null,
): WorkRevisionError {
  return new WorkRevisionError({ reason, detail, nextAction, paths, candidate });
}

export function isFullCommit(value: unknown): value is string {
  return typeof value === "string" && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value);
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected a Work revision object");
  }
  return value as Record<string, unknown>;
}

function paths(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some(path => typeof path !== "string" ||
      /[\\:\x00-\x1f]/u.test(path) ||
      path.split("/").some((part: string) => part === "" || part === "." || part === ".." ||
        /^\.git$/iu.test(part) || /^\.palimpsest$/iu.test(part)))) {
    throw new Error("obligation paths must be exact repository-relative file paths");
  }
  if (new Set(value).size !== value.length) throw new Error("duplicate obligation path");
  return Object.freeze([...value].sort() as string[]);
}

export function bindTaskObligations(value: unknown): BoundTaskObligations {
  const raw = object(value);
  if (raw.schemaVersion !== 1 ||
      Object.keys(raw).some(key => !["schemaVersion", "mayWrite", "mustChange", "mustExist", "mustPreserve"].includes(key))) {
    throw new Error("invalid TaskObligations v1");
  }
  const rules: TaskObligations = Object.freeze({
    schemaVersion: 1,
    mayWrite: paths(raw.mayWrite),
    mustChange: paths(raw.mustChange),
    mustExist: paths(raw.mustExist),
    mustPreserve: paths(raw.mustPreserve),
  });
  if (rules.mustChange.some(path => !rules.mayWrite.includes(path)) ||
      rules.mustPreserve.some(path => rules.mayWrite.includes(path))) {
    throw new Error("mustChange must be writable and mustPreserve must be read-only");
  }
  return Object.freeze({ rules, digest: canonicalDigest(rules) });
}

export function parseBoundTaskObligations(value: unknown): BoundTaskObligations {
  const raw = object(value);
  const bound = bindTaskObligations(raw.rules);
  if (Object.keys(raw).length !== 2 || raw.digest !== bound.digest) throw new Error("task obligations digest mismatch");
  return bound;
}

export function assertObligationScope(binding: BoundTaskObligations, requested: readonly string[]): void {
  const { mayWrite, mustChange } = binding.rules;
  const mismatches = [...requested.filter(path => !mayWrite.includes(path)), ...mustChange.filter(path => !requested.includes(path))];
  if (mismatches.length) {
    throw revisionError("TASK_OBLIGATION_SCOPE_MISMATCH", "Use only allowed paths and include every must-change path.",
      "CORRECT_PLAN", [...new Set(mismatches)].sort());
  }
}

export function revisionReceiptId(input: Pick<WorkRevisionReceipt,
  "attemptId" | "taskId" | "envelopeId" | "obligationsDigest" | "basis" | "candidate">): string {
  const { attemptId, taskId, envelopeId, obligationsDigest, basis, candidate } = input;
  return canonicalDigest({ kind: "work-revision-v1", attemptId, taskId, envelopeId, obligationsDigest, basis, candidate });
}

export function parseSettledRevisionReceipt(value: unknown): WorkRevisionReceipt {
  const raw = object(value);
  if (raw.schemaVersion !== 1 || raw.phase !== "SETTLED" || !isFullCommit(raw.basis) || !isFullCommit(raw.candidate) ||
      typeof raw.obligationsDigest !== "string" || !/^[0-9a-f]{64}$/u.test(raw.obligationsDigest) ||
      typeof raw.taskId !== "string" || typeof raw.attemptId !== "string" || typeof raw.envelopeId !== "string" ||
      !Array.isArray(raw.checks) || Object.keys(raw).length !== 10) throw new Error("invalid settled revision receipt");
  const receipt = raw as unknown as WorkRevisionReceipt;
  if (receipt.receiptId !== revisionReceiptId(receipt) ||
      receipt.checks.some(check => check === null || typeof check !== "object" || Object.keys(check).length !== 5 ||
        !["WRITE_SCOPE", "MUST_CHANGE", "MUST_EXIST", "MUST_PRESERVE"].includes(check.kind) ||
        paths([check.path]).length !== 1 || check.passed !== true ||
        (check.basisBlob !== null && !isFullCommit(check.basisBlob)) ||
        (check.candidateBlob !== null && !isFullCommit(check.candidateBlob)))) {
    throw new Error("invalid settled revision receipt checks or identity");
  }
  return receipt;
}
