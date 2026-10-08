/**
 * R3-WR2 — THE BORROWED-OBJECT LIFETIME AND RECOVERY CONTRACTS, FROZEN.
 *
 * This module records what R3-WR2 MEASURED, so a later reader gets the findings as data rather than as prose in
 * a report. Every value here corresponds to a measurement in `scripts/r3wr2/`, and each names the module that
 * produced it.
 *
 * THE TWO DEFECTS THIS STAGE PROVED, both in production code and both reproducible:
 *
 *   1  THE READINESS CRITERION WAS FAIL-OPEN. R3-WR decided commit capability by matching `git commit --dry-run`
 *      failure TEXT against a list of known object-store errors. Any failure outside that list fell through to
 *      READY. Two such failures were measured on this host: a corrupt index and a held `index.lock`, both
 *      exiting 128 with messages matching no pattern in the list. A world that could not commit was declared
 *      usable.
 *
 *   2  `palimpsest.world.create` DID NOT HONOUR ITS OWN DECLARED EFFECT PROFILE. The action is declared
 *      `effects.idempotent()`, and Ordarium's recovery path for an idempotent action whose invocation threw
 *      after dispatch is `redispatch-same-key` — it RE-RUNS the action with the same world id. The real
 *      `GitCliPort.createWorld` ran `git clone` unconditionally, so the second call failed with "destination
 *      path already exists and is not an empty directory". The redispatch could therefore never converge, and
 *      the attempt stayed unresolved: measured as Gate F's FAIL_AFTER_CLONE arm, where the retry was refused
 *      and the attempt remained at CREATED with no path forward.
 *
 * WHAT R3-WR2 DID NOT FIND, stated because a negative result about a suspected cause is the point of the gate:
 * the borrowed-object chain is REPACK-TOLERANT and COPY-TOLERANT, and a transiently unavailable store RECOVERS
 * when restored. Those are measured, not assumed, in `borrow-lifetime.mjs`.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
const NL = String.fromCharCode(10);

/** The two historical failure classes, kept distinct as the ruling requires. */
export const FAILURE_DISTINCTION = Object.freeze({
  OBJECT_STORE_FAILURE_REPRODUCED: true,
  ORIGINAL_TRIGGER_IDENTIFIED: false,
  statement: 'R3-WR reproduced the CLASS (a borrowed object store that cannot deliver an object makes a worker unable to commit) and never identified the ORIGIN of the original trigger; R3-WR2 preserves that distinction rather than collapsing it',
  implication: 'the readiness gate is justified by the reproduced class; no claim is made about the historical origin',
});

/**
 * CREATE-TIME READINESS vs ATTEMPT LIFETIME VALIDITY.
 *
 * The distinction the ruling asks to freeze. These are different properties measured by different modules, and
 * conflating them is how a point-in-time check gets mistaken for a lifetime guarantee.
 */
export const VALIDITY_SCOPES = Object.freeze({
  CREATE_TIME_READINESS: Object.freeze({
    question: 'was the world commit-capable at the moment it was handed over',
    measuredBy: 'src/effects/git_port.ts #assertWorldCommitCapable',
    evidence: 'scripts/r3wr2/production-readiness.mjs',
    scope: 'POINT IN TIME',
  }),
  ATTEMPT_LIFETIME_VALIDITY: Object.freeze({
    question: 'does the world stay usable for the whole attempt',
    measuredBy: 'scripts/r3wr2/borrow-lifetime.mjs',
    evidence: 'the fault matrix below',
    scope: 'LIFETIME',
  }),
  /** A readiness PASS is not a promise about the future, and the code says so where it is made. */
  relation: 'create-time readiness does NOT imply lifetime validity; the borrowed store can become unreadable after the check returns, which the lifetime matrix measures',
});

/** GATE B: the readiness criterion, as the corrected production code implements it. */
export const READINESS_CRITERION = Object.freeze({
  shape: 'ALLOWLIST of positive exit-code facts, not a denylist of error strings',
  why: 'a denylist cannot bound the failures it does not know about, so an unseen failure falls through to READY',
  facts: Object.freeze([
    Object.freeze({ command: 'rev-parse --verify HEAD^{commit}', requires: 'exit 0', establishes: 'the world names a commit, not merely a ref' }),
    Object.freeze({ command: 'cat-file -e <basis>^{commit}', requires: 'exit 0', establishes: 'the borrowed store can deliver the basis' }),
    Object.freeze({ command: 'status --porcelain --untracked-files=no', requires: 'exit 0', establishes: 'the index and work tree are readable' }),
    Object.freeze({ command: 'commit --dry-run', requires: 'exit 0 or exit 1', establishes: 'git reports it would commit, or nothing to commit' }),
  ]),
  /** The measured failures the OLD criterion accepted, which is the defect. */
  failuresTheOldDenylistMissed: Object.freeze([
    Object.freeze({ fault: 'corrupt index', signature: 'fatal: .git/index: index file smaller than expected', exit: 128, matchedAnyPattern: false }),
    Object.freeze({ fault: 'held index.lock', signature: "fatal: Unable to create '...index.lock': File exists", exit: 128, matchedAnyPattern: false }),
  ]),
  /** The exit-1 rule, and why it is safe. */
  exitOneRule: Object.freeze({
    meaning: 'git reports nothing to commit',
    whySafe: 'measured: `commit --dry-run` does NOT run the pre-commit hook, so a hook refusal cannot masquerade as exit 1',
    whyNotStatusText: 'requiring a clean tracked status would refuse a world whose worker has made UNSTAGED edits, which is exactly the state a resumed attempt is in',
  }),
  /** The stated limit of the check, so it is not read as covering more than it does. */
  limit: 'a pre-commit hook refusal is not detected, because `--dry-run` does not run the hook; this is a property of git, not a gap in the criterion',
});

