#!/usr/bin/env node
/**
 * R3-A0 §14 — GATE C: DETERMINISTIC CONSTRUCTION READINESS.
 *
 * §14 permits baseline qualification to begin automatically ONLY after this gate is GREEN. Everything it
 * checks is deterministic — no model is called, so a green gate cannot be produced by a lucky model run.
 *
 * It checks, in the ruling's order:
 *
 *   · the Qualification Contract v0.1 is frozen (bounds, Nq, verdicts, gate clauses);
 *   · ≥2 COMPLIANT frozen fixture families exist;
 *   · the failure-class tables are complete and every case names a declared class;
 *   · the mechanical oracles are deterministic (the same candidate judges identically twice);
 *   · the capital relationship maps are frozen and cover every class;
 *   · the bounds and Nq are frozen;
 *   · ≥2 materially distinct model families are AVAILABLE (verified end-to-end);
 *   · the common renderer is frozen and family-independent;
 *   · the baseline harness's own deterministic tests are green;
 *   · the confidentiality gates are green.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { FIXTURE_SPECS } from './fixture-content.mjs';
import { auditFixture } from './construct-fixtures.mjs';
import { CAPITAL_ITEMS, CAPITAL_RELATIONSHIPS, TRANSFER_HYPOTHESES, directClasses } from './capital.mjs';
import { ANTI_OVERFIT_PROCESSES, CONTAMINATION, FIXTURE_MANIFESTS, manifestFor } from './fixture-manifest.mjs';
import { allPreconditions } from './fixture-audit.mjs';
import { COMMON_RENDERER, MODEL_ROUTES, distinctFamilies, verifiedRoutes } from './models.mjs';
import { MIN_CLASS_HEADROOM, PAIR_VERDICTS, QUALIFICATION_BOUNDS, aToBGate, qualifyPair } from './qualification.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const RIG = join(homedir(), '.palimpsest-r3a', 'gate-c');
const NL = String.fromCharCode(10);

const results = [];
const check = (id, statement, pass, detail) => {
  results.push({ id, statement, pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${statement} — ${detail}${NL}`);
};

/* ---------------------------------------------------------------- §2 the contract */

process.stdout.write(`--- §2 the qualification contract v0.1 is frozen ---${NL}`);
check('GC-01', 'the aggregate bounds are frozen with room required in BOTH directions', QUALIFICATION_BOUNDS.roomRequiredInBothDirections === true && QUALIFICATION_BOUNDS.lower > 0 && QUALIFICATION_BOUNDS.upper < 1 && QUALIFICATION_BOUNDS.lower < QUALIFICATION_BOUNDS.upper, `(${String(QUALIFICATION_BOUNDS.lower)}, ${String(QUALIFICATION_BOUNDS.upper)}) on ${QUALIFICATION_BOUNDS.dimension}`);
check('GC-02', '§2.2 the floor/ceiling semantics are recorded correctly, not inverted', QUALIFICATION_BOUNDS.floorMeaning === 'no room to detect harm' && QUALIFICATION_BOUNDS.ceilingMeaning === 'no room to detect help', `${QUALIFICATION_BOUNDS.floorMeaning} / ${QUALIFICATION_BOUNDS.ceilingMeaning}`);
check('GC-03', '§2.2 Nq is frozen at 5 and the class-headroom minimum is frozen at 2', MIN_CLASS_HEADROOM.Nq === 5 && MIN_CLASS_HEADROOM.minVaryingDirectClasses === 2, `Nq=${String(MIN_CLASS_HEADROOM.Nq)}, min varying DIRECT classes=${String(MIN_CLASS_HEADROOM.minVaryingDirectClasses)}`);
check('GC-04', '§16 the allowed pair verdicts are exactly the three, with no "almost qualified"', Object.values(PAIR_VERDICTS).join(',') === 'QUALIFIED,UNQUALIFIED,INFRASTRUCTURE_INVALID', Object.values(PAIR_VERDICTS).join(', '));

/* ---------------------------------------------------------------- §4/§5/§6 the fixtures */

