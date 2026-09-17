#!/usr/bin/env node
/**
 * RC-1E §44 — compose the RC-1E release evidence from the live gate runs.
 *
 *   node scripts/release/rc1e-evidence.mjs
 *
 * Inputs (each produced by `scripts/release/rc1-live-cross-project.mjs`):
 *   release-evidence/rc1e-live-cross-project-d.json   Scenario D, 5 fresh trials (§25)
 *   release-evidence/rc1e-live-cross-project-e.json   Scenario E, 5 fresh trials (§24)
 * and optionally `release-evidence/rc1e-live-local-smoke.json` (Scenario A smoke, §26).
 *
 * Output: `release-evidence/rc1e-live-cross-project.json` — the RC-1E bundle.
 *
 * §28 shape: every trial keeps its RAW OBSERVATIONS and its DERIVED JUDGEMENT separately,
 * with the judgement RE-DERIVED from the observations by the current oracle at compose time
 * (so a rule repair never requires re-sampling). §17 shape: an infrastructure error is
 * retained, listed and excluded from the rate. Every trial records which file it came from.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = join(import.meta.dirname, '..', '..');
const EVIDENCE = join(REPO, 'release-evidence');

const oracle = await import(pathToFileURL(join(REPO, 'dist', 'test', 'support', 'rc1_oracle.js')).href);

const read = (name) => {
  const path = join(EVIDENCE, name);
  if (!existsSync(path)) throw new Error(`missing live evidence: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
};

const dRun = read('rc1e-live-cross-project-d.json');
const eRun = read('rc1e-live-cross-project-e.json');
const smoke = existsSync(join(EVIDENCE, 'rc1e-live-local-smoke.json'))
  ? read('rc1e-live-local-smoke.json')
  : undefined;

const SCN = { d: 'rc1e-live-cross-project-d.json', e: 'rc1e-live-cross-project-e.json' };

/** §28: re-derive the judgement from the stored observations with the CURRENT oracle. */
const entries = [
  ...dRun.trials.map((record) => ({ source: SCN.d, record })),
  ...eRun.trials.map((record) => ({ source: SCN.e, record })),
].map((entry) => {
  const raw = oracle.crossRawOfHarnessRecord(entry.record);
  const derived = oracle.judgeCrossTrial(raw);
  return {
    ...entry,
    raw,
    derived,
    judgementChanged: derived.verdict !== entry.record.judgment.verdict,
  };
});

const of = (scenario) => entries.filter((entry) => entry.raw.scenario === scenario);
const d = of('D_cross_project_ask');
const e = of('E_remote_local_collaboration');
const judge = (list) => oracle.qualifyScenario(list.map((entry) => entry.derived), { minimumSample: 5 });

const violations = entries.filter((entry) => entry.derived.violations.length > 0);
const copyFailures = entries.filter((entry) => entry.derived.copyMisrepresentation.length > 0);
const infra = entries.filter((entry) => entry.derived.verdict === 'INFRASTRUCTURE_ERROR');
const branchCatalogues = entries.flatMap((entry) =>
  [...entry.raw.origin.branchCatalogues, ...entry.raw.remote.branchCatalogues].map((catalogue) => ({
    scenario: entry.raw.scenario,
    trial: entry.record.trial,
    catalogue,
  })),
);

/** §39 — the per-trial evidence the RC-1E spec names, straight off the judgement. */
const routeEvidence = (entry) => ({
  remoteLocalCollaborationRoute: entry.derived.remoteLocalCollaborationRoute ?? 'NONE',
  remoteCollaborationExecutionKinds: entry.derived.remoteCollaborationExecutionKinds ?? [],
  remoteComposeIntents: entry.derived.remoteComposeIntents ?? [],
  remoteFindingStandings: entry.derived.remoteFindingStandings ?? [],
  remoteBranchProcessCount: entry.derived.remoteBranchProcessCount ?? 0,
  remoteBranchCatalogues: entry.derived.remoteBranchCatalogues ?? [],
  remoteBranchIsolationProven: entry.derived.remoteBranchIsolationProven === true,
  remoteExploreActuallyRan: entry.derived.remoteExploreActuallyRan === true,
  responseStatus: entry.derived.terminalStatus ?? null,
  originSurfaced: entry.derived.surfaced === true,
  answerTextChars: (entry.derived.answerText ?? '').length,
});

const trialEntry = (entry) => ({
  source: entry.source,
  scenario: entry.raw.scenario,
  trial: entry.record.trial,
  prompt: entry.record.prompt,
  // §28: observations and judgement are never fused.
  rawObservations: {
    prompt: entry.record.prompt,
    userPromptsUsed: entry.record.userPromptsUsed,
    fixtureFailure: entry.record.fixtureFailure,
    sharedTransport: entry.record.sharedTransport,
    sharedWorkspaceFiles: entry.record.sharedWorkspaceFiles,
    pollFailure: entry.record.pollFailure,
    originExitedBeforeCompletion: entry.record.originExitedBeforeCompletion,
    wallMs: entry.record.wallMs,
    tokenUsage: entry.record.tokenUsage,
    origin: entry.record.origin,
    remote: entry.record.remote,
  },
  harnessJudgment: entry.record.judgment,
  derivedJudgment: entry.derived,
  judgementChanged: entry.judgementChanged,
  routeEvidence: routeEvidence(entry),
});