/** GATE F: the declared-idempotency defect and its repair. */
export const IDEMPOTENCY_CONTRACT = Object.freeze({
  action: 'palimpsest.world.create',
  declaredProfile: 'effects.idempotent() (durable window)',
  declaredContract: 'the same world id reuses the path',
  /** Why the declaration is LOAD-BEARING rather than descriptive. */
  whyLoadBearing: 'when an invocation throws after dispatch, Ordarium leaves the operation UNCERTAIN and the idempotent recovery path is redispatch-same-key, which re-runs this action with the same world id — so the contract IS the convergence condition of the recovery engine',
  defect: 'GitCliPort.createWorld ran `git clone` unconditionally, so a second call failed with "destination path already exists and is not an empty directory" and the redispatch could never converge',
  observedConsequence: 'Gate F FAIL_AFTER_CLONE: the retry was refused, the attempt stayed at CREATED, and the project could not advance',
  repair: 'the world is REUSED when it already exists — the clone is skipped and the basis checkout and identity are re-applied',
  whyReuseAndNotReClone: 'a world that exists may hold a worker uncommitted work; `checkout --detach` at the SAME commit preserves it (measured), while deleting and re-cloning would destroy it',
  afterRepair: Object.freeze({
    SAME_ATTEMPT_RETRIED: true,
    NO_DUPLICATE_ATTEMPT: true,
    RETRY_SETTLED: true,
    workPreserved: true,
  }),
});

/** GATE C: the worker-token parity result. */
export const WORKER_TOKEN_FINDING = Object.freeze({
  HOST_GIT_OBJECT_ACCESS: 'borrowed objects readable, HEAD and basis resolvable, commit capable',
  WORKER_GIT_OBJECT_ACCESS: 'borrowed objects readable under the shipped Low-integrity write-restricted token, HEAD and basis resolvable, commit performed',
  HOST_WORKER_ACCESS_PARITY: 'PASS',
  /** Why the PASS is evidence rather than an artefact. */
  confinementControl: 'a Medium + NO_READ_UP canary OUTSIDE the world was DENIED to the worker (EPERM) while the world content was readable, so the confinement was in effect and the parity was not measured through an unconfined process',
  confidentialityPreserved: 'no label was removed, no read granted and no profile relaxed to obtain the result',
  /** The measurement artefact that had to be separated from a real conflict. */
  measuredArtefact: 'the write-restricted token cannot create an anonymous pipe, so a piped-stdio git invocation fails with EPERM for reasons unrelated to object access; the shipped runner uses inherited stdio, and this measurement redirects git output to files inside the world',
});

/**
 * GATE D: the borrow-chain lifetime matrix.
 *
 * Each row is a deterministic lifecycle fault, and the outcome is what the worker could still do. The three
 * columns that matter are which directory each hop borrows, whether the commit survived, and whether a
 * restored store recovers.
 */
