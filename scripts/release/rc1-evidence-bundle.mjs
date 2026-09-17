#!/usr/bin/env node
/**
 * RC-1R §28/§39 — compose ONE release evidence bundle from every live harness run.
 *
 *   node scripts/release/rc1-evidence-bundle.mjs
 *
 * Reads `release-evidence/rc1r-live-local.json`, `release-evidence/rc1r-live-cross-project.json`
 * and any retained top-up runs (`rc1r-live-local-topup<N>.json`, `…-topup<N>.json`) and
 * writes `release-evidence/rc1r-live-principal.json`.
 *
 * §28 shape: every trial appears TWICE-VALUED — `rawObservations` (what was observed) and
 * `derivedJudgment` (what the shared oracle concluded). The two are never merged, so the
 * judgement can be re-derived from the observations.
 *
 * §17 shape: a trial that produced NO product observation is an `INFRASTRUCTURE_ERROR`; it
 * is retained, listed, and excluded from the §16 rate rather than counted as a product
 * outcome. Its source file is recorded for every trial, so a top-up run is visible as such.
 *
 * §16 is evaluated HERE, over the whole sample, by the shared oracle — not by the
 * per-harness summaries (which only describe their own file).
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = join(import.meta.dirname, '..', '..');
const EVIDENCE = join(REPO, 'release-evidence');
const DSH_HOME = process.env.DSH_HOME?.trim() || 'C:/Users/66494/.dsh';

const oracle = await import(pathToFileURL(join(REPO, 'dist', 'test', 'support', 'rc1_oracle.js')).href);

const read = (name) => JSON.parse(readFileSync(join(EVIDENCE, name), 'utf8'));

const filesMatching = (pattern) =>
  (existsSync(EVIDENCE) ? readdirSync(EVIDENCE).filter((name) => pattern.test(name)).sort() : []).map((name) => ({
    name,
    data: read(name),
  }));

const localFiles = filesMatching(/^rc1r-live-local(-topup\d+)?\.json$/u);
const crossFiles = filesMatching(/^rc1r-live-cross-project(-topup\d+)?\.json$/u);
if (localFiles.length === 0) throw new Error('no local sample found (release-evidence/rc1r-live-local.json)');
if (crossFiles.length === 0) throw new Error('no cross sample found (release-evidence/rc1r-live-cross-project.json)');

const local = localFiles[0].data;
const cross = crossFiles[0].data;

const flatten = (files, kindOf) =>
  files.flatMap((file) => file.data.trials.map((record) => ({ source: file.name, scenario: kindOf(record), record })));

/**
 * §28 payoff: RE-DERIVE every judgement from the stored raw observations with the CURRENT
 * oracle revision, at bundle time. A judgement-logic repair therefore never requires
 * re-sampling, and any trial whose verdict changes is listed rather than silently rewritten.
 * The harness-time judgement is kept beside the re-derived one.
 */
const rejudge = (entry) => {
  const judgment = oracle.judgeLocalTrial(entry.record.raw);
  return {
    ...entry,
    rejudged: judgment,
    judgementChanged: judgment.verdict !== entry.record.judgment.verdict,
    harnessVerdict: entry.record.judgment.verdict,
  };
};

const rejudgeCross = (entry) => {
  // §28: ONE shared adapter turns the recorded raw observations into the oracle's input,
  // so the bundle and the replay tests can never disagree about what was observed.
  const judgment = oracle.judgeCrossTrial(oracle.crossRawOfHarnessRecord(entry.record));
  return { ...entry, rejudged: judgment, judgementChanged: judgment.verdict !== entry.record.judgment.verdict, harnessVerdict: entry.record.judgment.verdict };
};

const localTrials = flatten(localFiles, (record) => record.kind).map(rejudge);
const crossTrials = flatten(crossFiles, (record) => record.scenario).map(rejudgeCross);
/** Every judgement used below is the RE-DERIVED one (§28). */
const judgmentOf = (entry) => entry.rejudged;

/** §16: which scenarios are stochastic and must have five JUDGEABLE trials. */
const MINIMUM_SAMPLE = new Map([
  ['A_local_parallel', 5],
  ['B_auto_explore', 5],
  ['B_auto_focus', 1],
  ['C1_check_blocked', 5],
  ['C2_check_verified', 5],
  ['EN_local_parallel', 5],
  ['F_no_reasoning_parallel', 1],
  ['F_no_project_directory_cross', 1],
  ['D_cross_project_ask', 5],
  ['E_remote_local_collaboration', 5],
]);

const scenarioQualification = {};
for (const scenario of MINIMUM_SAMPLE.keys()) {
  const records = [...localTrials, ...crossTrials].filter((entry) => entry.scenario === scenario);
  if (records.length === 0) continue;
  scenarioQualification[scenario] = {
    ...oracle.qualifyScenario(records.map(judgmentOf), { minimumSample: MINIMUM_SAMPLE.get(scenario) }),
    sources: [...new Set(records.map((entry) => entry.source))],
  };
}

