/**
 * R3-WR4 — FROZEN IDENTITY AND TERMINAL-FAILURE CONTRACT.
 *
 * This module is RESEARCH-ONLY. It defines an `AuthorizedWorldBinding` contract for the purpose of this
 * stage's falsifiers and evidence. It is deliberately NOT a canonical owner: nothing in `src/` imports it,
 * it creates no store, and it establishes no authority. Its whole job is to state, in one auditable place,
 * WHICH FACTS this stage treats as trusted, where each already exists, and what the policy is BEFORE any
 * product code is changed — so the repair cannot be retro-fitted to whatever the code happened to do.
 *
 * The ruling's ordering is load-bearing: a contract written after the fix describes the fix. So the policy
 * table below is frozen first, and the two escaped defects are recorded as measurements against the frozen
 * R3-WR3 baseline rather than as descriptions.
 *
 * PLAIN JAVASCRIPT (`.mjs`). No LLM, no network.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from '../r3l0/envelope.mjs';

export const NL = String.fromCharCode(10);
export const STAGE_EVIDENCE_PATH = 'research-evidence/r3-wr4';

/* ================================================================== *
 * 1. ERRATUM TO R3-WR3
 * ================================================================== */

/**
 * §1 — APPEND-ONLY CORRECTION TO R3-WR3.
 *
 * R3-WR3's published result and its four commits are preserved unamended. This erratum withdraws three
 * unsupported INTERPRETATIONS of measurements R3-WR3 really made. In each case the measurement stands and
 * the inference drawn from it does not.
 */
export const R3WR3_ERRATUM = Object.freeze({
  preserves: Object.freeze({
    stage: 'R3-WR3',
    baseline: 'f2b6b12b34efcbc9e87000fb30ed9889bb3bb119',
    branch: 'r3-wr3-world-identity-replay',
    commits: Object.freeze(['48242cb', '7555047', '9c7fbea', '8c39c21']),
    statement: 'R3-WR3 evidence and commits are preserved byte-for-byte; this erratum appends a correction and rewrites nothing.',
  }),
  corrections: Object.freeze([
    Object.freeze({
      id: 'R3WR3-E1',
      subject: 'EFFECT_REPLAY_CONFLICT_DETECTED',
      measured: 'scripts/r3wr3/effect-replay.mjs decided the "different operation key, same physical path" case with `worlds.length === 1`.',
      whyUnsound: 'Counting physical directories proves NON-DUPLICATION of a world. It says nothing about whether the second, distinct effect invocation had any AUTHORITY to reuse that world. One directory can remain precisely because the second operation was refused, or because it silently adopted the first operation\'s world — the count cannot tell those apart.',
      downgradedTo: 'CROSS_OPERATION_WORLD_AUTHORITY: NOT_PROVEN',
      retainedMeasurement: 'No second physical world appeared. That measurement stands and is still reported.',
    }),
    Object.freeze({
      id: 'R3WR3-E2',
      subject: 'SERIALIZED_BY_RUNTIME',
      measured: 'scripts/r3wr3/effect-replay.mjs decided concurrency with `fulfilled.length + rejected.length === attempts.length`.',
      whyUnsound: 'That expression is a TAUTOLOGY for `Promise.allSettled`: every settled promise is either fulfilled or rejected, so the predicate is true for any outcome whatsoever, including six fully concurrent creations. It can never fail and therefore measures nothing.',
      downgradedTo: 'SINGLE_FLIGHT_DISPATCH: NOT_PROVEN',
      retainedMeasurement: 'Exactly one physical world existed and every fulfilled call named the same path. That observation stands; it is evidence of convergence, not of serialization.',
    }),
    Object.freeze({
      id: 'R3WR3-E3',
      subject: 'IRRECOVERABLE_ATTEMPT_TERMINAL_PATH: CLOSED',
      measured: 'scripts/r3wr3/terminal-audit.mjs drove ATTEMPT_FAILED/EXPIRED/CANCELLED through the real controller and found each accepted, lane-releasing and followed by a settling retry.',
      whyUnsound: 'Every terminal arm ran against a READABLE Git world, so `controller.report` always observed successfully. The arms therefore prove that the existing terminal events can proceed from an OBSERVABLE world. They say nothing about the case the residual was about: a world whose Git observations THROW.',
      downgradedTo: 'UNOBSERVABLE_WORLD_TERMINALIZATION: NOT_PROVEN',
      retainedMeasurement: 'FAILED/EXPIRED/CANCELLED are each admissible from RUNNING and each releases the lane. That stands as protocol evidence.',
    }),
  ]),
  /**
   * The published verdict is NOT erased. It remains correct about what it measured; what is withdrawn is the
   * unrestricted reading of it. A reader of the R3-WR3 record must be able to see both.
   */
  verdictTreatment: Object.freeze({
    kept: 'The R3-WR3 stage result remains published and unamended as protocol evidence.',
    withdrawn: 'Its unrestricted interpretation — that terminalization is closed for ALL worlds including unobservable ones — is withdrawn and replaced by UNOBSERVABLE_WORLD_TERMINALIZATION: NOT_PROVEN.',
  }),
});

