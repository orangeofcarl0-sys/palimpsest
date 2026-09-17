#!/usr/bin/env node
/**
 * RC-1 §40/§41 — compose ONE release evidence bundle from the two live harness runs.
 *
 *   node scripts/release/rc1-evidence-bundle.mjs
 *
 * Reads `release-evidence/rc1-live-local.json` and `release-evidence/rc1-live-cross-project.json`
 * (each of which contains EVERY trial, including failures) and writes
 * `release-evidence/rc1-live-principal.json`: the §12 environment record, a per-trial
 * matrix (scenario × trial × verdict × the real tool calls × costs), the §38 failure
 * classifications and the §20 branch-catalogue facts.
 *
 * It only RE-PROJECTS what the harnesses recorded. It never adds a trial, never edits a
 * verdict, never invents a cost and never stores chain-of-thought (§39).
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(import.meta.dirname, '..', '..');
const EVIDENCE = join(REPO, 'release-evidence');
const DSH_HOME = process.env.DSH_HOME?.trim() || 'C:/Users/66494/.dsh';
const read = (name) => {
  const path = join(EVIDENCE, name);
  if (!existsSync(path)) throw new Error(`missing harness output: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
};

const local = read('rc1-live-local.json');
const cross = read('rc1-live-cross-project.json');

const failureClassifications = (records) =>
  records
    .filter((record) => record.verdict !== 'PASS')
    .map((record) => ({ scenario: record.kind ?? record.scenario, trial: record.trial, verdict: record.verdict }));

const localMatrix = local.trials.map((record) => ({
  scenario: record.kind,
  trial: record.trial,
  freshSession: record.freshSession,
  deploymentProfile: record.deploymentProfile,
  projectId: record.projectId,
  profileVariant: record.profileVariant,
  observedProviderModel: record.observedProviderModel,
  prompt: record.prompt,
  expectedProductPath: record.expectations,
  observedToolPath: record.principalToolCalls,
  collaborateExecutions: record.collaborateExecutions,
  collaborateStatuses: record.collaborateStatuses,
  finalStatus: record.status,
  verdict: record.verdict,
  wallMs: record.wallMs,
  principalToolCallCount: record.principalToolCallCount,
  branchProcessCount: record.branchProcessCount,
  branchCapabilityIsolated: record.branchCapabilityIsolated,
  verifierRunCount: record.verifierRunCount,
  crossProjectMessageCount: record.crossProjectMessageCount,
  tokenUsage: record.tokenUsage,
  evidenceRefs: { sessionFile: record.sessionFile, frames: record.frames },
  finalText: record.finalText,
  violations: { leakedInternalIds: record.leakedInternalIds, claimsVerified: record.claimsVerified },
}));

const crossMatrix = cross.trials.map((record) => ({
  scenario: record.scenario,
  trial: record.trial,
  freshSession: record.freshSession,
  sharedTransport: record.sharedTransport,
  sharedWorkspaceFiles: record.sharedWorkspaceFiles,
  prompt: record.prompt,
  expectedProductPath: record.expectation,
  origin: {
    observedProviderModel: record.origin.observedProviderModel,
    toolNames: record.origin.toolNames,
    crossProjectCalls: record.origin.crossProjectCalls,
    catalogueSize: record.origin.catalogueSize,
    stdoutTurnCount: record.origin.stdoutTurns.length,
    finalText: record.origin.finalAssistantText,
  },
  remote: {
    observedProviderModel: record.remote.observedProviderModel,
    toolNames: record.remote.toolNames,
    crossProjectCalls: record.remote.crossProjectCalls,
    collaborateExecutions: record.remote.collaborateExecutions,
    activations: record.remote.activations,
    branchProcessCount: record.remote.branchProcessCount,
    finalText: record.remote.finalAssistantText,
  },
  observedToolPath: { origin: record.origin.toolNames, remote: record.remote.toolNames },
  crossProjectMessageCount: record.crossProjectMessageCount,
  remoteUsedCollaborate: record.remoteUsedCollaborate,
  originSurfacedWithoutSecondPrompt: record.originSurfacedWithoutSecondPrompt,
  surfacedText: record.surfacedText,
  verdict: record.verdict,
  wallMs: record.wallMs,
  branchProcessCount: record.branchProcessCount,
  tokenUsage: record.tokenUsage,
  violations: {
    leakedInternalIds: record.leakedInternalIds,
    claimsVerified: record.claimsVerified,
    claimsCommitment: record.claimsCommitment,
    inventedProject: record.inventedProject,
  },
}));

const branchCatalogues = [
  ...local.trials.flatMap((record) => (record.branchCatalogues ?? []).map((catalogue) => ({ scenario: record.kind, catalogue }))),
  ...cross.trials.flatMap((record) => (record.branchCatalogues ?? []).map((catalogue) => ({ scenario: record.scenario, catalogue }))),
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
    retained: 'nothing deleted for RC-1 (spec §30)',
    samplePaths: paths.slice(0, 10),
  };
}

const bundle = {
  stage: 'RC-1 — Live Principal Product Qualification & Interaction Surface Closure',
  bundle: 'release-evidence/rc1-live-principal.json',
  generatedFrom: ['release-evidence/rc1-live-local.json', 'release-evidence/rc1-live-cross-project.json'],
  environment: {
    ...local.environment,
    crossProject: cross.environment,
    note: 'One supported configuration only (spec §12); nothing here generalises to other models. No API keys, tokens or chain-of-thought are stored (§39/§41).',
  },
  criteria: { local: local.criteria, crossProject: cross.criteria },
  trialCounts: {
    local: local.trials.length,
    crossProject: cross.trials.length,
    total: local.trials.length + cross.trials.length,
    passed: local.trials.filter((record) => record.verdict === 'PASS').length + cross.trials.filter((record) => record.verdict === 'PASS').length,
  },
  failureClassifications: [...failureClassifications(local.trials), ...failureClassifications(cross.trials)],
  branchCatalogueEvidence: {
    assertion: 'every real branch session request/header.tools == ["palimpsest_branch_result"]',
    observed: branchCatalogues,
    widened: branchCatalogues.some((entry) => entry.catalogue.length !== 1 || entry.catalogue[0] !== 'palimpsest_branch_result'),
  },
  branchArtifactRetention: branchArtifactFacts(),
  localTrials: localMatrix,
  crossProjectTrials: crossMatrix,
  pass: local.pass === true && cross.pass === true,
  failures: [...(local.failures ?? []), ...(cross.failures ?? [])],
};

writeFileSync(join(EVIDENCE, 'rc1-live-principal.json'), `${JSON.stringify(bundle, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      wrote: 'release-evidence/rc1-live-principal.json',
      trialCounts: bundle.trialCounts,
      failureClassifications: bundle.failureClassifications,
      branchCatalogueWidened: bundle.branchCatalogueEvidence.widened,
      pass: bundle.pass,
    },
    null,
    2,
  ),
);
