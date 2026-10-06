#!/usr/bin/env node
/**
 * R3-AE §8 — THE DETERMINISTIC FIXTURE-AUDIT PRECONDITION.
 *
 * QC-6 used to check only that the fixture declared a non-empty class list, which is not a property of the
 * fixture at all. §8 replaces it with four facts that must be PROVEN mechanically, from the fixture's own
 * bytes, with no model involved:
 *
 *   mechanicalOracleProven              the oracle decides every case without a model's judgement
 *   allHiddenCasesDeclareFailureClass   every case names a declared class
 *   allDeclaredClassesAreExercised      every declared class has at least one case
 *   oracleUsesNoModelSelfReport         the oracle consults no model output
 *
 * The ANALYSIS must not manufacture these values. They are computed here, from the fixture sources, and the
 * pair cannot qualify unless all four are true.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { FIXTURE_SPECS } from './fixture-content.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const SCRATCH = join(homedir(), '.palimpsest-r3a', 'precondition');

/**
 * §8: patterns that would mean the oracle consults a MODEL rather than a rule. A match is a FAILURE of
 * `oracleUsesNoModelSelfReport`.
 */
const MODEL_CONSULTATION_PATTERNS = Object.freeze([
  /openai|anthropic|deepseek|openrouter/iu,
  /\bfetch\s*\(/u,
  /https?:\/\//u,
  /api[_-]?key/iu,
  /llm|completion|chat\.completions/iu,
]);

/**
 * §8: compute the precondition for one fixture, from its own bytes.
 *
 * The oracle must also be DETERMINISTIC: the same candidate is judged twice and the two result vectors must
 * be identical. A flaky oracle cannot ground a qualification record.
 */
export async function fixtureAuditPrecondition(spec) {
  const dir = join(SCRATCH, `${spec.fixtureId}-r${String(spec.fixtureRevision)}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  for (const [relative, content] of Object.entries(spec.files)) {
    const target = join(dir, relative);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }

  const acceptanceText = spec.files['acceptance.mjs'];
  const sourceText = spec.files[spec.sourceFile];

  /* -- oracleUsesNoModelSelfReport: the acceptance must consult no model -- */
  const modelConsultation = MODEL_CONSULTATION_PATTERNS.filter((pattern) => pattern.test(acceptanceText)).map((pattern) => String(pattern));

  /* -- mechanicalOracleProven: the oracle runs the candidate and compares deterministic state -- */
  const acceptanceModule = await import(pathToFileURL(join(dir, 'acceptance.mjs')).href);
  const candidate = await import(pathToFileURL(join(dir, spec.sourceFile)).href);
  const cases = spec.fixtureId.includes('f-a') ? acceptanceModule.FA_CASES : acceptanceModule.FB_CASES;
  const classes = spec.fixtureId.includes('f-a') ? acceptanceModule.FA_CLASSES : acceptanceModule.FB_CLASSES;

  const first = acceptanceModule.runCases(candidate[spec.exportName], cases);
  const second = acceptanceModule.runCases(candidate[spec.exportName], cases);
  const deterministic = JSON.stringify(first.results.map((result) => [result.id, result.pass, result.failureClass_detail ?? null]))
    === JSON.stringify(second.results.map((result) => [result.id, result.pass, result.failureClass_detail ?? null]));
  /** A mechanical oracle produces a per-case verdict for EVERY case; anything less is not a full judgement. */
  const judgesEveryCase = first.results.length === cases.length && first.results.every((result) => typeof result.pass === 'boolean');

  /* -- allHiddenCasesDeclareFailureClass / allDeclaredClassesAreExercised -- */
  const declared = new Set(classes.map((entry) => entry.id));
  const undeclaredCases = cases.filter((testCase) => !declared.has(testCase.failureClass)).map((testCase) => testCase.id);
  const unexercisedClasses = [...declared].filter((classId) => !cases.some((testCase) => testCase.failureClass === classId));

  const precondition = Object.freeze({
    fixtureId: spec.fixtureId,
    fixtureRevision: spec.fixtureRevision,
    /** §5: the fixture digest this precondition describes, so a fixture edit invalidates it. */
    contentDigest: createHash('sha256')
      .update(Object.entries(spec.files).map(([path, content]) => `${path}:${createHash('sha256').update(content, 'utf8').digest('hex')}`).join('\n'), 'utf8')
      .digest('hex'),
    mechanicalOracleProven: deterministic && judgesEveryCase,
    allHiddenCasesDeclareFailureClass: undeclaredCases.length === 0,
    allDeclaredClassesAreExercised: unexercisedClasses.length === 0,
    oracleUsesNoModelSelfReport: modelConsultation.length === 0,
    evidence: Object.freeze({
      deterministic,
      judgesEveryCase,
      casesRun: first.results.length,
      declaredClasses: [...declared].sort(),
      undeclaredCases: Object.freeze(undeclaredCases),
      unexercisedClasses: Object.freeze(unexercisedClasses),
      modelConsultationPatternsMatched: Object.freeze(modelConsultation),
      oracleSourceDigest: createHash('sha256').update(acceptanceText, 'utf8').digest('hex'),
      sourceDigest: createHash('sha256').update(sourceText, 'utf8').digest('hex'),
    }),
  });
  return precondition;
}

/** §8: every fixture's precondition, keyed by fixture id. */
export async function allPreconditions() {
  const out = {};
  for (const spec of FIXTURE_SPECS) out[spec.fixtureId] = await fixtureAuditPrecondition(spec);
  return Object.freeze(out);
}

async function main() {
  const preconditions = await allPreconditions();
  mkdirSync(join(REPO_ROOT, 'research-evidence', 'r3-ae'), { recursive: true });
  writeFileSync(join(REPO_ROOT, 'research-evidence', 'r3-ae', 'fixture-preconditions.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-AE', preconditions }, null, 2)}\n`, 'utf8');
  for (const precondition of Object.values(preconditions)) {
    const ok = precondition.mechanicalOracleProven && precondition.allHiddenCasesDeclareFailureClass && precondition.allDeclaredClassesAreExercised && precondition.oracleUsesNoModelSelfReport;
    process.stdout.write(`${precondition.fixtureId} r${String(precondition.fixtureRevision)} — precondition ${ok ? 'SATISFIED' : 'NOT SATISFIED'}\n`);
    process.stdout.write(`  mechanicalOracleProven=${String(precondition.mechanicalOracleProven)} allHiddenCasesDeclareFailureClass=${String(precondition.allHiddenCasesDeclareFailureClass)} allDeclaredClassesAreExercised=${String(precondition.allDeclaredClassesAreExercised)} oracleUsesNoModelSelfReport=${String(precondition.oracleUsesNoModelSelfReport)}\n`);
    process.stdout.write(`  digest ${precondition.contentDigest.slice(0, 16)}…\n`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