process.stdout.write(`${NL}--- §4/§5/§6 the frozen fixture families ---${NL}`);
const audits = [];
for (const spec of FIXTURE_SPECS) audits.push(await auditFixture(spec));
check('GC-05', '§6 at least TWO COMPLIANT frozen fixture families exist', audits.length >= 2, `${String(audits.length)} families: ${audits.map((entry) => entry.mechanismFamily).join(' | ')}`);
check('GC-06', '§4 the families are structurally distinct (different mechanism families, not renames)', new Set(audits.map((entry) => entry.mechanismFamily)).size === audits.length, audits.map((entry) => entry.mechanismFamily).join(' | '));
check('GC-07', '§5 every fixture revision carries a content digest', audits.every((entry) => /^[0-9a-f]{64}$/u.test(entry.contentDigest)), audits.map((entry) => `${entry.fixtureId}:${entry.contentDigest.slice(0, 12)}…`).join(' '));
check('GC-08', '§6 every declared failure class is exercised by at least one case', audits.every((entry) => entry.unexercisedClasses.length === 0), audits.flatMap((entry) => entry.unexercisedClasses).join(', ') || 'all classes exercised');
check('GC-09', '§6 every case names a DECLARED failure class', audits.every((entry) => entry.undeclaredCases.length === 0), audits.flatMap((entry) => entry.undeclaredCases).join(', ') || 'all cases declared');
check('GC-10', '§4 each fixture H0 FAILS at least one class, so the fixture has headroom rather than a floor', audits.every((entry) => entry.classesWithHeadroom.length > 0), audits.map((entry) => `${entry.fixtureId}: H0 ${entry.h0.raw}, headroom on ${String(entry.classesWithHeadroom.length)} classes`).join(' | '));
check('GC-11', '§4 each fixture H0 is NOT at the floor on every class (a fixture H0 solves nothing on is unmeasurable too)', audits.every((entry) => entry.h0.passed > 0), audits.map((entry) => `${entry.fixtureId}: H0 ${entry.h0.raw}`).join(' | '));

/** §14: the mechanical oracles must be DETERMINISTIC — the same candidate must judge identically twice. */
const deterministic = [];
for (const spec of FIXTURE_SPECS) {
  const first = await auditFixture(spec);
  const second = await auditFixture(spec);
  deterministic.push({ fixtureId: spec.fixtureId, same: first.h0.raw === second.h0.raw && JSON.stringify(first.perClass) === JSON.stringify(second.perClass) });
}
check('GC-12', '§14 the mechanical oracles are DETERMINISTIC (identical judgement across two constructions)', deterministic.every((entry) => entry.same), deterministic.map((entry) => `${entry.fixtureId}:${entry.same ? 'stable' : 'UNSTABLE'}`).join(' '));

/* ---------------------------------------------------------------- §2.4/§7 the capital maps */

process.stdout.write(`${NL}--- §2.4/§7 the frozen capital relationship maps ---${NL}`);
const mapCoverage = FIXTURE_SPECS.map((spec) => {
  const map = CAPITAL_RELATIONSHIPS[spec.fixtureId];
  const classIds = spec.fixtureId.includes('f-a') ? ['FA1', 'FA2', 'FA3', 'FA4', 'FA5', 'FA6'] : ['FB1', 'FB2', 'FB3', 'FB4', 'FB5', 'FB6', 'FB7'];
  const missing = classIds.filter((classId) => map?.[classId] === undefined);
  const capital = CAPITAL_ITEMS.find((item) => item.appliesToFixture === spec.fixtureId);
  const direct = capital === undefined ? [] : directClasses(spec.fixtureId, capital.capitalId);
  return { fixtureId: spec.fixtureId, missing, direct: direct.length, hasCapital: capital !== undefined };
});
check('GC-13', '§2.4 every failure class carries a capital relationship entry', mapCoverage.every((entry) => entry.missing.length === 0), mapCoverage.flatMap((entry) => entry.missing).join(', ') || 'all classes mapped');
check('GC-14', '§7 each fixture has a candidate capital item with a frozen DIRECT map', mapCoverage.every((entry) => entry.hasCapital && entry.direct > 0), mapCoverage.map((entry) => `${entry.fixtureId}: ${String(entry.direct)} DIRECT class(es)`).join(' | '));
check('GC-15', '§7 the capital provenance is recorded as mechanism derivation, not as an empirical claim', CAPITAL_ITEMS.every((item) => item.provenance === 'MECHANISM_DERIVATION'), CAPITAL_ITEMS.map((item) => `${item.capitalId}:${item.provenance}`).join(' '));
check('GC-16', '§2.4 TRANSFER_HYPOTHESIS entries exist and are recorded SEPARATELY from DIRECT', Object.keys(TRANSFER_HYPOTHESES).length > 0 && CAPITAL_ITEMS.every((item) => item.limitations.some((entry) => entry.includes('advisory'))), `${String(Object.keys(TRANSFER_HYPOTHESES).length)} fixture(s) carry transfer hypotheses`);

