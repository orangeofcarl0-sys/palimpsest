/**
 * Declared-selection contracts (H1 spec §3.3). The judge for a project is a
 * governed declaration (JUDGE_DECLARED on the hash-chained log), never an
 * implicit default. Judge inputs are split into a deterministic structured
 * digest (the formal signal) and a length-capped worker self-report explicitly
 * typed untrusted - "worker 自述不构成证据" applies to selection too: the
 * commentary may inform, never decide, and every decision is event-sourced.
 */

import { Buffer } from "node:buffer";

import { canonicalJsonBytes } from "../schema/index.js";

export type DeclaredJudgeKind = "rubric" | "llm" | "manual";

export interface JudgeDeclaration {
  judge_id: string;
  kind: DeclaredJudgeKind;
  version: number;
  declared_by: string;
}

/** A candidate's deterministic, self-report-free signal set. */
export interface StructuredDigest {
  attempt_id: string;
  worker_status: string;
  result_commit: string | null;
  changed_files: number;
  produced_artifacts: number;
  duration_ms: number | null;
}

/** Worker-authored text: may inform a non-rubric judge, must never be trusted. */
export interface UntrustedText {
  text: string;
  origin: "worker-self-report";
}

export interface JudgeView {
  structured: StructuredDigest;
  commentary: UntrustedText | null;
}

/** Cap for the worker summary as stored on the attempt report. */
export const SUMMARY_STORE_CAP = 2000;
/** Cap for what a judge may read from the worker summary. */
export const SUMMARY_JUDGE_CAP = 512;

export function capWorkerSummary(summary: string): string {
  return summary.length > SUMMARY_STORE_CAP ? summary.slice(0, SUMMARY_STORE_CAP) : summary;
}

export function judgeCommentary(summary: string | null): UntrustedText | null {
  if (summary === null || summary.length === 0) return null;
  const text = summary.length > SUMMARY_JUDGE_CAP ? summary.slice(0, SUMMARY_JUDGE_CAP) : summary;
  return { text, origin: "worker-self-report" };
}

/**
 * The deterministic judge: a canonical total order over the structured
 * digest. Same inputs always produce the same decision (replayable); equal
 * digests tie, and the tournament's tie rule resolves to the first candidate
 * - honestly reported as a tie in the decision event.
 */
export function rubricCompare(a: JudgeView, b: JudgeView): "left" | "right" | "tie" {
  const ka = Buffer.from(canonicalJsonBytes(a.structured as unknown as Record<string, unknown>)).toString("hex");
  const kb = Buffer.from(canonicalJsonBytes(b.structured as unknown as Record<string, unknown>)).toString("hex");
  if (ka === kb) return "tie";
  return ka > kb ? "left" : "right";
}