/* ================================================================== *
 * 2. THE AUTHORIZED WORLD BINDING CONTRACT
 * ================================================================== */

/**
 * §2 — THE TRUSTED FACTS, AND WHERE EACH ALREADY EXISTS.
 *
 * The contract names six facts. The point of the "existingSource" column is that this stage invents no new
 * authority: every trusted fact is already recorded somewhere the product owns, and the repair must READ
 * those places rather than accept a caller's word for any of them.
 */
export const AUTHORIZED_WORLD_BINDING = Object.freeze({
  kind: 'AuthorizedWorldBinding',
  status: 'RESEARCH-ONLY CONTRACT — not a canonical owner, imported by nothing in src/',
  trustedFacts: Object.freeze([
    Object.freeze({
      fact: 'canonical project / repository identity',
      existingSource: 'the port is CONSTRUCTED with `repository` (`GitCliPort(repository, worktreeRoot)`); `GitPort.repository` is the public read (src/effects/git_port.ts)',
      howItIsUsed: 'the world root is derived from it and a world may only ever be created under that root',
    }),
    Object.freeze({
      fact: 'durable Attempt identity',
      existingSource: 'the attempt row in the Work event store; the world id IS the attempt id at every shipped call site (src/tools/controller.ts `claim`: `worldId: attemptId`, `callId: world:${attemptId}`)',
      howItIsUsed: 'the world is bound to the attempt id it was created for; a different id is not silently adopted',
    }),
    Object.freeze({
      fact: 'TaskEnvelope base_commit',
      existingSource: '`TaskEnvelope.base_commit`, resolved per attempt by `#attemptContext(attemptId)[1]` and passed to the effect as `baseCommit`',
      howItIsUsed: 'the world records its ORIGINAL basis and a reuse must match it exactly',
    }),
    Object.freeze({
      fact: 'expected World path',
      existingSource: '`GitPort.worldPath(worldId)` — pure path arithmetic over the worktree root',
      howItIsUsed: 'confinement: the resolved path must be a direct child of the root and must not physically escape it',
    }),
    Object.freeze({
      fact: 'authorized operation / recovery lineage',
      existingSource: 'the Ordarium operation record: `operationId = op_<digestJson({action,version,logicalKeyDigest})>`, logical key `<source>\\0<scope>\\0<callId>`, and the operation STATE that recovery consults (node_modules/@ordarium/core, `OperationRecord`)',
      howItIsUsed: 'the effect engine owns idempotency and redispatch; this stage measures it rather than replacing it',
    }),
    Object.freeze({
      fact: 'Git physical repository identity',
      existingSource: '`git rev-parse --absolute-git-dir`, `--git-common-dir`, `--show-toplevel`, plus `realpathSync` of each',
      howItIsUsed: 'the administrative directory AND the common directory must both lie inside the world',
    }),
  ]),
  /**
   * §2 — WHAT IS EXPLICITLY NOT SUFFICIENT AUTHORITY.
   *
   * Each of these is something the product CAN observe. The contract says observing it is not the same as
   * being authorized by it, so no single one of them may license a world reuse on its own.
   */
  notSufficientAlone: Object.freeze([
    'a worldId — it names a directory, and naming one is not owning one',
    'a baseCommit — a commit id is a value a caller can pass, not a fact about what a world was cut from',
    'a callId — it keys an Ordarium operation, and a different callId is not by itself an unauthorized attempt',
    'Git ancestry — `merge-base --is-ancestor` says one commit descends from another, never that a world ORIGINATED at one',
    'a Worker-written receipt — bytes inside a world are EVIDENCE, and a worker with a shell can write them; authority stays outside',
  ]),
  /** The rule that replaces "ancestry is close enough". */
  basisIdentityRule: 'A world\'s ORIGINAL BASIS is a property of the world, recorded when it was created. A requested base that is merely an ANCESTOR of the world\'s HEAD is NOT the world\'s basis and must be refused.',
});

