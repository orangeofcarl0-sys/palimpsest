/**
 * R3-WR3 — THE FROZEN CONTRACTS AND THE STAGE EVIDENCE RECORD.
 *
 * This module records what R3-WR3 MEASURED, so a later reader gets the findings as data rather than as prose in
 * a report. Every value corresponds to a measurement in `scripts/r3wr3/`, and each names the module that
 * produced it. It writes ONE file under `research-evidence/r3-wr3/` and nothing else: no historical evidence, no
 * frozen corpus, no other stage's record.
 *
 * THE TWO DEFECTS THIS STAGE PROVED, both in production code and both reproduced against a frozen snapshot of
 * the pre-repair implementation:
 *
 *   1  PARENT REPOSITORY ADOPTION. `#worldExists()` asked `git rev-parse --git-dir`, and git DISCOVERS an
 *      enclosing repository. From a directory with no `.git` of its own it exits 0 and names the PARENT, so a
 *      directory that was not a world answered "a repository is here" and the checkout, remote and config calls
 *      that followed ran against the CANONICAL repository. Measured: its HEAD became detached and its commit
 *      identity was overwritten.
 *
 *   2  CANDIDATE HEAD REWIND. `checkout --detach baseCommit` ran on EVERY call, so a second `createWorld` for a
 *      world holding a committed candidate X moved HEAD back to the basis and removed the candidate's files from
 *      the working tree.
 *
 * A third, smaller defect was repaired with them: `remote remove origin` was wrapped in a bare `catch`, so a
 * FAILED removal was indistinguishable from "there was no origin" — and a surviving remote is a path back into
 * the canonical project on a world a strong worker can reach.
 *
 * WHAT R3-WR3 DID NOT FIND, stated because a negative result about a suspected cause is the point of a gate:
 * the sibling-containment failure was a HARNESS-LIFECYCLE defect, not broken confinement. The shipped fence
 * caches its binding-seam resolution including a failure, and the harness set the environment variable AFTER the
 * first fence call, so the declared fence applied nothing. Real confinement was never broken, and the
 * independent R1-H conformance suite (17 PASS / 0 FAIL) confirms it.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from '../r3l0/envelope.mjs';

const NL = String.fromCharCode(10);
export const STAGE_EVIDENCE_PATH = 'research-evidence/r3-wr3';

/** The two escaped defects, with the measurement that establishes each. */
export const ESCAPED_DEFECTS = Object.freeze([
  Object.freeze({
    id: 'R3WR3-D1',
    title: 'parent repository adoption',
    file: 'src/effects/git_port.ts',
    method: 'createWorld / #worldIdentity',
    was: 'reuse was decided by `git rev-parse --git-dir`, which resolves an ENCLOSING repository for a directory that has none of its own',
    whyThatIsDefect: 'the directory is not a world, and the checkout, remote and config calls that followed ran against the canonical repository',
    measuredConsequence: Object.freeze({
      adoptedParentRepository: true,
      canonicalMutated: true,
      symbolicRef: 'refs/heads/master -> DETACHED',
      userName: 'orangeofcarl0 -> Palimpsest Worker',
      userEmail: 'orangeofcarl0@gmail.com -> worker@palimpsest.invalid',
    }),
    is: 'identity resolved by `rev-parse --absolute-git-dir` plus a canonicalized filesystem comparison, asking whether THAT DIRECTORY LIES INSIDE THE WORLD',
    shapesDiscriminated: Object.freeze([
      Object.freeze({ shape: 'isolated world', gitDir: '<world>/.git', verdict: 'ISOLATED_REPOSITORY' }),
      Object.freeze({ shape: 'parent adoption', gitDir: '<canonical>/.git', verdict: 'REFUSED (WORLD_PATH_NOT_ISOLATED)' }),
      Object.freeze({ shape: 'linked worktree', gitDir: '<canonical>/.git/worktrees/<id>', verdict: 'REFUSED (WORLD_IDENTITY_MISMATCH)' }),
    ]),
  }),
  Object.freeze({
    id: 'R3WR3-D2',
    title: 'candidate HEAD rewind',
    file: 'src/effects/git_port.ts',
    method: 'createWorld',
    was: '`checkout --detach baseCommit` ran unconditionally on every call, including a reuse',
    measuredConsequence: Object.freeze({
      head: 'X -> B',
      candidateFile: 'src/candidate-only.mjs DELETED',
      candidateStillReachable: true,
      canonicalUnchanged: true,
    }),
    is: 'the checkout is CONDITIONAL on whether work would be lost: a fresh clone is moved to its basis, a world whose HEAD covers the basis is left alone, and a world on an UNRELATED basis is refused',
  }),
  Object.freeze({
    id: 'R3WR3-D3',
    title: 'unverified remote removal',
    file: 'src/effects/git_port.ts',
    method: 'createWorld / #removeOriginIfPresent',
    was: '`remote remove origin` was wrapped in a bare `catch`, so a FAILED removal was indistinguishable from "there was no origin"',
    whyThatIsDefect: 'a surviving remote is a path back into the canonical project on a world a strong worker can reach, which is what the removal exists to prevent',
    measuredFault: 'a directory at `.git/config.lock` makes `git remote remove` fail with "could not lock config file" while the remote survives and the config stays readable',
    is: 'the remote list is read, every remote is removed with its failure surfaced, and the post-condition is measured: no remaining remote may name the canonical repository',
  }),
]);

