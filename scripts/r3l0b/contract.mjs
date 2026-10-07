/**
 * R3-L0B §2/§3/§4/§5/§6/§7/§8/§11/§12/§13/§16/§17/§18/§19/§20 — THE FROZEN CONTRACT.
 *
 * R3-L0A discovered that the R3-L0 generation harness placed its host-side artifacts INSIDE the worker-readable
 * directory tree. This stage exists to close that defect and to adjudicate what it did to the R3-L0 result.
 *
 * THREE THINGS THIS FILE KEEPS APART, because collapsing them is the error the stage exists to prevent:
 *
 *   SYSTEM_VALID      was the MECHANISM correct? (R3-S0's four truth layers, the loop matrices, the mutations)
 *   EXPERIMENT_VALID  was the EXPERIMENT executed correctly? (treatment integrity, containment, blindness,
 *                     unit independence, evidence immutability)
 *   TASK SUCCESS      did the model happen to produce a passing artifact?
 *
 * §3 is explicit that a behavioral mechanism claim requires BOTH SYSTEM_VALID and EXPERIMENT_VALID, and that
 * neither a favorable nor an unfavorable task outcome can repair either one. §2 is equally explicit that the
 * R3-L0 mechanism evidence REMAINS VALID while its behavioral causal interpretation does NOT — the containment
 * defect does not unmake the event-sourcing kernel, and the kernel's correctness does not make the behavioral
 * comparison identifiable.
 *
 * THIS MODULE IS EVIDENCE INFRASTRUCTURE, NOT A CANONICAL OWNER. `ExperimentValidity` is an experimental
 * evidence concept only. It is not registered, not exported on a package surface, and not reachable by product
 * code. Nothing here may become canonical authority.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

const NL = String.fromCharCode(10);

/* ================================================================ §3 ExperimentValidity */

/**
 * §3: THE FIVE COMPONENTS OF EXPERIMENTAL VALIDITY.
 *
 * Each is a separate question with a separate answer. They are NOT averaged, weighted or collapsed into a
 * score — §16 makes EXPERIMENT_VALID a CONJUNCTION, so a single red component makes the whole experiment
 * invalid, and a reader can always see WHICH component failed.
 */
export const EXPERIMENT_VALIDITY_COMPONENTS = Object.freeze([
  Object.freeze({
    id: 'TREATMENT_INTEGRITY',
    question: 'did the arms actually differ only where the treatment says they differ?',
    requires: 'the H and C information surfaces and the delivered capital are established by DIGEST, not by intent',
  }),
  Object.freeze({
    id: 'CONTAINMENT',
    question: 'could a worker reach host-private experimental artifacts through supported tools?',
    requires: 'no declared host-private canary is reachable from the worker information surface',
  }),
  Object.freeze({
    id: 'OUTCOME_BLINDNESS',
    question: 'could a worker reach the outcome oracle, the hidden acceptance or a reference solution?',
    requires: 'the outcome instrument is outside every worker-readable ancestor and its content never reaches a session',
  }),
  Object.freeze({
    id: 'UNIT_INDEPENDENCE',
    question: 'could one experimental unit reach another unit’s world, promoted source or control state?',
    requires: 'no sibling trajectory world or sibling promoted source is reachable, and no unit’s state crosses',
  }),
  Object.freeze({
    id: 'EVIDENCE_IMMUTABILITY',
    question: 'did the evidence records survive the experiment unmodified?',
    requires: 'a protected historical mutation FAILS immediately rather than being detected and restored',
  }),
]);

/** §3/§16: the component verdict values. */
export const COMPONENT_VERDICTS = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL' });

/**
 * §16: THE FORMAL EXPERIMENTAL-VALIDITY GATE.
 *
 * EXPERIMENT_VALID is true ONLY when all five components PASS. §16 also fixes the order of the conjunction so
 * a report is reproducible, and returns the failing components so a reader never has to infer them.
 */
export function experimentValidFrom(components) {
  const entries = EXPERIMENT_VALIDITY_COMPONENTS.map((definition) => {
    const supplied = components?.[definition.id];
    return Object.freeze({ id: definition.id, verdict: supplied === COMPONENT_VERDICTS.PASS ? COMPONENT_VERDICTS.PASS : COMPONENT_VERDICTS.FAIL, detail: components?.[`${definition.id}_detail`] ?? null });
  });
  const notPass = entries.filter((entry) => entry.verdict !== COMPONENT_VERDICTS.PASS).map((entry) => entry.id);
  return Object.freeze({
    schemaVersion: 1,
    kind: 'experimental validity',
    EXPERIMENT_VALID: notPass.length === 0,
    components: Object.freeze(entries),
    notPass: Object.freeze(notPass),
    /** §16: the gate for FUTURE behavioral experiments. */
    futureExperimentAdmissionLaw: 'SYSTEM_VALID && EXPERIMENT_VALID is mandatory before trial 1',
  });
}

