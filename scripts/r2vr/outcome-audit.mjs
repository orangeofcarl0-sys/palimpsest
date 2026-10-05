#!/usr/bin/env node
/**
 * R2-VR §6 — THE OUTCOME-SENSITIVITY AND TREATMENT-RELEVANCE AUDIT.
 *
 * R2-V reported that every trial scored 13/14 or 14/14 and that all variance came from one hidden case. That
 * was read from the aggregate `failures` list. §6 requires the MECHANICAL version: re-judge every stored
 * final candidate against EVERY hidden case, so the audit can say which cases vary, which are invariant, and
 * whether the varying cases are addressed by the capital that was actually added.
 *
 * HOW IT AVOIDS A SECOND FETCH PATH OR A RE-RUN. The 20 final candidates were committed inside their
 * worlds during the R2-V matrix and are still on disk as `final-source.txt`. This script re-judges THOSE
 * bytes with the SAME hidden acceptance module the trial used. No worker runs, no model is called, and no
 * R2-V raw record is modified (§2). The outcome is a deterministic function of stored inputs.
 *
 * §6: "Use the existing bundle contents. Do not infer from domain names only." So the relevance test is a
 * mechanical check of each bundle's OWN recorded method clauses against the varying case's invariant, and
 * the result is reported per bundle. A varying case that no ADDED bundle addresses yields
 * UTILITY_ASSAY_OUTCOME_MISMATCH.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { bundleCapital } from '../r2s/candidates.mjs';
import { judgeHidden, SCENARIOS } from '../r2u/scenarios.mjs';
import { ARMS } from '../r2v/design.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const EVIDENCE = join(REPO_ROOT, 'research-evidence', 'r2-vr');
const RIG = join(homedir(), '.palimpsest-r2v', 'matrix');
const SCRATCH = join(homedir(), '.palimpsest-r2v', 'rejudge');
const NL = String.fromCharCode(10);

/**
 * §6: THE BUNDLE→INVARIANT RELEVANCE TABLE, IN TWO TIERS.
 *
 * "Do not infer from domain names only" cuts BOTH ways: a bundle must not be credited for a case merely
 * because it is about "validation" somewhere. So each invariant gets two matchers:
 *
 *   direct   the clause names the OBJECT this invariant is about — for `rejection-leaves-cache-untouched`
 *            that is the cache's own shape and its entries, not validation in general;
 *   generic  the clause states a transferable PRINCIPLE (validate before mutating) about a DIFFERENT
 *            domain object, which a worker might or might not transfer.
 *
 * Only DIRECT coverage counts toward "the added capital addresses this outcome". Generic coverage is
 * reported beside it so the distinction is visible rather than silently rounded.
 */
