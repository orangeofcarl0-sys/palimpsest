/** The five writable files for the T2 supplier correction. */
export const DELIVERABLES = Object.freeze(["technical-capacity.md", "vendor-compliance.md", "cost-model.json",
  "schedule.md", "risk-review.md", "recommendation.md"].map(name => `deliverables/${name}`));
export const CERTIFICATES = DELIVERABLES[1];
export const REVISION_PATHS = Object.freeze(DELIVERABLES.filter(path => path !== CERTIFICATES));
export const PRESERVE_CERTIFICATES = `Keep ${CERTIFICATES} byte-for-byte identical to the basis. Its certificate evidence is read-only for this revision.`;
export const REVISION_SCOPE_INSTRUCTIONS = `The write scope is exactly these five paths: ${REVISION_PATHS.join(", ")}. ${PRESERVE_CERTIFICATES}`;

export function requireRevisionScope(paths) {
  if (!Array.isArray(paths) || paths.length !== REVISION_PATHS.length ||
    !REVISION_PATHS.every(path => paths.includes(path))) {
    throw new Error(`ENERGY_REVISION_SCOPE_MISMATCH. ${REVISION_SCOPE_INSTRUCTIONS}`);
  }
}