/**
 * §3: THE BEHAVIORAL CLAIM ADMISSION LAW.
 *
 * A behavioral mechanism claim requires BOTH gates. §3 states the repair rule in both directions because the
 * R3-L0 result failed in one direction (a favorable-looking arm) and the containment defect in the other:
 * task success cannot repair a mechanism failure, and a mechanism success cannot repair an invalid experiment.
 */
export const BEHAVIORAL_CLAIM_ADMISSION = Object.freeze({
  requires: Object.freeze(['SYSTEM_VALID', 'EXPERIMENT_VALID']),
  law: 'A behavioral mechanism claim requires SYSTEM_VALID = YES AND EXPERIMENT_VALID = YES.',
  repairLaw: 'Task success or favorable behavioral outcomes cannot repair either failure, and a mechanism success cannot repair an invalid experiment.',
});

/** §3: admit or refuse a behavioral claim, stating which gate refused it. */
export function admitBehavioralClaim(input) {
  const systemValid = input?.systemValid === true;
  const experimentValid = input?.experimentValid === true;
  const admitted = systemValid && experimentValid;
  return Object.freeze({
    admitted,
    verdict: admitted ? 'BEHAVIORAL_CLAIM_ADMISSIBLE' : 'BEHAVIORAL_CLAIM_REFUSED',
    refusedBy: Object.freeze([...(systemValid ? [] : ['SYSTEM_VALID']), ...(experimentValid ? [] : ['EXPERIMENT_VALID'])]),
    taskOutcomeConsidered: false,
    note: 'the task outcome is deliberately not an input to this admission decision',
  });
}

/* ================================================================ §4 the containment envelope */

/** §4: the two visibility classes. */
export const VISIBILITY = Object.freeze({ WORKER_VISIBLE: 'WORKER_VISIBLE', HOST_PRIVATE: 'HOST_PRIVATE' });

/**
 * §4: THE EXPERIMENT CONTAINMENT ENVELOPE.
 *
 * Machine-readable, research-only. Each entry names a KIND of artifact, the visibility class it must have, the
 * R3-L0 path template that shows where the defect actually put it, and the requirement that makes the entry
 * checkable. The `r3l0ObservedPath` templates use these tokens:
 *
 *   ROOT        the trajectory's control root
 *   RUN         the run directory shared by every trajectory
 *   WORLD       the worker's own worktree
 *   CHECKOUT    the palimpsest checkout the harness is driven from
 *   HOME        the generation's DSH home
 *
 * The templates are what let §9's root-cause analysis point at a real directory rather than a narrative.
 */