/** §28: the observations and the judgement are stored side by side, never fused. */
const localTrial = (entry) => ({
  source: entry.source,
  scenario: entry.scenario,
  trial: entry.record.trial,
  expectedProductPath: entry.record.expectations,
  rawObservations: entry.record.raw,
  /** The judgement recorded while the trial ran, and the same observations re-derived by
   *  the current oracle revision at bundle time. They differ only where a rule was
   *  repaired after the trial; `judgementChanged` names those trials explicitly. */
  harnessJudgment: entry.record.judgment,
  derivedJudgment: judgmentOf(entry),
  judgementChanged: entry.judgementChanged,
});

const crossTrial = (entry) => ({
  source: entry.source,
  scenario: entry.scenario,
  trial: entry.record.trial,
  rawObservations: {
    prompt: entry.record.prompt,
    userPromptsUsed: entry.record.userPromptsUsed,
    fixtureFailure: entry.record.fixtureFailure,
    sharedTransport: entry.record.sharedTransport,
    sharedWorkspaceFiles: entry.record.sharedWorkspaceFiles,
    wallMs: entry.record.wallMs,
    pollFailure: entry.record.pollFailure,
    originExitedBeforeCompletion: entry.record.originExitedBeforeCompletion,
    tokenUsage: entry.record.tokenUsage,
    origin: entry.record.origin,
    remote: entry.record.remote,
  },
  harnessJudgment: entry.record.judgment,
  derivedJudgment: judgmentOf(entry),
  judgementChanged: entry.judgementChanged,
});

const allTrials = [...localTrials, ...crossTrials];
const passed = allTrials.filter((entry) => judgmentOf(entry).verdict === 'PASS').length;
const infrastructureErrors = allTrials.filter((entry) => judgmentOf(entry).verdict === 'INFRASTRUCTURE_ERROR');
const judgementChanges = allTrials.filter((entry) => entry.judgementChanged);

const branchCatalogues = [
  ...localTrials.flatMap(({ scenario, record }) =>
    (record.raw.branchCatalogues ?? []).map((catalogue) => ({ scenario, catalogue })),
  ),
  ...crossTrials.flatMap(({ scenario, record }) =>
    [...(record.origin?.branchCatalogues ?? []), ...(record.remote?.branchCatalogues ?? [])].map((catalogue) => ({
      scenario,
      catalogue,
    })),
  ),
];

/**
 * §30 branch-session artifact retention facts — path, approximate size, data classes.
 * Nothing is deleted; this only MEASURES what the DSH host already persisted.
 */
function branchArtifactFacts() {
  const root = join(DSH_HOME, 'sessions');
  if (!existsSync(root)) return { root, branchSessions: 0, totalBytes: 0, paths: [] };
  let branchSessions = 0;
  let totalBytes = 0;
  const paths = [];
  for (const key of readdirSync(root)) {
    const keyDir = join(root, key);
    let entries = [];
    try {
      entries = readdirSync(keyDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.startsWith('branch-')) continue;
      const dir = join(keyDir, entry);
      let bytes = 0;
      try {
        for (const file of readdirSync(dir)) bytes += statSync(join(dir, file)).size;
      } catch {
        continue;
      }
      branchSessions += 1;
      totalBytes += bytes;
      paths.push(join(keyDir, entry));
    }
  }
  return {
    root: `${DSH_HOME}/sessions/<cwd-key>/branch-<id>/session.v3.jsonl.zstd`,
    branchSessions,
    totalBytes,
    approximateMegabytes: Number((totalBytes / (1024 * 1024)).toFixed(3)),
    dataClasses: [
      'session header (host-local telemetry)',
      'request/header — exactly one tool: palimpsest_branch_result',
      'assistant/message (final visible text only; no chain-of-thought field exists)',
      'tool/call + tool/result for palimpsest_branch_result',
      'NO Palimpsest semantic store, PeerRef, PersistentPoint or ReasoningCell event',
    ],
    retained: 'nothing deleted for RC-1R (spec §30)',
    samplePaths: paths.slice(0, 10),
  };
}

const criteriaSatisfied = Object.values(scenarioQualification).every((entry) => entry.qualified);