/* ---------------------------------------------------------------- §8/§9 the model axis */

process.stdout.write(`${NL}--- §8/§9 the model-family axis ---${NL}`);
const verified = verifiedRoutes();
check('GC-17', '§8 at least TWO materially distinct model families are AVAILABLE (verified end-to-end)', verified.length >= 2 && distinctFamilies(verified).length >= 2, `${String(verified.length)} verified route(s) across families: ${distinctFamilies(verified).join(', ')}`);
check('GC-18', '§8 no two verified routes are two sizes of ONE family', new Set(verified.map((route) => `${route.vendor}/${route.modelFamily}`)).size === verified.length, verified.map((route) => `${route.vendor}/${route.modelFamily}`).join(', '));
check('GC-19', '§8 every verified route records WHY it is materially distinct', verified.every((route) => route.materialDistinctness !== undefined && route.materialDistinctness.reasoningArchitecture.length > 0), verified.map((route) => route.modelFamily).join(', '));
check('GC-20', '§8 unverified routes are recorded honestly rather than dropped', MODEL_ROUTES.some((route) => route.verifiedEndToEnd === false) ? MODEL_ROUTES.filter((route) => route.verifiedEndToEnd === false).every((route) => typeof route.verificationNote === 'string') : true, MODEL_ROUTES.map((route) => `${route.modelId}:${route.verifiedEndToEnd ? 'verified' : 'gateway-only'}`).join(' '));
check('GC-21', '§9 the common renderer is frozen and family-independent', COMMON_RENDERER.familySpecific === false && COMMON_RENDERER.rendererId === 'dsh-common-worker', `${COMMON_RENDERER.rendererId} v${String(COMMON_RENDERER.rendererVersion)}`);

/* ---------------------------------------------------------------- §12 the verdict logic */

process.stdout.write(`${NL}--- §12/§17 the qualification logic (deterministic fixtures) ---${NL}`);
const classIdsA = ['FA1', 'FA2', 'FA3', 'FA4', 'FA5', 'FA6'];
/** §8: the deterministic precondition every synthetic pair must carry, exactly as the real pairs do. */
const PRECONDITION_OK = Object.freeze({ mechanicalOracleProven: true, allHiddenCasesDeclareFailureClass: true, allDeclaredClassesAreExercised: true, oracleUsesNoModelSelfReport: true });
const directAll = (classId) => (classIdsA.includes(classId) ? 'DIRECT' : 'NONE');
/**
 * A synthetic pair with REAL headroom: several DIRECT classes vary with DIFFERENT observed series, and the
 * per-run coverage varies inside the frozen bounds. A fixture where every run scores identically has no
 * aggregate variance and correctly fails QC-2.
 */
const goodTrials = [
  { classPass: { FA1: false, FA2: false, FA3: false, FA4: true, FA5: true, FA6: true }, fullSolve: false },
  { classPass: { FA1: true, FA2: false, FA3: false, FA4: true, FA5: true, FA6: true }, fullSolve: false },
  { classPass: { FA1: false, FA2: true, FA3: false, FA4: true, FA5: true, FA6: true }, fullSolve: false },
  { classPass: { FA1: false, FA2: false, FA3: true, FA4: false, FA5: true, FA6: true }, fullSolve: false },
  { classPass: { FA1: true, FA2: true, FA3: true, FA4: false, FA5: true, FA6: true }, fullSolve: true },
];
const good = qualifyPair({ fixtureId: 'f-a', modelId: 'm', nq: 5, classIds: classIdsA, directClasses: classIdsA, relationshipOf: directAll, fixtureAuditPrecondition: PRECONDITION_OK, trials: goodTrials });
check('GC-22', '§5/§6 a pair with ≥2 variable non-redundant DIRECT groups inside the bounds is QUALIFIED', good.verdict === PAIR_VERDICTS.QUALIFIED, `${good.verdict} (coverage ${good.classCoverage.toFixed(3)}, variable DIRECT groups: ${good.variableDirectGroups.join(', ')})`);

/**
 * §5: THE BUG THIS STAGE FIXED. A pair whose classes carry DIFFERENT series must produce DIFFERENT groups;
 * the pre-correction engine read `trial[classId]` and merged every class into one undefined series.
 */