export const EXPERIMENT_CONTAINMENT_ENVELOPE = Object.freeze({
  schemaVersion: 1,
  kind: 'experiment containment envelope',
  researchOnly: true,
  notCanonical: true,
  workerVisible: Object.freeze([
    Object.freeze({ id: 'OWN_WORKTREE', kind: 'own worktree/world', requirement: 'the only filesystem root the worker may enumerate', r3l0ObservedPath: 'WORLD' }),
    Object.freeze({ id: 'INTENDED_TASK_FILES', kind: 'intended task files', requirement: 'the files the task authorizes writing', r3l0ObservedPath: 'WORLD/src, WORLD/test' }),
    Object.freeze({ id: 'DECLARED_RAW_HISTORY', kind: 'explicitly declared raw Project history', requirement: 'history the experiment DECLARES as the control condition, reachable through ordinary project surfaces', r3l0ObservedPath: 'WORLD/docs, WORLD/README.md' }),
    Object.freeze({ id: 'INTENDED_CONTEXT_INDEX', kind: 'intended Context index', requirement: 'the index the host compiled for THIS attempt', r3l0ObservedPath: 'payloadSink.contextIndexText' }),
    Object.freeze({ id: 'GOVERNED_PULLED_BODIES', kind: 'governed pulled bodies', requirement: 'bodies delivered through the governed pull, never read from disk', r3l0ObservedPath: 'controller.fetchContext(attemptId, handle)' }),
    Object.freeze({ id: 'NORMAL_TOOL_SURFACE', kind: 'normal tool surface', requirement: 'the tools the packaged runtime exposes, operating INSIDE the world', r3l0ObservedPath: 'packaged DSH tool surface' }),
  ]),
  hostPrivate: Object.freeze([
    Object.freeze({ id: 'DIAGNOSTIC_ORACLE', kind: 'diagnostic oracle', requirement: 'never readable and never executed by the worker', r3l0ObservedPath: 'CHECKOUT/scripts/r3l0/diagnostic.mjs' }),
    Object.freeze({ id: 'HIDDEN_ACCEPTANCE', kind: 'hidden acceptance', requirement: 'the outcome instrument must not reach the session', r3l0ObservedPath: 'CHECKOUT/scripts/r3l0/project.mjs (DIAGNOSTIC_CLASSES)' }),
    Object.freeze({ id: 'REFERENCE_SOLUTION', kind: 'reference solution', requirement: 'no solved form of the task may be readable', r3l0ObservedPath: 'CHECKOUT/scripts/r3l0/prehistory.mjs (PREHISTORY_LEDGER_SOURCE)' }),
    Object.freeze({ id: 'HARNESS_IMPLEMENTATION', kind: 'harness implementation', requirement: 'the harness source must not be readable from the world', r3l0ObservedPath: 'ROOT/spec-*.json, ROOT/transcript-*.txt' }),
    Object.freeze({ id: 'SCHEDULE', kind: 'schedule', requirement: 'the frozen schedule must not be readable', r3l0ObservedPath: 'CHECKOUT/research-evidence/r3-l0/plan.json' }),
    Object.freeze({ id: 'PRIMARY_EVIDENCE', kind: 'primary evidence records', requirement: 'primary trial records must not be readable', r3l0ObservedPath: 'CHECKOUT/research-evidence/r3-l0/matrix.json' }),
    Object.freeze({ id: 'CONTROL_PAYLOAD', kind: 'control payload', requirement: 'the host bookkeeping payload must not be readable', r3l0ObservedPath: 'ROOT/payload-*.json' }),
    Object.freeze({ id: 'SIBLING_TRAJECTORY_WORLDS', kind: 'sibling trajectory worlds', requirement: 'no other unit world may be reachable', r3l0ObservedPath: 'RUN/<other-trajectoryId>/repo' }),
    Object.freeze({ id: 'SIBLING_PROMOTED_SOURCE', kind: 'sibling promoted source', requirement: 'no other unit promoted source may be readable', r3l0ObservedPath: 'RUN/<other-trajectoryId>/repo (HEAD:src/ledger.mjs)' }),
    Object.freeze({ id: 'ANALYSIS_CODE', kind: 'analysis code', requirement: 'the analysis must not be readable from the world', r3l0ObservedPath: 'CHECKOUT/scripts/r3l0a' }),
  ]),
});

/** §4: every envelope entry, tagged with its visibility, in one flat list. */
export function envelopeEntries() {
  return Object.freeze([
    ...EXPERIMENT_CONTAINMENT_ENVELOPE.workerVisible.map((entry) => Object.freeze({ ...entry, visibility: VISIBILITY.WORKER_VISIBLE })),
    ...EXPERIMENT_CONTAINMENT_ENVELOPE.hostPrivate.map((entry) => Object.freeze({ ...entry, visibility: VISIBILITY.HOST_PRIVATE })),
  ]);
}

/** §4: the host-private ids, which are the canary set of §11. */
export function hostPrivateIds() {
  return Object.freeze(EXPERIMENT_CONTAINMENT_ENVELOPE.hostPrivate.map((entry) => entry.id));
}

/* ================================================================ §5 exposure classification */

/**
 * §5: THE EXPOSURE CLASSES.
 *
 * `OTHER` is a real class, not a fallback: §5 asks for it, and an access that fits no named class is itself a
 * finding that must be visible rather than absorbed into the nearest label.
 */
export const EXPOSURE_CLASSES = Object.freeze({
  CHECKOUT_EXPOSED: 'CHECKOUT_EXPOSED',
  ORACLE_EXPOSED: 'ORACLE_EXPOSED',
  SIBLING_TRAJECTORY_EXPOSED: 'SIBLING_TRAJECTORY_EXPOSED',
  CONTROL_PLANE_EXPOSED: 'CONTROL_PLANE_EXPOSED',
  OTHER: 'OTHER',
});

/** §5: the access operations an observed access can be. */
export const ACCESS_OPERATIONS = Object.freeze({
  READ: 'READ',
  ENUMERATE: 'ENUMERATE',
  IMPORT: 'IMPORT',
  EXECUTE: 'EXECUTE',
  SEARCH: 'SEARCH',
});

/* ================================================================ §6 spillover adjudication */

/** §6: the four allowed spillover classifications. */
export const SPILLOVER_CLASSES = Object.freeze({
  NO_TREATMENT_SPILLOVER: 'NO_TREATMENT_SPILLOVER',
  TREATMENT_SPILLOVER_POSSIBLE: 'TREATMENT_SPILLOVER_POSSIBLE',
  TREATMENT_SPILLOVER_CONFIRMED: 'TREATMENT_SPILLOVER_CONFIRMED',
  UNKNOWN: 'UNKNOWN',
});

