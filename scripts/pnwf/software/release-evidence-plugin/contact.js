/** The caller and broker share the same meaning of a review basis. */
export const releaseContactBasis = {
  type: "string",
  description: "Full 40-character Git HEAD SHA of this workspace at the start of the handover, as printed by git rev-parse HEAD. " +
    "Use the workspace commit, not a release record ID, an archive SHA-256, or a shortened commit hash.",
};

export function releaseContactRefusal(input, expectedBasis) {
  if (input?.action !== "contact" || typeof input.question !== "string" || !input.question.trim() || input.question.length > 6000) {
    return { ok: false, code: "REVIEW_REQUEST_INVALID" };
  }
  if (input.basis === expectedBasis) return null;
  return {
    ok: false,
    code: "REVIEW_BASIS_MISMATCH",
    expectedBasis,
    recovery: {
      command: "git rev-parse HEAD",
      tool: "release_contact",
      argument: "basis",
      steps: [
        "Run git rev-parse HEAD in the handover workspace to identify its full Git SHA.",
        "Retry release_contact with the same question and set basis to expectedBasis. If HEAD has advanced, expectedBasis is the SHA of the original handover checkout.",
      ],
    },
  };
}