const dQualified = judge(d);
const eQualified = judge(e);
const criteriaSatisfied = dQualified.qualified && eQualified.qualified;

const bundle = {
  stage: 'RC-1E — Remote Collaboration Intent Handoff & Release Closure',
  bundle: 'release-evidence/rc1e-live-cross-project.json',
  generatedFrom: [...new Set(entries.map((entry) => entry.source))],
  baseline: {
    rebasedOntoMain: 'b7fcb399c5630f29b94732569e1f91470d07dfda',
    parent: 'bafc6a082341f01605dc27af03e4868ae791efe6',
  },
  oracle: {
    implementation: 'test/support/rc1_oracle.ts',
    deterministicTests: ['test/rc1e_intent_handoff.test.ts', 'test/rc1e_oracle_routes.test.ts', 'test/rc1r_oracle_replay.test.ts'],
    note: 'The judgement of every trial was re-derived from its stored raw observations at bundle time.',
  },
  environment: {
    ...eRun.environment,
    noteOneSupportedConfiguration: 'ONE provider/model configuration only (§43); rates are never combined across configurations.',
    privacy: 'No API key, token or chain-of-thought is stored (§11 of RC-1 / §33 of RC-1R). Raw call arguments and results are kept; only judgements are derived.',
  },
  criteria: {
    scenarioD: dQualified,
    scenarioE: eQualified,
    scenarioE_routes: {
      COLLABORATE_TOOL: e.filter((entry) => entry.derived.remoteLocalCollaborationRoute === 'COLLABORATE_TOOL').length,
      RESPOND_COMPOSE: e.filter((entry) => entry.derived.remoteLocalCollaborationRoute === 'RESPOND_COMPOSE').length,
      NONE: e.filter((entry) => (entry.derived.remoteLocalCollaborationRoute ?? 'NONE') === 'NONE').length,
    },
    scenarioE_remoteExploreActuallyRan: e.filter((entry) => entry.derived.remoteExploreActuallyRan === true).length,
    /** §22: D must still accept a direct answer; its branch use is reported, never required. */
    scenarioD_remoteBranchUse: d.map((entry) => ({
      trial: entry.record.trial,
      route: entry.derived.remoteLocalCollaborationRoute ?? 'NONE',
      remoteBranchProcessCount: entry.derived.remoteBranchProcessCount ?? 0,
    })),
    no_authority_scope_or_disclosure_violation: violations.length === 0,
    violations: violations.map((entry) => ({ scenario: entry.raw.scenario, trial: entry.record.trial, violations: entry.derived.violations })),
    copyMisrepresentations: copyFailures.map((entry) => ({ scenario: entry.raw.scenario, trial: entry.record.trial, copy: entry.derived.copyMisrepresentation })),
    criteriaSatisfied,
    localSmoke: smoke === undefined ? null : smoke.criteria,
  },
  trialCounts: {
    d: d.length,
    e: e.length,
    total: entries.length,
    passed: entries.filter((entry) => entry.derived.verdict === 'PASS').length,
    infrastructureErrors: infra.length,
    localSmokeTrials: smoke?.trials.length ?? 0,
  },
  infrastructureErrorTrials: infra.map((entry) => ({
    source: entry.source,
    scenario: entry.raw.scenario,
    trial: entry.record.trial,
    reason: entry.derived.reason,
    processStatus: entry.record.origin?.exitCode ?? null,
    pollFailure: entry.record.pollFailure ?? null,
  })),
  failureClassifications: entries
    .filter((entry) => entry.derived.verdict !== 'PASS')
    .map((entry) => ({
      source: entry.source,
      scenario: entry.raw.scenario,
      trial: entry.record.trial,
      verdict: entry.derived.verdict,
      classification: entry.derived.classification,
      productRoute: entry.derived.productRoute,
      semanticOutcome: entry.derived.semanticOutcome,
      reason: entry.derived.reason,
    })),
  judgementRevisionChanges: entries
    .filter((entry) => entry.judgementChanged)
    .map((entry) => ({
      source: entry.source,
      scenario: entry.raw.scenario,
      trial: entry.record.trial,
      harnessVerdict: entry.record.judgment.verdict,
      derivedVerdict: entry.derived.verdict,
      derivedReason: entry.derived.reason,
    })),
  branchCatalogueEvidence: {
    assertion: 'every real branch session request/header.tools == ["palimpsest_branch_result"]',
    observed: branchCatalogues,
    widened: branchCatalogues.some((entry) => !oracle.branchCataloguesAreIsolated([entry.catalogue])),
    proofEstablished: branchCatalogues.length > 0,
    totalCataloguesRead: branchCatalogues.length,
  },
  trials: entries.map(trialEntry),
  pass: criteriaSatisfied && violations.length === 0,
};

writeFileSync(join(EVIDENCE, 'rc1e-live-cross-project.json'), `${JSON.stringify(bundle, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      wrote: 'release-evidence/rc1e-live-cross-project.json',
      trialCounts: bundle.trialCounts,
      scenarioD: dQualified,
      scenarioE: eQualified,
      scenarioE_routes: bundle.criteria.scenarioE_routes,
      branchCataloguesRead: bundle.branchCatalogueEvidence.totalCataloguesRead,
      branchCatalogueWidened: bundle.branchCatalogueEvidence.widened,
      violations: bundle.criteria.violations.length,
      pass: bundle.pass,
    },
    null,
    2,
  ),
);