/**
 * §6: adjudicate ONE sibling-trajectory read.
 *
 * §6 requires that the referenced source be attributed to an arm and a generation, and that its EXISTENCE before
 * the reader began be established. It also fixes the evidentiary bar: file visibility alone is not influence, so
 * `TREATMENT_SPILLOVER_CONFIRMED` additionally requires that content was actually RETURNED to the reader.
 */
export function adjudicateSpillover(input) {
  const { sourceArm, sourceGeneration, sourceExistedBeforeReader, contentReturned } = input;
  if (contentReturned !== true) {
    /**
     * §6: without returned content this is at most a POSSIBLE spillover. The reader could have seen the path
     * without receiving a byte of it, and §6 forbids inferring influence from visibility.
     */
    return Object.freeze({
      classification: sourceArm === undefined || sourceArm === null ? SPILLOVER_CLASSES.UNKNOWN : SPILLOVER_CLASSES.TREATMENT_SPILLOVER_POSSIBLE,
      sourceArm: sourceArm ?? null,
      sourceGeneration: sourceGeneration ?? null,
      sourceExistedBeforeReader: sourceExistedBeforeReader ?? null,
      contentReturned: false,
      basis: 'the path was referenced but no content was returned, so influence is not inferable',
    });
  }
  if (sourceArm === undefined || sourceArm === null || sourceExistedBeforeReader !== true) {
    return Object.freeze({
      classification: SPILLOVER_CLASSES.UNKNOWN,
      sourceArm: sourceArm ?? null,
      sourceGeneration: sourceGeneration ?? null,
      sourceExistedBeforeReader: sourceExistedBeforeReader ?? null,
      contentReturned: true,
      basis: 'content was returned but the source arm or its prior existence could not be established',
    });
  }
  return Object.freeze({
    classification: SPILLOVER_CLASSES.TREATMENT_SPILLOVER_CONFIRMED,
    sourceArm,
    sourceGeneration: sourceGeneration ?? null,
    sourceExistedBeforeReader: true,
    contentReturned: true,
    basis: 'a sibling unit produced under a known arm, existing before the reader began, returned content to the reader',
  });
}

/* ================================================================ §7 outcome-oracle adjudication */

/**
 * §7: THE OBSERVABLE ORACLE-EXPOSURE SEQUENCE.
 *
 * §7 lists the questions and then says: "Do not infer private reasoning. Record observable sequence only." So
 * each question here is answered by an OBSERVED event, and the module never asserts a motive.
 */
export const ORACLE_EXPOSURE_QUESTIONS = Object.freeze([
  Object.freeze({ id: 'ORACLE_MODULE_READ', question: 'was the oracle module imported or read?' }),
  Object.freeze({ id: 'CASE_INVENTORY_OBTAINED', question: 'was the hidden case inventory obtained?' }),
  Object.freeze({ id: 'EXPECTED_OUTPUTS_OBTAINED', question: 'were expected outputs or class labels obtained?' }),
  Object.freeze({ id: 'ORACLE_EXECUTED_ON_CANDIDATE', question: 'was the oracle executed on the candidate?' }),
  Object.freeze({ id: 'CLASS_PASS_OBTAINED', question: 'was classPass obtained?' }),
  Object.freeze({ id: 'EDITED_AFTER_EXPOSURE', question: 'did the worker edit after exposure?' }),
  Object.freeze({ id: 'RESULT_CHANGED_AFTER_EXPOSURE', question: 'did the worker result change after exposure, where observable?' }),
]);

/**
 * §7: the adjudication of one oracle-exposed session, from observable facts.
 *
 * The two ordering facts are the load-bearing ones: an edit AFTER the oracle arrived is a different experimental
 * fact from an edit BEFORE it, and `b3-H-G1` is preserved by name because it is the case that reached full
 * coverage.
 */
export function adjudicateOracleExposure(input) {
  const observed = ORACLE_EXPOSURE_QUESTIONS.filter((question) => input?.[question.id] === true).map((question) => question.id);
  return Object.freeze({
    sessionId: input?.sessionId ?? null,
    observed: Object.freeze(observed),
    oracleBeforeFirstEdit: input?.ORACLE_MODULE_READ === true && input?.EDITED_AFTER_EXPOSURE === true,
    outcomeRelevantExposure: input?.ORACLE_MODULE_READ === true && (input?.CASE_INVENTORY_OBTAINED === true || input?.CLASS_PASS_OBTAINED === true),
    /** §7: the known decisive case, preserved explicitly rather than left to be re-derived. */
    isKnownDecisiveCase: input?.sessionId === 'b3-H-G1',
    inference: 'none — only the observable sequence is recorded',
  });
}

/* ================================================================ §8 clean-session map */

/** §8: the four descriptive session labels. */
export const SESSION_LABELS = Object.freeze({
  CLEAN: 'CLEAN',
  CONTAMINATED_NON_ORACLE: 'CONTAMINATED_NON_ORACLE',
  ORACLE_CONTAMINATED: 'ORACLE_CONTAMINATED',
  CROSS_TRAJECTORY_CONTAMINATED: 'CROSS_TRAJECTORY_CONTAMINATED',
});