/**
 * §A1 — THE CROSS-OPERATION POLICY, FROZEN BEFORE IMPLEMENTATION.
 *
 * The five cases the ruling enumerates, with the expected outcome stated as policy. "Refuse" always means
 * BEFORE any mutating Git command (no checkout, no remote removal, no config write).
 */
export const CROSS_OPERATION_POLICY = Object.freeze({
  cases: Object.freeze([
    Object.freeze({
      id: 'C1',
      case: 'same-key idempotent redispatch',
      example: 'the SAME callId and the SAME input are invoked again after an uncertain outcome',
      expected: 'ALLOW',
      basis: 'the Ordarium operation id is identical, so this is the engine\'s own `redispatch-same-key` recovery of ONE operation. It must converge on the same world rather than create a second one.',
    }),
    Object.freeze({
      id: 'C2',
      case: 'authorized same-Attempt continuation after restart',
      example: 'the same attempt id is re-claimed by a NEW runtime over the same durable ledger',
      expected: 'ALLOW',
      basis: 'the attempt identity is unchanged and the world\'s recorded binding names that same attempt and the same basis, so this is a resume, not an adoption.',
    }),
    Object.freeze({
      id: 'C3',
      case: 'distinct operation referring to the same Attempt without established authorization',
      example: 'a NEW callId (so a new operation id) asks for an existing world it has no lineage for',
      expected: 'REFUSE',
      basis: 'a different callId is NOT automatically unauthorized — but it must not ACQUIRE world authority merely because the directory already exists. Without an established lineage the safe answer is refusal before any mutating command.',
    }),
    Object.freeze({
      id: 'C4',
      case: 'operation associated with another Attempt',
      example: 'attempt B asks for the world directory that belongs to attempt A',
      expected: 'REFUSE',
      basis: 'the world records the attempt id it was created for; a mismatch is a different attempt reaching for work it does not own.',
    }),
    Object.freeze({
      id: 'C5',
      case: 'operation associated with another Project',
      expected: 'REFUSE',
      basis: 'the world root is derived from the canonical repository, so another project\'s world is a different path; and the world\'s own recorded binding names its repository/attempt, which a foreign world cannot satisfy.',
    }),
  ]),
  /** The property that makes C3/C4 more than a path coincidence. */
  bindingAnchor: 'A world carries a recorded binding of (attempt id, original basis) written at creation. It is EVIDENCE inside the world, never authority: the authority is the caller\'s trusted attempt identity plus the canonical repository the port was constructed with.',
});

/* ================================================================== *
 * 3. ESCAPED DEFECTS, MEASURED AGAINST THE FROZEN R3-WR3 BASELINE
 * ================================================================== */

/**
 * §A2/§A3 — THE TWO DEFECTS THIS STAGE CLOSES.
 *
 * Both were reproduced by running the FROZEN R3-WR3 compiled port (`scripts/r3wr4/baseline/git_port.r3wr3.mjs`,
 * a byte copy of `dist/src/effects/git_port.js` at `8c39c21`). The `measuredConsequence` fields are what the
 * harness observed, not what the code appears to do.
 */
