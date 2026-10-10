/**
 * R3-L0C-I-A-R-L-C-F-S-H §3 — THE ARTIFACT-ENVELOPE VALIDATOR, REUSED RATHER THAN RESTATED.
 *
 * §3 requires the validated-cost adapter to "reuse ... the new artifact-envelope validator". The validator the
 * previous stage committed (`scripts/r3l0ciarlcfs/artifact-validity.mjs`) is correct and frozen, and the defect this
 * stage closes is that the AUTHORITATIVE CONSUMER never called it — not that the validator itself is wrong. So this
 * module RE-EXPORTS it rather than writing a second one.
 *
 * WHY A RE-EXPORT RATHER THAN A DIRECT IMPORT AT EVERY CALL SITE. It gives this stage a single named place where the
 * validator's identity is declared, so a reader can see which validator is on the authoritative path, and so the
 * execution closure covers the reuse explicitly. There is exactly ONE envelope-validity implementation in the
 * repository, and `validated-cost-bridge.mjs` consumes it.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import {
  ARTIFACT_ENVELOPE,
  ARTIFACT_VALIDITY_STATES,
  NL,
} from '../r3l0ciarlcfs/contract.mjs';
import {
  measureValidatedArtifact,
  validateArtifactEnvelope,
  validityState,
} from '../r3l0ciarlcfs/artifact-validity.mjs';

/** §3: the validator's source, named so a report can state which implementation is authoritative. */
export const ARTIFACT_VALIDATOR_SOURCE = Object.freeze({
  module: 'scripts/r3l0ciarlcfs/artifact-validity.mjs',
  function: 'validateArtifactEnvelope',
  consumedBy: 'scripts/r3l0ciarlcfsh/validated-cost-bridge.mjs validatedCostBridge',
  restatedHere: false,
  secondImplementationCreated: false,
});

/** §3: whether a validity state is one this stage treats as an INVALID (not merely absent) observation. */
export function isInvalidMeasurementState(state) {
  return state === 'UNREADABLE' || state === 'MALFORMED' || state === 'ENVELOPE_INVALID' || state === 'COMPLETION_NOT_OBSERVED';
}

export { ARTIFACT_ENVELOPE, ARTIFACT_VALIDITY_STATES, NL, validateArtifactEnvelope, validityState };