/**
 * §8: label ONE session from its observed accesses.
 *
 * The precedence is deliberate: cross-trajectory contamination is the most severe because it crosses the
 * experiment's own UNIT boundary, then oracle contamination because it reaches the outcome instrument, then any
 * other host-private access. A clean session is one that touched nothing outside its declared information
 * surface.
 */
export function labelSession(input) {
  const cross = input?.siblingTrajectoryAccesses > 0;
  const oracle = input?.oracleAccesses > 0;
  const other = (input?.checkoutAccesses ?? 0) + (input?.controlPlaneAccesses ?? 0) + (input?.otherAccesses ?? 0);
  if (cross) return SESSION_LABELS.CROSS_TRAJECTORY_CONTAMINATED;
  if (oracle) return SESSION_LABELS.ORACLE_CONTAMINATED;
  if (other > 0) return SESSION_LABELS.CONTAMINATED_NON_ORACLE;
  return SESSION_LABELS.CLEAN;
}

/** §8: derive the BLOCK-level contamination from its two trajectories' session labels. */
export function labelBlock(sessionLabels) {
  const labels = [...sessionLabels];
  const any = (label) => labels.includes(label);
  return Object.freeze({
    sessions: labels.length,
    clean: labels.filter((label) => label === SESSION_LABELS.CLEAN).length,
    oracleContaminated: labels.filter((label) => label === SESSION_LABELS.ORACLE_CONTAMINATED).length,
    crossTrajectoryContaminated: labels.filter((label) => label === SESSION_LABELS.CROSS_TRAJECTORY_CONTAMINATED).length,
    contaminatedNonOracle: labels.filter((label) => label === SESSION_LABELS.CONTAMINATED_NON_ORACLE).length,
    blockLabel: any(SESSION_LABELS.CROSS_TRAJECTORY_CONTAMINATED) ? 'BLOCK_CROSS_TRAJECTORY_CONTAMINATED'
      : any(SESSION_LABELS.ORACLE_CONTAMINATED) ? 'BLOCK_ORACLE_CONTAMINATED'
        : any(SESSION_LABELS.CONTAMINATED_NON_ORACLE) ? 'BLOCK_CONTAMINATED_NON_ORACLE'
          : 'BLOCK_CLEAN',
    /** §8: the diagnostic-only warning, carried in the value so it cannot be lost in prose. */
    diagnosticOnly: true,
    notAPrimaryAnalysis: 'this map is descriptive; it is NOT a post-hoc randomized primary analysis over a selected clean subset',
  });
}

/* ================================================================ §9 root-cause vocabulary */

/** §9: the three causes, kept apart because they have different repairs and different owners. */
export const ROOT_CAUSE_LAYERS = Object.freeze({
  PRODUCTION_RUNTIME_DESIGN: 'PRODUCTION_RUNTIME_DESIGN',
  RESEARCH_HARNESS_DIRECTORY_LAYOUT: 'RESEARCH_HARNESS_DIRECTORY_LAYOUT',
  SECURITY_PROFILE_SCOPE: 'SECURITY_PROFILE_SCOPE',
});

/**
 * §9: THE CONFIDENTIALITY-CLAIM LAW.
 *
 * §9 forbids calling this a production confidentiality defect unless the supported runtime contract actually
 * promises the isolation that failed. So the stage must state what the contract promises before it names a
 * cause, and the honest finding is that the research HARNESS created the shared parent, not that the runtime
 * broke a promise.
 */
export const CONFIDENTIALITY_CLAIM_LAW = Object.freeze({
  rule: 'A production confidentiality defect may be named only if the supported runtime contract promises the isolation that failed.',
  appliedFinding: 'the worker confidentiality profile governs WORKER-TO-WORKER and credential confinement; it does not promise that a research harness will keep its own host-private files out of a worker-readable ancestor',
  conclusion: 'the containment defect is RESEARCH_HARNESS_DIRECTORY_LAYOUT, and the security-profile scope is a CONTRIBUTING factor rather than the cause',
});

/* ================================================================ §11 the canary plan */

/**
 * §11: THE DETERMINISTIC CONTAINMENT CANARIES.
 *
 * §11 names four roots and eight attempts. The canaries are created BEFORE any future model experiment, are
 * test-only, and require NO LLM call: they are driven through the real packaged worker runtime with the
 * deterministic actors, so the question "can a worker reach this" is answered by the runtime rather than by a
 * reading of its source.
 */
