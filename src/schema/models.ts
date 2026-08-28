/**
 * Frozen contracts for the Palimpsest V0 wire format.
 *
 * Ported from palimpsest-repo palimpsest/schema/models.py (phase0-2 unified
 * baseline, schema_version=1 / payload_version=1). Parse functions validate
 * unknown input fail-closed and return normalized plain JSON objects, the
 * same shape the Python side produces via model_dump(exclude_unset=False).
 *
 * Datetime fields keep their wire strings here; canonical digests convert
 * them via canonicalDatetime() (see computeRequestDigest / computeEventDigest
 * and the per-model digest helpers).
 */

import { canonicalDigest } from "./canonical.js";
import { canonicalDatetime, datetimeToEpochMicros } from "./datetime.js";

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const GIT_COMMIT_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const COMMAND_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/u;
const HOST_RE =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/u;
const WINDOWS_DEVICE_RE = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/iu;

export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractError";
  }
}

// ---------------------------------------------------------------------------
// Field validators (mirror the Python _validate_* helpers)
// ---------------------------------------------------------------------------

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field<T>(
  value: unknown,
  name: string,
  check: (inner: unknown) => T,
): T {
  try {
    return check(value);
  } catch (error) {
    if (error instanceof ContractError || error instanceof RangeError) {
      throw new ContractError(`${name}: ${error.message}`);
    }
    throw error;
  }
}

function expectString(value: unknown): string {
  if (typeof value !== "string") throw new ContractError("expected a string");
  return value;
}

function expectNullableString(value: unknown): string | null {
  return value === null ? null : expectString(value);
}

function expectInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ContractError("expected an integer");
  }
  return value;
}

function expectNullableInt(value: unknown): number | null {
  return value === null ? null : expectInt(value);
}

function expectBool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new ContractError("expected a boolean");
  return value;
}

function expectArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new ContractError("expected an array");
  return value;
}

function expectObject(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new ContractError("expected an object");
  return value;
}

function nonEmpty(value: string): string {
  if (value.length === 0) throw new ContractError("must not be empty");
  return value;
}

function nfc(value: string): string {
  return value.normalize("NFC");
}

function validateIdentifier(value: string): string {
  const normalized = nfc(value);
  if (!ID_RE.test(normalized)) {
    throw new ContractError(
      "must be a stable identifier of at most 128 ASCII characters",
    );
  }
  return normalized;
}

function validateDigest(value: string): string {
  if (!SHA256_RE.test(value)) {
    throw new ContractError("must be a lowercase 64-character SHA-256 digest");
  }
  return value;
}

function validateNullableDigest(value: string | null): string | null {
  return value === null ? null : validateDigest(value);
}

function validateCommit(value: string): string {
  if (!GIT_COMMIT_RE.test(value)) {
    throw new ContractError("must be a full lowercase Git object id");
  }
  return value;
}

function validateDatetime(value: string): string {
  datetimeToEpochMicros(value);
  return value;
}

function validateProjectPath(value: string): string {
  const normalized = nfc(value);
  if (normalized.length === 0 || normalized.includes("\x00") || normalized.includes("\\")) {
    throw new ContractError("must be a non-empty POSIX project-relative path");
  }
  if (normalized.startsWith("/")) {
    throw new ContractError("absolute and UNC paths are forbidden");
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new ContractError("empty, current, and parent path segments are forbidden");
  }
  for (const part of parts) {
    if (part.includes(":") || part.endsWith(" ") || part.endsWith(".")) {
      throw new ContractError("drive, alternate-stream, and ambiguous paths are forbidden");
    }
    const deviceStem = part.split(".")[0]!;
    if (WINDOWS_DEVICE_RE.test(deviceStem)) {
      throw new ContractError("Windows device paths are forbidden");
    }
  }
  return normalized;
}

function unique<T>(values: readonly T[]): T[] {
  if (new Set(values).size !== values.length) {
    throw new ContractError("duplicate entries are forbidden");
  }
  return [...values];
}

function validateTimestamp(value: string): string {
  return validateDatetime(value);
}

// ---------------------------------------------------------------------------
// Nested contract models
// ---------------------------------------------------------------------------

export interface Requirement {
  requirement_id: string;
  statement: string;
  priority: "critical" | "high" | "normal" | "low";
  acceptance_refs: string[];
}

export function parseRequirement(value: unknown): Requirement {
  const raw = expectObject(value);
  requireFields(raw, "requirement_id", "statement", "priority", "acceptance_refs");
  const priority = field(raw.priority, "priority", expectString);
  if (!["critical", "high", "normal", "low"].includes(priority)) {
    throw new ContractError("priority: invalid literal");
  }
  return Object.freeze({
    requirement_id: field(raw.requirement_id, "requirement_id", (inner) =>
      validateIdentifier(expectString(inner)),
    ),
    statement: field(raw.statement, "statement", (inner) => nonEmpty(expectString(inner))),
    priority: priority as Requirement["priority"],
    acceptance_refs: field(
      raw.acceptance_refs,
      "acceptance_refs",
      (inner) => unique(expectArray(inner).map(expectString)),
    ),
  });
}

export interface Decision {
  decision_id: string;
  statement: string;
  rationale: string;
  evidence_ids: string[];
  supersedes: string | null;
}

export function parseDecision(value: unknown): Decision {
  const raw = expectObject(value);
  requireFields(raw, "decision_id", "statement", "rationale", "evidence_ids", "supersedes");
  return Object.freeze({
    decision_id: field(raw.decision_id, "decision_id", (inner) =>
      validateIdentifier(expectString(inner)),
    ),
    statement: field(raw.statement, "statement", (inner) => nonEmpty(expectString(inner))),
    rationale: field(raw.rationale, "rationale", (inner) => nonEmpty(expectString(inner))),
    evidence_ids: field(raw.evidence_ids, "evidence_ids", (inner) =>
      unique(expectArray(inner).map(expectString)),
    ),
    supersedes: field(raw.supersedes, "supersedes", (inner) => {
      if (inner === null) return null;
      return validateIdentifier(expectString(inner));
    }),
  });
}

export const TASK_ROLES = [
  "implementer",
  "tester",
  "verifier",
  "scout",
  "analyst",
] as const;

export type TaskRole = (typeof TASK_ROLES)[number];

export interface TaskSpec {
  task_id: string;
  objective: string;
  depends_on: string[];
  write_paths: string[];
  required_artifacts: string[];
  /** Optional role for slot-aware concurrency (P3); absent means "implementer". */
  role?: TaskRole | undefined;
  /** Optional skill/plugin hints the claiming worker should load (E2); absent means no hint. */
  suggested_skills?: string[] | undefined;
}

