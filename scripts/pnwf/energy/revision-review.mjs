/** Read committed revision facts from the isolated Git world. */
import { assert, blob, changed, clean, descendant, git, head, sha } from "./contract.mjs";
import { CERTIFICATES, requireRevisionScope, REVISION_PATHS } from "./revision-scope.mjs";

export function validateWorkerResult(repo, basis, result) {
  assert(sha(result) && result !== basis && descendant(repo, basis, result), "WORKER_RESULT_BASIS_MISMATCH");
  assert(clean(repo), "WORKER_WORLD_DIRTY");
  const paths = changed(repo, basis, result);
  assert(paths.length > 0 && paths.every(path => REVISION_PATHS.includes(path)), "WORKER_RESULT_OUTSIDE_SCOPE");
  const entries = git(repo, "ls-tree", "-r", "-z", result, "--", ...paths).split("\0").filter(Boolean);
  assert(entries.length === paths.length && entries.every(entry => /^100644 blob /u.test(entry)), "WORKER_RESULT_NOT_REGULAR");
  return paths;
}

export function revisionReceipt({ repo, basis, candidate, settlement }) {
  assert(sha(basis) && sha(candidate) && head(repo) === candidate, "REVISION_REVIEW_CANDIDATE_MISMATCH");
  const paths = validateWorkerResult(repo, basis, candidate);
  requireRevisionScope(paths);
  const certificate = blob(repo, basis, CERTIFICATES);
  assert(certificate === blob(repo, candidate, CERTIFICATES), "CERTIFICATE_ARTIFACT_REWRITTEN");
  return { schema: "pnwf-energy-revision-receipt/v1", basis, candidate, resultCommit: candidate, paths,
    certificate: { path: CERTIFICATES, blob: certificate, unchanged: true }, clean: true, settlement };
}

export function revisionReviewTool(resolve) {
  return {
    name: "palimpsest_revision_review",
    description: "Read the committed revision receipt. To inspect one changed file, supply its path and the exact basis and candidate from the receipt.",
    mode: "read-only",
    parameters: { type: "object", additionalProperties: false, properties: {
      basis: { type: "string" }, candidate: { type: "string" }, taskId: { type: "string" },
      path: { type: "string", enum: REVISION_PATHS },
    } },
    output: { schema: {}, render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }] },
    async execute(input) {
      assert(input && typeof input === "object" && !Array.isArray(input) &&
        Object.keys(input).every(key => ["basis", "candidate", "taskId", "path"].includes(key)), "INVALID_REVISION_REVIEW_INPUT");
      const subject = resolve(input.taskId);
      assert(subject, "REVISION_REVIEW_NOT_READY");
      const { basis, candidate, repo } = subject;
      assert((input.basis === undefined || input.basis === basis) &&
        (input.candidate === undefined || input.candidate === candidate), "REVISION_REVIEW_SHA_MISMATCH");
      if (input.path !== undefined) {
        assert(input.basis === basis && input.candidate === candidate, "REVISION_REVIEW_EXACT_SHA_REQUIRED");
        assert(REVISION_PATHS.includes(input.path), "REVISION_REVIEW_PATH_OUTSIDE_SCOPE");
      }
      const receipt = revisionReceipt(subject);
      if (input.path === undefined) return receipt;
      const diff = git(repo, "diff", "--no-ext-diff", "--no-textconv", "--no-color", "--no-renames", basis, candidate, "--", input.path);
      return { schema: "pnwf-energy-revision-file/v1", basis, candidate, resultCommit: candidate, path: input.path, diff };
    },
  };
}