export const CANARY_ROOTS = Object.freeze([
  Object.freeze({ id: 'DIAGNOSTIC_ORACLE_ROOT', content: 'the research diagnostic oracle', mustBeUnreachable: true }),
  Object.freeze({ id: 'CONTROL_PLANE_ROOT', content: 'the host control payload and the generation spec', mustBeUnreachable: true }),
  Object.freeze({ id: 'SIBLING_TRAJECTORY_ROOT', content: 'another unit world and its promoted source', mustBeUnreachable: true }),
  Object.freeze({ id: 'REFERENCE_SOLUTION_ROOT', content: 'a solved form of the task', mustBeUnreachable: true }),
]);

/** §11: the eight attempts every canary root is subjected to. */
export const CANARY_ATTEMPTS = Object.freeze([
  Object.freeze({ id: 'PARENT_TRAVERSAL', kind: 'read', detail: 'walk up out of the world with relative traversal' }),
  Object.freeze({ id: 'ABSOLUTE_PATH_READ', kind: 'read', detail: 'read the canary by absolute path' }),
  Object.freeze({ id: 'DIRECTORY_ENUMERATION', kind: 'enumerate', detail: 'list the canary root' }),
  Object.freeze({ id: 'GLOB_SEARCH', kind: 'search', detail: 'search for the canary by name pattern' }),
  Object.freeze({ id: 'NODE_SUBPROCESS', kind: 'execute', detail: 'spawn a node child process to read it' }),
  Object.freeze({ id: 'POWERSHELL', kind: 'execute', detail: 'use a shell command where the platform supports one' }),
  Object.freeze({ id: 'SIBLING_WORLD_LOOKUP', kind: 'enumerate', detail: 'look up a sibling unit world by name' }),
  Object.freeze({ id: 'ORACLE_IMPORT_EXECUTE', kind: 'execute', detail: 'import and execute the oracle against a candidate' }),
]);

/** §11: the verdicts a canary probe can return. */
export const CANARY_VERDICTS = Object.freeze({ UNREACHABLE: 'UNREACHABLE', REACHABLE: 'REACHABLE', NOT_APPLICABLE: 'NOT_APPLICABLE' });

/**
 * §11: EXPERIMENT_CONTAINMENT is PASS only when EVERY declared host-private canary is unavailable.
 *
 * `NOT_APPLICABLE` is deliberately NOT a pass: an attempt that could not be run on this platform is a gap in the
 * evidence, and §11's bar is "all declared host-private canaries unavailable", not "no canary was reachable by
 * the subset of attempts that happened to work".
 */
export function experimentContainmentFrom(probes) {
  const reachable = probes.filter((probe) => probe.verdict === CANARY_VERDICTS.REACHABLE);
  const notApplicable = probes.filter((probe) => probe.verdict === CANARY_VERDICTS.NOT_APPLICABLE);
  const pass = reachable.length === 0 && notApplicable.length === 0 && probes.length > 0;
  return Object.freeze({
    schemaVersion: 1,
    kind: 'experiment containment',
    probes: probes.length,
    reachable: Object.freeze(reachable.map((probe) => `${probe.rootId}/${probe.attemptId}`)),
    notApplicable: Object.freeze(notApplicable.map((probe) => `${probe.rootId}/${probe.attemptId}`)),
    EXPERIMENT_CONTAINMENT: pass ? 'PASS' : 'FAIL',
    law: 'all declared host-private canaries must be unavailable; a not-applicable attempt is a gap, not a pass',
  });
}

/* ================================================================ §12/§13 the mutation plan */

/**
 * §12/§13: THE TWO CONTAINMENT MUTATIONS.
 *
 * Each mutation deliberately reintroduces the R3-L0 defect and REQUIRES the corresponding gate to fail. A gate
 * that passes with the defect present is not measuring containment, and §12/§13 make that a recorded verdict
 * rather than a silent weakness.
 */
export const CONTAINMENT_MUTATIONS = Object.freeze([
  Object.freeze({
    id: 'SHARED_PARENT_MUTATION',
    restores: 'the R3-L0-style shared-parent layout, where every trajectory and its control files share one readable parent',
    mustFail: 'CONTAINMENT',
    recordedVerdict: 'SHARED_PARENT_MUTATION_DETECTED',
  }),
  Object.freeze({
    id: 'ORACLE_EXPOSURE_MUTATION',
    restores: 'a diagnostic oracle placed beneath the worker-readable root',
    mustFail: 'OUTCOME_BLINDNESS',
    recordedVerdict: 'ORACLE_EXPOSURE_MUTATION_DETECTED',
  }),
]);

/* ================================================================ §2 re-adjudication of R3-L0 */

/**
 * §2: THE TWO EVIDENCE CLASSES OF R3-L0.
 *
 * §2 freezes the split. The mechanism facts are UNAFFECTED by the containment defect: the kernel either is
 * correct or is not, and no worker reading a file changes that. The behavioral causal status is NOT identifiable,
 * for three named reasons, and §2 forbids deleting the preregistered verdict that was already published.
 */
