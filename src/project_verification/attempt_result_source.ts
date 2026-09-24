/**
 * PLMP-LEAN-1 appendix B / B-r1, slice 2 — the two bridges, and nothing else.
 *
 *     canonical Work record  →  ATTEMPT_RESULT subject
 *     ATTEMPT_RESULT subject →  exact, ephemeral, releasable checkout
 *
 * This slice deliberately produces NO VerificationRun, touches no freshness, no runtime capability,
 * no promotion and no finish composition. It answers exactly two questions, so that everything built
 * on top has a base that cannot verify the wrong object.
 *
 * The ownership line is the whole design:
 *
 *     Canonical result identity  ≠  Runtime materializability
 *
 * The SOURCE reads Work and says which result the attempt produced — if the database records a
 * result commit that the object store can no longer produce, Work history stays canonical and
 * verification execution fails closed. The MATERIALIZER never inspects Work validity (not even
 * whether base is an ancestor of result): it guarantees `R exists` and `checkout(R) == R`, and
 * nothing more.
 *
 * NOT a Work workspace. `GitPort.createWorktree()` is a Work execution primitive — persistent,
 * named by attempt, and without a removal operation — so it is deliberately not reused here. A
 * verification environment is ephemeral, detached, exact and always released.
 *
 * And a warning for whoever wires the first verifier to this: pointing the EXISTING
 * `git diff --check` head verifier at this checkout would check nothing, because a clean checkout has
 * no working-tree diff. `exact materialization ≠ meaningful verification`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { attemptReportDigestOf, parseAttemptReport, parseTaskEnvelope, type AttemptReport } from "../schema/index.js";
import {
  ProjectVerificationError,
  materializeAttemptResultVerificationSubject,
  resultSubjectRevisionRange,
  type AttemptResultVerificationSubject,
  type ResultVerificationSubject,
} from "./artifacts.js";

/* -------------------------------------------------------------------------- *
 * The Work-backed source — read-only, and never a Work truth owner
 * -------------------------------------------------------------------------- */

/**
 * Exactly what this source may read: the Work owner's canonical record for one attempt. The read
 * lives on the Work side so the verification plane names no storage column and keeps no shadow
 * envelope cache — and so "which attempt produced what" has one owner.
 */
export interface AttemptResultWorkReader {
  readonly projectId: string;
  attemptWorkRecord(attemptId: string): {
    readonly state: string;
    readonly taskId: string | null;
    readonly report: unknown;
    readonly envelope: unknown;
  } | null;
}

export interface AttemptResultVerificationSource {
  /**
   * The canonical result of one attempt. `attemptId` is INTERNAL application/service identity — it is
   * never a parameter a principal supplies, and the returned subject's every identity field comes
   * from canonical state rather than from the caller.
   */
  materialize(attemptId: string): AttemptResultVerificationSubject;
}

/**
 * The first-party source: the subject is derived from the attempt row, its AttemptReport and its
 * TaskEnvelope, with every identity cross-check enforced. No store of its own, no subject row, no
 * cached result commit, and no inference of Work truth from Git.
 */
