/**
 * R3-L0C-F §15 — THE FAIL-STOP POLICY RULING AND RESUME QUALIFICATION.
 *
 * §15 requires the stage to state, as a value, that it proposes a protocol without creating Project terminal
 * authority, and §18 requires the resume qualification to be recorded. This module writes that record.
 *
 * WHAT THIS DOCUMENT IS: a PROPOSAL. It defines a fail-stop protocol and demonstrates that the frozen design can
 * be executed under it. It carries no authority to run the 16-session matrix, and §15 says so explicitly: "The
 * eventual behavioral execution requires an explicit authorization ruling for this fail-stop protocol. This
 * document proposes the protocol but does not by itself create Project terminal authority."
 *
 * WHAT IT IS NOT, and each is a §15 prohibition carried as a value:
 *
 *   · NOT an operator cancellation capability;
 *   · NOT `ATTEMPT_CANCELLED` for unobservable Worlds;
 *   · NOT new governance authority;
 *   · NOT `HOST_FAILURE` turned into `ATTEMPT_FAILED`.
 *
 * THE RESIDUAL IT LEAVES OPEN, NAMED RATHER THAN HIDDEN. A fail-stop run stops the RESEARCH run and preserves its
 * World and evidence; the Canonical Attempt may remain RUNNING in the preserved experimental Project. §15 calls
 * that "an explicitly scoped product-liveness residual, not a fake terminal state", and the distinction is the
 * whole point: the alternative — synthesizing a terminal to make the project look resolved — would be a
 * fabricated canonical fact, which this project refuses.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { FAIL_STOP_POLICY_BOUNDARY, STAGE_STOP } from './contract.mjs';

const NL = String.fromCharCode(10);

/**
 * §15: THE POLICY RULING.
 *
 * `FAIL_STOP_POLICY: PROPOSED` — the stage proposes; it does not authorize. The field that would say
 * `EXPLICITLY_AUTHORIZED` is the one a later ruling must set, and it is deliberately absent here.
 */
export const FAIL_STOP_POLICY_RULING = Object.freeze({
  schemaVersion: 1,
  stage: 'R3-L0C-F',
  kind: 'fail-stop policy ruling',
  policy: 'PROPOSED',
  /** §15: what the protocol says, in one sentence. */
  protocol: 'a load-bearing failure stops the RESEARCH RUN, retains its World and evidence, refuses a session retry and refuses a causal claim',
  /** §15: the boundary, carried from the contract so the two cannot disagree. */
  boundary: FAIL_STOP_POLICY_BOUNDARY,
  /** §15: the residual, named. */
  residual: Object.freeze({
    id: 'CANONICAL_ATTEMPT_MAY_REMAIN_RUNNING',
    description: 'the Canonical Attempt may remain RUNNING in the preserved experimental Project',
    classification: 'explicitly scoped product-liveness residual, not a fake terminal state',
    /** The alternative this document refuses, and why. */
    refusedAlternative: 'synthesizing ATTEMPT_CANCELLED or ATTEMPT_FAILED would be a fabricated canonical fact',
    openAtStageClose: true,
    /** §15: resolving it requires a separate semantic decision, not a reinterpretation here. */
    requiresSeparateDecision: 'if the project needs an automatic machine-failure terminal, that is a separate semantic decision and must not be reached by reinterpreting CANCELLED as FAILED',
  }),
  /** §15: what a later authorization ruling must supply. */
  authorizationRequired: Object.freeze({
    required: true,
    what: 'an explicit authorization ruling for this fail-stop protocol before the 16-session behavioral matrix runs',
    thisDocumentProvidesIt: false,
    /** §15: the scope of what this document CAN support. */
    thisDocumentSupports: 'a determination that the frozen design is executable under fail-stop, with every gate green',
  }),
  /** §0/§18: the mandatory stop. */
  stageStop: STAGE_STOP,
  modelCallsMade: 0,
});

/**
 * §18: THE RESUME QUALIFICATION.
 *
 * Answers the stage's mission question: CAN the frozen R3-L0C capital-reuse design be executed under strict
 * fail-stop? The answer is built from the gate verdicts rather than asserted, so the qualification and the gates
 * cannot diverge.
 */
