#!/usr/bin/env node
/**
 * R3-A2 §"Failure-class requirements" — THE DETERMINISTIC AUDIT OF THE TWO NEW FAMILIES.
 *
 * This module produces the SAME two artifacts R3-A0/R3-AE produced for F-A/F-B, for F-C and F-D, using the
 * generic oracle accessors rather than a per-family branch:
 *
 *   constructionAudit        the H0's headroom per class, and the declared-class/case coherence facts;
 *   fixtureAuditPrecondition the four facts QC-6 consumes (R3-AE §8): the oracle is mechanical and
 *                            deterministic, every hidden case declares a class, every declared class is
 *                            exercised, and the oracle consults no model self-report.
 *
 * §"No primary-fixture smoke" and §"Failure-class requirements": everything here is deterministic. No model is
 * called, so a green audit cannot be produced by a lucky model run.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { COMBINED_SPECS, NEW_FAMILIES, contentDigestOf, materialize, oracleOf, specFor } from './fixtures.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const SCRATCH = join(homedir(), '.palimpsest-r3a2', 'audit');
const NL = String.fromCharCode(10);

/**
 * R3-AE §8: patterns that would mean the oracle consults a MODEL rather than a rule. A match is a FAILURE of
 * `oracleUsesNoModelSelfReport`.
 */
