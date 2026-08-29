/**
 * Gate DSL — declarative, deterministic, versioned gates (Research line,
 * raw-notes 预算.txt §13–22).
 *
 * A GateDefinition declares *when evidence proves a subject may advance*;
 * it is pure (no side effects, never runs tools), and evaluation queries
 * the already-recorded Evidence projection. The clause grammar and the pure
 * clause evaluation live in domain/gate_clause.ts so declared stage-graph
 * guards can reuse them without importing the evidence layer; this module
 * keeps the storage-backed engine (GateResult, evidence queries).
 *
 * Hard-gate semantics are preserved: any `all`-failure is FAIL (one-vote
 * veto); missing evidence is INCOMPLETE, never FAIL — absence of evidence
 * is not evidence of absence (§18). The engine reports what evidence it
 * used and what it next needs, making the gate an Evidence Demand
 * Generator (§22) instead of a verdict oracle.
 */

import { EventStore } from "../state/index.js";
import { DomainValidationError } from "../domain/errors.js";
import { evalClause, type GateClause, type GateDefinition } from "../domain/gate_clause.js";

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

export type { ClauseFlag, GateClause, GateDefinition } from "../domain/gate_clause.js";
export { parseGateDefinition } from "../domain/gate_clause.js";

export interface EvidenceView {
  evidence_id: string;
  predicate: string;
  value: Record<string, unknown>;
  status: string;
}

/**
 * Active evidence views for one subject. The evidence projection (schema
 * v1) carries subject inside evidence_json, not as columns; scope the query
 * via json_extract. Stale evidence is excluded from the calculation but its
 * id is recalled.
 */
export function activeEvidenceViews(
  store: EventStore,
  projectId: string,
  subjectType: string,
  subjectId: string,
): EvidenceView[] {
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
  return views.filter((view) => view.status === "active");
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
    const evidence = activeEvidenceViews(store, projectId, subjectType, subjectId);
    const all = gate.require.mode === "all";
    const clauses = gate.require.chain;
    const flags = clauses.map((clause) => evalClause(clause, evidence));

    const passed: string[] = [];
    const failed: string[] = [];
    const unresolved: string[] = [];
    flags.forEach((flag, index) => {
      const label = GateEngine.#clauseLabel(clauses[index]!);
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

  static #clauseLabel(clause: GateClause): string {
    if ("exists" in clause) return `exists(${clause.exists.predicate})`;
    if ("count" in clause) return `count(${clause.count.predicate}) >= ${clause.count.gte}`;
    return `not(${GateEngine.#clauseLabel(clause.not)})`;
  }
}