export const ESCAPED_DEFECTS = Object.freeze([
  Object.freeze({
    id: 'R3WR4-D1',
    title: 'WRONG_ANCESTOR_BASIS_ACCEPTANCE',
    file: 'src/effects/git_port.ts',
    method: '#headCovers / createWorld reuse branch',
    was: 'A reuse was accepted whenever the requested baseCommit WAS or DESCENDED FROM the world\'s HEAD (`#headCovers` = `head === basis || isAncestor(basis, head)`). Ancestry was treated as basis identity.',
    scenario: 'Build B0 -> B1 -> X inside a world created at B0, then call createWorld(W, B1). B1 is an ancestor of X, so the reuse was accepted.',
    measuredConsequence: 'createWorld(W, B1) RETURNED a world path. The world\'s ORIGINAL basis is B0, but the port accepted a request for B1 — a commit the world never started from — because B1 happens to be reachable from the candidate.',
    whyThatIsDefect: 'Basis identity is what a result is judged against. A world whose basis silently becomes "any ancestor of HEAD" has no fixed basis, so a later result can be attributed to a base the attempt never started from. This is exactly the §A2 counterexample: ancestry compatibility is not original-basis identity.',
    shapesDiscriminated: 'requested == recorded basis (ACCEPT) | requested is an ancestor of HEAD but != recorded basis (REFUSE) | requested is unrelated (REFUSE, as R3-WR3 already did)',
  }),
  Object.freeze({
    id: 'R3WR4-D2',
    title: 'FOREIGN_COMMON_GIT_DIRECTORY',
    file: 'src/effects/git_port.ts',
    method: '#worldIdentity',
    was: '`#worldIdentity` read `git rev-parse --git-common-dir` into a `commonDir` field and NEVER CHECKED IT. Isolation was decided by `--absolute-git-dir` alone.',
    scenario: 'Point a world\'s `.git/commondir` at the CANONICAL repository\'s `.git`. The world\'s own administrative directory stays inside the world, so `--absolute-git-dir` still says "isolated" — but refs, config and remotes are then read and written in the canonical repository.',
    measuredConsequence: 'createWorld RETURNED success. The port then REMOVED the canonical repository\'s `origin` remote and OVERWROTE its `user.name` with "Palimpsest Worker". The canonical repository was mutated through a world that passed the isolation test.',
    whyThatIsDefect: '§D2-cR requires a world to OWN its mutable Git state. A world whose COMMON directory is the canonical repository does not own its config or refs: every mutating command the port runs lands on the canonical project. The `--absolute-git-dir` test alone cannot see this.',
    shapesDiscriminated: 'normal supported borrow (`common-dir` inside the world; immutable objects borrowed via `objects/info/alternates`) is ACCEPTED | a `common-dir` outside the world is REFUSED, named separately from the canonical-adoption case',
  }),
]);

/* ================================================================== *
 * 4. GATE B — THE TERMINAL CLASSIFICATION, FROZEN
 * ================================================================== */

/**
 * §6 — THE FIVE QUESTIONS, ANSWERED SEPARATELY.
 *
 * The ruling forbids inferring one from another, so each is its own field with its own evidence. The
 * answers below are the MEASURED ones (see `scripts/r3wr4/terminal.mjs`).
 */
export const TERMINAL_CLASSIFICATION = Object.freeze({
  method: 'driven through the real `installPalimpsest` stack, with only the world\'s borrowed object dependency broken and the canonical repository left healthy',
  EVENT_KIND_EXISTS: Object.freeze({
    answer: 'YES',
    detail: 'ATTEMPT_FAILED, ATTEMPT_CANCELLED and ATTEMPT_EXPIRED are all declared event types in the canonical state machine (src/domain/state_machine.ts ATTEMPT_EVENT_TARGET) with RUNNING as an allowed source state.',
  }),
  EVENT_ADMISSIBLE: Object.freeze({
    answer: 'PARTIAL',
    detail: 'Measured through the scheduler\'s own admission: ATTEMPT_CANCELLED and ATTEMPT_EXPIRED are each admitted from RUNNING with `attempt_report: null`; ATTEMPT_FAILED is REFUSED with a null report ("expected an object"), because its payload REQUIRES a parseable AttemptReport.',
    significance: 'The vocabulary already contains a faithful "terminal, no Result" representation — `attempt_report: null` — but only for CANCELLED and EXPIRED. FAILED cannot express "failed with no observed result" at all.',
  }),
  AUTHORITY_ESTABLISHED: Object.freeze({
    answer: 'NO',
    detail: 'Nothing in the current system establishes WHO may record a permanent failure terminal, nor that the original worker has stopped mutating the world. `controller.report` is the only production caller of the terminal callback and it performs no principal check; the worker cannot reach it (its whole vocabulary is READY_FOR_SETTLEMENT/NEEDS_ESCALATION and it denies the `palimpsest_` prefix), but the host/operator distinction is not represented at this boundary.',
  }),
  EXECUTABLE_WITH_UNOBSERVABLE_WORLD: Object.freeze({
    answer: 'NO',
    detail: 'Measured: with only the world\'s borrowed object dependency permanently unavailable, `controller.report(attemptId, {workerStatus})` THROWS for failed, cancelled AND expired — `#observeAttemptResultSync` runs bare `execFileSync("git", ["diff", ...])` with no guard — and NO terminal event is appended. The attempt remains RUNNING.',
  }),
  PROJECT_CAN_CONTINUE: Object.freeze({
    answer: 'YES, once a terminal event exists',
    detail: 'Measured: after an ATTEMPT_CANCELLED/EXPIRED event is appended, the terminal attempt releases its own lane and the scheduler opens a FRESH attempt for the same task (ATTEMPT_CREATED). So the blocker is producing the event truthfully, not the project\'s ability to continue afterwards.',
  }),
  /**
   * §6 evidence discipline — the distinction the schema must be able to carry.
   */
  observationDiscipline: Object.freeze({
    rule: 'An unavailable Git observation MUST NOT become `changed_files: []`.',
    measuredFailure: '`#observeAttemptResultSync` has no way to return "I could not look": its only outcomes are a populated observation or a THROW. The throw escapes `report` as a raw child-process error, which is neither a Result nor a named refusal.',
    RESULT_OBSERVATION_UNAVAILABLE: 'the world\'s Git observations cannot be taken at all — represented faithfully ONLY by `attempt_report: null` (CANCELLED/EXPIRED)',
    TRUSTED_HOST_FAILURE_OBSERVED: 'the host saw the worker stop (timeout / spawn error / abort / close-without-result) — an EXISTING host-local fact (`WorkWorkerExecutionOutcome {kind:"HOST_FAILURE"}`) that is deliberately NEVER written to the event log',
    semanticBlocker: 'The event log has no way to record "the host observed the worker stop AND the world cannot be observed". HOST_FAILURE is host-local by design and the AttemptReport schema has no field for an unavailable observation. So the two facts cannot be carried together into one terminal event without new report-schema meaning.',
  }),
});

