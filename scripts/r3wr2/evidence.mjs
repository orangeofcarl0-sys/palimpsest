/**
 * R3-WR2 — THE STAGE EVIDENCE RECORD.
 *
 * This module produces the stage's evidence JSON from the FROZEN CONTRACTS rather than from prose, so a reader
 * can regenerate it and compare. It writes one file under `research-evidence/r3-wr2/`, and it writes NOTHING
 * else: no historical evidence, no frozen corpus, no other stage's record.
 *
 * The record is deliberately explicit about what this stage did NOT establish — the unidentified trigger, the
 * absent authorized terminal path, the pre-commit-hook blind spot, and the move-hostility of an absolute
 * borrow — because a closure report whose residuals are invisible is not a closure report.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BORROW_LIFETIME_MATRIX,
  CONTINUATION_FINDING,
  FAILURE_DISTINCTION,
  IDEMPOTENCY_CONTRACT,
  PREPARATION_FAILURE_FINDING,
  READINESS_CRITERION,
  VALIDITY_SCOPES,
  WORKER_TOKEN_FINDING,
} from './contract.mjs';
import { REPO_ROOT } from '../r3l0/envelope.mjs';

const NL = String.fromCharCode(10);
export const STAGE_EVIDENCE_PATH = 'research-evidence/r3-wr2';

/**
 * The regression results, recorded as MEASUREMENTS. The one failing test is recorded with the proof that it
 * pre-dates this stage, so a reader can distinguish it from a regression rather than having to trust a claim.
 */
export const REGRESSION = Object.freeze({
  build: 'PASS (tsc -b clean)',
  unit: '3816/3817 passed across 277 files',
  unitKnownFailure: Object.freeze({
    test: 'test/r3l0c_containment.test.ts > §10 the DECLARED layout blocks the sibling world, by traversal and by absolute path',
    PRE_EXISTING: true,
    proof: 'the same test fails IDENTICALLY at the baseline commit 65fdbb1908348cf58a5e800f61795fc99c0c280b in a clean worktree, before any R3-WR2 change, deterministically across three consecutive runs',
    cause: 'host-dependent ACL/fence behaviour in the R3-L0C containment suite; it imports neither src/effects/git_port.ts nor any file R3-WR2 changed',
    relationToThisStage: 'NOT a regression of R3-WR2',
  }),
  e2e: '38/38 passed',
  architecture: 'PASS, 0 violations, 9 accepted baseline exceptions observed',
  publicApi: 'PASS, missing 0 / changed kind 0 / added 0',
  r3wr2NewTests: '22/22',
  r3wrExistingTests: '20/20',
  r3s0: 'PASS',
  r3l0b: 'PASS',
  r1hConfidentiality: 'PASS 17 PASS / 0 LIMIT / 0 FAIL',
  r1hrHostHardening: 'PASS 44 PASS / 3 LIMIT / 0 FAIL',
  r1hcConfidentialResidual: 'PASS 26 PASS / 1 LIMIT / 0 FAIL',
  r1lConsumerBoundary: 'PASS',
  d2D4D5WorkOccRecovery: 'PASS',
  hostConformance: 'PASS',
  historicalEvidenceImmutability: 'PASS (325 protected files, 0 changed / 0 added / 0 removed)',
});

/** The residuals, each stated as a limitation rather than softened into a note. */
export const RESIDUALS = Object.freeze([
  'the ORIGIN of the historical object-store trigger remains unidentified; only the CLASS is reproduced',
  'an attempt whose world can never be committed in has no authorized terminal path: the controller exposes no abandon/cancel/terminalize operation, so the attempt stays RUNNING and the project cannot take its next structural revision. Closing it needs new canonical semantics, which were NOT invented',
  'the readiness gate does not detect a pre-commit hook refusal, because git --dry-run does not run the hook — a property of git, stated rather than hidden',
  'a borrowed world cannot survive its parent being MOVED, because the alternates pointer is absolute',
]);

/**
 * An incident THIS SESSION caused, recorded rather than omitted.
 *
 * Restoring the e2e toolchain with `pnpm add` emptied 164 of 248 package directories in the pnpm virtual store.
 * It was detected immediately, repaired offline from the intact content-addressable store, and every affected
 * measurement was re-run afterwards. It is recorded because a report that hides a self-inflicted environment
 * change is less trustworthy than one that names it.
 */