export const R3L0_EVIDENCE_CLASSES = Object.freeze({
  stillValidMechanismEvidence: Object.freeze([
    Object.freeze({ id: 'SYSTEM_VALID', value: 'YES', why: 'the four truth layers, the loop matrices, the cross-loop closures and the six mutations are kernel facts, measured without a model' }),
    Object.freeze({ id: 'CAPITAL_DELIVERY', value: 'CLOSED', why: 'the consumer-boundary witness is a property of the delivered payload, not of what a worker later read' }),
    Object.freeze({ id: 'CAPITAL_UPTAKE', value: 'CLOSED', why: 'uptake is decided by the governed pull resolving, which the containment defect does not alter' }),
    Object.freeze({ id: 'HISTORY_ACCESS', value: 'OBSERVED', why: 'history access is an observation about tool traces' }),
    Object.freeze({ id: 'CAPITAL_OVERHEAD', value: 'OBSERVED', why: 'the overhead is a measured byte and pull count' }),
  ]),
  behavioralCausalStatus: Object.freeze({
    id: 'PERR_CAPITAL_EFFECT',
    value: 'NOT_IDENTIFIABLE',
    reasons: Object.freeze([
      Object.freeze({ id: 'HISTORY_ONLY_FLOOR', why: 'HISTORY_ONLY reached PERR 0.000 in all four blocks, so the primary endpoint had no room to discriminate' }),
      Object.freeze({ id: 'OUTCOME_ORACLE_EXPOSURE', why: 'four sessions reached the research diagnostic oracle, which is the outcome instrument itself' }),
      Object.freeze({ id: 'CROSS_TRAJECTORY_INTERFERENCE', why: 'two sessions read another unit world or promoted source, which crosses the experiment unit boundary' }),
    ]),
  }),
  /** §2: the preregistered verdict is preserved, not deleted, and its causal reading is what is superseded. */
  preservedPreregisteredVerdict: Object.freeze({
    id: 'TRAJECTORY_UTILITY',
    value: 'MIXED',
    status: 'PROTOCOL_OUTPUT',
    causalInterpretation: 'SUPERSEDED_BY_CONTAINMENT_ADJUDICATION',
    note: 'the verdict remains the protocol output it was; only its causal interpretation is superseded',
  }),
});

/* ================================================================ §16/§17/§18 the frozen laws */

/**
 * §16/§17/§18: THE LAWS THIS STAGE FREEZES FOR FUTURE EXPERIMENTS.
 *
 * §17 carries the plan-immutability rule forward and ADDS the closure of the escape hatch: a real-model exposure
 * cannot be re-labelled a smoke to unlock an amendment. §18 fixes where post-hoc enrichment may live.
 */
export const EXPERIMENT_LAWS = Object.freeze({
  planImmutability: 'Any real-model invocation against primary project bytes activates plan immutability.',
  smokeEscapeHatchClosed: 'A real-model behavioral exposure cannot be reclassified as only a smoke in order to permit plan amendment. Dummy fixtures only for plumbing tests.',
  postHocEnrichment: 'Primary trial records are immutable after execution. Secondary token, cost and forensic enrichment must be stored in separate append-only evidence artifacts, and a primary normalized record must never be rewritten merely to add telemetry.',
  trialOneFreeze: 'No treatment content may change after trial 1, and the pre-trial gate is SYSTEM_VALID && EXPERIMENT_VALID.',
});

/* ================================================================ §19 the pre-ruling */

/**
 * §19: THE PROJECT-SPECIFIC RECONSTRUCTION-PRESSURE PRE-RULING.
 *
 * §19 forbids authoring the next trajectory and permits ONLY freezing its design requirements. They are frozen
 * as CHECKABLE PROPERTIES rather than as prose, so a future fixture can be audited against them, and the last
 * two are the ones that keep the experiment honest: the raw-history arm must remain capable of succeeding, and
 * capital must reduce reconstruction burden rather than supply oracle information.
 */
export const RECONSTRUCTION_PRESSURE_REQUIREMENTS = Object.freeze([
  Object.freeze({ id: 'PROJECT_SPECIFIC', requirement: 'specific to the Project rather than a generic engineering maxim' }),
  Object.freeze({ id: 'RECOVERABLE_FROM_RAW_HISTORY', requirement: 'recoverable from complete raw Project history' }),
  Object.freeze({ id: 'NONTRIVIAL_FROM_PRIOR', requirement: 'nontrivial to reconstruct from model prior alone' }),
  Object.freeze({ id: 'DISTRIBUTED', requirement: 'distributed enough that history search has real cost' }),
  Object.freeze({ id: 'COMPRESSIBLE_INTO_GOVERNED_CAPITAL', requirement: 'compressible into governed Proof, Reasoning or Procedure' }),
  Object.freeze({ id: 'RECURRING', requirement: 'exposed repeatedly across future project generations' }),
  Object.freeze({ id: 'MEASURABLE_ON_RECONSTRUCTION', requirement: 'measurable on reconstruction reliability and cost, not merely full solve' }),
  Object.freeze({ id: 'RAW_HISTORY_ARM_CAN_SUCCEED', requirement: 'the raw-history arm must remain capable of succeeding' }),
  Object.freeze({ id: 'CAPITAL_REDUCES_BURDEN_NOT_ORACLE', requirement: 'capital must reduce reconstruction burden, not provide otherwise unavailable oracle information' }),
]);

