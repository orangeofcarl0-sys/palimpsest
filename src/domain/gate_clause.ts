/**
 * Pure gate-clause grammar and evaluation (Research line, raw-notes 预算.txt
 * §13–22).
 *
 * This is the single grammar home for gate clauses. It moved out of the
 * evidence layer (gate_dsl.ts) because declared stage-graph guards live in
 * the domain layer and must evaluate clauses without importing evidence
 * storage. The parser is fail-closed: anything not matching the closed
 * grammar throws a TypeError naming the violated rule.
 *
 * Clause evaluation is pure: it inspects only the already-recorded evidence
 * views handed to it and never touches storage. `exists`/`count` clauses
 * without matching evidence are `unresolved`, never `fail` — absence of
 * evidence is not evidence of absence (§18).
 */

export type ClauseFlag = "pass" | "fail" | "unresolved";

export type GateClause =
  | { exists: { predicate: string; where?: Record<string, unknown> | undefined } }
  | { count: { predicate: string; where?: Record<string, unknown> | undefined; gte: number } }
  | { not: GateClause };

export interface GateDefinition {
  gate_id: string;
  version: number;
  subject_type: "attempt" | "commit" | "task";
  require: { mode: "all"; chain: GateClause[] } | { mode: "any"; chain: GateClause[] };
}

export const KNOWN_PREDICATES: ReadonlySet<string> = new Set([
  "process_exit_zero",
  "tests_pass",
  "tests_fail",
  "lint_pass",
  "expected_files_exist",
  "write_scope_valid",
]);

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseWhere(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) throw new TypeError("clause where must be an object");
  return value;
}

export function parseClause(value: unknown): GateClause {
  if (!isObject(value)) throw new TypeError("gate clause must be an object");
  if ("exists" in value) {
    const spec = value.exists as unknown;
    if (!isObject(spec)) throw new TypeError("exists clause requires an object");
    const predicate = spec.predicate;
    if (typeof predicate !== "string") throw new TypeError("predicate must be a string");
    if (!KNOWN_PREDICATES.has(predicate)) {
      throw new TypeError(`unknown evidence predicate '${predicate}'`);
    }
    return { exists: { predicate, ...(spec.where === undefined ? {} : { where: parseWhere(spec.where) }) } };
  }
  if ("count" in value) {
    const spec = value.count as unknown;
    if (!isObject(spec)) throw new TypeError("count clause requires an object");
    const predicate = spec.predicate;
    if (typeof predicate !== "string") throw new TypeError("predicate must be a string");
    if (!KNOWN_PREDICATES.has(predicate)) {
      throw new TypeError(`unknown evidence predicate '${predicate}'`);
    }
    const gte = spec.gte;
    if (typeof gte !== "number" || !Number.isInteger(gte) || gte < 0) {
      throw new TypeError("count.gte must be a non-negative integer");
    }
    return { count: { predicate, gte, ...(spec.where === undefined ? {} : { where: parseWhere(spec.where) }) } };
  }
  if ("not" in value) {
    return { not: parseClause(value.not) };
  }
  throw new TypeError("gate clause must be exists | count | not");
}

/** Fail-closed parse of a gate definition (schema_version not required: gates are optional metadata). */
export function parseGateDefinition(value: unknown): GateDefinition {
  if (!isObject(value)) throw new TypeError("gate definition must be an object");
  const gateId = value.gate_id;
  if (typeof gateId !== "string" || gateId.length === 0) {
    throw new TypeError("gate_id must be a non-empty string");
  }
  const version = value.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
    throw new TypeError("version must be a non-negative integer");
  }
  const subjectType = value.subject_type;
  if (subjectType !== "attempt" && subjectType !== "commit" && subjectType !== "task") {
    throw new TypeError("subject_type must be attempt | commit | task");
  }
  const require = value.require;
  if (!isObject(require)) throw new TypeError("require must be an object");
  const clauses = require.all ?? require.any;
  if (!Array.isArray(clauses)) {
    throw new TypeError("require must have an all or any clause array");
  }
  return {
    gate_id: gateId,
    version,
    subject_type: subjectType,
    require: require.all !== undefined
      ? { mode: "all", chain: clauses.map(parseClause) }
      : { mode: "any", chain: clauses.map(parseClause) },
  };
}

/** Structural evidence view a pure clause evaluation consumes. */
export interface ClauseEvidence {
  predicate: string;
  value: Record<string, unknown>;
}

function matchClause(
  clause: { predicate: string; where?: Record<string, unknown> | undefined },
  view: ClauseEvidence,
): boolean {
  if (view.predicate !== clause.predicate) return false;
  if (clause.where === undefined) return true;
  return Object.entries(clause.where).every(([key, expected]) => view.value[key] === expected);
}

/**
 * Evaluate one clause against the given evidence views. Pure: `exists` and
 * `count` return `unresolved` when no evidence matches; `not` flips
 * pass/fail and leaves `unresolved` untouched (absence ≠ evidence of absence).
 */
export function evalClause(clause: GateClause, evidence: readonly ClauseEvidence[]): ClauseFlag {
  if ("exists" in clause) {
    return evidence.some((view) => matchClause(clause.exists, view)) ? "pass" : "unresolved";
  }
  if ("count" in clause) {
    const matched = evidence.filter((view) => matchClause(clause.count, view)).length;
    return matched >= clause.count.gte ? "pass" : "unresolved";
  }
  const inner = evalClause(clause.not, evidence);
  // `not` flips pass/fail; unresolved stays unresolved (absence ≠ evidence of absence).
  return inner === "pass" ? "fail" : inner === "fail" ? "pass" : "unresolved";
}