/* ================================================================== *
 * 5. EVIDENCE RECORD
 * ================================================================== */

export const VERDICTS = Object.freeze({
  'R3-WR4': 'COMPLETE',
  WORLD_PHYSICAL_IDENTITY: 'CLOSED',
  WORLD_EFFECT_AUTHORITY_BINDING: 'CLOSED',
  FROZEN_BASIS_IDENTITY: 'CLOSED',
  CROSS_OPERATION_ADOPTION: 'OPEN',
  SINGLE_FLIGHT_DISPATCH: 'PROVEN',
  CANDIDATE_PROGRESS_PRESERVATION: 'CLOSED',
  UNOBSERVABLE_WORLD_FAILURE_EVIDENCE: 'CLOSED',
  AUTHORIZED_TERMINAL_PATH: 'POLICY_REQUIRED',
  PERMANENT_FAILURE_CONTINUATION: 'OPEN',
  SYSTEM_VALID: 'YES within audited envelope',
  EXPERIMENT_ENVIRONMENT_VALID: 'YES',
  'R3-L0C RESUME QUALIFICATION': 'BLOCKED',
});

export const VERDICT_BASIS = Object.freeze({
  WORLD_PHYSICAL_IDENTITY_CLOSED: 'The administrative directory AND the Git common directory must both lie inside the world; the canonical-adoption and foreign-common shapes are refused before any mutating command, with a healthy borrowed world still accepted.',
  WORLD_EFFECT_AUTHORITY_BINDING_CLOSED: 'A world records the (attempt id, original basis) it was created for; a reuse must match it, and a legacy world is adopted only when HEAD proves the basis. World-local bytes are treated as evidence, never as authority.',
  FROZEN_BASIS_IDENTITY_CLOSED: 'The §A2 counterexample (B0 -> B1 -> X, then createWorld(W, B1)) is refused after the repair and was accepted by the frozen baseline, while a legitimate replay on B0 preserves HEAD, candidate and dirty work.',
  CROSS_OPERATION_ADOPTION_OPEN: 'R3-WR3\'s `worlds.length === 1` criterion is withdrawn (erratum E1), and the measurement that replaces it is worse for the old claim: a COUNTED run shows two DISTINCT operation ids (different callIds, same input digest) both reaching `succeeded` against the same world. The physical binding now refuses a world that records a different attempt (WORLD_OWNER_MISMATCH) and a different basis, so a FOREIGN attempt cannot take it — but a distinct operation targeting the SAME attempt still reuses the world with no authorization check at the operation level, because the effect action receives no operation identity. "A distinct operation acquired no world authority" is therefore NOT proven, and the physical reuse it produces is intentional. Closing this would require an authority check where the effect runtime owns the question, which this stage did not add.',
  SINGLE_FLIGHT_DISPATCH_PROVEN: 'R3-WR3\'s tautological criterion is withdrawn (erratum E2). What replaces it is a COUNTED, CONTROLLABLY BLOCKED production-port wrapper: six simultaneous same-key invocations were fired while every dispatch was held open for a 250 ms window the harness controls, and the port observed exactly ONE dispatch with a maximum of ONE active at a time (`portDispatches: 1`, `maxActive: 1`, one physical world, every success naming the same path). The unblocked arm gives the same counts. SCOPE, stated rather than implied: this is single-flight within ONE runtime process over ONE durable ledger. Multi-process coordination over the same ledger was NOT exercised, and no such claim is made.',
  CANDIDATE_PROGRESS_PRESERVATION_CLOSED: 'A world holding a committed candidate, unstaged edits and untracked files keeps all three across a legitimate reuse, and a refused reuse leaves HEAD, index, work tree and Git config byte-identical.',
  UNOBSERVABLE_WORLD_FAILURE_EVIDENCE_CLOSED: 'The real failure was constructed and measured: only the world\'s borrowed object dependency is unavailable, the canonical repository stays healthy, the attempt stays RUNNING, and no Result or Promotion is produced. RESULT_OBSERVATION_UNAVAILABLE is distinguished from TRUSTED_HOST_FAILURE_OBSERVED.',
  AUTHORIZED_TERMINAL_PATH_POLICY_REQUIRED: 'No existing pathway can record a permanent unobservable-world failure truthfully: FAILED cannot carry a null Result, no principal model authorizes the transition, lease expiry is caller-asserted rather than observed, and HOST_FAILURE is host-local by design. New governance semantics are required, so §9 requires a POLICY_REQUIRED return rather than an invented event.',
  PERMANENT_FAILURE_CONTINUATION_OPEN: 'The project CAN continue once a terminal event exists (measured: lane released, fresh attempt opened), but no authorized truthful way to create that event exists, so the end-to-end continuation cannot be closed this stage.',
  SYSTEM_VALID_YES: 'Build, full unit suite, e2e, architecture, public API and the R3-S0/R3-L0B/R3-WR family regressions are green; the Windows confidential single-active profile is unchanged.',
  EXPERIMENT_ENVIRONMENT_VALID_YES: 'No stochastic model was run, R3-L0C\'s corpus, capital, oracle and verdicts are byte-untouched, and the protected historical evidence tree is unchanged.',
  R3L0C_RESUME_QUALIFICATION_BLOCKED: 'Gate B is POLICY_REQUIRED: an attempt whose world becomes permanently unobservable cannot yet be terminalized truthfully. A long-horizon experiment that can strand an attempt with no authorized terminal path would accumulate exactly the unresolved positions the experiment must not have.',
});