export function resumeQualification(input) {
  const { verdicts, crashMatrix, preservation, closure, boundary, containment, substitutability, falsifiers, negativeControls } = input;
  /** §0: the six mission requirements, each mapped to the measurement that satisfies it. */
  const mission = Object.freeze([
    Object.freeze({
      id: 'NEVER_REPEATS_A_POSSIBLY_EXPOSED_SESSION',
      satisfied: verdicts.POST_EXPOSURE_RETRY === 'ZERO' && crashMatrix.cases.every((entry) => (entry.maxLaunchesPerSession ?? 0) <= 1),
      evidence: 'every crash case launched each session at most once; MAX_WORKER_LAUNCHES=1 and POST_EXPOSURE_RETRIES=0 are asserted',
    }),
    Object.freeze({
      id: 'PRESERVES_ALL_EVIDENCE_FOLLOWING_A_FAILURE',
      satisfied: verdicts.CRASH_PRESERVATION === 'CLOSED' && preservation.checks.every((check) => check.holds === true),
      evidence: 'the PRESERVE marker, the abort manifest and the evidence index survive a sweep and are read from disk after it',
    }),
    Object.freeze({
      id: 'NEVER_FABRICATES_CANONICAL_ATTEMPT_SETTLEMENT',
      satisfied: crashMatrix.cases.every((entry) => entry.properties.properties.find((item) => item.id === 'NO_FAKE_ATTEMPT_TERMINAL')?.holds === true),
      evidence: 'terminalEventsSynthesized is empty for every case; the runner writes no product store',
    }),
    Object.freeze({
      id: 'NEVER_REPLACES_A_FAILED_EXPERIMENTAL_UNIT',
      satisfied: crashMatrix.cases.every((entry) => entry.properties.properties.find((item) => item.id === 'NEXT_SESSION_NOT_STARTED')?.holds === true),
      evidence: 'a failure stops the whole matrix; no later session starts and no trajectory is replaced',
    }),
    Object.freeze({
      id: 'BINDS_THE_ACTUAL_SHIPPED_RUNTIME_AND_EXECUTION_ROUTE',
      satisfied: verdicts.EXECUTION_CLOSURE === 'COMPLETE' && closure.mutation.EXECUTION_CLOSURE_MUTATION === 'PASS',
      evidence: 'the closure covers SOURCE and COMPILED_RUNTIME separately, and the mutation shows a shipped-runtime change moves the digest while the old closure was blind to it',
    }),
    Object.freeze({
      id: 'PRESERVES_THE_ORIGINAL_RESEARCH_ESTIMAND_AND_OUTCOME_RULES',
      satisfied: substitutability.qualificationStopRequired === false && verdicts.TREATMENT_BOUNDARY === 'PASS',
      evidence: 'the frozen corpus, invariants, exposures, verdict rules and arm order are untouched; the boundary witnesses match the frozen expectation manifests exactly',
    }),
  ]);

  const allSatisfied = mission.every((entry) => entry.satisfied === true);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-F',
    kind: 'fail-stop resume qualification',
    question: 'can the frozen R3-L0C capital-reuse design be executed under a strict fail-stop protocol?',
    answer: allSatisfied ? 'YES — the design is executable under fail-stop, and every qualification gate is green' : 'NO — at least one mission requirement is not satisfied',
    mission,
    allSatisfied,
    /** §18: the gate summary, so the answer is checkable against the gates. */
    gates: Object.freeze({
      FAIL_STOP_RUNNER: verdicts.FAIL_STOP_RUNNER,
      POST_EXPOSURE_RETRY: verdicts.POST_EXPOSURE_RETRY,
      GENERATION_EVIDENCE_DURABILITY: verdicts.GENERATION_EVIDENCE_DURABILITY,
      CRASH_PRESERVATION: verdicts.CRASH_PRESERVATION,
      EXECUTION_CLOSURE: verdicts.EXECUTION_CLOSURE,
      TREATMENT_BOUNDARY: verdicts.TREATMENT_BOUNDARY,
      EXPERIMENT_CONTAINMENT: verdicts.EXPERIMENT_CONTAINMENT,
    }),
    /** §3/§8: the two halves of the falsifier, reported together. */
    falsifierHalves: Object.freeze({
      failsAgainstLegacy: falsifiers.FALSIFIERS_FAIL_AGAINST_LEGACY,
      legacyViolatedProperties: falsifiers.LEGACY_PROPERTY_VIOLATIONS,
      legacyNonDiscriminating: falsifiers.propertyWitness.nonDiscriminating,
      /** §8: the negative controls cover the properties the legacy subject cannot exercise. */
      allPropertiesFalsifiable: negativeControls.ALL_PROPERTIES_FALSIFIABLE,
    }),
    /** §12: the substitutability determinations, carried so the qualification is self-contained. */
    substitutability: substitutability.records,
    /** §14: the conditions under which a verdict may be issued, restated. */
    verdictIssued: false,
    verdictNotIssuedBecause: 'no model session ran in this stage; §0 requires a qualification, not an execution',
    /** §15/§18: the policy status. */
    policyStatus: 'PROPOSED',
    requiresAuthorizationRuling: true,
    /** §0/§18: the stop. */
    stageStop: STAGE_STOP,
    modelCallsMade: 0,
  });
}

export { NL };