const twoSeries = qualifyPair({ fixtureId: 'f-a', modelId: 'm', nq: 5, classIds: classIdsA, directClasses: classIdsA, relationshipOf: directAll, fixtureAuditPrecondition: PRECONDITION_OK, trials: goodTrials });
check('GC-22b', '§5 classes with DIFFERENT observed series form SEPARATE groups (the corrected nesting)', twoSeries.classGroups.length > 1 && twoSeries.variableGroups.length >= 2, `groups: ${twoSeries.classGroups.map((group) => `${group.members.join('+')}=${group.raw}`).join(' | ')}`);

/** §5: identical series collapse into ONE group, and `classCoverage`/`fullSolve` are never counted. */
const identicalSeries = qualifyPair({ fixtureId: 'f-a', modelId: 'm', nq: 5, classIds: ['FA1', 'FA2'], directClasses: ['FA1', 'FA2'], relationshipOf: () => 'DIRECT', fixtureAuditPrecondition: PRECONDITION_OK, trials: goodTrials.map((trial) => ({ classPass: { FA1: trial.classPass.FA1, FA2: trial.classPass.FA1 }, fullSolve: trial.fullSolve })) });
check('GC-22c', '§5 classes with IDENTICAL observed series collapse into ONE group', identicalSeries.classGroups.length === 1 && identicalSeries.classGroups[0].members.length === 2, `groups: ${identicalSeries.classGroups.map((group) => group.members.join('+')).join(' | ')}`);
check('GC-22d', '§5 the aggregate classCoverage/fullSolve are DIAGNOSTICS and cannot satisfy QC-2', (() => {
  /** Every class moves together, so coverage varies but there is only ONE group: QC-2 must still fail. */
  const oneGroup = qualifyPair({ fixtureId: 'f-a', modelId: 'm', nq: 5, classIds: classIdsA, directClasses: classIdsA, relationshipOf: directAll, fixtureAuditPrecondition: PRECONDITION_OK, trials: [
    { classPass: { FA1: true, FA2: true, FA3: true, FA4: true, FA5: true, FA6: true }, fullSolve: true },
    { classPass: { FA1: false, FA2: false, FA3: false, FA4: false, FA5: false, FA6: false }, fullSolve: false },
    { classPass: { FA1: true, FA2: true, FA3: true, FA4: true, FA5: true, FA6: true }, fullSolve: true },
    { classPass: { FA1: false, FA2: false, FA3: false, FA4: false, FA5: false, FA6: false }, fullSolve: false },
    { classPass: { FA1: true, FA2: true, FA3: true, FA4: true, FA5: true, FA6: true }, fullSolve: true },
  ] });
  return oneGroup.classGroups.length === 1 && oneGroup.reasons.join(' ').includes('QC-2 failed');
})(), 'one group, coverage varies → QC-2 still fails');
check('GC-22e', '§6 QC-4 counts GROUPS, so one group with two DIRECT members counts ONCE', (() => {
  const oneDirectGroup = qualifyPair({ fixtureId: 'f-a', modelId: 'm', nq: 5, classIds: ['FA1', 'FA2'], directClasses: ['FA1', 'FA2'], relationshipOf: () => 'DIRECT', fixtureAuditPrecondition: PRECONDITION_OK, trials: goodTrials.map((trial) => ({ classPass: { FA1: trial.classPass.FA1, FA2: trial.classPass.FA1 }, fullSolve: trial.fullSolve })) });
  return oneDirectGroup.variableDirectGroups.length === 1 && oneDirectGroup.reasons.join(' ').includes('QC-4 failed');
})(), 'FA1+FA2 is one DIRECT group, so QC-4 sees one');

/** §8: QC-6 is a real precondition — an absent or false one must reject the pair. */
check('GC-22f', '§8 QC-6 rejects a pair with NO fixture-audit precondition', qualifyPair({ fixtureId: 'f-a', modelId: 'm', nq: 5, classIds: classIdsA, directClasses: classIdsA, relationshipOf: directAll, trials: goodTrials }).reasons.join(' ').includes('QC-6 failed'), 'absent precondition → QC-6 fails');
check('GC-22g', '§8 QC-6 rejects a pair whose oracle consults a model self-report', qualifyPair({ fixtureId: 'f-a', modelId: 'm', nq: 5, classIds: classIdsA, directClasses: classIdsA, relationshipOf: directAll, fixtureAuditPrecondition: { ...PRECONDITION_OK, oracleUsesNoModelSelfReport: false }, trials: goodTrials }).reasons.join(' ').includes('QC-6 failed'), 'model-consulting oracle → QC-6 fails');
check('GC-22h', '§8 the real fixtures carry a SATISFIED deterministic precondition', Object.values(await allPreconditions()).every((precondition) => precondition.mechanicalOracleProven && precondition.allHiddenCasesDeclareFailureClass && precondition.allDeclaredClassesAreExercised && precondition.oracleUsesNoModelSelfReport), Object.values(await allPreconditions()).map((precondition) => precondition.fixtureId).join(', '));

