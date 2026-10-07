/**
 * R3-L0A §2/§3/§4 — THE PROTOCOL ERRATUM, THE PLAN-AMENDMENT ADJUDICATION AND THE FUTURE IMMUTABILITY LAW.
 *
 * §2 requires the out-of-protocol primary-fixture smoke to be RECORDED, along with the fact that the plan commit
 * was rewritten after primary behaviour had already been exposed. §2 also says: if the pre-amend SHA can be
 * recovered from the local reflog, record it; if it cannot, say so; do not invent it.
 *
 * §3 requires each post-smoke change to be CLASSIFIED. The classification is decided by a real diff of the two
 * plan commits, not by recollection.
 *
 * §4 freezes the immutability law that this episode shows is needed.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from '../r3l0/envelope.mjs';

const NL = String.fromCharCode(10);
const git = (args) => execFileSync('git', [...args], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();

/** §2: the amended plan commit and the design commit, which must not be amended. */
export const AMENDED_PLAN_COMMIT = 'be52b08';
export const DESIGN_COMMIT = '90f6b1f';
export const RESULT_COMMIT = '1be2062';

/** §3: the classification vocabulary, frozen so a change cannot be described loosely. */
export const CHANGE_CLASSES = Object.freeze({
  PLUMBING_REPAIR: 'PLUMBING_REPAIR',
  OUTCOME_DEFINITION_CHANGE: 'OUTCOME_DEFINITION_CHANGE',
  TREATMENT_CONTENT_CHANGE: 'TREATMENT_CONTENT_CHANGE',
  UNKNOWN: 'UNKNOWN',
});

/**
 * §2: recover the pre-amend plan commit from the reflog.
 *
 * §2 is explicit that the SHA must be recovered or the limitation stated — never invented. This reads the
 * reflog and returns what is there.
 */
export function recoverPreAmendCommit() {
  let reflog = '';
  try {
    reflog = git(['reflog', '--date=iso']);
  } catch (error) {
    return Object.freeze({ recovered: false, sha: null, note: `the reflog could not be read: ${String(error?.message ?? error).slice(0, 120)}` });
  }
  /** The amended commit appears as `commit (amend): <subject>`; the entry BEFORE it is the original. */
  const lines = reflog.split(NL);
  const amendIndex = lines.findIndex((line) => line.includes('commit (amend): test(r3-l0): freeze longitudinal experiment plan'));
  if (amendIndex === -1) return Object.freeze({ recovered: false, sha: null, note: 'no amend entry for the plan commit was found in the reflog' });
  const amendSha = (/^([0-9a-f]{7,40})/u.exec(lines[amendIndex]) ?? [])[1] ?? null;
  const previous = lines[amendIndex + 1] ?? '';
  const previousSha = (/^([0-9a-f]{7,40})/u.exec(previous) ?? [])[1] ?? null;
  const previousIsOriginal = previous.includes('commit: test(r3-l0): freeze longitudinal experiment plan');
  return Object.freeze({
    recovered: previousSha !== null && previousIsOriginal,
    sha: previousIsOriginal ? previousSha : null,
    amendedSha: amendSha,
    reflogEntry: previous,
    note: previousIsOriginal
      ? 'the pre-amend plan commit was recovered from the local reflog'
      : 'the reflog does not hold the pre-amend plan commit',
  });
}

/** §3: the diff between the two plan commits, classified file by file. */
export function planAmendmentDiff(preAmendSha, amendedSha = AMENDED_PLAN_COMMIT) {
  if (preAmendSha === null) return Object.freeze({ available: false, note: 'the pre-amend commit is unavailable, so the diff cannot be computed', files: Object.freeze([]) });
  const nameStatus = git(['diff', '--name-status', preAmendSha, amendedSha]);
  const files = nameStatus.split(NL).filter((line) => line.trim() !== '').map((line) => {
    const [status, ...rest] = line.split(/\s+/u);
    return Object.freeze({ status, path: rest.join(' ') });
  });
  const patch = git(['diff', preAmendSha, amendedSha]);

  /**
   * §3: THE CLASSIFICATION.
   *
   * The rule is mechanical: a change is OUTCOME_DEFINITION_CHANGE if it touches the diagnostic oracle, the PERR
   * mapping, the verdict rules, the generation requirements or the schedule; TREATMENT_CONTENT_CHANGE if it
   * touches the capital bodies; and PLUMBING_REPAIR if it touches only the harness's wiring. The evidence is the
   * file list plus the diff hunks.
   */
  const OUTCOME_FILES = ['diagnostic.mjs', 'capital.mjs', 'project.mjs', 'plan.mjs', 'witness.mjs'];
  const outcomeTouched = files.filter((file) => OUTCOME_FILES.some((name) => file.path.endsWith(name)));
  /** The amended diff added capability WIRING to the generation child, not any definitional content. */
  const addedWiring = /^\+.*(reasoningVerificationPolicy|reasoningAdmissionPolicy|procedureStore|proceduresModule|procedureAuthoring|procedureAdmission)/mu.test(patch);
  const addedDefinitions = /^\+.*(DIAGNOSTIC_CASES|PREPAID_EXPOSURES|CAPITAL_BODIES|UTILITY_VERDICT_RULES|UPTAKE_VERDICT_RULES|VALIDATION)/mu.test(patch);

  const classification = outcomeTouched.length > 0 || addedDefinitions
    ? CHANGE_CLASSES.OUTCOME_DEFINITION_CHANGE
    : addedWiring
      ? CHANGE_CLASSES.PLUMBING_REPAIR
      : CHANGE_CLASSES.UNKNOWN;

  return Object.freeze({
    available: true,
    preAmendSha,
    amendedSha,
    files: Object.freeze(files),
    /** §3: the diff hunk evidence for the classification, kept so it can be re-checked. */
    addedWiringOnly: addedWiring && !addedDefinitions,
    outcomeFilesTouched: Object.freeze(outcomeTouched.map((file) => file.path)),
    classification,
    /** §3: the consequence the ruling attaches to each class. */
    consequence: classification === CHANGE_CLASSES.PLUMBING_REPAIR
      ? 'only plumbing changed, so the 24-run randomized matrix remains USABLE but pristine preregistration is WEAKENED'
      : 'a treatment/outcome/verdict definition changed after observing primary behaviour — the stronger contamination finding applies',
    patchBytes: patch.length,
  });
}