export const RESIDUALS = Object.freeze([
  'CROSS_OPERATION_WORLD_AUTHORITY: OPEN — measured, a distinct operation id with a different callId reaches `succeeded` against an existing world. The physical binding refuses a world owned by ANOTHER attempt, but a distinct operation targeting the SAME attempt still reuses it with no operation-level authorization, because the effect action receives no operation identity. Closing this needs an authority decision where the effect runtime owns the question.',
  'SINGLE_FLIGHT_DISPATCH: PROVEN WITHIN ONE RUNTIME PROCESS — six simultaneous same-key calls produced exactly one dispatch and a maximum of one active at a time. Multi-process coordination over the same durable ledger was NOT exercised and is not claimed.',
  'UNOBSERVABLE_WORLD_TERMINALIZATION: POLICY_REQUIRED — see the seven required decisions in this record; no new event or authority was invented.',
  'The §A2 repair refuses a world that has moved its HEAD and carries NO recorded binding, because its original basis is unknowable. Worlds created before this repair are therefore refused on reuse rather than silently adopted; a migration would need its own adjudication.',
  'Lease expiry remains CALLER-ASSERTED: `TaskEnvelope.lease_s` is never read by the attempt runtime and `lease_generation` is hardcoded null, so EXPIRED is not an observed fact.',
  'The readiness gate remains POINT-IN-TIME and does not detect a pre-commit hook refusal (stated by R3-WR2 and unchanged).',
  'A borrowed world still cannot survive its parent object store being MOVED, because `objects/info/alternates` is an absolute path (R3-WR2 residual, unchanged).',
  'The world binding file is EVIDENCE, not authority: a caller with filesystem access can rewrite it. It catches the accidental and careless case (a copied or mis-attributed world directory) and is stated as such rather than as a defence against a hostile caller.',
  '`ATTEMPT_FAILED` cannot express "failed with no observed result" at all, because its payload requires a parseable AttemptReport. Only CANCELLED and EXPIRED admit `attempt_report: null`.',
]);