export const BORROW_LIFETIME_MATRIX = Object.freeze({
  topologies: Object.freeze([
    Object.freeze({ id: 'SHIPPED', hops: Object.freeze(['canonical', 'worker world']), built: 'GitCliPort.createWorld' }),
    Object.freeze({ id: 'CHAINED', hops: Object.freeze(['canonical', 'trajectory world (a copy)', 'worker world']), built: 'the R3-L0C rig, by copying a prepared world and cloning from the copy' }),
  ]),
  /** What SURVIVES, which is the reassuring half and must be stated as clearly as what fails. */
  survives: Object.freeze([
    Object.freeze({ fault: 'parent world copied', why: 'the pointer still names the original, and the copy is simply unused' }),
    Object.freeze({ fault: 'borrowed store repacked (`git repack -a -d`)', why: 'repacking rewrites the store in place, so the pointer stays valid' }),
    Object.freeze({ fault: 'borrowed store temporarily unavailable, then restored', why: 'the world is unchanged by the outage and commits again once the store returns' }),
  ]),
  /** What BREAKS, and the mechanism. */
  breaks: Object.freeze([
    Object.freeze({ fault: 'borrowed store removed', mechanism: 'the objects the world needs are gone; commit fails with the worker signature `fatal: could not parse HEAD`' }),
    Object.freeze({ fault: 'borrowed store temporarily unavailable at commit time', mechanism: 'the same signature, and the failure is RECOVERABLE once the store returns' }),
    Object.freeze({ fault: 'parent world MOVED', mechanism: 'the alternates pointer is ABSOLUTE, so relocating the parent leaves a path that no longer resolves — the borrow is pinned, not relocatable' }),
    Object.freeze({ fault: 'failure after edits but before commit', mechanism: 'the edits remain in the worktree and uncommitted; the world is recoverable once the store returns, but nothing was committed' }),
  ]),
  /** The lifetime property the matrix establishes, stated as a bound rather than a guarantee. */
  lifetimeProperty: 'the world usable lifetime is bounded by the lifetime of a directory it does not own, and by that directory staying at its recorded ABSOLUTE path',
  /** Alternatives, with their tradeoffs, as the ruling asks — proposed, not implemented. */
  alternatives: Object.freeze([
    Object.freeze({ option: 'owner lifetime protection', idea: 'keep the borrowed store alive for as long as a world that borrows it exists', tradeoff: 'requires an owner-side registry and a release path; adds lifecycle state to a directory that currently has none' }),
    Object.freeze({ option: 'detach borrowed objects (`--dissociate`)', idea: 'copy the borrowed objects into the world so it owns them', tradeoff: 'removes the dependency entirely at the cost of duplicating history per world — the cost `--shared` exists to avoid, and it would be paid on every attempt' }),
    Object.freeze({ option: 'relative alternates', idea: 'record the pointer relative to the world so a moved parent follows', tradeoff: 'only helps when the parent moves WITH the world; a parent moved independently still breaks, and the pointer would then be wrong in a new way' }),
  ]),
  /** The ruling forbids an unmeasured product-wide redesign, and none was made. */
  productRedesignMade: false,
});

/**
 * GATE E: failed-attempt continuation.
 *
 * R3-WR recorded `FAILED_ATTEMPT_RECOVERY: OPEN` on the strength of a preserved run whose attempt was left
 * RUNNING. R3-WR2 EXERCISED the resume path through the real controller, and the result NARROWS that finding:
 * the supported continuation exists and works for a worker that returned a failure AND for a worker that
 * terminated without returning anything. The gap is narrower and specific.
 */
export const CONTINUATION_FINDING = Object.freeze({
  supersedes: 'R3-WR FAILED_ATTEMPT_RECOVERY: OPEN',
  correctedStatement: 'a failed or terminated worker DOES have a supported continuation: the SAME attempt is resumed, its retained work is preserved, and it settles',
  arms: Object.freeze([
    Object.freeze({ arm: 'RETURNED_FAILURE', workerOutcome: 'HOST_FAILURE with changes retained', sameAttemptResumed: true, workPreserved: true, resultSettled: true, attemptLeftOpen: false }),
    Object.freeze({ arm: 'TERMINATED_WORKER', workerOutcome: 'the worker threw, so no outcome was ever returned', sameAttemptResumed: true, workPreserved: true, resultSettled: true, attemptLeftOpen: false }),
    Object.freeze({ arm: 'STORE_PERMANENTLY_GONE', workerOutcome: 'the borrowed store destroyed for good, so a resumed worker still cannot commit', sameAttemptResumed: true, workPreserved: true, resultSettled: false, attemptLeftOpen: true }),
  ]),
  /** What makes the resume legitimate rather than a workaround. */
  whyLegitimate: 'the resume goes through the SAME supported controller path (`start` → admission RESUME → the existing position), the SAME attempt id, and the SAME world; no verification is skipped, no promotion is forced and quiescence is not disabled',
  /** The residual, stated precisely. */
  residualGap: 'an attempt whose world can NEVER be committed in has no authorized terminal path: the controller exposes no abandon/cancel/terminalize operation, so the attempt stays RUNNING and the project cannot take its next structural revision',
  residualIsNot: 'a defect in the resume path — it is the absence of a terminal path for a permanently impossible attempt',
  /** The ruling forbids inventing a new event, so none was added. */
  canonicalChangeMade: false,
  canonicalChangeRequired: 'a terminal path for a permanently-uncommittable attempt would require new canonical semantics (an abandon/terminal event with its own authorization), which this stage reports rather than invents',
});

/** GATE F: preparation failure. */
export const PREPARATION_FAILURE_FINDING = Object.freeze({
  arms: Object.freeze([
    Object.freeze({ mode: 'FAIL_BEFORE_CLONE', worldOnDisk: false, workerGivenPartialWorld: false, sameAttemptRetried: true, duplicateAttempt: false, retrySettled: true }),
    Object.freeze({ mode: 'FAIL_AFTER_CLONE', worldOnDisk: true, workerGivenPartialWorld: false, sameAttemptRetried: true, duplicateAttempt: false, retrySettled: true }),
  ]),
  partialWorldNeverPresented: 'measured: in both arms the worker never ran, so no partially created world was handed over as READY',
  idempotencyPreserved: 'measured: the retry reuses the SAME attempt id and mints no duplicate, which is what the pre-repair FAIL_AFTER_CLONE arm VIOLATED before the idempotency fix',
  uncommittedDataPreserved: 'the partial world is reused, not deleted, so a world that held work would keep it',
});

export { NL };