/** The replay state matrix, as the ruling enumerates it. */
export const REPLAY_STATE_MATRIX = Object.freeze({
  rowsTotal: 12,
  rowsSatisfied: 12,
  everyRefusalKeptCanonicalIdentical: true,
  everyRefusalKeptWorldInPlace: true,
  rows: Object.freeze([
    Object.freeze({ state: 'World absent', required: 'CREATE_AND_VALIDATE', outcome: 'created' }),
    Object.freeze({ state: 'Complete, correct, clean World', required: 'REUSE_SAFELY', outcome: 'reused' }),
    Object.freeze({ state: 'Complete World with unstaged changes', required: 'PRESERVE_CHANGES', outcome: 'preserved' }),
    Object.freeze({ state: 'Complete World with staged changes', required: 'PRESERVE_INDEX_AND_CHANGES', outcome: 'preserved' }),
    Object.freeze({ state: 'Complete World with untracked files', required: 'PRESERVE_FILES', outcome: 'preserved' }),
    Object.freeze({ state: 'World with committed candidate X', required: 'PRESERVE_HEAD_X', outcome: 'preserved' }),
    Object.freeze({ state: 'Existing directory without own .git', required: 'NEVER_ADOPT_PARENT_REPOSITORY', outcome: 'REFUSED WORLD_PATH_NOT_ISOLATED' }),
    Object.freeze({ state: 'Partial .git / unfinished clone', required: 'FAIL_CLOSED_UNLESS_PROVEN', outcome: 'REFUSED WORLD_PATH_NOT_ISOLATED' }),
    Object.freeze({ state: 'World belonging to another Attempt', required: 'ISOLATED_PER_ATTEMPT', outcome: 'isolated (sibling world byte-identical)' }),
    Object.freeze({ state: 'Wrong requested base', required: 'REJECT_WITHOUT_MUTATION', outcome: 'REFUSED WORLD_BASIS_MISMATCH, work intact' }),
    Object.freeze({ state: 'Broken object store', required: 'FAIL_READINESS_WITHOUT_DESTROYING_WORK', outcome: 'REFUSED WORLD_HEAD_UNRESOLVABLE, world survives' }),
    Object.freeze({ state: 'Unknown repository identity', required: 'FAIL_CLOSED', outcome: 'REFUSED' }),
  ]),
  /** The two facts that must stay distinct, which the matrix proves by producing different codes. */
  distinctRefusals: Object.freeze({
    unresolvableHead: 'WORLD_HEAD_UNRESOLVABLE — a broken borrowed store; the work is still there, so this is a readiness failure',
    basisDisagreement: 'WORLD_BASIS_MISMATCH — HEAD resolves, but not to this basis; moving would discard work built elsewhere',
  }),
});

