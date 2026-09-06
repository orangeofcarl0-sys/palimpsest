/**
 * Context Manifest (PLMP-CTX-2 §3, raw-notes 预算.txt §8/§9). The canonical
 * record of what context an attempt was compiled against: the requirement
 * it answers, the exact references with digests, the lexical retrieval
 * hits, the linked evidence, and the stale references deliberately
 * excluded (§9 excluded_stale). Emitted as CONTEXT_MANIFEST_ADDED and
 * projected for lookup; coverage assessment turns the manifest into an
 * advisory per-class confidence reading (§8).
 *
 * The manifest shape mirrors its on-chain payload form (snake_case fields) -
 * the controller passes it verbatim into the event.
 */

import { canonicalDigest } from "../schema/index.js";

import type { ContextRequirement } from "./requirement.js";

export const CONTEXT_RETRIEVAL_METHOD = "lexical";

/** Coverage classes below this confidence recommend additional exploration. */
export const COVERAGE_RECOMMENDATION_THRESHOLD = 0.75;

export interface ContextManifestInput {
  readonly manifestId: string;
  readonly taskId: string;
  readonly projectRevision: number;
  readonly requirement: ContextRequirement;
  /** Lexical retrieval hits for the attempt's worktree (already capped). */
  readonly source: ReadonlyArray<{
    readonly path: string;
    readonly line: number;
    readonly snippet: string;
    readonly term: string;
  }>;
  readonly createdAt: string;
}

/** The on-chain payload shape (snake_case) - passed verbatim into the event. */
export interface ContextManifest {
  readonly manifest_id: string;
  readonly task_id: string;
  readonly project_revision: number;
  readonly requirement: ContextRequirement;
  readonly exact: ReadonlyArray<{ ref: string; digest: string }>;
  readonly source: ReadonlyArray<{
    readonly path: string;
    readonly line: number;
    readonly snippet: string;
    readonly term: string;
  }>;
  readonly evidence: readonly string[];
  readonly excluded_stale: readonly string[];
  readonly retrieval: readonly string[];
  readonly created_at: string;
}

export function buildContextManifest(input: ContextManifestInput): ContextManifest {
  return {
    manifest_id: input.manifestId,
    task_id: input.taskId,
    project_revision: input.projectRevision,
    requirement: input.requirement,
    exact: input.requirement.exact.map((ref) => ({
      ref,
      digest: canonicalDigest(ref),
    })),
    source: [...input.source],
    evidence: [...input.requirement.evidenceSubjects],
    excluded_stale: [...input.requirement.forbiddenStale],
    retrieval: [CONTEXT_RETRIEVAL_METHOD],
    created_at: input.createdAt,
  };
}

export interface CoverageAssessment {
  readonly exact: number;
  readonly code: number;
  readonly evidence: number;
  readonly historical: number;
  readonly forbidden: number;
  readonly unresolved: readonly string[];
  readonly recommendation: { readonly additionalExploration: boolean };
}

function ratio(hit: number, total: number): number {
  return total === 0 ? 1 : hit / total;
}

export function assessCoverage(
  requirement: ContextRequirement,
  manifest: ContextManifest,
): CoverageAssessment {
  const exactHits = requirement.exact.filter((ref) =>
    manifest.exact.some((entry) => entry.ref === ref),
  ).length;
  const codeHits = requirement.codePaths.filter((path) =>
    manifest.source.some((entry) => entry.path === path || entry.path.includes(path)),
  ).length;
  const evidenceHits = requirement.evidenceSubjects.filter((subject) =>
    manifest.evidence.includes(subject),
  ).length;

  const exact = ratio(exactHits, requirement.exact.length);
  const code = ratio(codeHits, requirement.codePaths.length);
  const evidence = ratio(evidenceHits, requirement.evidenceSubjects.length);
  const historical = 1; // V0 placeholder: the historical layer is empty by design
  const forbidden = 1; // stale references are excluded by construction

  const unresolved: string[] = [];
  if (exact < 1) unresolved.push(`exact: ${exactHits}/${requirement.exact.length} digested`);
  if (code < 1) unresolved.push(`code: ${codeHits}/${requirement.codePaths.length} located`);
  if (evidence < 1)
    unresolved.push(`evidence: ${evidenceHits}/${requirement.evidenceSubjects.length} linked`);
  const recommendation = {
    additionalExploration:
      exact < COVERAGE_RECOMMENDATION_THRESHOLD ||
      code < COVERAGE_RECOMMENDATION_THRESHOLD ||
      evidence < COVERAGE_RECOMMENDATION_THRESHOLD,
  };
  return { exact, code, evidence, historical, forbidden, unresolved, recommendation };
}