/**
 * §11 — REGRESSION, as measured on this host at this stage.
 *
 * `unit` counts include this stage's own 23 new tests, which is why the total rises from R3-WR3's 3832.
 */
export const REGRESSION = Object.freeze({
  build: 'PASS — tsc -b, no diagnostics',
  unit: 'PASS — 3855/3855 across 280 files, 0 failed',
  unitNote: 'R3-WR3 reported 3832/3832 across 278 files; this stage adds 23 tests in 2 files.',
  e2e: 'PASS — 38/38',
  architecture: 'PASS — 0 violations, 9 accepted baseline exceptions observed',
  publicApi: 'PASS — 0 missing, 0 changed kind, 0 added (the GitPort interface gained no member)',
  r3s0: 'PASS — contract and systemic suites',
  r3l0b: 'PASS — immutability guard and containment; the guard reports the historical tree unchanged',
  r1hConfidentiality: 'PASS — 17 PASS / 0 LIMIT / 0 FAIL; the kernel fence verified 4/4 roots by readback',
  r1hrHostHardening: 'PASS — 44 PASS / 3 LIMIT / 0 FAIL (the disclosed limits are unchanged from the baseline)',
  r1hcConfidentialResidual: 'PASS — 26 PASS / 1 LIMIT / 0 FAIL (HC-27, the known parallel-active-worker limit)',
  r1lConsumerBoundary: 'PASS — §R1-L-LIVE',
  d2D4D5WorkEffectRecovery: 'PASS — 142 tests across the D2-live, D4-c, D5-0 and D5-d suites',
  r3wrAndR3wr2AndR3wr3Regression: 'PASS — the R3-WR3 world-identity suite (14), the R3-WR2 lifetime suite, the execution-world and object-store suites; all 63 green',
  newR3wr4MutationSuite: 'PASS — 5/5 counted witnesses satisfied, each with a baseline that genuinely violated it; 5 prior R3-WR3 regressions re-run and preserved',
  historicalEvidenceImmutability: 'PASS — `git diff 8c39c21..HEAD` over scripts/r3l0c, scripts/r3l0cr, scripts/r3l0b, research-evidence/{r3-l0c,r3-l0c-r,r3-wr,r3-wr2,r3-wr3,r3-l0a} is EMPTY; the protected evidence tree digest is unchanged',
  windowsConfidentialProfile: 'UNCHANGED — single-active profile remains valid; no host file was modified this stage',
});

/**
 * Assemble the stage record. `input` carries the harness measurements so the record is REGENERABLE from the
 * frozen contract plus the runs, rather than hand-maintained.
 */
export function buildStageRecord(input = {}) {
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-WR4',
    kind: 'world/effect identity and unobservable-failure terminal closure',
    baseline: input.baseline ?? '8c39c2191f7120f5f24f0a318296a9161c25635d',
    branch: input.branch ?? 'r3-wr4-effect-identity-terminal-closure',
    commits: Object.freeze(input.commits ?? []),
    erratum: R3WR3_ERRATUM,
    identityContract: AUTHORIZED_WORLD_BINDING,
    crossOperationPolicy: CROSS_OPERATION_POLICY,
    escapedDefects: ESCAPED_DEFECTS,
    gitAdminAudit: input.gitAdminAudit ?? null,
    effectDispatch: input.effectDispatch ?? null,
    crossOperationWitnesses: input.crossOperationWitnesses ?? null,
    candidatePreservation: input.candidatePreservation ?? null,
    terminalClassification: TERMINAL_CLASSIFICATION,
    unobservableFailure: input.unobservableFailure ?? null,
    continuation: input.continuation ?? null,
    mutationWitnesses: input.mutationWitnesses ?? null,
    policyRequirement: input.policyRequirement ?? null,
    regression: input.regression ?? null,
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