/** Path confinement, as measured. */
export const PATH_CONFINEMENT = Object.freeze({
  rowsTotal: 15,
  rowsSatisfied: 15,
  junctionProvenLive: true,
  refusedForms: Object.freeze([
    'traversal (.. and ../..)',
    'backslash traversal',
    'forward-slash nesting',
    'backslash nesting',
    'absolute path',
    'drive-qualified path',
    'UNC path',
    'extended-length prefix (\\\\?\\C:\\...)',
    'the canonical repository itself',
    'a sibling repository',
    'a junction at the world path whose target lies outside the root',
    'the empty id',
    'the root itself (.)',
  ]),
  acceptedForms: Object.freeze(['an ordinary deterministic attempt id — the positive control']),
  /** Provenance, stated so the boundary is not overclaimed. */
  provenance: 'worldId is generated by the scheduler as stableEntityId("attempt", key) and every shipped call site passes that, so this is defence in depth against a future caller widening the boundary — NOT a demonstrated user-controlled exploit, which this stage does not claim',
});

/** Effect-level replay through the real Ordarium runtime. */
export const EFFECT_REPLAY = Object.freeze({
  method: 'createPalimpsestEffects over a real SQLite ledger; "the same key" read from the runtime, where the logical key is <source>\\0<scope>\\0<callId> when the action declares no key()',
  properties: Object.freeze({
    SAME_KEY_RETRY_CONVERGES: true,
    CANDIDATE_SURVIVES_REPLAY: true,
    DIRTY_SURVIVES_REPLAY: true,
    RESTART_CONVERGES: true,
    EFFECT_REPLAY_CONFLICT_DETECTED: true,
    UNCERTAIN_REDISPATCH_CONVERGES: true,
    CONCURRENT_ONE_WORLD: true,
  }),
  /** The two details that make those results load-bearing. */
  countedFault: 'the uncertain-redispatch arm injects the fault a COUNTED number of times, so `successfulInvocations: 1` proves the redispatch actually re-reached the port; a fault that fired forever would leave "did the redispatch even run" unanswerable',
  concurrencyAdjudication: 'six simultaneous same-key invocations were fired and the runtime shared ONE operation — 6 fulfilled, one physical world. The synchronous `#gitSync()` in the port is explicitly NOT treated as a mutex; it is a single-threaded pre-check',
});

/** Readiness, carried forward from R3-WR2 and re-measured. */
export const READINESS = Object.freeze({
  rowsTotal: 10,
  rowsSatisfied: 10,
  acceptedStates: Object.freeze(['clean', 'staged edit', 'unstaged edit', 'untracked file']),
  refusedStates: Object.freeze(['corrupt index', 'index.lock contention', 'malformed HEAD', 'unavailable borrowed store', 'unresolvable basis commit', 'unresolvable gitdir']),
  unknownFailuresRefused: true,
  everyRefusalKeptWorldInPlace: true,
  scope: 'POINT-IN-TIME — it establishes the world was commit-capable when prepared, and is NOT a lifetime guarantee',
  /** The documentation mismatch the ruling asked to audit. */
  documentationMismatch: Object.freeze({
    was: "R3-WR2's comment claimed exit 1 was honoured ONLY with an empty tracked status, while the code accepted it unconditionally",
    resolution: 'the CODE was right and the comment is corrected: `commit --dry-run` does not run the pre-commit hook, so exit 1 means only "nothing to commit" — the legitimate state of a clean world AND of a world holding unstaged edits, which is the state a resumed attempt is in',
  }),
});

/** The remote contract. */
export const REMOTE_CONTRACT = Object.freeze({
  cases: Object.freeze([
    Object.freeze({ case: 'world created through the shipped path', remotesAfter: 0, verified: true }),
    Object.freeze({ case: 'a remote pointing at the canonical repository, added after creation', remotesAfter: 0, REMOVED: true }),
    Object.freeze({ case: 'a remote whose removal FAILS (config.lock directory)', remotesAfter: 1, outcome: 'REFUSED WORLD_REMOTE_NOT_REMOVED, naming the remote' }),
  ]),
  REMOTE_REMOVAL_VERIFIED: true,
});