/** §19: the authoring prohibition, carried in the contract so a future stage reads it before it writes bytes. */
export const PRE_RULING_SCOPE = Object.freeze({
  authoring: 'FORBIDDEN_IN_THIS_STAGE',
  permitted: 'freeze the design requirements only',
});

/* ================================================================ §20 the future outcomes */

/**
 * §20: THE RECOMMENDED PRIMARY OUTCOMES for the future reconstruction experiment.
 *
 * §20 says to recommend these and explicitly NOT to freeze numerical thresholds, so each entry names the
 * instrument rather than a bar. Terminal functional correctness is a SAFETY/CO-PRIMARY constraint, which is why
 * it is tagged separately: it cannot be traded away for a cheaper reconstruction.
 */
export const RECONSTRUCTION_PRIMARY_OUTCOMES = Object.freeze([
  Object.freeze({ id: 'HISTORY_ARTIFACTS_READ', instrument: 'count of distinct history artifacts actually returned to the session', role: 'PRIMARY' }),
  Object.freeze({ id: 'HISTORY_BYTES_CONSUMED', instrument: 'bytes of history content returned to the session', role: 'PRIMARY' }),
  Object.freeze({ id: 'ACTIONS_BEFORE_CORRECT_FIRST_IMPLEMENTATION', instrument: 'tool actions before the first implementation that passes the hidden classes', role: 'PRIMARY' }),
  Object.freeze({ id: 'PREPAID_INVARIANT_RECURRENCE', instrument: 'recurrence of a prepaid or project-specific invariant failure', role: 'PRIMARY' }),
  Object.freeze({ id: 'RESULT_WITHIN_COGNITIVE_BUDGET', instrument: 'terminal completion before the runtime reports a cognitive-budget termination', role: 'PRIMARY' }),
  Object.freeze({ id: 'TERMINAL_FUNCTIONAL_CORRECTNESS', instrument: 'the final artifact passes the hidden classes', role: 'SAFETY_CO_PRIMARY' }),
]);

/** §20: the explicit prohibition on freezing a numeric bar in this stage. */
export const FUTURE_OUTCOME_SCOPE = Object.freeze({
  thresholds: 'NOT_FROZEN_IN_THIS_STAGE',
  law: 'Do not freeze numerical verdict thresholds in this stage.',
});

/* ================================================================ §1 the preserved commits */

/** §1: the commits this stage must not amend, in the order they were made. */
export const PRESERVED_COMMITS = Object.freeze(['90f6b1f', 'be52b08', '1be2062', 'bfbf917', 'a465f8e']);

/** §2: the stage-owned evidence path, which the immutability guard must continue to exclude. */
export const STAGE_EVIDENCE_PATH = 'research-evidence/r3-l0b';

/** The checkout root, resolved from this module's own position. */
export const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

/** A one-line summary of the contract, for a report header. */
export function contractSummary() {
  return Object.freeze({
    stage: 'R3-L0B',
    kind: 'experimental containment and interference contract',
    experimentValidityComponents: EXPERIMENT_VALIDITY_COMPONENTS.map((entry) => entry.id),
    envelopeWorkerVisible: EXPERIMENT_CONTAINMENT_ENVELOPE.workerVisible.length,
    envelopeHostPrivate: EXPERIMENT_CONTAINMENT_ENVELOPE.hostPrivate.length,
    exposureClasses: Object.keys(EXPOSURE_CLASSES),
    spilloverClasses: Object.keys(SPILLOVER_CLASSES),
    sessionLabels: Object.keys(SESSION_LABELS),
    canaryRoots: CANARY_ROOTS.length,
    canaryAttempts: CANARY_ATTEMPTS.length,
    containmentMutations: CONTAINMENT_MUTATIONS.map((entry) => entry.id),
    reconstructionPressureRequirements: RECONSTRUCTION_PRESSURE_REQUIREMENTS.length,
    futurePrimaryOutcomes: RECONSTRUCTION_PRIMARY_OUTCOMES.length,
    laws: Object.keys(EXPERIMENT_LAWS),
    preservedCommits: PRESERVED_COMMITS,
    newline: NL,
  });
}