export function parseTaskSpec(value: unknown): TaskSpec {
  const raw = expectObject(value);
  requireFields(raw, "task_id", "objective", "depends_on", "write_paths", "required_artifacts");
  const spec: TaskSpec = {
    task_id: field(raw.task_id, "task_id", (inner) => validateIdentifier(expectString(inner))),
    objective: field(raw.objective, "objective", (inner) => nonEmpty(expectString(inner))),
    depends_on: field(raw.depends_on, "depends_on", (inner) =>
      unique(expectArray(inner).map(expectString)),
    ),
    write_paths: field(raw.write_paths, "write_paths", (inner) =>
      unique(expectArray(inner).map((item) => validateProjectPath(expectString(item)))),
    ),
    required_artifacts: field(raw.required_artifacts, "required_artifacts", (inner) =>
      unique(expectArray(inner).map((item) => validateProjectPath(expectString(item)))),
    ),
  };
  if (raw.role !== undefined && raw.role !== null) {
    const role = field(raw.role, "role", expectString);
    if (!TASK_ROLES.includes(role as TaskRole)) {
      throw new ContractError("role: invalid literal");
    }
    spec.role = role as TaskRole;
  }
  if (raw.suggested_skills !== undefined && raw.suggested_skills !== null) {
    spec.suggested_skills = field(raw.suggested_skills, "suggested_skills", (inner) =>
      unique(expectArray(inner).map((item) => nonEmpty(expectString(item)))),
    );
  }
  return Object.freeze(spec);
}

export interface AllowedCommand {
  executable: string;
  argv_prefix: string[];
}

export function parseAllowedCommand(value: unknown): AllowedCommand {
  const raw = expectObject(value);
  requireFields(raw, "executable", "argv_prefix");
  const executable = field(raw.executable, "executable", expectString);
  if (!COMMAND_RE.test(executable)) {
    throw new ContractError("executable: must be an executable basename, not a path");
  }
  const argvPrefix = field(raw.argv_prefix, "argv_prefix", (inner) =>
    expectArray(inner).map(expectString),
  );
  if (argvPrefix.some((entry) => entry.length === 0 || entry.includes("\x00"))) {
    throw new ContractError("argv_prefix: entries must be non-empty and NUL-free");
  }
  return Object.freeze({ executable, argv_prefix: argvPrefix });
}

export interface NetworkEndpoint {
  host: string;
  port: number | null;
}

export function parseNetworkEndpoint(value: unknown): NetworkEndpoint {
  const raw = expectObject(value);
  requireFields(raw, "host", "port");
  const host = field(raw.host, "host", expectString).toLowerCase();
  if (host === "localhost" || host.length > 253 || !HOST_RE.test(host)) {
    throw new ContractError("host: must be an exact non-local DNS host without wildcards");
  }
  const port = field(raw.port, "port", expectNullableInt);
  if (port !== null && (port < 1 || port > 65535)) {
    throw new ContractError("port: must be between 1 and 65535");
  }
  return Object.freeze({ host, port });
}

export interface RuntimeMetadata {
  runner: string;
  runner_version: string;
  argv: string[];
  exit_code: number | null;
  duration_ms: number;
  environment_digest: string;
  stdout_artifact: string | null;
  stderr_artifact: string | null;
}

export function parseRuntimeMetadata(value: unknown): RuntimeMetadata {
  const raw = expectObject(value);
  requireFields(
    raw,
    "runner",
    "runner_version",
    "argv",
    "exit_code",
    "duration_ms",
    "environment_digest",
    "stdout_artifact",
    "stderr_artifact",
  );
  const durationMs = field(raw.duration_ms, "duration_ms", expectInt);
  if (durationMs < 0) throw new ContractError("duration_ms: must be >= 0");
  const argv = field(raw.argv, "argv", (inner) => expectArray(inner).map(expectString));
  if (argv.length === 0 || argv.some((entry) => entry.length === 0 || entry.includes("\x00"))) {
    throw new ContractError("argv: must contain non-empty, NUL-free entries");
  }
  return Object.freeze({
    runner: field(raw.runner, "runner", (inner) => nonEmpty(expectString(inner))),
    runner_version: field(raw.runner_version, "runner_version", (inner) =>
      nonEmpty(expectString(inner)),
    ),
    argv,
    exit_code: field(raw.exit_code, "exit_code", expectNullableInt),
    duration_ms: durationMs,
    environment_digest: field(raw.environment_digest, "environment_digest", (inner) =>
      validateDigest(expectString(inner)),
    ),
    stdout_artifact: field(raw.stdout_artifact, "stdout_artifact", (inner) => {
      if (inner === null) return null;
      return validateProjectPath(expectString(inner));
    }),
    stderr_artifact: field(raw.stderr_artifact, "stderr_artifact", (inner) => {
      if (inner === null) return null;
      return validateProjectPath(expectString(inner));
    }),
  });
}

// ---------------------------------------------------------------------------
// The five core schemas
// ---------------------------------------------------------------------------

export interface ProjectIr {
  schema_version: 1;
  project_id: string;
  revision: number;
  digest: string;
  parent_revision: number | null;
  parent_digest: string | null;
  goal: string;
  requirements: Requirement[];
  decisions: Decision[];
  tasks: TaskSpec[];
  head_commit: string;
  committed_at: string;
}

/** Canonical digest input: every field except `digest`, datetimes in micro form. */
export function projectIrDigestOf(value: Omit<ProjectIr, "digest">): string {
  return canonicalDigest({ ...value, committed_at: canonicalDatetime(value.committed_at) });
}