/** Terminal-event admissibility: the finding that resolves an R3-WR2 residual. */
export const TERMINAL_ADMISSIBILITY = Object.freeze({
  supersedes: 'R3-WR2 IRRECOVERABLE_ATTEMPT_TERMINAL_PATH: POLICY_REQUIRED',
  correctedStatement: 'a legitimate terminal pathway already exists through the admitted semantics; no new authority, event or canonical contract is required',
  arms: Object.freeze([
    Object.freeze({ event: 'ATTEMPT_FAILED', status: 'failed', accepted: true, laneReleased: true, freshPositionOpened: true, futureWorkProceeded: true, worldSurvived: true, uncommittedPreserved: true }),
    Object.freeze({ event: 'ATTEMPT_EXPIRED', status: 'expired', accepted: true, laneReleased: true, freshPositionOpened: true, futureWorkProceeded: true, worldSurvived: true, uncommittedPreserved: true, lateResult: 'recorded STALE' }),
    Object.freeze({ event: 'ATTEMPT_CANCELLED', status: 'cancelled', accepted: true, laneReleased: true, freshPositionOpened: true, futureWorkProceeded: true, worldSurvived: true, uncommittedPreserved: true }),
  ]),
  idempotency: 'a second identical report is refused with "illegal Attempt transition FAILED -> FAILED" and appends NO second event',
  lateResult: 'after EXPIRED a late completed report is recorded STALE; after FAILED or CANCELLED it is refused by the transition table — a late result cannot silently overturn a terminal event',
  exposedThrough: Object.freeze(['palimpsest_report (workerStatus failed/cancelled/expired)', 'the CLI report subcommand', 'the control surface report']),
  canonicalChangeMade: false,
  canonicalChangeRequired: false,
});

/** The sibling-containment adjudication. */
export const CONTAINMENT_ADJUDICATION = Object.freeze({
  test: 'test/r3l0c_containment.test.ts',
  verdict: 'HARNESS_LIFECYCLE_DEFECT — real confinement is NOT broken',
  rootCause: 'the shipped fence resolves its binding seam from PALIMPSEST_DSH_ROOT and CACHES the result in win32_label.js, INCLUDING A FAILURE. The harness set that variable inside probeWith, which runs AFTER the first ensureReadFence call, so the first call latched "the DSH binding seam could not be resolved" into the cache and the DECLARED fence then applied NOTHING while reporting no error',
  evidence: Object.freeze([
    'the failing test reported the DECLARED step reading the sibling world SUCCESSFULLY (read: true), which is the opposite of what a working fence produces',
    'measured directly: with the variable unset the first call returns supported=false; setting it afterwards and calling again STILL returns supported=false, because the cached failure wins',
    'scripts/r3l0b/canaries.mjs already sets the variable BEFORE its first fence call, which is why the canary suite never exhibited this',
  ]),
  correction: 'HARNESS-ONLY — the environment setup moved before the first call. No ACL relaxed, no test skipped, no accepted baseline exception added, no production code touched',
  failingBeforePassingAfter: 'failed on three consecutive runs before the correction; passes on three consecutive runs after it, 6/6',
  guardAdded: "the fence's own outcome (supported / rootsVerified / treesVerified) is asserted BEFORE the containment assertion, so a fence that applies nothing can no longer be mistaken for confinement working",
  realConfinementIntact: 'independently confirmed: R3-L0B canary and containment suites pass, and R1-H reports 17 PASS / 0 FAIL with "the confined subject CANNOT read any protected root"',
});