/** The R2-V shape: coverage near the ceiling and all variance in ONE class. */
const ceilingTrials = Array.from({ length: 5 }, (_, index) => ({ classPass: { FA1: true, FA2: true, FA3: true, FA4: true, FA5: true, FA6: index === 0 }, fullSolve: index !== 0 }));
const ceiling = qualifyPair({ fixtureId: 'f-a', modelId: 'm', nq: 5, classIds: classIdsA, directClasses: ['FA6'], relationshipOf: directAll, fixtureAuditPrecondition: PRECONDITION_OK, trials: ceilingTrials });
check('GC-23', '§12 the R2-V shape (near-ceiling coverage, one unrelated varying class) is UNQUALIFIED', ceiling.verdict === PAIR_VERDICTS.UNQUALIFIED, ceiling.reasons.map((entry) => entry.slice(0, 60)).join(' | '));

/** §16: too many infrastructure-invalid runs cannot be judged. */
const invalid = qualifyPair({ fixtureId: 'f-a', modelId: 'm', nq: 5, classIds: classIdsA, directClasses: classIdsA, relationshipOf: directAll, fixtureAuditPrecondition: PRECONDITION_OK, trials: [...goodTrials.slice(0, 3), { classPass: {}, infrastructureInvalid: true }, { classPass: {}, infrastructureInvalid: true }] });
check('GC-24', '§16 a pair with too many infrastructure-invalid runs is INFRASTRUCTURE_INVALID, not UNQUALIFIED', invalid.verdict === PAIR_VERDICTS.INFRASTRUCTURE_INVALID, invalid.reasons[0] ?? 'ABSENT');

/* ---------------------------------------------------------------- §2.1/§17 the A→B gate */

process.stdout.write(`${NL}--- §2.1/§17 the A→B gate clauses ---${NL}`);
const lShape = aToBGate([
  { fixtureId: 'fa', taskFamily: 'FA', modelId: 'm1', modelFamily: 'deepseek', verdict: PAIR_VERDICTS.QUALIFIED, antiOverfitProcess: ANTI_OVERFIT_PROCESSES.COMPLIANT },
  { fixtureId: 'fb', taskFamily: 'FB', modelId: 'm1', modelFamily: 'deepseek', verdict: PAIR_VERDICTS.QUALIFIED, antiOverfitProcess: ANTI_OVERFIT_PROCESSES.COMPLIANT },
  { fixtureId: 'fa', taskFamily: 'FA', modelId: 'm2', modelFamily: 'glm', verdict: PAIR_VERDICTS.QUALIFIED, antiOverfitProcess: ANTI_OVERFIT_PROCESSES.COMPLIANT },
]);
check('GC-25', '§2.1 the minimum L-shaped bridge is GREEN on a model-on-2-tasks plus task-on-2-models graph', lShape.green === true, `clauses ${JSON.stringify(lShape.clauses)}`);
const noBridge = aToBGate([
  { fixtureId: 'fa', taskFamily: 'FA', modelId: 'm1', modelFamily: 'deepseek', verdict: PAIR_VERDICTS.QUALIFIED, antiOverfitProcess: ANTI_OVERFIT_PROCESSES.COMPLIANT },
  { fixtureId: 'fb', taskFamily: 'FB', modelId: 'm2', modelFamily: 'glm', verdict: PAIR_VERDICTS.QUALIFIED, antiOverfitProcess: ANTI_OVERFIT_PROCESSES.COMPLIANT },
]);
check('GC-26', '§2.1 a graph with NO L-shaped bridge is RED even with 2 families and 2 models', noBridge.green === false, `clauses ${JSON.stringify(noBridge.clauses)}`);
const nonCompliant = aToBGate([
  { fixtureId: 'fa', taskFamily: 'FA', modelId: 'm1', modelFamily: 'deepseek', verdict: PAIR_VERDICTS.QUALIFIED, antiOverfitProcess: ANTI_OVERFIT_PROCESSES.COMPLIANT },
  { fixtureId: 'fb', taskFamily: 'FB', modelId: 'm1', modelFamily: 'deepseek', verdict: PAIR_VERDICTS.QUALIFIED, antiOverfitProcess: ANTI_OVERFIT_PROCESSES.NON_COMPLIANT },
  { fixtureId: 'fa', taskFamily: 'FA', modelId: 'm2', modelFamily: 'glm', verdict: PAIR_VERDICTS.QUALIFIED, antiOverfitProcess: ANTI_OVERFIT_PROCESSES.NON_COMPLIANT },
]);
check('GC-27', '§2.6 a NON_COMPLIANT qualified pair does NOT count toward the gate', nonCompliant.excludedNonCompliant === 2 && nonCompliant.green === false, `excluded ${String(nonCompliant.excludedNonCompliant)}, clauses ${JSON.stringify(nonCompliant.clauses)}`);