const bundle = {
  stage: 'RC-1R — Live Qualification Oracle Repair & Full Sample Closure',
  baseline: 'ae4a91c3ef57b9cd50770faa5ab0b180c839aebf',
  bundle: 'release-evidence/rc1r-live-principal.json',
  generatedFrom: [...localFiles.map((file) => file.name), ...crossFiles.map((file) => file.name)],
  oracle: {
    implementation: 'test/support/rc1_oracle.ts',
    replayTests: 'test/rc1r_oracle_replay.test.ts',
    note:
      'The judgement of every trial in this bundle was produced by the ONE shared oracle, so it can be ' +
      're-derived from the stored raw observations. Top-up files are labelled per trial in `sources`.',
  },
  environment: {
    ...local.environment,
    crossProject: cross.environment,
    supportedConfiguration: 'ONE provider/model configuration only (spec §18); nothing here generalises to other models.',
    privacy:
      'No API key, token or chain-of-thought is stored anywhere in this bundle (§33/§39). The judgement block ' +
      'is an interpretation of the observations block, and both are kept.',
  },
  criteria: {
    authoritative: 'computed here over the whole sample by test/support/rc1_oracle.ts (qualifyScenario)',
    perScenario: scenarioQualification,
    requiredStochasticRate: '>= 4/5 of JUDGEABLE trials per scenario, with five judgeable trials (§16/§17)',
    criteriaSatisfied,
    no_authority_scope_or_disclosure_violation: allTrials.every((entry) => judgmentOf(entry).violations.length === 0),
    violations: allTrials
      .filter((entry) => judgmentOf(entry).violations.length > 0)
      .map(({ scenario, record, rejudged }) => ({ scenario, trial: record.trial, violations: rejudged.violations })),
    copyMisrepresentations: allTrials
      .filter((entry) => judgmentOf(entry).copyMisrepresentation.length > 0)
      .map(({ scenario, record, rejudged }) => ({ scenario, trial: record.trial, copy: rejudged.copyMisrepresentation })),
    harnessSummaries: { local: local.criteria, crossProject: cross.criteria },
  },
  trialCounts: {
    local: localTrials.length,
    crossProject: crossTrials.length,
    total: allTrials.length,
    passed,
    infrastructureErrors: infrastructureErrors.length,
    topUpTrials: allTrials.filter(({ source }) => /-topup\d+\.json$/u.test(source)).length,
    judgementsChangedAtBundleTime: judgementChanges.length,
  },
  /** Trials whose verdict differs between harness time and bundle time (instrument evolution). */
  judgementRevisionChanges: judgementChanges.map(({ source, scenario, record, harnessVerdict, rejudged }) => ({
    source,
    scenario,
    trial: record.trial,
    harnessVerdict,
    derivedVerdict: rejudged.verdict,
    derivedReason: rejudged.reason,
  })),
  infrastructureErrorTrials: infrastructureErrors.map(({ source, scenario, record, rejudged }) => ({
    source,
    scenario,
    trial: record.trial,
    reason: rejudged.reason,
    processStatus: record.raw?.processStatus ?? null,
    exitCode: record.raw?.exitCode ?? null,
    wallMs: record.raw?.wallMs ?? null,
    assistantMessageCount: (record.raw?.assistantMessages ?? record.origin?.assistantMessages ?? []).length,
    userMessageCount: (record.raw?.userMessages ?? record.origin?.userMessages ?? []).length,
  })),
  failureClassifications: allTrials
    .filter((entry) => judgmentOf(entry).verdict !== 'PASS')
    .map(({ source, scenario, record, rejudged }) => ({
      source,
      scenario,
      trial: record.trial,
      verdict: rejudged.verdict,
      classification: rejudged.classification,
      productRoute: rejudged.productRoute,
      semanticOutcome: rejudged.semanticOutcome,
      reason: rejudged.reason,
    })),
  branchCatalogueEvidence: {
    assertion: 'every real branch session request/header.tools == ["palimpsest_branch_result"]',
    observed: branchCatalogues,
    /**
     * FP-5: `[].every(...)` is vacuously true, so "no branch observed" must not read as a
     * clean result. A widened-or-absent catalogue is reported as `widened: true`, and the
     * proof is only established when at least one catalogue was actually read.
     */
    widened: branchCatalogues.some((entry) => !oracle.branchCataloguesAreIsolated([entry.catalogue])),
    proofEstablished: branchCatalogues.length > 0,
    totalCataloguesRead: branchCatalogues.length,
  },
  branchArtifactRetention: branchArtifactFacts(),
  localTrials: localTrials.map(localTrial),
  crossProjectTrials: crossTrials.map(crossTrial),
  pass: criteriaSatisfied && allTrials.every((entry) => judgmentOf(entry).violations.length === 0),
  failures: [...(local.failures ?? []), ...(cross.failures ?? [])],
};

writeFileSync(join(EVIDENCE, 'rc1r-live-principal.json'), `${JSON.stringify(bundle, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      wrote: 'release-evidence/rc1r-live-principal.json',
      trialCounts: bundle.trialCounts,
      perScenario: scenarioQualification,
      infrastructureErrorTrials: bundle.infrastructureErrorTrials,
      failureClassifications: bundle.failureClassifications,
      judgementRevisionChanges: bundle.judgementRevisionChanges,
      branchCatalogueWidened: bundle.branchCatalogueEvidence.widened,
      branchCataloguesRead: bundle.branchCatalogueEvidence.totalCataloguesRead,
      pass: bundle.pass,
    },
    null,
    2,
  ),
);