export function firstPartyAttemptResultVerificationSource(
  owner: AttemptResultWorkReader,
): AttemptResultVerificationSource {
  return Object.freeze({
    materialize(attemptId: string): AttemptResultVerificationSubject {
      const record = owner.attemptWorkRecord(attemptId);
      if (record === null) {
        throw new ProjectVerificationError(
          "invalid_value",
          `attempt "${attemptId}" does not exist in project "${owner.projectId}"`,
        );
      }
      // Only a COMPLETED attempt has an immutable result. A running one has no result yet; a failed
      // or cancelled one never will.
      if (record.state !== "COMPLETED") {
        throw new ProjectVerificationError(
          "invalid_value",
          `attempt "${attemptId}" is ${record.state}, not COMPLETED — only a completed attempt has an immutable result to verify`,
        );
      }
      if (record.report === null || record.report === undefined) {
        throw new ProjectVerificationError(
          "invalid_value",
          `attempt "${attemptId}" is COMPLETED but carries no report, so its result cannot be identified`,
        );
      }
      let report: AttemptReport;
      try {
        report = parseAttemptReport(record.report);
      } catch (error) {
        throw new ProjectVerificationError(
          "malformed_artifact",
          `attempt "${attemptId}" has an unreadable report: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (report.worker_status !== "completed") {
        throw new ProjectVerificationError(
          "invalid_value",
          `attempt "${attemptId}" has a "${report.worker_status}" report, not a completed one`,
        );
      }
      if (report.result_commit === null) {
        throw new ProjectVerificationError(
          "invalid_value",
          `attempt "${attemptId}" reports no result commit, so there is no immutable result to verify`,
        );
      }
      if (record.taskId === null) {
        throw new ProjectVerificationError("invalid_value", `attempt "${attemptId}" has no task`);
      }
      if (record.envelope === null || record.envelope === undefined) {
        throw new ProjectVerificationError(
          "invalid_value",
          `task "${record.taskId}" has no envelope, so the attempt's result cannot be bound to what it was authorized to do`,
        );
      }
      let envelope;
      try {
        envelope = parseTaskEnvelope(record.envelope);
      } catch (error) {
        throw new ProjectVerificationError(
          "malformed_artifact",
          `task "${record.taskId}" has an unreadable envelope: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Identity cross-checks. A report that disagrees with canonical state is not a result to verify
      // — it is a corrupted record, and it fails closed rather than being reconciled by guesswork.
      const disagreements: string[] = [];
      if (report.project_id !== owner.projectId) disagreements.push(`report.project_id ${report.project_id} ≠ ${owner.projectId}`);
      if (report.attempt_id !== attemptId) disagreements.push(`report.attempt_id ${report.attempt_id} ≠ ${attemptId}`);
      if (report.envelope_id !== envelope.envelope_id) disagreements.push(`report.envelope_id ${report.envelope_id} ≠ ${envelope.envelope_id}`);
      if (report.base_commit !== envelope.base_commit) disagreements.push(`report.base_commit ≠ envelope.base_commit`);
      if (envelope.task_id !== record.taskId) disagreements.push(`envelope.task_id ${envelope.task_id} ≠ attempt.task_id ${record.taskId}`);
      if (disagreements.length > 0) {
        throw new ProjectVerificationError(
          "invalid_value",
          `attempt "${attemptId}" has an inconsistent canonical record (${disagreements.join("; ")}) — refusing to derive a verification subject from it`,
        );
      }

      return materializeAttemptResultVerificationSubject({
        projectId: owner.projectId,
        taskId: envelope.task_id,
        attemptId,
        envelopeId: envelope.envelope_id,
        baseCommit: envelope.base_commit,
        resultCommit: report.result_commit,
        reportDigest: attemptReportDigestOf(report),
      });
    },
  });
}

/* -------------------------------------------------------------------------- *
 * The materializer — an ephemeral execution environment, not a truth owner
 * -------------------------------------------------------------------------- */

export interface AttemptResultMaterialization {
  /** Where the protocol should run. */
  readonly repository: string;
  /** The commit actually checked out; the caller must confirm it equals `subject.resultCommit`. */
  readonly materializedCommit: string;
  /** Always called, including when the protocol throws, times out or errors. */
  release(): Promise<void>;
}

/**
 * A runtime capability, not a canonical port. Deliberately NOT `GitPort.createWorktree()`: that is a
 * Work execution primitive with a persistent, attempt-named workspace and no removal operation.
 */
/**
 * §D3-d3: the materializer is generic over a COMMIT, so it serves every result subject kind. It is
 * deliberately not duplicated per kind — a second materializer would be a second place for "checkout
 * exactly this revision" to be got wrong.
 */
export interface AttemptResultMaterializerPort {
  materialize(subject: ResultVerificationSubject): Promise<AttemptResultMaterialization>;
}

/**
 * The first-party materializer: a DETACHED git worktree at exactly `subject.resultCommit`.
 *
 * It checks only what materialization means — the object exists, and the checkout is that object.
 * It deliberately does NOT check whether `baseCommit` is reachable, whether the ambient branch
 * contains either commit, or whether base is an ancestor of result: those are Work-validity
 * questions, and a protocol that needs them can ask them. Extending them here would quietly widen
 * Work semantics from the verification plane.
 *
 * The path lives under a verification-specific namespace, never `attempt-<id>`, so it cannot be
 * mistaken for a Work workspace.
 */
export function gitAttemptResultMaterializer(input: {
  readonly repository: string;
  /** Where ephemeral checkouts are created; defaults to `<repository>/.palimpsest/verification`. */
  readonly rootDirectory?: string | undefined;
}): AttemptResultMaterializerPort {
  const repository = input.repository;
  const root = input.rootDirectory ?? join(repository, ".palimpsest", "verification");
  const git = (args: readonly string[], cwd: string): string =>
    execFileSync("git", [...args], { cwd, encoding: "utf8" });

  return Object.freeze({
    async materialize(subject: ResultVerificationSubject): Promise<AttemptResultMaterialization> {
      const commit = resultSubjectRevisionRange(subject).resultRevision;
      // The canonical record may name a commit this repository can no longer produce (pruned, a
      // different clone, a corrupted object store). Work history stays canonical; execution fails
      // closed here rather than the other way round.
      try {
        git(["cat-file", "-e", `${commit}^{commit}`], repository);
      } catch {
        throw new ProjectVerificationError(
          "invalid_value",
          `the repository cannot produce commit ${commit.slice(0, 12)} named by the canonical attempt record — Work history is unchanged, but this result cannot be materialized`,
        );
      }
      mkdirSync(root, { recursive: true });
      const path = join(root, `result-${subject.digest.slice(0, 16)}-${randomUUID().slice(0, 8)}`);
      git(["worktree", "add", "--detach", path, commit], repository);
      const materializedCommit = git(["rev-parse", "HEAD"], path).trim();
      if (materializedCommit !== commit) {
        // Release before refusing, so a mismatch cannot leak a worktree.
        try {
          git(["worktree", "remove", "--force", path], repository);
        } catch {
          /* the defensive cleanup below still runs */
        }
        rmSync(path, { recursive: true, force: true });
        throw new ProjectVerificationError(
          "invalid_value",
          `materialization produced ${materializedCommit.slice(0, 12)} where ${commit.slice(0, 12)} was required`,
        );
      }
      return Object.freeze({
        repository: path,
        materializedCommit,
        async release(): Promise<void> {
          try {
            git(["worktree", "remove", "--force", path], repository);
          } catch {
            // A failed removal must not hide the verification result, and the directory is reaped
            // below regardless.
          }
          rmSync(path, { recursive: true, force: true });
          try {
            git(["worktree", "prune"], repository);
          } catch {
            /* prune is hygiene, not correctness */
          }
        },
      });
    },
  });
}