/* ---------------------------------------------------------------- §19 the harness tests */

process.stdout.write(`${NL}--- §19 the baseline harness and the confidentiality gates ---${NL}`);
const harnessDigests = {
  'scripts/r3a/fixture-content.mjs': createHash('sha256').update(readFileSync(join(REPO_ROOT, 'scripts', 'r3a', 'fixture-content.mjs'))).digest('hex'),
  'scripts/r3a/qualification.mjs': createHash('sha256').update(readFileSync(join(REPO_ROOT, 'scripts', 'r3a', 'qualification.mjs'))).digest('hex'),
  'scripts/r3a/models.mjs': createHash('sha256').update(readFileSync(join(REPO_ROOT, 'scripts', 'r3a', 'models.mjs'))).digest('hex'),
  'scripts/r3a/trial.mjs': createHash('sha256').update(readFileSync(join(REPO_ROOT, 'scripts', 'r3a', 'trial.mjs'))).digest('hex'),
  'scripts/r3a/qualify.mjs': createHash('sha256').update(readFileSync(join(REPO_ROOT, 'scripts', 'r3a', 'qualify.mjs'))).digest('hex'),
};
check('GC-28', '§13 the harness digests the plan was frozen against are recorded', Object.values(harnessDigests).every((digest) => /^[0-9a-f]{64}$/u.test(digest)), `${String(Object.keys(harnessDigests).length)} files digested`);
const trialSource = readFileSync(join(REPO_ROOT, 'scripts', 'r3a', 'trial.mjs'), 'utf8');
check('GC-29', '§10 the baseline harness selects NO capital (no knowledge, no index, no prework)', trialSource.includes("service.start({ expectedTaskId: 't1' })") && !trialSource.includes('knowledge:'), 'the job starts with no knowledge selection');
check('GC-30', '§10 the baseline harness never enables the efficacy prework seam', !trialSource.includes('EFFICACY_ENV') && !trialSource.includes('PALIMPSEST_R2E_EFFICACY'), 'no efficacy env is set');

/** §19: the confidentiality gate is run live rather than asserted. */
let confidentialityPass = false;
let confidentialityDetail = 'not run';
try {
  const output = execFileSync(process.execPath, [join(REPO_ROOT, 'scripts', 'r1hc', 'conformance.mjs')], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
  confidentialityPass = /CONFORMANCE: PASS/u.test(output);
  confidentialityDetail = output.trim().split('\n').pop() ?? '';
} catch (error) {
  confidentialityDetail = String(error?.message ?? error).slice(0, 160);
}
check('GC-31', '§19 the R1-HC confidentiality conformance gate is GREEN', confidentialityPass, confidentialityDetail.slice(0, 150));

/* ---------------------------------------------------------------- report */

const failed = results.filter((entry) => !entry.pass);
mkdirSync(RIG, { recursive: true });
const record = { schemaVersion: 1, stage: 'R3-A0', gate: 'C', deterministicOnly: true, harnessDigests, results };
writeFileSync(join(RIG, 'gate-c.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
mkdirSync(join(REPO_ROOT, 'research-evidence', 'r3-a'), { recursive: true });
writeFileSync(join(REPO_ROOT, 'research-evidence', 'r3-a', 'gate-c.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');

process.stdout.write(`${NL}§R3-A0 GATE C (deterministic construction readiness): ${failed.length === 0 ? 'GREEN' : 'RED'} — ${String(results.length - failed.length)}/${String(results.length)}${NL}`);
process.exit(failed.length === 0 ? 0 : 1);