export const ENVIRONMENT_INCIDENT = Object.freeze({
  what: 'this session ran `pnpm add -D @playwright/test` to restore an e2e toolchain whose package directory was empty in this worktree. The command emptied 164 of 248 package directories in the pnpm virtual store.',
  howDiscovered: 'the subsequent `npx vitest` / `npx tsc` invocations failed with MODULE_NOT_FOUND, and a directory count showed 164 empty package dirs',
  repair: 'removed node_modules and reinstalled OFFLINE from the intact pnpm content-addressable store; the store was verified populated first, so the reinstall restored the exact pinned versions rather than fetching anything new',
  verifiedAfterRepair: 'tsc 7.0.2, vitest 4.1.10 and playwright 1.63.0 all resolve; build clean; the full unit suite and the e2e suite were then run to completion on the repaired tree',
  effectOnEvidence: 'none — the repair restored the same pinned versions and the affected measurements were re-run afterwards',
  effectOnGitState: 'none — node_modules is not tracked',
});

/**
 * A toolchain gap that PRE-DATES this stage, recorded so it is not mistaken for a defect.
 *
 * `node_modules/@playwright/test` was an empty directory in this worktree, which is why the e2e suite could not
 * be started at first. The ruling requires the e2e suite to run, so it was restored; the gap is named here
 * because it was found, not caused.
 */
export const PRE_EXISTING_ENVIRONMENT_GAPS = Object.freeze([
  Object.freeze({
    gap: 'node_modules/@playwright/test was an empty directory in this worktree, so `playwright test` could not start',
    preExisting: true,
    resolution: 'restored (see ENVIRONMENT_INCIDENT), after which the e2e suite ran 38/38',
  }),
  Object.freeze({
    gap: 'the R3-L0C containment test fails on this host',
    preExisting: true,
    resolution: 'recorded, not repaired: it is outside this stage scope and its repair would touch R3-L0C evidence',
  }),
]);

/** The verdicts, with the basis for each so a reader can see what each rests on. */
export const VERDICTS = Object.freeze({
  GIT_HISTORY: 'CONTINUOUS',
  WORKTREE_READINESS: 'CLOSED',
  BORROWED_OBJECT_LIFETIME: 'CLOSED',
  WORKER_TOKEN_GIT_ACCESS: 'PASS',
  FAILED_ATTEMPT_CONTINUATION: 'CLOSED',
  CANONICAL_SEMANTICS: 'UNCHANGED',
  NEXT: 'R3-L0C RESUME QUALIFICATION',
});

/** Build the record from the contracts. */
export function buildStageRecord(input) {
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-WR2',
    kind: 'borrowed object lifetime and attempt recovery closure',
    baseline: input?.baseline ?? '65fdbb1908348cf58a5e800f61795fc99c0c280b',
    branch: input?.branch ?? 'r3-wr2-borrowed-object-lifetime',
    commits: Object.freeze(input?.commits ?? []),
    scopeDiscipline: Object.freeze({
      stochasticModelRuns: 0,
      r3l0cMatrixRestarted: false,
      historicalCorpusCapitalOracleVerdictsModified: false,
      architectureWriteUsed: false,
      canonicalSemanticsChanged: false,
    }),
    failureDistinction: FAILURE_DISTINCTION,
    validityScopes: VALIDITY_SCOPES,
    readinessCriterion: READINESS_CRITERION,
    idempotencyContract: IDEMPOTENCY_CONTRACT,
    workerTokenFinding: WORKER_TOKEN_FINDING,
    borrowLifetimeMatrix: BORROW_LIFETIME_MATRIX,
    continuationFinding: CONTINUATION_FINDING,
    preparationFailureFinding: PREPARATION_FAILURE_FINDING,
    regression: REGRESSION,
    residuals: RESIDUALS,
    environmentIncident: ENVIRONMENT_INCIDENT,
    preExistingEnvironmentGaps: PRE_EXISTING_ENVIRONMENT_GAPS,
    verdicts: VERDICTS,
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
