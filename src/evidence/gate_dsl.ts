/**
 * Gate DSL — declarative, deterministic, versioned gates (Research line,
 * raw-notes 预算.txt §13–22).
 *
 * A GateDefinition declares *when evidence proves a subject may advance*;
 * it is pure (no side effects, never runs tools), and evaluation queries
 * the already-recorded Evidence projection. Hard-gate semantics are
 * preserved: any `all`-failure is FAIL (one-vote veto); missing evidence is
 * INCOMPLETE, never FAIL — absence of evidence is not evidence of absence
 * (§18). The engine reports what evidence it used and what it next needs,
 * making the gate an Evidence Demand Generator (§22) instead of a verdict
 * oracle.
 */

import { EventStore } from "../state/index.js";
import { DomainValidationError } from "../domain/errors.js";

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

export interface GateResult {
  gate_id: string;
  version: number;
  subject_type: string;
  subject_id: string;
  verdict: "PASS" | "FAIL" | "INCOMPLETE";
  passed: string[];
  failed: string[];
  unresolved: string[];
  evidence_used: string[];
  next_evidence_needed: string[];
}

const KNOWN_PREDICATES = new Set([
  "process_exit_zero",
  "tests_pass",
  "tests_fail",
  "lint_pass",
  "expected_files_exist",
  "write_scope_valid",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseWhere(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) throw new TypeError("clause where must be an object");
  return value;
}

function parseClause(value: unknown): GateClause {
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

interface EvidenceView {
  evidence_id: string;
  predicate: string;
  value: Record<string, unknown>;
  status: string;
}

export class GateEngine {
  /**
   * H1 §3.4 D-1: the registry lives on the log (GATE_DEFINED) and is read
   * from the gate_registry projection. In-memory registration is gone - a
   * gate exists iff a declaration event says so, and the latest declaration
   * wins (older versions are superseded, never merged).
   */
  private static definitionOf(
    store: EventStore,
    projectId: string,
    gateId: string,
  ): GateDefinition | undefined {
    const row = store.connection
      .prepare(
        "SELECT definition_json FROM gate_registry WHERE project_id=? AND gate_id=?",
      )
      .get(projectId, gateId) as { definition_json: Uint8Array } | undefined;
    if (row === undefined) return undefined;
    return JSON.parse(new TextDecoder().decode(row.definition_json)) as GateDefinition;
  }

  get(store: EventStore, projectId: string, gateId: string): GateDefinition | undefined {
    return GateEngine.definitionOf(store, projectId, gateId);
  }

  /**
   * Evaluate one gate against the Evidence projection for a subject.
   * Queries only active evidence; stale evidence is ignored (it already
   * lost its authority by invalidation).
   */
  evaluate(
    store: EventStore,
    projectId: string,
    subjectType: GateDefinition["subject_type"],
    subjectId: string,
    gateId: string,
  ): GateResult {
    const gate = GateEngine.definitionOf(store, projectId, gateId);
    if (gate === undefined) {
      throw new DomainValidationError(`gate ${gateId} is not declared`);
    }
    if (gate.subject_type !== subjectType) {
      throw new DomainValidationError(
        `gate ${gateId} expects subject_type ${gate.subject_type}, got ${subjectType}`,
      );
    }
    const evidence = this.#evidence(store, projectId, subjectType, subjectId);
    const all = gate.require.mode === "all";
    const clauses = gate.require.chain;
    const flags = clauses.map((clause) => this.#evalClause(clause, evidence));

    const passed: string[] = [];
    const failed: string[] = [];
    const unresolved: string[] = [];
    flags.forEach((flag, index) => {
      const label = this.#clauseLabel(clauses[index]!);
      if (flag === "pass") passed.push(label);
      else if (flag === "fail") failed.push(label);
      else unresolved.push(label);
    });

    // all: one fail vetoes; missing evidence makes it INCOMPLETE, never FAIL.
    // any: any pass wins; missing evidence is INCOMPLETE; all-fail is FAIL.
    let verdict: GateResult["verdict"];
    if (all) {
      verdict = failed.length > 0 ? "FAIL" : unresolved.length > 0 ? "INCOMPLETE" : "PASS";
    } else {
      verdict = passed.length > 0 ? "PASS" : unresolved.length > 0 ? "INCOMPLETE" : "FAIL";
    }

    const evidenceUsed = evidence.map((item) => item.evidence_id);
    const nextEvidenceNeeded = unresolved.length > 0
      ? [...unresolved]
      : verdict === "FAIL"
        ? [`re-run gate ${gateId} after fixing failed clauses`]
        : [];

    return {
      gate_id: gate.gate_id,
      version: gate.version,
      subject_type: subjectType,
      subject_id: subjectId,
      verdict,
      passed,
      failed,
      unresolved,
      evidence_used: evidenceUsed,
      next_evidence_needed: nextEvidenceNeeded,
    };
  }

  #evidence(
    store: EventStore,
    projectId: string,
    subjectType: string,
    subjectId: string,
  ): EvidenceView[] {
    // The evidence projection (schema v1) carries subject inside evidence_json,
    // not as columns; scope the query via json_extract.
    const rows = store.connection
      .prepare(
        `SELECT evidence_id, status, evidence_json FROM evidence
         WHERE project_id=?
           AND json_extract(evidence_json, '$.subject_type')=?
           AND json_extract(evidence_json, '$.subject_id')=?`,
      )
      .all(projectId, subjectType, subjectId) as Array<{
      evidence_id: string;
      status: string;
      evidence_json: Uint8Array;
    }>;
    const views: EvidenceView[] = [];
    for (const row of rows) {
      const parsed = JSON.parse(new TextDecoder().decode(row.evidence_json)) as {
        predicate: string;
        value: Record<string, unknown>;
      };
      views.push({
        evidence_id: row.evidence_id,
        predicate: parsed.predicate,
        value: parsed.value,
        status: row.status,
      });
    }
    // Stale evidence is excluded from the calculation but its id is recalled.
    return views.filter((view) => view.status === "active");
  }

  #match(clause: { predicate: string; where?: Record<string, unknown> | undefined }, view: EvidenceView): boolean {
    if (view.predicate !== clause.predicate) return false;
    if (clause.where === undefined) return true;
    return Object.entries(clause.where).every(([key, expected]) => view.value[key] === expected);
  }

  #evalClause(clause: GateClause, evidence: EvidenceView[]): ClauseFlag {
    if ("exists" in clause) {
      return evidence.some((view) => this.#match(clause.exists, view)) ? "pass" : "unresolved";
    }
    if ("count" in clause) {
      const matched = evidence.filter((view) => this.#match(clause.count, view)).length;
      return matched >= clause.count.gte ? "pass" : "unresolved";
    }
    const inner = this.#evalClause(clause.not, evidence);
    // `not` flips pass/fail; unresolved stays unresolved (absence ≠ evidence of absence).
    return inner === "pass" ? "fail" : inner === "fail" ? "pass" : "unresolved";
  }

  #clauseLabel(clause: GateClause): string {
    if ("exists" in clause) return `exists(${clause.exists.predicate})`;
    if ("count" in clause) return `count(${clause.count.predicate}) >= ${clause.count.gte}`;
    return `not(${this.#clauseLabel(clause.not)})`;
  }
}