export function parseProjectIr(value: unknown): ProjectIr {
  const raw = expectObject(value);
  requireFields(
    raw,
    "schema_version",
    "project_id",
    "revision",
    "digest",
    "parent_revision",
    "parent_digest",
    "goal",
    "requirements",
    "decisions",
    "tasks",
    "head_commit",
    "committed_at",
  );
  if (raw.schema_version !== 1) throw new ContractError("schema_version must be 1");
  const revision = field(raw.revision, "revision", expectInt);
  if (revision < 0) throw new ContractError("revision must be >= 0");
  const parentRevision = field(raw.parent_revision, "parent_revision", expectNullableInt);
  if (parentRevision !== null && parentRevision < 0) {
    throw new ContractError("parent_revision must be >= 0");
  }
  const data: Omit<ProjectIr, "digest"> = {
    schema_version: 1,
    project_id: field(raw.project_id, "project_id", (inner) =>
      validateIdentifier(expectString(inner)),
    ),
    revision,
    parent_revision: parentRevision,
    parent_digest: field(raw.parent_digest, "parent_digest", validateNullableDigestString),
    goal: field(raw.goal, "goal", (inner) => nonEmpty(expectString(inner))),
    requirements: field(raw.requirements, "requirements", (inner) =>
      expectArray(inner).map(parseRequirement),
    ),
    decisions: field(raw.decisions, "decisions", (inner) =>
      expectArray(inner).map(parseDecision),
    ),
    tasks: field(raw.tasks, "tasks", (inner) => expectArray(inner).map(parseTaskSpec)),
    head_commit: field(raw.head_commit, "head_commit", (inner) =>
      validateCommit(expectString(inner)),
    ),
    committed_at: field(raw.committed_at, "committed_at", (inner) =>
      validateTimestamp(expectString(inner)),
    ),
  };
  if (revision === 0) {
    if (data.parent_revision !== null || data.parent_digest !== null) {
      throw new ContractError("revision 0 must omit both parent fields");
    }
  } else if (data.parent_revision === null || data.parent_digest === null) {
    throw new ContractError("non-root revisions require both parent fields");
  }
  if (data.parent_revision !== null && data.parent_revision >= revision) {
    throw new ContractError("parent_revision must be lower than revision");
  }
  unique(data.requirements.map((item) => item.requirement_id));
  unique(data.decisions.map((item) => item.decision_id));
  unique(data.tasks.map((item) => item.task_id));
  const expected = projectIrDigestOf(data);
  const digest = field(raw.digest, "digest", (inner) => validateDigest(expectString(inner)));
  if (digest !== expected) {
    throw new ContractError(`digest mismatch: expected ${expected}`);
  }
  return Object.freeze({ ...data, digest });
}

function validateNullableDigestString(value: unknown): string | null {
  if (value === null) return null;
  return validateDigest(expectString(value));
}

export interface TaskEnvelope {
  schema_version: 1;
  project_id: string;
  task_id: string;
  envelope_id: string;
  project_revision: number;
  project_digest: string;
  base_commit: string;
  objective: string;
  read_paths: string[];
  write_paths: string[];
  required_artifacts: string[];
  allowed_commands: AllowedCommand[];
  network_policy: "deny" | "allow-listed";
  network_allowlist: NetworkEndpoint[];
  timeout_s: number;
  lease_s: number;
  attempt_limit: number;
  candidate_limit: 1 | 2 | 4;
  idempotency_key: string;
  /** Skill/plugin hints for the claiming worker (E2); absent means no hint. */
  suggested_skills?: string[] | undefined;
}

export function parseTaskEnvelope(value: unknown): TaskEnvelope {
  const raw = expectObject(value);
  requireFields(
    raw,
    "schema_version",
    "project_id",
    "task_id",
    "envelope_id",
    "project_revision",
    "project_digest",
    "base_commit",
    "objective",
    "read_paths",
    "write_paths",
    "required_artifacts",
    "allowed_commands",
    "network_policy",
    "network_allowlist",
    "timeout_s",
    "lease_s",
    "attempt_limit",
    "candidate_limit",
    "idempotency_key",
  );
  if (raw.schema_version !== 1) throw new ContractError("schema_version must be 1");
  const networkPolicy = field(raw.network_policy, "network_policy", expectString);
  if (networkPolicy !== "deny" && networkPolicy !== "allow-listed") {
    throw new ContractError("network_policy: invalid literal");
  }
  const positive = (name: string): number => {
    const inner = field(raw[name], name, expectInt);
    if (inner <= 0) throw new ContractError(`${name} must be > 0`);
    return inner;
  };
  const candidateLimit = field(raw.candidate_limit, "candidate_limit", expectInt);
  if (candidateLimit !== 1 && candidateLimit !== 2 && candidateLimit !== 4) {
    throw new ContractError("candidate_limit must be 1, 2 or 4");
  }
  const envelope: TaskEnvelope = {
    schema_version: 1,
    project_id: field(raw.project_id, "project_id", (inner) =>
      validateIdentifier(expectString(inner)),
    ),
    task_id: field(raw.task_id, "task_id", (inner) => validateIdentifier(expectString(inner))),
    envelope_id: field(raw.envelope_id, "envelope_id", (inner) =>
      validateIdentifier(expectString(inner)),
    ),
    project_revision: (() => {
      const inner = field(raw.project_revision, "project_revision", expectInt);
      if (inner < 0) throw new ContractError("project_revision must be >= 0");
      return inner;
    })(),
    project_digest: field(raw.project_digest, "project_digest", (inner) =>
      validateDigest(expectString(inner)),
    ),
    base_commit: field(raw.base_commit, "base_commit", (inner) =>
      validateCommit(expectString(inner)),
    ),
    objective: field(raw.objective, "objective", (inner) => nonEmpty(expectString(inner))),
    read_paths: field(raw.read_paths, "read_paths", parsePathList),
    write_paths: field(raw.write_paths, "write_paths", parsePathList),
    required_artifacts: field(raw.required_artifacts, "required_artifacts", parsePathList),
    allowed_commands: field(raw.allowed_commands, "allowed_commands", (inner) =>
      expectArray(inner).map(parseAllowedCommand),
    ),
    network_policy: networkPolicy,
    network_allowlist: field(raw.network_allowlist, "network_allowlist", (inner) =>
      expectArray(inner).map(parseNetworkEndpoint),
    ),
    timeout_s: positive("timeout_s"),
    lease_s: positive("lease_s"),
    attempt_limit: positive("attempt_limit"),
    candidate_limit: candidateLimit as 1 | 2 | 4,
    idempotency_key: field(raw.idempotency_key, "idempotency_key", (inner) =>
      validateDigest(expectString(inner)),
    ),
  };
  if (envelope.lease_s > envelope.timeout_s) {
    throw new ContractError("lease_s must not exceed timeout_s");
  }
  if (envelope.candidate_limit > envelope.attempt_limit) {
    throw new ContractError("candidate_limit must not exceed attempt_limit");
  }
  if (envelope.network_policy === "deny" && envelope.network_allowlist.length > 0) {
    throw new ContractError("deny policy requires an empty network_allowlist");
  }
  if (envelope.network_policy === "allow-listed" && envelope.network_allowlist.length === 0) {
    throw new ContractError("allow-listed policy requires at least one endpoint");
  }
  unique(envelope.allowed_commands.map((command) => JSON.stringify(command)));
  unique(envelope.network_allowlist.map((endpoint) => JSON.stringify(endpoint)));
  if (raw.suggested_skills !== undefined && raw.suggested_skills !== null) {
    envelope.suggested_skills = field(raw.suggested_skills, "suggested_skills", (inner) =>
      unique(expectArray(inner).map((item) => nonEmpty(expectString(item)))),
    );
  }
  return Object.freeze(envelope);
}

