/**
 * C6-R0 — canonical source provenance for a domain evaluation.
 *
 * The COG-6 defect this module exists to prevent: a domain rubric read the AMBIENT working tree, and
 * a later evidence extractor labelled a post-negative-control snapshot as
 * `acceptedCapabilitiesDigest`. The rubric itself never produced that field, and its checks show it
 * evaluated the accepted data — but the record could not prove which committed bytes it observed.
 *
 * The rule this module enforces:
 *   · a domain evaluation observes a COMMITTED GIT BLOB at an EXPLICITLY NAMED HEAD;
 *   · it records the evaluation time, the head, the blob digest and the result subject;
 *   · an ambient working-tree digest may be recorded, but only as non-canonical evidence;
 *   · when the blob or the head cannot be resolved, the evaluation is UNQUALIFIED, never guessed.
 *
 * Nothing here reads a repository implicitly. The caller supplies `readBlob` and `resolveHead`, which
 * makes the rule testable without touching a real Git world.
 */

export const SOURCE_EVALUATION_SCHEMA = "c6r-source-evaluation/v1";

const COMMIT = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;

function unqualified(reason) {
  return {
    schema: SOURCE_EVALUATION_SCHEMA,
    qualified: false,
    unqualifiedReason: reason,
    canonicalBasis: "COMMITTED_BLOB",
  };
}

/**
 * Evaluate what the canonical source actually says at one head.
 *
 * @param {{
 *   readBlob: (input: { head: string, path: string }) => string | null,
 *   resolveHead: (ref: string) => string | null,
 *   observedHead: string,
 *   path: string,
 *   at: string,
 *   subject: { kind: string, id: string },
 *   expected?: { digest: string, source?: string } | undefined,
 *   workingTreeDigest?: string | undefined,
 *   digest: (text: string) => string,
 * }} input
 */
export function evaluateCanonicalSource(input) {
  if (typeof input.at !== "string" || input.at.trim() === "") return unqualified("no_evaluation_time");
  if (input.subject === undefined || input.subject === null || typeof input.subject.kind !== "string" || typeof input.subject.id !== "string") {
    return unqualified("no_result_subject");
  }
  if (typeof input.observedHead !== "string" || !COMMIT.test(input.observedHead)) {
    return unqualified("no_observed_head");
  }
  if (typeof input.path !== "string" || input.path.trim() === "") return unqualified("no_source_path");

  const resolved = input.resolveHead(input.observedHead);
  if (resolved === null || resolved === undefined) return unqualified("observed_head_not_resolvable");
  if (resolved !== input.observedHead) return unqualified("observed_head_resolved_elsewhere");

  let blob;
  try {
    blob = input.readBlob({ head: input.observedHead, path: input.path });
  } catch {
    blob = null;
  }
  if (typeof blob !== "string") return unqualified("canonical_blob_not_resolvable");

  const committedBlobDigest = input.digest(blob);
  const expectedDigest = input.expected?.digest ?? null;
  if (expectedDigest !== null && !DIGEST.test(expectedDigest)) {
    return unqualified("expected_digest_malformed");
  }

  const workingTreeDigest = typeof input.workingTreeDigest === "string" && DIGEST.test(input.workingTreeDigest)
    ? input.workingTreeDigest
    : null;

  return {
    schema: SOURCE_EVALUATION_SCHEMA,
    qualified: true,
    unqualifiedReason: null,
    canonicalBasis: "COMMITTED_BLOB",
    evaluationAt: input.at,
    subject: { kind: input.subject.kind, id: input.subject.id },
    path: input.path,
    observedHead: input.observedHead,
    committedBlobDigest,
    expectedDigest,
    equalsExpected: expectedDigest === null ? null : committedBlobDigest === expectedDigest,
    expectedSource: input.expected?.source ?? null,
    workingTree: workingTreeDigest === null
      ? null
      : {
          digest: workingTreeDigest,
          canonical: false,
          relation:
            workingTreeDigest === committedBlobDigest
              ? "SAME_BYTES"
              : "DIFFERENT_RENDERING_OR_CONTENT",
          note: "the working tree is ambient evidence only; it never substitutes for the committed blob",
        },
  };
}

/**
 * The same evaluation against a real Git worktree. Kept separate from the pure core so tests can pin
 * the rule without creating a repository, and so the runner passes the exact commands it used.
 *
 * @param {{
 *   workDir: string,
 *   git: (args: string[], options: { cwd: string, encoding: "utf8" }) => string,
 *   readFile: (path: string) => string,
 *   digest: (text: string | Buffer) => string,
 *   join: (...parts: string[]) => string,
 *   observedHead: string,
 *   path: string,
 *   at: string,
 *   subject: { kind: string, id: string },
 *   expected?: { digest: string, source?: string } | undefined,
 * }} input
 */
export function evaluateCanonicalSourceInWorld(input) {
  const readBlob = ({ head, path }) => {
    try {
      return input.git(["show", `${head}:${path}`], { cwd: input.workDir, encoding: "utf8" });
    } catch {
      return null;
    }
  };
  const resolveHead = (ref) => {
    try {
      const value = input.git(["rev-parse", "--verify", `${ref}^{commit}`], { cwd: input.workDir, encoding: "utf8" }).trim();
      return COMMIT.test(value) ? value : null;
    } catch {
      return null;
    }
  };
  let workingTreeDigest;
  try {
    workingTreeDigest = input.digest(input.readFile(input.join(input.workDir, input.path)));
  } catch {
    workingTreeDigest = undefined;
  }
  return evaluateCanonicalSource({
    readBlob,
    resolveHead,
    observedHead: input.observedHead,
    path: input.path,
    at: input.at,
    subject: input.subject,
    expected: input.expected,
    workingTreeDigest,
    digest: input.digest,
  });
}

/** A domain evaluation without a resolvable canonical basis may still be recorded; it may not pass. */
export function requireQualified(record) {
  if (record?.qualified !== true) {
    throw new Error(`unqualified source evaluation: ${record?.unqualifiedReason ?? "unknown"}`);
  }
  return record;
}