/** §4: the immutability law this episode shows is needed. */
export function immutabilityLaw() {
  return Object.freeze({
    id: 'REAL_MODEL_INVOCATION_ACTIVATES_PLAN_IMMUTABILITY',
    statement: 'Any real-model invocation against primary project bytes activates plan immutability.',
    invocationNamesThatCount: Object.freeze(['smoke', 'probe', 'verification', 'trial']),
    meaning: 'the NAME of the invocation is irrelevant; what matters is that a real model saw the primary bytes',
    consequence: 'after such exposure, a plan commit may NOT be amended; a further change requires a NEW commit and a recorded deviation',
    why: 'R3-L0 amended its plan commit after a CAPITALIZED generation had already run against the primary project bytes, which is the episode this law exists to prevent',
    effectiveFrom: 'R3-L0A',
  });
}

/** §2: the protocol deviation record. */
export function protocolErratum(preAmend) {
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0A',
    kind: 'protocol erratum',
    /** §1: the two frozen distinctions, neither replacing the other. */
    frozenDistinctions: Object.freeze({
      protocolVerdict: 'TRAJECTORY_UTILITY: MIXED',
      inferentialStatus: 'PRIMARY PERR EFFECT NON DISCRIMINATING DUE TO HISTORY_ONLY FLOOR',
      relationship: 'the inferential status qualifies the interpretation of the verdict; it does not replace it',
    }),
    deviations: Object.freeze([
      Object.freeze({
        id: 'OUT_OF_PROTOCOL_PRIMARY_FIXTURE_SMOKE',
        what: 'after the initial plan commit and before the formal 24-session matrix, a real CAPITALIZED generation was run against the primary project bytes',
        demonstrated: Object.freeze({ handlesVisible: 6, governedPullsResolved: 6, generationPromoted: true, passedClasses: Object.freeze(['D1', 'D2', 'D3', 'D4']), failedClasses: Object.freeze(['D5', 'D6']) }),
        nqImpact: 'NONE — the run is not one of the 24 scheduled sessions and contributes nothing to N',
        recordLimitation: 'the smoke run\'s own durable artifacts were removed during R3-L0 rig cleanup, so its numbers are recorded from the execution record rather than re-derived from a surviving artifact',
      }),
      Object.freeze({
        id: 'PLAN_COMMIT_REWRITTEN_AFTER_PRIMARY_BEHAVIOR_EXPOSURE',
        what: 'the plan commit was amended and re-frozen AFTER that primary-fixture smoke had already run',
        preAmendShaRecovered: preAmend.recovered,
        preAmendSha: preAmend.sha,
        amendedSha: AMENDED_PLAN_COMMIT,
        note: 'the final plan checkpoint is therefore NOT pristine pre-behaviour preregistration',
        pristineClaim: false,
      }),
    ]),
    /** §2: the honest label for the checkpoint, so no later report can call it pristine. */
    preregistrationStatus: 'WEAKENED',
    preregistrationStatusReason: 'the plan commit was amended after a real model had already run against the primary project bytes',
  });
}

function main() {
  const preAmend = recoverPreAmendCommit();
  const diff = planAmendmentDiff(preAmend.sha);
  const record = Object.freeze({
    ...protocolErratum(preAmend),
    preAmendRecovery: preAmend,
    planAmendmentDiff: diff,
    immutabilityLaw: immutabilityLaw(),
    protectedCommits: Object.freeze({ design: DESIGN_COMMIT, plan: AMENDED_PLAN_COMMIT, result: RESULT_COMMIT }),
  });
  const dir = join(REPO_ROOT, 'research-evidence', 'r3-l0a');
  writeFileSync(join(dir, 'protocol-erratum.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  process.stdout.write(`§2 pre-amend SHA: ${preAmend.recovered ? preAmend.sha : 'NOT RECOVERABLE'}${NL}`);
  process.stdout.write(`§3 classification: ${diff.classification ?? 'N/A'} over ${String(diff.files.length)} file(s)${NL}`);
  process.stdout.write(`§4 law: ${immutabilityLaw().statement}${NL}`);
  return record;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  main();
}
