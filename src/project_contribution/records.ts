/**
 * The Journal encoding of contribution vocabulary.
 *
 * Journal bodies are human-readable notes with ONE machine marker and a compact JSON payload. The
 * marker makes the record discoverable by a later Session without a second store; a malformed body is
 * skipped rather than guessed, so a damaged note cannot become a fabricated contribution.
 */
import type { ProjectJournalViewEntry } from "../project_workspace/index.js";

import {
  CONTRIBUTION_DECISIONS,
  CONTRIBUTION_OBSERVATIONS,
  CONTRIBUTION_SOURCE_KINDS,
  READ_FOOTPRINT_OBSERVATIONS,
  type ContributionBasis,
  type ContributionDecisionRecord,
  type ContributionPlanChange,
  type ContributionRecord,
  type ContributionSourceKind,
  type DelegationStartRecord,
} from "./types.js";

export const CONTRIBUTION_MARKER = "<!-- pc1-contribution:v1 -->";
export const CONTRIBUTION_DECISION_MARKER = "<!-- pc1-contribution-decision:v1 -->";
export const DELEGATION_START_MARKER = "<!-- pc1-delegation-start:v1 -->";

export interface JournalRecordRow<T> {
  readonly entry: ProjectJournalViewEntry["entry"];
  readonly record: T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isBasis(value: unknown): value is ContributionBasis {
  if (!isObject(value)) return false;
  return (
    typeof value.projectRevision === "number" &&
    Number.isSafeInteger(value.projectRevision) &&
    value.projectRevision >= 0 &&
    typeof value.projectDigest === "string" &&
    typeof value.headCommit === "string"
  );
}

function extractPayload(body: string, marker: string): unknown {
  const index = body.indexOf(marker);
  if (index < 0) return undefined;
  const rest = body.slice(index + marker.length).trim();
  if (!rest.startsWith("{")) return undefined;
  try {
    return JSON.parse(rest) as unknown;
  } catch {
    return undefined;
  }
}

export function parseContributionRecord(raw: unknown): ContributionRecord | null {
  if (!isObject(raw) || raw.schema !== "pc1-contribution/v1") return null;
  const sourceKind = raw.sourceKind;
  if (
    typeof sourceKind !== "string" ||
    !(CONTRIBUTION_SOURCE_KINDS as readonly string[]).includes(sourceKind)
  ) {
    return null;
  }
  const observation = raw.observation;
  if (
    typeof observation !== "string" ||
    !(CONTRIBUTION_OBSERVATIONS as readonly string[]).includes(observation)
  ) {
    return null;
  }
  const footprintObservation = raw.readFootprintObservation;
  if (
    typeof footprintObservation !== "string" ||
    !(READ_FOOTPRINT_OBSERVATIONS as readonly string[]).includes(footprintObservation)
  ) {
    return null;
  }
  if (
    typeof raw.contributionId !== "string" ||
    typeof raw.projectId !== "string" ||
    typeof raw.sourceRef !== "string" ||
    typeof raw.task !== "string" ||
    typeof raw.finding !== "string" ||
    typeof raw.createdAt !== "string" ||
    !isBasis(raw.basis) ||
    !isStringArray(raw.declaredReadFootprint) ||
    !isStringArray(raw.artifacts) ||
    raw.independentVerification !== false
  ) {
    return null;
  }
  return Object.freeze({
    schema: "pc1-contribution/v1" as const,
    contributionId: raw.contributionId,
    projectId: raw.projectId,
    sourceKind: sourceKind as ContributionSourceKind,
    sourceRef: raw.sourceRef,
    task: raw.task,
    finding: raw.finding,
    basis: Object.freeze({ ...raw.basis }),
    observation: observation as ContributionRecord["observation"],
    declaredReadFootprint: Object.freeze([...raw.declaredReadFootprint]),
    readFootprintObservation: footprintObservation as ContributionRecord["readFootprintObservation"],
    artifacts: Object.freeze([...raw.artifacts]),
    independentVerification: false,
    createdAt: raw.createdAt,
  });
}

export function parseDecisionRecord(raw: unknown): ContributionDecisionRecord | null {
  if (!isObject(raw) || raw.schema !== "pc1-contribution-decision/v1") return null;
  const decision = raw.decision;
  if (typeof decision !== "string" || !(CONTRIBUTION_DECISIONS as readonly string[]).includes(decision)) {
    return null;
  }
  if (
    typeof raw.decisionId !== "string" ||
    typeof raw.projectId !== "string" ||
    typeof raw.contributionId !== "string" ||
    typeof raw.decisionNote !== "string" ||
    typeof raw.createdAt !== "string" ||
    !isBasis(raw.basisAtDecision) ||
    (raw.basisState !== "CURRENT" && raw.basisState !== "STALE") ||
    typeof raw.declaredChangedPlan !== "boolean"
  ) {
    return null;
  }
  let planChange: ContributionPlanChange | null = null;
  if (raw.planChange !== null) {
    const value = raw.planChange;
    if (
      !isObject(value) ||
      typeof value.fromRevision !== "number" ||
      typeof value.toRevision !== "number" ||
      !isStringArray(value.addedTaskIds) ||
      !isStringArray(value.removedTaskIds) ||
      !isStringArray(value.changedTaskIds) ||
      !isStringArray(value.changedIds) ||
      typeof value.reason !== "string" ||
      (value.changeClass !== null && typeof value.changeClass !== "string")
    ) {
      return null;
    }
    planChange = Object.freeze({
      fromRevision: value.fromRevision,
      toRevision: value.toRevision,
      addedTaskIds: Object.freeze([...value.addedTaskIds]),
      removedTaskIds: Object.freeze([...value.removedTaskIds]),
      changedTaskIds: Object.freeze([...value.changedTaskIds]),
      changeClass: value.changeClass as string | null,
      changedIds: Object.freeze([...value.changedIds]),
      reason: value.reason,
    });
  }
  return Object.freeze({
    schema: "pc1-contribution-decision/v1" as const,
    decisionId: raw.decisionId,
    projectId: raw.projectId,
    contributionId: raw.contributionId,
    decision: decision as ContributionDecisionRecord["decision"],
    decisionNote: raw.decisionNote,
    basisAtDecision: Object.freeze({ ...raw.basisAtDecision }),
    basisState: raw.basisState,
    declaredChangedPlan: raw.declaredChangedPlan,
    planChange,
    createdAt: raw.createdAt,
  });
}

export function parseDelegationStartRecord(raw: unknown): DelegationStartRecord | null {
  if (!isObject(raw) || raw.schema !== "pc1-delegation-start/v1") return null;
  if (
    typeof raw.projectId !== "string" ||
    typeof raw.delegationRef !== "string" ||
    typeof raw.task !== "string" ||
    typeof raw.basisCommit !== "string" ||
    typeof raw.createdAt !== "string" ||
    (raw.basis !== null && !isBasis(raw.basis))
  ) {
    return null;
  }
  return Object.freeze({
    schema: "pc1-delegation-start/v1" as const,
    projectId: raw.projectId,
    delegationRef: raw.delegationRef,
    task: raw.task,
    basisCommit: raw.basisCommit,
    basis: raw.basis === null ? null : Object.freeze({ ...raw.basis }),
    createdAt: raw.createdAt,
  });
}

function rowsOf<T>(
  entries: readonly ProjectJournalViewEntry[],
  marker: string,
  parse: (raw: unknown) => T | null,
): readonly JournalRecordRow<T>[] {
  const rows: JournalRecordRow<T>[] = [];
  for (const entry of entries) {
    const raw = extractPayload(entry.entry.body, marker);
    if (raw === undefined) continue;
    const record = parse(raw);
    if (record !== null) rows.push(Object.freeze({ entry: entry.entry, record }));
  }
  return Object.freeze(rows);
}

export function contributionJournalEntries(
  entries: readonly ProjectJournalViewEntry[],
): readonly JournalRecordRow<ContributionRecord>[] {
  return rowsOf(entries, CONTRIBUTION_MARKER, parseContributionRecord);
}

export function decisionJournalEntries(
  entries: readonly ProjectJournalViewEntry[],
): readonly JournalRecordRow<ContributionDecisionRecord>[] {
  return rowsOf(entries, CONTRIBUTION_DECISION_MARKER, parseDecisionRecord);
}

export function delegationStartEntries(
  entries: readonly ProjectJournalViewEntry[],
): readonly JournalRecordRow<DelegationStartRecord>[] {
  return rowsOf(entries, DELEGATION_START_MARKER, parseDelegationStartRecord);
}

export function contributionJournalBody(record: ContributionRecord): string {
  return [
    "## Contribution recorded (non-canonical)",
    "",
    `Source: ${record.sourceKind} (${record.sourceRef})`,
    `Task: ${record.task}`,
    `Finding: ${record.finding}`,
    `Observation: ${record.observation}`,
    `Declared read footprint: ${record.declaredReadFootprint.length === 0 ? "(not observed)" : record.declaredReadFootprint.join(", ")}`,
    `Independent verification: no (a single contribution is not independent verification)`,
    "",
    CONTRIBUTION_MARKER,
    JSON.stringify(record),
  ].join("\n");
}

export function decisionJournalBody(record: ContributionDecisionRecord): string {
  const change =
    record.planChange === null
      ? record.declaredChangedPlan
        ? "declared: the plan changed (no product-observed revision accompanies this declaration)"
        : "no plan change was applied"
      : `observed plan revision ${record.planChange.fromRevision} -> ${record.planChange.toRevision}; added [${record.planChange.addedTaskIds.join(", ")}], removed [${record.planChange.removedTaskIds.join(", ")}], changed [${record.planChange.changedTaskIds.join(", ")}]`;
  return [
    "## Contribution decision (non-canonical)",
    "",
    `Contribution: ${record.contributionId}`,
    `Decision: ${record.decision}`,
    `Note: ${record.decisionNote}`,
    `Basis at decision: ${record.basisState}`,
    `Plan: ${change}`,
    "",
    CONTRIBUTION_DECISION_MARKER,
    JSON.stringify(record),
  ].join("\n");
}

export function delegationStartJournalBody(record: DelegationStartRecord): string {
  return [
    "## Delegation started (non-canonical)",
    "",
    `Task: ${record.task}`,
    `Delegation: ${record.delegationRef}`,
    `Read basis: ${record.basisCommit}`,
    "",
    DELEGATION_START_MARKER,
    JSON.stringify(record),
  ].join("\n");
}