/** The mutation witnesses. */
export const MUTATION_WITNESSES = Object.freeze({
  witnessesTotal: 7,
  witnessesSatisfied: 7,
  healthyControlPassesBoth: true,
  witnesses: Object.freeze([
    'PARENT_REPOSITORY_ADOPTION_DETECTED',
    'CANDIDATE_HEAD_REWIND_DETECTED',
    'WORLD_PATH_ESCAPE_DETECTED',
    'WRONG_BASIS_REUSE_DETECTED',
    'PARTIAL_WORLD_MISCLASSIFICATION_DETECTED',
    'UNKNOWN_READINESS_FAILURE_DETECTED',
    'EFFECT_REPLAY_CONFLICT_DETECTED',
  ]),
  /** The three witnesses whose baseline had to be chosen for the defect they exercise. */
  baselineChoices: Object.freeze([
    'readiness compares against the R3-WR implementation (compiled from 792d109), because the text-matching criterion was repaired in R3-WR2 — comparing against the R3-WR2 snapshot would have produced a witness that could never fail',
    'escape tests the RESOLVED path, not a textual prefix, because the baseline returns .../worlds/../escaped-target — a prefix test would have called that compliant while it had written outside the root',
    'replay measures CONVERGENCE (same path, one directory, candidate intact) rather than only counting directories, because two calls alone do not discriminate when both ports reuse',
  ]),
});

/** The regression results. */
export const REGRESSION = Object.freeze({
  build: 'PASS (tsc -b clean)',
  unit: '3832/3832 passed across 278 files — ALL GREEN',
  unitNote: 'R3-WR2 reported 3816/3817 with the r3l0c containment failure classified as pre-existing. That failure is now FIXED (see CONTAINMENT_ADJUDICATION), so this stage has no non-green test.',
  e2e: '38/38 passed',
  architecture: 'PASS, 0 violations, 9 accepted baseline exceptions observed',
  publicApi: 'PASS, missing 0 / changed kind 0 / added 0',
  r3s0: 'PASS',
  r3l0b: 'PASS (canary, containment, immutability)',
  r1hConfidentiality: 'PASS 17 PASS / 0 LIMIT / 0 FAIL',
  r1hrHostHardening: 'PASS (0 FAIL)',
  r1hcConfidentialResidual: 'PASS (0 FAIL)',
  r1lConsumerBoundary: 'PASS',
  d2D4D5WorkEffectRecovery: 'PASS',
  hostConformance: 'PASS',
  r3wrAndR3wr2Regression: 'PASS',
  newR3wr3MutationSuite: 'PASS 7/7 witnesses + healthy control',
  historicalEvidenceImmutability: 'PASS — 325 protected files (R3-L0A) and 339 (R3-L0B), 0 changed / 0 added / 0 removed',
  sixRegressionsFromThisStageRepaired: Object.freeze([
    'lean_execution_world: world path spelling',
    'lean_mutating_bootstrap: world path spelling',
    'lean_speculative_authority: world path spelling',
    'sr2b3_attempt_execution_owner: world path spelling',
    'lean_d2_live_composition: world path spelling',
    'r3wr2_lifetime_recovery: refusal code refined to WORLD_HEAD_UNRESOLVABLE',
  ]),
});

/** The verdicts, with the basis for each. */
export const VERDICTS = Object.freeze({
  'R3-WR3': 'COMPLETE',
  WORLD_IDENTITY_ISOLATION: 'CLOSED',
  WORLD_PATH_CONFINEMENT: 'CLOSED',
  IDEMPOTENT_REPLAY_SAFETY: 'CLOSED',
  CANDIDATE_COMMIT_PRESERVATION: 'CLOSED',
  PARTIAL_WORLD_RECOVERY: 'LIMITED',
  RECOVERABLE_ATTEMPT_CONTINUATION: 'CLOSED',
  IRRECOVERABLE_ATTEMPT_TERMINAL_PATH: 'CLOSED',
  EXPERIMENT_CONTAINMENT: 'CLOSED',
  SYSTEM_VALID: 'YES within audited envelope',
  'R3-L0C BEHAVIORAL REPLICATION': 'AUTHORIZED',
});