function parsePathList(value: unknown): string[] {
  return unique(expectArray(value).map((item) => validateProjectPath(expectString(item))));
}

export interface AttemptReport {
  schema_version: 1;
  project_id: string;
  attempt_id: string;
  task_id: string;
  envelope_id: string;
  input_project_revision: number;
  input_project_digest: string;
  base_commit: string;
  worktree_id: string;
  result_commit: string | null;
  worker_status: "completed" | "failed" | "cancelled" | "expired";
  summary: string;
  changed_files: string[];
  produced_artifacts: string[];
  started_at: string;
  finished_at: string;
  runtime_metadata: RuntimeMetadata;
}

/** Canonical digest of an AttemptReport payload object (datetimes → micro). */
export function attemptReportDigestOf(report: AttemptReport): string {
  return canonicalDigest({
    ...report,
    started_at: canonicalDatetime(report.started_at),
    finished_at: canonicalDatetime(report.finished_at),
  });
}

export function parseAttemptReport(value: unknown): AttemptReport {
  const raw = expectObject(value);
  requireFields(
    raw,
    "schema_version",
    "project_id",
    "attempt_id",
    "task_id",
    "envelope_id",
    "input_project_revision",
    "input_project_digest",
    "base_commit",
    "worktree_id",
    "result_commit",
    "worker_status",
    "summary",
    "changed_files",
    "produced_artifacts",
    "started_at",
    "finished_at",
    "runtime_metadata",
  );
  if (raw.schema_version !== 1) throw new ContractError("schema_version must be 1");
  const workerStatus = field(raw.worker_status, "worker_status", expectString);
  if (!["completed", "failed", "cancelled", "expired"].includes(workerStatus)) {
    throw new ContractError("worker_status: invalid literal");
  }
  const revision = field(raw.input_project_revision, "input_project_revision", expectInt);
  if (revision < 0) throw new ContractError("input_project_revision must be >= 0");
  const report: AttemptReport = {
    schema_version: 1,
    project_id: field(raw.project_id, "project_id", (inner) =>
      validateIdentifier(expectString(inner)),
    ),
    attempt_id: field(raw.attempt_id, "attempt_id", (inner) =>
      validateIdentifier(expectString(inner)),
    ),
    task_id: field(raw.task_id, "task_id", (inner) => validateIdentifier(expectString(inner))),
    envelope_id: field(raw.envelope_id, "envelope_id", (inner) =>
      validateIdentifier(expectString(inner)),
    ),
    input_project_revision: revision,
    input_project_digest: field(raw.input_project_digest, "input_project_digest", (inner) =>
      validateDigest(expectString(inner)),
    ),
    base_commit: field(raw.base_commit, "base_commit", (inner) =>
      validateCommit(expectString(inner)),
    ),
    worktree_id: field(raw.worktree_id, "worktree_id", (inner) =>
      validateIdentifier(expectString(inner)),
    ),
    result_commit: field(raw.result_commit, "result_commit", (inner) => {
      if (inner === null) return null;
      return validateCommit(expectString(inner));
    }),
    worker_status: workerStatus as AttemptReport["worker_status"],
    summary: field(raw.summary, "summary", expectString),
    changed_files: field(raw.changed_files, "changed_files", parsePathList),
    produced_artifacts: field(raw.produced_artifacts, "produced_artifacts", parsePathList),
    started_at: field(raw.started_at, "started_at", (inner) =>
      validateTimestamp(expectString(inner)),
    ),
    finished_at: field(raw.finished_at, "finished_at", (inner) =>
      validateTimestamp(expectString(inner)),
    ),
    runtime_metadata: parseRuntimeMetadata(raw.runtime_metadata),
  };
  if (datetimeToEpochMicros(report.finished_at) < datetimeToEpochMicros(report.started_at)) {
    throw new ContractError("finished_at must not precede started_at");
  }
  return Object.freeze(report);
}

export const EVIDENCE_PREDICATES = [
  "process_exit_zero",
  "tests_pass",
  "tests_fail",
  "lint_pass",
  "expected_files_exist",
  "write_scope_valid",
] as const;

export type EvidencePredicate = (typeof EVIDENCE_PREDICATES)[number];

export interface EvidenceAtom {
  schema_version: 1;
  project_id: string;
  evidence_id: string;
  subject_type: "attempt" | "commit" | "task";
  subject_id: string;
  subject_digest: string;
  predicate: EvidencePredicate;
  value: Record<string, Json>;
  project_revision: number;
  input_fingerprint: string;
  command: string[] | null;
  exit_code: number | null;
  environment_digest: string;
  dependency_digest: string | null;
  observed_artifacts: string[];
  producer: string;
  created_at: string;
  status: "active" | "stale";
}

export function parseEvidenceAtom(value: unknown): EvidenceAtom {
  const raw = expectObject(value);
  requireFields(
    raw,
    "schema_version",
    "project_id",
    "evidence_id",
    "subject_type",
    "subject_id",
    "subject_digest",
    "predicate",
    "value",
    "project_revision",
    "input_fingerprint",
    "command",
    "exit_code",
    "environment_digest",
    "dependency_digest",
    "observed_artifacts",
    "producer",
    "created_at",
    "status",
  );
  if (raw.schema_version !== 1) throw new ContractError("schema_version must be 1");
  const subjectType = field(raw.subject_type, "subject_type", expectString);
  if (!["attempt", "commit", "task"].includes(subjectType)) {
    throw new ContractError("subject_type: invalid literal");
  }
  const predicate = field(raw.predicate, "predicate", expectString);
  if (!EVIDENCE_PREDICATES.includes(predicate as EvidencePredicate)) {
    throw new ContractError("predicate: invalid literal");
  }
  const status = field(raw.status, "status", expectString);
  if (status !== "active" && status !== "stale") {
    throw new ContractError("status: invalid literal");
  }
  const revision = field(raw.project_revision, "project_revision", expectInt);
  if (revision < 0) throw new ContractError("project_revision must be >= 0");
  const valueObject = field(raw.value, "value", expectObject);
  canonicalDigest(valueObject);
  const command = field(raw.command, "command", (inner) => {
    if (inner === null) return null;
    return expectArray(inner).map(expectString);
  });
  const exitCode = field(raw.exit_code, "exit_code", expectNullableInt);
  const commandPredicates: readonly EvidencePredicate[] = [
    "process_exit_zero",
    "tests_pass",
    "tests_fail",
    "lint_pass",
  ];
  if (commandPredicates.includes(predicate as EvidencePredicate)) {
    if (command === null || command.length === 0 || exitCode === null) {
      throw new ContractError("process evidence requires command and exit_code");
    }
  }
  if (
    (predicate === "process_exit_zero" || predicate === "tests_pass" || predicate === "lint_pass") &&
    exitCode !== 0
  ) {
    throw new ContractError("passing process evidence requires exit_code 0");
  }
  if (predicate === "tests_fail" && exitCode === 0) {
    throw new ContractError("tests_fail evidence requires a nonzero exit_code");
  }
  return Object.freeze({
    schema_version: 1,
    project_id: field(raw.project_id, "project_id", (inner) =>
      validateIdentifier(expectString(inner)),
    ),
    evidence_id: field(raw.evidence_id, "evidence_id", (inner) =>
      validateIdentifier(expectString(inner)),
    ),
    subject_type: subjectType as EvidenceAtom["subject_type"],
    subject_id: field(raw.subject_id, "subject_id", (inner) =>
      validateIdentifier(expectString(inner)),
    ),
    subject_digest: field(raw.subject_digest, "subject_digest", (inner) =>
      validateDigest(expectString(inner)),
    ),
    predicate: predicate as EvidencePredicate,
    value: valueObject as Record<string, Json>,
    project_revision: revision,
    input_fingerprint: field(raw.input_fingerprint, "input_fingerprint", (inner) =>
      validateDigest(expectString(inner)),
    ),
    command,
    exit_code: exitCode,
    environment_digest: field(raw.environment_digest, "environment_digest", (inner) =>
      validateDigest(expectString(inner)),
    ),
    dependency_digest: field(raw.dependency_digest, "dependency_digest", (inner) =>
      validateNullableDigestString(inner),
    ),
    observed_artifacts: field(raw.observed_artifacts, "observed_artifacts", parsePathList),
    producer: field(raw.producer, "producer", (inner) => nonEmpty(expectString(inner))),
    created_at: field(raw.created_at, "created_at", (inner) =>
      validateTimestamp(expectString(inner)),
    ),
    status: status as EvidenceAtom["status"],
  });
}