export const MODEL_CONSULTATION_PATTERNS = Object.freeze([
  /openai|anthropic|deepseek|openrouter/iu,
  /\bfetch\s*\(/u,
  /https?:\/\//u,
  /api[_-]?key/iu,
  /llm|completion|chat\.completions/iu,
]);

/** §"Failure-class requirements": the H0 headroom and coherence audit for one spec. */
export async function constructionAudit(spec, root = SCRATCH) {
  const dir = join(root, `${spec.fixtureId}-r${String(spec.fixtureRevision)}`);
  rmSync(dir, { recursive: true, force: true });
  for (const [relative, content] of Object.entries(spec.files)) {
    const target = join(dir, relative);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  const source = await import(pathToFileURL(join(dir, spec.sourceFile)).href);
  const oracle = await oracleOf(spec, pathToFileURL(join(dir, spec.acceptanceFile)).href);
  const run = oracle.runCases(source[spec.exportName], oracle.cases);

  const perClass = oracle.classes.map((entry) => {
    const members = run.results.filter((result) => result.failureClass === entry.id);
    return Object.freeze({
      classId: entry.id,
      invariant: entry.invariant,
      cases: members.length,
      passed: members.filter((result) => result.pass).length,
      failed: members.filter((result) => !result.pass).length,
      /** A class has H0 headroom when H0 fails at least one of its cases. */
      h0Headroom: members.some((result) => !result.pass),
    });
  });

  const declared = new Set(oracle.classIds);
  const undeclaredCases = run.results.filter((result) => !declared.has(result.failureClass)).map((result) => result.id);
  const unexercisedClasses = oracle.classIds.filter((classId) => !oracle.cases.some((testCase) => testCase.failureClass === classId));

  return Object.freeze({
    fixtureId: spec.fixtureId,
    fixtureRevision: spec.fixtureRevision,
    mechanismFamily: spec.mechanismFamily,
    sourceFile: spec.sourceFile,
    exportName: spec.exportName,
    contentDigest: contentDigestOf(spec),
    h0: Object.freeze({ passed: run.passed, total: run.total, raw: `${String(run.passed)}/${String(run.total)}` }),
    perClass: Object.freeze(perClass),
    classesWithHeadroom: Object.freeze(perClass.filter((entry) => entry.h0Headroom).map((entry) => entry.classId)),
    classesWithoutHeadroom: Object.freeze(perClass.filter((entry) => !entry.h0Headroom).map((entry) => entry.classId)),
    declaredClassCount: oracle.classIds.length,
    caseCount: oracle.cases.length,
    undeclaredCases: Object.freeze(undeclaredCases),
    unexercisedClasses: Object.freeze(unexercisedClasses),
    classStructure: spec.classStructure,
    /** §"Failure-class requirements": the structural relations are recorded SEPARATELY from observed series. */
    note: 'structural class relations are declared here; observed series equality is computed separately by the qualification engine and does NOT prove semantic redundancy',
  });
}

/**
 * R3-AE §8: the four deterministic precondition facts for one spec, computed from its own bytes. The
 * ANALYSIS must not manufacture these.
 */
export async function preconditionOf(spec, root = SCRATCH) {
  const dir = join(root, `${spec.fixtureId}-precondition-r${String(spec.fixtureRevision)}`);
  rmSync(dir, { recursive: true, force: true });
  for (const [relative, content] of Object.entries(spec.files)) {
    const target = join(dir, relative);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  const acceptanceText = spec.files[spec.acceptanceFile];
  const sourceText = spec.files[spec.sourceFile];
  const modelConsultation = MODEL_CONSULTATION_PATTERNS.filter((pattern) => pattern.test(acceptanceText)).map((pattern) => String(pattern));

  const source = await import(pathToFileURL(join(dir, spec.sourceFile)).href);
  const oracle = await oracleOf(spec, pathToFileURL(join(dir, spec.acceptanceFile)).href);

  const first = oracle.runCases(source[spec.exportName], oracle.cases);
  const second = oracle.runCases(source[spec.exportName], oracle.cases);
  const determinism = (run) => JSON.stringify(run.results.map((result) => [result.id, result.pass, result.failureClass_detail ?? null]));
  const deterministic = determinism(first) === determinism(second);
  const judgesEveryCase = first.results.length === oracle.cases.length && first.results.every((result) => typeof result.pass === 'boolean');

  const declared = new Set(oracle.classIds);
  const undeclaredCases = oracle.cases.filter((testCase) => !declared.has(testCase.failureClass)).map((testCase) => testCase.id);
  const unexercisedClasses = oracle.classIds.filter((classId) => !oracle.cases.some((testCase) => testCase.failureClass === classId));

  return Object.freeze({
    fixtureId: spec.fixtureId,
    fixtureRevision: spec.fixtureRevision,
    contentDigest: contentDigestOf(spec),
    mechanicalOracleProven: deterministic && judgesEveryCase,
    allHiddenCasesDeclareFailureClass: undeclaredCases.length === 0,
    allDeclaredClassesAreExercised: unexercisedClasses.length === 0,
    oracleUsesNoModelSelfReport: modelConsultation.length === 0,
    evidence: Object.freeze({
      deterministic,
      judgesEveryCase,
      casesRun: first.results.length,
      declaredClasses: oracle.classIds,
      undeclaredCases: Object.freeze(undeclaredCases),
      unexercisedClasses: Object.freeze(unexercisedClasses),
      modelConsultationPatternsMatched: Object.freeze(modelConsultation),
      oracleSourceDigest: createHash('sha256').update(acceptanceText, 'utf8').digest('hex'),
      sourceDigest: createHash('sha256').update(sourceText, 'utf8').digest('hex'),
    }),
  });
}

/** Every NEW family's construction audit. */
export async function allConstructionAudits(root = SCRATCH) {
  const out = [];
  for (const fixtureId of NEW_FAMILIES) out.push(await constructionAudit(specFor(fixtureId), root));
  return Object.freeze(out);
}

/** Every NEW family's precondition, keyed by fixture id. */
export async function allPreconditions(root = SCRATCH) {
  const out = {};
  for (const fixtureId of NEW_FAMILIES) out[fixtureId] = await preconditionOf(specFor(fixtureId), root);
  return Object.freeze(out);
}

/** True when all four precondition facts hold. */
export function preconditionSatisfied(precondition) {
  return precondition.mechanicalOracleProven === true
    && precondition.allHiddenCasesDeclareFailureClass === true
    && precondition.allDeclaredClassesAreExercised === true
    && precondition.oracleUsesNoModelSelfReport === true;
}

async function main() {
  const audits = await allConstructionAudits();
  const preconditions = await allPreconditions();
  mkdirSync(join(REPO_ROOT, 'research-evidence', 'r3-a2'), { recursive: true });
  writeFileSync(join(REPO_ROOT, 'research-evidence', 'r3-a2', 'fixture-audit.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-A2', fixtures: audits }, null, 2)}${NL}`, 'utf8');
  writeFileSync(join(REPO_ROOT, 'research-evidence', 'r3-a2', 'fixture-preconditions.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-A2', preconditions }, null, 2)}${NL}`, 'utf8');
  for (const audit of audits) {
    process.stdout.write(`${audit.fixtureId} r${String(audit.fixtureRevision)} — H0 ${audit.h0.raw} over ${String(audit.declaredClassCount)} classes / ${String(audit.caseCount)} cases${NL}`);
    process.stdout.write(`  digest ${audit.contentDigest.slice(0, 16)}…${NL}`);
    for (const entry of audit.perClass) process.stdout.write(`  ${entry.classId} ${entry.invariant}: ${String(entry.passed)}/${String(entry.cases)} passed, headroom=${String(entry.h0Headroom)}${NL}`);
    if (audit.undeclaredCases.length > 0) process.stdout.write(`  UNDECLARED CASES: ${audit.undeclaredCases.join(', ')}${NL}`);
    if (audit.unexercisedClasses.length > 0) process.stdout.write(`  UNEXERCISED CLASSES: ${audit.unexercisedClasses.join(', ')}${NL}`);
  }
  process.stdout.write(`${NL}--- the deterministic QC-6 preconditions ---${NL}`);
  for (const precondition of Object.values(preconditions)) {
    process.stdout.write(`${precondition.fixtureId}: ${preconditionSatisfied(precondition) ? 'SATISFIED' : 'NOT SATISFIED'}${NL}`);
  }
  process.stdout.write(`${NL}combined portfolio: ${COMBINED_SPECS.map((spec) => spec.fixtureId).join(', ')}${NL}`);
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