const RELEVANCE_MATCHERS = Object.freeze({
  'rejection-leaves-cache-untouched': Object.freeze({
    direct: (text) => /(cache's shape|every entry|validate the whole input|every changed id)/iu.test(text),
    generic: (text) => /(validat\w*[^.]*\bbefore\b[^.]*(delet|mutat|appl)|complete all validation before the first mutation)/iu.test(text),
  }),
  'dependent-closure-invalidated': Object.freeze({
    direct: (text) => /(transitive|complete affected set|dependent closure|invalidate the transitive)/iu.test(text),
    generic: (text) => /(delete|invalidate|deleting)/iu.test(text),
  }),
  'ancestors-preserved': Object.freeze({
    direct: (text) => /(and not its dependencies|ancestors|preserve every entry that is still correct)/iu.test(text),
    generic: () => false,
  }),
  'unresolvable-dependency-is-unusable': Object.freeze({
    direct: (text) => /(does not hold as unusable|dependency the cache does not hold)/iu.test(text),
    generic: () => false,
  }),
  'cycle-terminates': Object.freeze({
    direct: (text) => /(terminate on a cycle|cycle)/iu.test(text),
    generic: () => false,
  }),
  'deep-chain-closure': Object.freeze({
    direct: (text) => /(complete affected set|transitive)/iu.test(text),
    generic: () => false,
  }),
  'changed-node-invalidated': Object.freeze({
    direct: (text) => /(delete|invalidate|deleting)/iu.test(text),
    generic: () => false,
  }),
  'unaffected-preserved': Object.freeze({
    direct: (text) => /(preserve every entry that is still correct|unaffected)/iu.test(text),
    generic: () => false,
  }),
  'changed-id-shape-validated': Object.freeze({
    direct: (text) => /(every changed id|cache's shape|validate the whole input)/iu.test(text),
    generic: () => false,
  }),
  'unknown-changed-node-is-harmless': Object.freeze({
    direct: (text) => /(unaffected|still correct)/iu.test(text),
    generic: () => false,
  }),
});

/** The recorded method text of one bundle: its proof, its reasoning and every procedure clause. */
function methodTextOf(bundleId) {
  const bundle = bundleCapital(bundleId);
  return [bundle.proof.statement, bundle.reasoning.statement, ...bundle.procedureClauses.map((clause) => clause.instruction)].join(' ');
}

/** §6: which bundles' RECORDED METHOD covers one invariant DIRECTLY, and which only generically. */
function addressingBundles(invariant) {
  const matcher = RELEVANCE_MATCHERS[invariant];
  if (matcher === undefined) return Object.freeze({ direct: Object.freeze([]), generic: Object.freeze([]) });
  const direct = ['D', 'B', 'C'].filter((bundleId) => matcher.direct(methodTextOf(bundleId)));
  const generic = ['D', 'B', 'C'].filter((bundleId) => !direct.includes(bundleId) && matcher.generic(methodTextOf(bundleId)));
  return Object.freeze({ direct: Object.freeze(direct), generic: Object.freeze(generic) });
}

/**
 * Re-judge one stored final candidate against every hidden case.
 *
 * @param {string} sourceText the committed final source
 * @param {string} label a scratch-directory label so two judgements cannot collide
 */
async function perCaseResults(sourceText, label) {
  const scratch = join(SCRATCH, label);
  rmSync(scratch, { recursive: true, force: true });
  const judgement = await judgeHidden(SCENARIOS.D, sourceText, scratch);
  const byCase = {};
  for (const result of judgement.results) byCase[result.id] = { pass: result.pass, failureClass: result.failureClass ?? null, invariant: result.invariant ?? null };
  return { byCase, passed: judgement.passed, total: judgement.total };
}

async function main() {
  const { readdirSync } = await import('node:fs');
  const runRoots = existsSync(RIG) ? readdirSync(RIG, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith('runs-')).map((entry) => join(RIG, entry.name)).sort() : [];
  const runDir = runRoots[runRoots.length - 1];
  if (runDir === undefined) throw new Error(`no R2-V run directory under ${RIG}; the stored final candidates are required for a no-stochastic-run audit`);

  mkdirSync(SCRATCH, { recursive: true });
  const trials = [];
  for (const entry of readdirSync(runDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('D-')) continue;
    const recordPath = join(runDir, entry.name, 'out', 'trial.json');
    const sourcePath = join(runDir, entry.name, 'out', 'final-source.txt');
    if (!existsSync(recordPath) || !existsSync(sourcePath)) continue;
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    const source = readFileSync(sourcePath, 'utf8');
    const judged = await perCaseResults(source, entry.name);
    trials.push(Object.freeze({
      trialId: entry.name,
      condition: record.condition,
      block: record.block,
      consumedBundles: record.consumedBundles,
      perCase: judged.byCase,
      passed: judged.passed,
      total: judged.total,
    }));
    process.stdout.write(`re-judged ${entry.name} ${String(judged.passed)}/${String(judged.total)}${NL}`);
  }

  /**
   * §6: WHICH CASES VARY. A case is invariant when all 20 candidates agree on it. The invariant name is
   * read from the acceptance module's own case list through the first candidate that reports it.
   */
  const caseIds = [...new Set(trials.flatMap((trial) => Object.keys(trial.perCase)))].sort();
  const caseAudit = caseIds.map((caseId) => {
    const outcomes = trials.map((trial) => trial.perCase[caseId]);
    const passes = outcomes.filter((outcome) => outcome?.pass === true).length;
    const invariant = outcomes.find((outcome) => outcome?.invariant !== null && outcome?.invariant !== undefined)?.invariant ?? 'UNKNOWN';
    const failureClasses = [...new Set(outcomes.filter((outcome) => outcome !== undefined && outcome.pass === false).map((outcome) => outcome.failureClass))];
    return Object.freeze({
      caseId,
      invariant,
      passes: `${String(passes)}/${String(trials.length)}`,
      varies: passes > 0 && passes < trials.length,
      invariantAcrossAll: passes === trials.length || passes === 0,
      failureClasses: Object.freeze(failureClasses),
      /** §6: which bundles' RECORDED METHOD mechanically covers this invariant, direct vs generic. */
      addressedBy: addressingBundles(invariant).direct,
      addressedGenericallyBy: addressingBundles(invariant).generic,
    });
  });

  const varying = caseAudit.filter((entry) => entry.varies);
  const invariantCases = caseAudit.filter((entry) => entry.invariantAcrossAll);

  /**
   * §6: THE MISMATCH RULING. D is present in EVERY arm, so it is the constant, not the treatment. The
   * question is whether the ADDED capital (B and/or C) addresses any VARYING case. If none does, the
   * assay's outcome variation cannot be attributed to the added capital at all.
   */
  const addedByArm = { V1: ['B'], V2: ['C'], V3: ['B', 'C'] };
  const addedBundles = [...new Set(Object.values(addedByArm).flat())];
  const varyingAddressedByAdded = varying.filter((entry) => entry.addressedBy.some((bundleId) => addedBundles.includes(bundleId)));
  const varyingAddressedByDOnly = varying.filter((entry) => entry.addressedBy.includes('D') && !entry.addressedBy.some((bundleId) => addedBundles.includes(bundleId)));
  const outcomeMismatch = varying.length > 0 && varyingAddressedByAdded.length === 0;

  const audit = Object.freeze({
    schemaVersion: 1,
    stage: 'R2-VR',
    kind: 'outcome-sensitivity and treatment-relevance audit',
    method: 'the 20 stored final candidates re-judged against every hidden case with the same acceptance module; no worker ran and no R2-V record was modified',
    trialsJudged: trials.length,
    casesAudited: caseAudit.length,
    caseAudit,
    varyingCases: varying.map((entry) => entry.caseId),
    invariantCases: invariantCases.map((entry) => entry.caseId),
    invariantCaseCount: invariantCases.length,
    /**
     * §6: the mechanism finding. Every trial scored 13/14 or 14/14, so the ONLY variation available is the
     * single varying case, and that case is addressed by the D bundle's first clause — which is present in
     * every arm — rather than by the ADDED capital.
     */
    mechanism: Object.freeze({
      addedBundles,
      varyingAddressedByAdded: varyingAddressedByAdded.map((entry) => entry.caseId),
      varyingAddressedByDOnly: varyingAddressedByDOnly.map((entry) => `${entry.caseId} (addressed by D, present in every arm)`),
      varyingAddressedGenerically: varying.map((entry) => ({ caseId: entry.caseId, by: entry.addressedGenericallyBy })),
      dIsConstantAcrossArms: true,
      note: 'D is in every arm, so a case that only D addresses cannot vary WITH the treatment. A GENERIC clause ("validate before mutating", stated about another domain object) is not direct coverage of the cache-entry-shape check h14 performs; it is reported separately rather than counted as relevance.',
    }),
    outcomeMismatch,
    ruling: outcomeMismatch ? 'UTILITY_ASSAY_OUTCOME_MISMATCH' : 'OUTCOME_VARIES_AND_IS_ADDRESSED_BY_ADDED_CAPITAL',
    trials,
  });

  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, 'outcome-audit.json'), `${JSON.stringify(audit, null, 2)}${NL}`, 'utf8');
  process.stdout.write(`${NL}R2-VR OUTCOME AUDIT — ${String(trials.length)} candidates × ${String(caseAudit.length)} cases${NL}`);
  process.stdout.write(`  varying cases: ${varying.length === 0 ? '(none)' : varying.map((entry) => `${entry.caseId} (${entry.passes})`).join(', ')}${NL}`);
  process.stdout.write(`  invariant cases: ${String(invariantCases.length)}/${String(caseAudit.length)}${NL}`);
  process.stdout.write(`  ruling: ${audit.ruling}${NL}`);
}

await main();