// ---------------------------------------------------------------------------
// Event types and payload normalization
// ---------------------------------------------------------------------------

export const EVENT_TYPES = [
  "PROJECT_CREATED",
  "PROJECT_REVISED",
  "TASK_CREATED",
  "TASK_BLOCKED",
  "TASK_READY",
  "TASK_STARTED",
  "TASK_VERIFYING",
  "TASK_SATISFIED",
  "TASK_FAILED",
  "TASK_STALE",
  "ATTEMPT_CREATED",
  "ATTEMPT_LEASED",
  "ATTEMPT_STARTED",
  "ATTEMPT_COMPLETED",
  "ATTEMPT_FAILED",
  "ATTEMPT_EXPIRED",
  "ATTEMPT_CANCELLED",
  "ATTEMPT_LATE_RESULT",
  "EVIDENCE_ADDED",
  "EVIDENCE_STALE",
  "SCHEDULER_PAUSED",
  "SCHEDULER_RESUMED",
  "MANUAL_APPROVAL_RECORDED",
  "PROMOTION_PREPARED",
  "PROMOTION_GIT_STARTED",
  "PROMOTION_GIT_COMPLETED",
  "PROMOTION_COMMITTED",
  "PROMOTION_FAILED",
  "JUDGE_DECLARED",
  "CANDIDATE_SELECTED",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

const TASK_EVENT_TARGET: Partial<Record<EventType, string>> = {
  TASK_BLOCKED: "BLOCKED",
  TASK_READY: "READY",
  TASK_STARTED: "ACTIVE",
  TASK_VERIFYING: "VERIFYING",
  TASK_SATISFIED: "SATISFIED",
  TASK_FAILED: "FAILED",
  TASK_STALE: "STALE",
};

const ATTEMPT_EVENT_TARGET: Partial<Record<EventType, string>> = {
  ATTEMPT_LEASED: "LEASED",
  ATTEMPT_STARTED: "RUNNING",
  ATTEMPT_COMPLETED: "COMPLETED",
  ATTEMPT_FAILED: "FAILED",
  ATTEMPT_EXPIRED: "EXPIRED",
  ATTEMPT_CANCELLED: "CANCELLED",
  ATTEMPT_LATE_RESULT: "STALE",
};

const TASK_STATES = [
  "BLOCKED",
  "READY",
  "ACTIVE",
  "VERIFYING",
  "SATISFIED",
  "FAILED",
  "STALE",
] as const;
const ATTEMPT_STATES = [
  "CREATED",
  "LEASED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
  "STALE",
] as const;

const REQUIRED_WORKER_STATUS: Partial<Record<EventType, string>> = {
  ATTEMPT_COMPLETED: "completed",
  ATTEMPT_FAILED: "failed",
  ATTEMPT_EXPIRED: "expired",
  ATTEMPT_CANCELLED: "cancelled",
};

function requireFields(raw: Record<string, unknown>, ...names: string[]): void {
  for (const name of names) {
    if (!Object.hasOwn(raw, name)) {
      throw new ContractError(`${name}: field is required`);
    }
  }
}

function optionalPositiveInt(value: unknown, name: string): number | null {
  const inner = expectNullableInt(value);
  if (inner !== null && inner <= 0) throw new ContractError(`${name} must be > 0`);
  return inner;
}

/**
 * Validate and normalize one event payload for its event type. Mirrors
 * _normalize_event_payload: returns a fresh plain object with every declared
 * field present (explicit nulls preserved), enforcing the target-state and
 * worker-status consistency rules.
 */
export function normalizeEventPayload(
  eventType: EventType,
  payload: unknown,
): Record<string, unknown> {
  const raw = expectObject(payload);
  switch (eventType) {
    case "PROJECT_CREATED":
    case "PROJECT_REVISED": {
      requireFields(raw, "project_ir");
      const result: Record<string, unknown> = {
        project_ir: parseProjectIr(raw.project_ir),
      };
      if (eventType === "PROJECT_REVISED") {
        requireFields(raw, "promotion_id");
        result.promotion_id = field(raw.promotion_id, "promotion_id", (inner) =>
          validateIdentifier(expectString(inner)),
        );
      }
      return result;
    }
    case "TASK_CREATED": {
      requireFields(raw, "task_envelope", "initial_state", "policy_id", "policy_digest");
      const initialState = field(raw.initial_state, "initial_state", expectString);
      if (initialState !== "BLOCKED" && initialState !== "READY") {
        throw new ContractError("initial_state: invalid literal");
      }
      return {
        task_envelope: parseTaskEnvelope(raw.task_envelope),
        initial_state: initialState,
        policy_id: field(raw.policy_id, "policy_id", (inner) =>
          validateIdentifier(expectString(inner)),
        ),
        policy_digest: field(raw.policy_digest, "policy_digest", (inner) =>
          validateDigest(expectString(inner)),
        ),
      };
    }
    case "TASK_BLOCKED": {
      requireFields(raw, "previous_state", "new_state", "reason");
      return parseTaskTransition(raw);
    }
    case "TASK_READY": {
      requireFields(raw, "previous_state", "new_state", "reason", "batch_activation_event_id");
      return {
        ...parseTaskTransition(raw),
        batch_activation_event_id: optionalPositiveInt(
          raw.batch_activation_event_id,
          "batch_activation_event_id",
        ),
      };
    }
    case "TASK_STARTED": {
      requireFields(
        raw,
        "previous_state",
        "new_state",
        "reason",
        "planned_candidate_count",
        "first_attempt_no",
      );
      const planned = field(raw.planned_candidate_count, "planned_candidate_count", expectInt);
      if (planned < 1 || planned > 4) {
        throw new ContractError("planned_candidate_count must be between 1 and 2");
      }
      const first = field(raw.first_attempt_no, "first_attempt_no", expectInt);
      if (first <= 0) throw new ContractError("first_attempt_no must be > 0");
      return {
        ...parseTaskTransition(raw),
        planned_candidate_count: planned,
        first_attempt_no: first,
      };
    }
    case "TASK_VERIFYING":
    case "TASK_SATISFIED":
    case "TASK_FAILED": {
      requireFields(raw, "previous_state", "new_state", "reason", "batch_activation_event_id");
      const batch = field(raw.batch_activation_event_id, "batch_activation_event_id", expectInt);
      if (batch <= 0) throw new ContractError("batch_activation_event_id must be > 0");
      return { ...parseTaskTransition(raw), batch_activation_event_id: batch };
    }
    case "TASK_STALE": {
      requireFields(raw, "previous_state", "new_state", "reason", "batch_activation_event_id");
      return {
        ...parseTaskTransition(raw),
        batch_activation_event_id: optionalPositiveInt(
          raw.batch_activation_event_id,
          "batch_activation_event_id",
        ),
      };
    }
    case "ATTEMPT_CREATED": {
      requireFields(raw, "task_id", "envelope_id", "attempt_no");
      const attemptNo = field(raw.attempt_no, "attempt_no", expectInt);
      if (attemptNo <= 0) throw new ContractError("attempt_no must be > 0");
      return {
        task_id: field(raw.task_id, "task_id", (inner) =>
          validateIdentifier(expectString(inner)),
        ),
        envelope_id: field(raw.envelope_id, "envelope_id", (inner) =>
          validateIdentifier(expectString(inner)),
        ),
        attempt_no: attemptNo,
      };
    }
    case "ATTEMPT_LEASED":
    case "ATTEMPT_STARTED": {
      requireFields(raw, "previous_state", "new_state", "lease_generation", "reason");
      return parseAttemptTransition(raw);
    }
    case "ATTEMPT_COMPLETED":
    case "ATTEMPT_FAILED":
    case "ATTEMPT_LATE_RESULT": {
      requireFields(raw, "previous_state", "new_state", "lease_generation", "reason", "attempt_report");
      return {
        ...parseAttemptTransition(raw),
        attempt_report: parseAttemptReport(raw.attempt_report),
      };
    }
    case "ATTEMPT_EXPIRED":
    case "ATTEMPT_CANCELLED": {
      requireFields(raw, "previous_state", "new_state", "lease_generation", "reason", "attempt_report");
      return {
        ...parseAttemptTransition(raw),
        attempt_report:
          raw.attempt_report === null ? null : parseAttemptReport(raw.attempt_report),
      };
    }
    case "EVIDENCE_ADDED": {
      requireFields(raw, "evidence");
      return { evidence: parseEvidenceAtom(raw.evidence) };
    }
    case "EVIDENCE_STALE": {
      requireFields(raw, "evidence_id", "reason");
      return {
        evidence_id: field(raw.evidence_id, "evidence_id", (inner) =>
          validateIdentifier(expectString(inner)),
        ),
        reason: field(raw.reason, "reason", (inner) => nonEmpty(expectString(inner))),
      };
    }
    case "SCHEDULER_PAUSED": {
      requireFields(raw, "reason");
      return {
        reason: field(raw.reason, "reason", (inner) => nonEmpty(expectString(inner))),
      };
    }
    case "SCHEDULER_RESUMED": {
      requireFields(raw, "reason", "expected_control_generation");
      const generation = field(
        raw.expected_control_generation,
        "expected_control_generation",
        expectInt,
      );
      if (generation < 0) {
        throw new ContractError("expected_control_generation must be >= 0");
      }
      return {
        reason: field(raw.reason, "reason", (inner) => nonEmpty(expectString(inner))),
        expected_control_generation: generation,
      };
    }
    case "MANUAL_APPROVAL_RECORDED": {
      requireFields(raw, "approver", "subject_type", "subject_id", "subject_digest", "risk_summary");
      const subjectType = field(raw.subject_type, "subject_type", expectString);
      if (!["attempt", "commit", "task", "promotion"].includes(subjectType)) {
        throw new ContractError("subject_type: invalid literal");
      }
      return {
        approver: field(raw.approver, "approver", (inner) => nonEmpty(expectString(inner))),
        subject_type: subjectType,
        subject_id: field(raw.subject_id, "subject_id", (inner) =>
          validateIdentifier(expectString(inner)),
        ),
        subject_digest: field(raw.subject_digest, "subject_digest", (inner) =>
          validateDigest(expectString(inner)),
        ),
        risk_summary: field(raw.risk_summary, "risk_summary", (inner) =>
          nonEmpty(expectString(inner)),
        ),
      };
    }
    case "JUDGE_DECLARED": {
      requireFields(raw, "judge_id", "kind", "version", "declared_by");
      const kind = expectString(raw.kind);
      if (kind !== "rubric" && kind !== "llm" && kind !== "manual") {
        throw new ContractError(`judge kind: invalid literal`);
      }
      return {
        judge_id: field(raw.judge_id, "judge_id", (inner) => validateIdentifier(expectString(inner))),
        kind,
        version: field(raw.version, "version", (inner) => { const n = expectInt(inner); if (n <= 0) throw new ContractError(`version must be > 0`); return n; }),
        declared_by: field(raw.declared_by, "declared_by", expectString),
      };
    }
    case "CANDIDATE_SELECTED": {
      requireFields(raw, "candidates", "rounds", "judge", "winner", "entries_digest");
      const judge = expectObject(raw.judge);
      const judgeKind = expectString(judge.kind);
      if (judgeKind !== "rubric" && judgeKind !== "llm" && judgeKind !== "manual") {
        throw new ContractError(`judge kind: invalid literal`);
      }
      const candidates = expectArray(raw.candidates);
      const rounds = expectArray(raw.rounds);
      return {
        task_id: raw.task_id === null || raw.task_id === undefined ? null : expectString(raw.task_id),
        candidates: candidates.map((inner) => validateIdentifier(expectString(inner))),
        rounds: rounds.map((round) => {
          const entry = expectObject(round);
          return {
            left: validateIdentifier(expectString(entry.left)),
            right: validateIdentifier(expectString(entry.right)),
            winner: validateIdentifier(expectString(entry.winner)),
            tie: entry.tie === true,
          };
        }),
        judge: {
          id: field(judge.id, "judge.id", (inner) => validateIdentifier(expectString(inner))),
          kind: judgeKind,
          replayable: judge.replayable === true,
        },
        winner:
          raw.winner === null || raw.winner === undefined
            ? null
            : validateIdentifier(expectString(raw.winner)),
        entries_digest: field(raw.entries_digest, "entries_digest", expectString),
      };
    }
    case "PROMOTION_PREPARED":
    case "PROMOTION_GIT_STARTED":
    case "PROMOTION_GIT_COMPLETED":
    case "PROMOTION_COMMITTED":
    case "PROMOTION_FAILED": {
      requireFields(
        raw,
        "promotion_id",
        "attempt_id",
        "source_commit",
        "expected_head_commit",
        "resulting_head_commit",
        "reason",
      );
      return {
        promotion_id: field(raw.promotion_id, "promotion_id", (inner) =>
          validateIdentifier(expectString(inner)),
        ),
        attempt_id: field(raw.attempt_id, "attempt_id", (inner) =>
          validateIdentifier(expectString(inner)),
        ),
        source_commit: field(raw.source_commit, "source_commit", (inner) =>
          validateCommit(expectString(inner)),
        ),
        expected_head_commit: field(raw.expected_head_commit, "expected_head_commit", (inner) =>
          validateCommit(expectString(inner)),
        ),
        resulting_head_commit: field(raw.resulting_head_commit, "resulting_head_commit", (inner) => {
          if (inner === null) return null;
          return validateCommit(expectString(inner));
        }),
        reason: expectNullableString(raw.reason),
      };
    }
  }
}

function parseTaskTransition(raw: Record<string, unknown>): Record<string, unknown> {
  const newState = field(raw.new_state, "new_state", expectString);
  if (!TASK_STATES.includes(newState as (typeof TASK_STATES)[number])) {
    throw new ContractError("new_state: invalid literal");
  }
  return {
    previous_state: expectNullableString(raw.previous_state),
    new_state: newState,
    reason: expectNullableString(raw.reason),
  };
}

function parseAttemptTransition(raw: Record<string, unknown>): Record<string, unknown> {
  const newState = field(raw.new_state, "new_state", expectString);
  if (!ATTEMPT_STATES.includes(newState as (typeof ATTEMPT_STATES)[number])) {
    throw new ContractError("new_state: invalid literal");
  }
  const leaseGeneration = field(raw.lease_generation, "lease_generation", expectNullableInt);
  if (leaseGeneration !== null && leaseGeneration < 0) {
    throw new ContractError("lease_generation must be >= 0");
  }
  return {
    previous_state: expectNullableString(raw.previous_state),
    new_state: newState,
    lease_generation: leaseGeneration,
    reason: expectNullableString(raw.reason),
  };
}

function validateEventConsistency(
  eventType: EventType,
  normalized: Record<string, unknown>,
): void {
  const taskTarget = TASK_EVENT_TARGET[eventType];
  if (taskTarget !== undefined && normalized.new_state !== taskTarget) {
    throw new ContractError("task event_type does not match payload new_state");
  }
  const attemptTarget = ATTEMPT_EVENT_TARGET[eventType];
  if (attemptTarget !== undefined && normalized.new_state !== attemptTarget) {
    throw new ContractError("attempt event_type does not match payload new_state");
  }
  const report = normalized.attempt_report;
  const required = REQUIRED_WORKER_STATUS[eventType];
  if (
    report !== undefined &&
    report !== null &&
    required !== undefined &&
    (report as AttemptReport).worker_status !== required
  ) {
    throw new ContractError("AttemptReport worker_status does not match event_type");
  }
}

function validateEmbeddedIdentity(input: {
  projectId: string;
  entityId: string;
  eventType: EventType;
  payload: Record<string, unknown>;
}): void {
  const { projectId, entityId, eventType, payload } = input;
  if (eventType === "PROJECT_CREATED" || eventType === "PROJECT_REVISED") {
    const project = payload.project_ir as ProjectIr;
    if (project.project_id !== projectId || entityId !== projectId) {
      throw new ContractError("embedded ProjectIR identity does not match Event identity");
    }
  } else if (eventType === "TASK_CREATED") {
    const envelope = payload.task_envelope as TaskEnvelope;
    if (envelope.project_id !== projectId || envelope.task_id !== entityId) {
      throw new ContractError("embedded TaskEnvelope identity does not match Event identity");
    }
  } else if (
    eventType === "ATTEMPT_COMPLETED" ||
    eventType === "ATTEMPT_FAILED" ||
    eventType === "ATTEMPT_LATE_RESULT" ||
    eventType === "ATTEMPT_EXPIRED" ||
    eventType === "ATTEMPT_CANCELLED"
  ) {
    const report = payload.attempt_report;
    if (
      report !== null &&
      report !== undefined &&
      ((report as AttemptReport).project_id !== projectId ||
        (report as AttemptReport).attempt_id !== entityId)
    ) {
      throw new ContractError("embedded AttemptReport identity does not match Event identity");
    }
  } else if (eventType === "EVIDENCE_ADDED") {
    const evidence = payload.evidence as EvidenceAtom;
    if (evidence.project_id !== projectId || evidence.evidence_id !== entityId) {
      throw new ContractError("embedded EvidenceAtom identity does not match Event identity");
    }
  }
}

// ---------------------------------------------------------------------------
// NewEvent / SchedulerEvent
// ---------------------------------------------------------------------------

export interface NewEvent {
  schema_version: 1;
  project_id: string;
  event_type: EventType;
  payload_version: 1;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  causation_id: number | null;
  correlation_id: string;
  idempotency_key: string;
  expected_project_revision: number | null;
}

export interface SchedulerEvent extends NewEvent {
  event_id: number;
  project_sequence: number;
  request_digest: string;
  previous_event_digest: string;
  event_digest: string;
  committed_at: string;
}

const NO_PROJECT_REVISION_EVENTS: ReadonlySet<EventType> = new Set([
  "PROJECT_CREATED",
  "SCHEDULER_PAUSED",
  "SCHEDULER_RESUMED",
] as const);

function parseEventType(value: unknown): EventType {
  const inner = expectString(value);
  if (!EVENT_TYPES.includes(inner as EventType)) {
    throw new ContractError("event_type: invalid literal");
  }
  return inner as EventType;
}

/** Validate a new event request; returns the normalized form. */
export function parseNewEvent(value: unknown): NewEvent {
  const raw = expectObject(value);
  requireFields(
    raw,
    "schema_version",
    "project_id",
    "event_type",
    "payload_version",
    "entity_type",
    "entity_id",
    "payload",
    "causation_id",
    "correlation_id",
    "idempotency_key",
    "expected_project_revision",
  );
  if (raw.schema_version !== 1) throw new ContractError("schema_version must be 1");
  if (raw.payload_version !== 1) throw new ContractError("payload_version must be 1");
  const eventType = field(raw.event_type, "event_type", parseEventType);
  const causation = field(raw.causation_id, "causation_id", expectNullableInt);
  if (causation !== null && causation <= 0) {
    throw new ContractError("causation_id must be > 0");
  }
  const expectedRevision = field(
    raw.expected_project_revision,
    "expected_project_revision",
    expectNullableInt,
  );
  if (expectedRevision !== null && expectedRevision < 0) {
    throw new ContractError("expected_project_revision must be >= 0");
  }
  const normalized = normalizeEventPayload(eventType, raw.payload);
  validateEventConsistency(eventType, normalized);
  const event: NewEvent = {
    schema_version: 1,
    project_id: field(raw.project_id, "project_id", (inner) =>
      validateIdentifier(expectString(inner)),
    ),
    event_type: eventType,
    payload_version: 1,
    entity_type: field(raw.entity_type, "entity_type", (inner) =>
      nonEmpty(expectString(inner)),
    ),
    entity_id: field(raw.entity_id, "entity_id", (inner) =>
      validateIdentifier(expectString(inner)),
    ),
    payload: normalized,
    causation_id: causation,
    correlation_id: field(raw.correlation_id, "correlation_id", (inner) =>
      validateIdentifier(expectString(inner)),
    ),
    idempotency_key: field(raw.idempotency_key, "idempotency_key", (inner) =>
      validateDigest(expectString(inner)),
    ),
    expected_project_revision: expectedRevision,
  };
  if (NO_PROJECT_REVISION_EVENTS.has(eventType)) {
    if (event.expected_project_revision !== null) {
      throw new ContractError(`${eventType} must not require a project revision`);
    }
  } else if (event.expected_project_revision === null) {
    throw new ContractError(`${eventType} requires expected_project_revision`);
  }
  validateEmbeddedIdentity({
    projectId: event.project_id,
    entityId: event.entity_id,
    eventType,
    payload: normalized,
  });
  return event;
}

/** Validate a committed event; recomputes both digests fail-closed. */
export function parseSchedulerEvent(value: unknown): SchedulerEvent {
  const base = parseNewEvent(value);
  const raw = expectObject(value);
  requireFields(
    raw,
    "event_id",
    "project_sequence",
    "request_digest",
    "previous_event_digest",
    "event_digest",
    "committed_at",
  );
  const eventId = field(raw.event_id, "event_id", expectInt);
  if (eventId <= 0) throw new ContractError("event_id must be > 0");
  const sequence = field(raw.project_sequence, "project_sequence", expectInt);
  if (sequence <= 0) throw new ContractError("project_sequence must be > 0");
  const event: SchedulerEvent = {
    ...base,
    event_id: eventId,
    project_sequence: sequence,
    request_digest: field(raw.request_digest, "request_digest", (inner) =>
      validateDigest(expectString(inner)),
    ),
    previous_event_digest: field(raw.previous_event_digest, "previous_event_digest", (inner) =>
      validateDigest(expectString(inner)),
    ),
    event_digest: field(raw.event_digest, "event_digest", (inner) =>
      validateDigest(expectString(inner)),
    ),
    committed_at: field(raw.committed_at, "committed_at", (inner) =>
      validateTimestamp(expectString(inner)),
    ),
  };
  const expectedRequest = computeRequestDigest(event);
  if (event.request_digest !== expectedRequest) {
    throw new ContractError(`request_digest mismatch: expected ${expectedRequest}`);
  }
  const expectedEvent = computeEventDigest(event);
  if (event.event_digest !== expectedEvent) {
    throw new ContractError(`event_digest mismatch: expected ${expectedEvent}`);
  }
  return event;
}

// ---------------------------------------------------------------------------
// Digests
// ---------------------------------------------------------------------------

/**
 * Replace embedded datetime wire strings with their canonical micro form so
 * digests match the Python model_dump(mode="python") behavior.
 */
export function canonicalizeEventPayload(
  eventType: EventType,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  switch (eventType) {
    case "PROJECT_CREATED":
    case "PROJECT_REVISED": {
      const project = payload.project_ir as ProjectIr;
      return {
        ...payload,
        project_ir: {
          ...project,
          committed_at: canonicalDatetime(project.committed_at),
        },
      };
    }
    case "ATTEMPT_COMPLETED":
    case "ATTEMPT_FAILED":
    case "ATTEMPT_LATE_RESULT":
    case "ATTEMPT_EXPIRED":
    case "ATTEMPT_CANCELLED": {
      if (payload.attempt_report === null || payload.attempt_report === undefined) {
        return payload;
      }
      const report = payload.attempt_report as AttemptReport;
      return {
        ...payload,
        attempt_report: {
          ...report,
          started_at: canonicalDatetime(report.started_at),
          finished_at: canonicalDatetime(report.finished_at),
        },
      };
    }
    case "EVIDENCE_ADDED": {
      const evidence = payload.evidence as EvidenceAtom;
      return {
        ...payload,
        evidence: { ...evidence, created_at: canonicalDatetime(evidence.created_at) },
      };
    }
    default:
      return payload;
  }
}

export function computeRequestDigest(event: NewEvent | SchedulerEvent): string {
  return canonicalDigest({
    schema_version: event.schema_version,
    project_id: event.project_id,
    event_type: event.event_type,
    payload_version: event.payload_version,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    payload: canonicalizeEventPayload(event.event_type, event.payload),
    causation_id: event.causation_id,
    correlation_id: event.correlation_id,
    expected_project_revision: event.expected_project_revision,
  });
}

export function computeEventDigest(event: SchedulerEvent): string {
  const { previous_event_digest: previous, event_digest: _eventDigest, ...content } = event;
  return canonicalDigest({
    chain_version: 1,
    previous_event_digest: previous,
    event: {
      ...content,
      payload: canonicalizeEventPayload(event.event_type, event.payload),
      committed_at: canonicalDatetime(event.committed_at),
    },
  });
}