export const VERDICT_BASIS = Object.freeze({
  WORLD_IDENTITY_ISOLATION_CLOSED: 'identity is resolved by Git-native administrative-directory resolution plus canonicalized filesystem identity, and the production port refuses every non-isolated shape while leaving the canonical repository byte-identical',
  WORLD_PATH_CONFINEMENT_CLOSED: '15/15 escape forms refused, including a live junction, with the ordinary form accepted as the control',
  IDEMPOTENT_REPLAY_SAFETY_CLOSED: 'same-key retry, restart and uncertain-redispatch all converge on ONE physical world through the real Ordarium runtime, and six simultaneous same-key calls shared one operation',
  CANDIDATE_COMMIT_PRESERVATION_CLOSED: 'HEAD, the work tree and the candidate commit survive a reuse, proven against a baseline that demonstrably rewound and deleted',
  PARTIAL_WORLD_RECOVERY_LIMITED: 'a partial world is refused safely and never deleted, but it is NOT recovered: recovering one would require proving the identity a half-made world cannot supply, so the honest verdict is LIMITED rather than CLOSED',
  RECOVERABLE_ATTEMPT_CONTINUATION_CLOSED: 'the same-attempt resume path still works for a returned failure and a terminated worker, with work preserved and the result settled',
  IRRECOVERABLE_ATTEMPT_TERMINAL_PATH_CLOSED: 'FAILED, EXPIRED and CANCELLED are all accepted through the existing report surface, release the lane, and let a fresh attempt commit and settle — so the pathway exists and no new authority is required',
  EXPERIMENT_CONTAINMENT_CLOSED: 'the sibling-containment failure was a harness environment-order defect, corrected with a deterministic failing-before/passing-after reproduction, and real confinement is independently confirmed by R1-H',
  SYSTEM_VALID_YES: 'the build, the full unit suite, e2e, architecture, the public API, the containment and confidentiality suites and the historical-evidence guards are all green within the audited envelope',
});

/** What remains, stated as limitations rather than softened. */
export const RESIDUALS = Object.freeze([
  'PARTIAL_WORLD_RECOVERY is LIMITED, not CLOSED: a partial world is refused safely and never deleted, but it is not recovered. Recovering one would need proof of identity that a half-made world cannot supply, so the runtime refuses rather than guesses.',
  'the readiness gate remains POINT-IN-TIME: it establishes commit capability when the world is prepared and does not promise a later commit will succeed. The lifetime question is measured separately by R3-WR2 Gate D.',
  'a borrowed world still cannot survive its parent being MOVED, because the alternates pointer is absolute — carried forward from R3-WR2 and unchanged.',
  'the readiness gate does not detect a pre-commit hook refusal, because `git commit --dry-run` does not run the hook — a property of git, stated rather than hidden.',
  'the path confinement is defence in depth, not a demonstrated user-controlled exploit: `worldId` is scheduler-generated in every shipped call site.',
]);

/**
 * Build the record from the contracts, so the file is regenerable rather than hand-maintained.
 */
export function buildStageRecord(input) {
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-WR3',
    kind: 'execution world identity, replay safety and recovery boundary',
    baseline: input?.baseline ?? 'f2b6b12b34efcbc9e87000fb30ed9889bb3bb119',
    branch: input?.branch ?? 'r3-wr3-world-identity-replay',
    commits: Object.freeze(input?.commits ?? []),
    scopeDiscipline: Object.freeze({
      stochasticModelRuns: 0,
      r3l0cMatrixRestarted: false,
      frozenCorpusCapitalOracleVerdictsModified: false,
      architectureWriteUsed: false,
      canonicalSemanticsChanged: false,
      priorStageCommitsAmended: false,
      forcePushUsed: false,
    }),
    escapedDefects: ESCAPED_DEFECTS,
    replayStateMatrix: REPLAY_STATE_MATRIX,
    pathConfinement: PATH_CONFINEMENT,
    effectReplay: EFFECT_REPLAY,
    readiness: READINESS,
    remoteContract: REMOTE_CONTRACT,
    terminalAdmissibility: TERMINAL_ADMISSIBILITY,
    containmentAdjudication: CONTAINMENT_ADJUDICATION,
    mutationWitnesses: MUTATION_WITNESSES,
    regression: REGRESSION,
    verdicts: VERDICTS,
    verdictBasis: VERDICT_BASIS,
    residuals: RESIDUALS,
  });
}

/** Write the record. It writes ONE file and nothing else. */
export function writeStageRecord(record) {
  const directory = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'stage-result.json');
  writeFileSync(path, `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  return path;
}

export { NL };
