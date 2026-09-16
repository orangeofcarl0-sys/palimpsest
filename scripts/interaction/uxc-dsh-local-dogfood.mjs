#!/usr/bin/env node
/**
 * UX-C §33/§34/§35/§37 — PACKAGED DSH LOCAL COLLABORATION DOGFOOD.
 *
 *   node scripts/interaction/uxc-dsh-local-dogfood.mjs
 *
 * A NORMAL FIRST-PARTY DEPLOYMENT: a typed deployment profile carrying ONLY
 * `reasoning: {}`. The harness plays the DSH host role and derives the ephemeral
 * branch execution port from its OWN DSH knowledge (bin + profile), exactly as
 * `host/dsh/lib/index.js` does — the deployment profile never carries a store path,
 * a policy, a branch port, an org-memory store or a branch-agent profile.
 *
 * It proves:
 *   - `palimpsest_collaborate intent=PARALLEL` runs REAL ephemeral DSH branches;
 *   - the fan-out bound (MAX_BRANCH_HINT) holds and is refused, never clamped;
 *   - no durable PeerRef / PersistentPoint / commitment is created;
 *   - EXACTLY ONE candidate owner (RecipeExecution), never via DEDUPLICATED;
 *   - useful findings return and the PRIMARY result labels them exploratory / not truth;
 *   - the memoryless AUTO pair (FOCUS for coupled, EXPLORE for decomposable+verifiable);
 *   - the branch environment enumerates exactly ONE tool: principal-only tools are
 *     structurally unreachable (§37).
 *
 * Prints a final `pass=true|false` line; exits non-zero on failure; cleans temp dirs
 * in a `finally`.
 */

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const REPO = join(import.meta.dirname, '..', '..');
const DIST = pathToFileURL(join(REPO, 'dist', 'src')).href;
const DSH_HOME = process.env.DSH_HOME?.trim() || 'C:/Users/66494/.dsh';
const DSH_BIN = process.env.DSH_BIN?.trim() || 'C:/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js';
const PROFILES = join(DSH_HOME, 'profiles').replace(/\\/g, '/');
const HOST_BUNDLE = join(PROFILES, 'node_modules', 'palimpsest-dsh-host').replace(/\\/g, '/');
const ADVANCED = join(REPO, 'dist', 'src', 'advanced.js').replace(/\\/g, '/');
const PROFILE_NAME = 'palimpsest-uxc-local';
const BRANCH_TIMEOUT_MS = Number(process.env.BRANCH_TIMEOUT_MS ?? 300_000);

const PROJECT = 'project-uxc-local';
const PEER = 'peer-uxc-local';
const EXPLORE_TASK =
  'Explore independent approaches to the caching layer; separately evaluate each component and verify the trade-offs with tests.';
const COUPLED_TASK =
  'Apply one atomic schema migration that every module depends on; the change is monolithic and shares state across components.';

const { launchDeployment, composeBranchHostEnvironment, BRANCH_RESULT_TOOL_NAME } = await import(`${DIST}/deployment/index.js`);
const { dshSubprocessBranchExecutionPort } = await import(`${DIST}/reasoning_cell/index.js`);

const evidence = {};
const failures = [];
function check(name, ok, detail) {
  evidence[name] = { ok: Boolean(ok), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) };
  if (!ok) failures.push(`${name}: ${evidence[name].detail}`);
  return Boolean(ok);
}

function rawRows(databasePath, table) {
  if (!existsSync(databasePath)) return '<no-file>';
  const database = new DatabaseSync(databasePath);
  try {
    const exists = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (exists === undefined) return '<absent>';
    return JSON.stringify(database.prepare(`SELECT * FROM "${table}"`).all());
  } finally {
    database.close();
  }
}

const root = join(tmpdir(), `palimpsest-uxc-local-${process.pid}-${Date.now()}`);
const state = join(root, 'state');
const startedAt = Date.now();
let deployment;

function setupProfiles(stateDir) {
  mkdirSync(root, { recursive: true });
  mkdirSync(join(PROFILES, 'node_modules'), { recursive: true });
  rmSync(HOST_BUNDLE, { recursive: true, force: true });
  cpSync(join(REPO, 'host', 'dsh'), HOST_BUNDLE, { recursive: true });

  const deploymentPath = join(root, 'deployment.json');
  writeFileSync(
    deploymentPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        profileId: 'uxc-local',
        projectId: PROJECT,
        localPeer: PEER,
        persistentPoint: `pp-${PEER}`,
        repository: REPO,
        transport: { namespace: 'uxc-local', databasePath: join(stateDir, 'transport.sqlite') },
        databases: {
          orchestration: join(stateDir, 'orchestration.sqlite'),
          ordarium: join(stateDir, 'ordarium.sqlite'),
          coordination: join(stateDir, 'coordination.sqlite'),
          transportCursors: join(stateDir, 'cursors.sqlite'),
          attentionMarks: join(stateDir, 'attention.sqlite'),
        },
        // THE WHOLE CONFIGURATION: the packaged local-collaboration bundle. No store
        // path, no policy, no branch port, no org memory.
        reasoning: {},
        // Pull-mode attention: nothing activates without a host binding; wiring the
        // capability performs no work.
        attention: { policyId: 'uxc-local-attention-v1', cooldownMs: 0, activation: 'none' },
      },
      null,
      2,
    ),
  );

  const profileDir = join(PROFILES, PROFILE_NAME);
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, 'package.json'),
    JSON.stringify(
      { name: `dsh-profile-${PROFILE_NAME}`, private: true, dependencies: {}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'palimpsest-dsh-host'], patchReload: 'startup' } } },
      null,
      2,
    ),
  );
  writeFileSync(
    join(profileDir, 'cordis.patch.yml'),
    `- id: palimpsest-tools\n  config:\n    palimpsestEntry: '${ADVANCED}'\n    deploymentProfile: '${deploymentPath}'\n    serve: false\n`,
  );
  return deploymentPath;
}

async function main() {
  mkdirSync(state, { recursive: true });
  const deploymentPath = setupProfiles(state);
  const raw = JSON.parse(readFileSync(deploymentPath, 'utf8'));
  const realPort = dshSubprocessBranchExecutionPort({ dshBin: DSH_BIN, profile: PROFILE_NAME, workDir: state, timeoutMs: BRANCH_TIMEOUT_MS, nodeExecPath: process.execPath });
  const branchRuns = [];
  const port = {
    adapterId: realPort.adapterId,
    run: async (input) => {
      const outcome = await realPort.run(input);
      branchRuns.push(outcome);
      return outcome;
    },
  };
  deployment = launchDeployment(raw, { host: { branchExecution: port } });
  const controller = deployment.installed.controller;
  if (!controller.isProjectInitialized()) {
    controller.start({
      projectId: PROJECT,
      goal: 'uxc local dogfood',
      requirements: [{ requirement_id: 'req-1', statement: 'collaborate', priority: 'normal', acceptance_refs: [] }],
      decisions: [],
      tasks: [],
      committedAt: '2026-09-17T00:00:00Z',
    });
  }

  check(
    'deployment_composes_the_packaged_collaboration_surface',
    deployment.installed.application.collaboration !== undefined &&
      deployment.installed.application.advisor !== undefined &&
      deployment.reasoning.storeConfigured === true &&
      deployment.reasoning.branchAdapter !== undefined,
    JSON.stringify({ reasoning: deployment.reasoning, readiness: deployment.collaborationReadiness() }),
  );
  check(
    'deployment_profile_carried_only_reasoning_empty',
    JSON.stringify(raw.reasoning) === '{}' && raw.databases.reasoningStorePath === undefined && raw.databases.reasoning === undefined,
    `reasoning=${JSON.stringify(raw.reasoning)} databases=${JSON.stringify(Object.keys(raw.databases))}`,
  );
  const reasoningStorePath = join(state, 'reasoning.sqlite');
  check('derived_store_lives_beside_the_orchestration_db', existsSync(reasoningStorePath), reasoningStorePath);

  /* ---- §37: the branch environment enumerates EXACTLY ONE tool --------------- */
  const composed = composeBranchHostEnvironment({
    schemaVersion: 1,
    cell: { schemaVersion: 1, cellId: 'cell-probe' },
    branch: { schemaVersion: 1, cellId: 'cell-probe', branchId: 'branch-probe' },
    objective: 'o',
    question: 'q',
    frontierBasis: { schemaVersion: 1, cellId: 'cell-probe', frontierRevision: 0, frontierDigest: 'c'.repeat(64) },
    acceptedClaims: [],
  });
  /**
   * §37 (gate review F3): the REAL branch environment, not an in-process object.
   *
   * The DSH host persists each branch session at
   *   $DSH_HOME/sessions/<cwd-key>/branch-<id>/session.v3.jsonl.zstd
   * and its `request/header` record IS the tool catalogue the branch model was offered.
   * A `.zstd` file written by the host is a CONCATENATED multi-frame stream, and Node's
   * `zstdDecompressSync` decodes only the FIRST frame (which is just the 240-byte session
   * header) - so we split on the zstd magic and decode every frame.
   */
  function realBranchCatalogue() {
    const sessionsRoot = join(DSH_HOME, 'sessions');
    if (!existsSync(sessionsRoot)) return { ok: false, detail: 'no DSH sessions directory' };
    const candidates = [];
    for (const cwdKey of readdirSync(sessionsRoot)) {
      const dir = join(sessionsRoot, cwdKey);
      let entries;
      try {
        if (!statSync(dir).isDirectory()) continue;
        entries = readdirSync(dir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.startsWith('branch-')) continue;
        const file = join(dir, entry, 'session.v3.jsonl.zstd');
        if (!existsSync(file)) continue;
        candidates.push({ file, mtime: statSync(file).mtimeMs });
      }
    }
    candidates.sort((a, b) => b.mtime - a.mtime);
    // The newest few branches are the ones THIS run just produced.
    for (const candidate of candidates.slice(0, 8)) {
      const frames = [];
      const buffer = readFileSync(candidate.file);
      const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
      const starts = [];
      for (let i = 0; i + 4 <= buffer.length; i += 1) {
        if (buffer.compare(magic, 0, 4, i, i + 4) === 0) starts.push(i);
      }
      for (let i = 0; i < starts.length; i += 1) {
        const end = i + 1 < starts.length ? starts[i + 1] : buffer.length;
        try {
          frames.push(zstdDecompressSync(buffer.subarray(starts[i], end)).toString('utf8'));
        } catch {
          // an unreadable frame is reported by the frame count, never silently trusted
        }
      }
      const text = frames.join('\n');
      const records = text
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return undefined;
          }
        })
        .filter((record) => record !== undefined);
      const catalogues = [];
      (function walk(value) {
        if (Array.isArray(value)) {
          for (const item of value) walk(item);
          return;
        }
        if (value === null || typeof value !== 'object') return;
        if (Array.isArray(value.tools) && value.tools.length > 0 && value.tools.every((tool) => tool !== null && (typeof tool === 'string' || typeof tool.name === 'string'))) {
          catalogues.push(value.tools.map((tool) => (typeof tool === 'string' ? tool : tool.name)));
        }
        for (const key of Object.keys(value)) walk(value[key]);
      })(records);
      if (catalogues.length > 0) {
        return {
          ok: true,
          file: candidate.file,
          frames: frames.length,
          recordTypes: [...new Set(records.map((record) => record.type))],
          catalogues,
        };
      }
    }
    return { ok: false, detail: `no branch tool catalogue found across ${candidates.length} branch session artifact(s)` };
  }

  const principalOnly = [
    'palimpsest_manage',
    'palimpsest_federation',
    'palimpsest_cross_project',
    'palimpsest_project',
    'palimpsest_external_assets',
    'palimpsest_proof',
    'palimpsest_verification',
    'palimpsest_reasoning',
  ];
  check(
    'branch_environment_has_exactly_one_host_private_tool',
    composed.ok === true && composed.environment.toolNames.length === 1 && composed.environment.toolNames[0] === BRANCH_RESULT_TOOL_NAME,
    composed.ok ? JSON.stringify(composed.environment.toolNames) : composed.detail,
  );
  check(
    'branch_environment_exposes_no_principal_only_tool',
    composed.ok === true && principalOnly.every((name) => !composed.environment.toolNames.includes(name)) && composed.environment.principalTools.length === 0,
    JSON.stringify(composed.ok ? composed.environment.toolNames : ['<not composed>']),
  );

  const realCatalogue = realBranchCatalogue();
  check(
    'real_branch_process_was_offered_exactly_one_tool',
    realCatalogue.ok === true && realCatalogue.catalogues.every((catalogue) => catalogue.length === 1 && catalogue[0] === BRANCH_RESULT_TOOL_NAME),
    realCatalogue.ok
      ? `frames=${realCatalogue.frames} types=${JSON.stringify(realCatalogue.recordTypes)} catalogues=${JSON.stringify(realCatalogue.catalogues)}`
      : realCatalogue.detail,
  );
  check(
    'real_branch_process_was_offered_no_principal_only_tool',
    realCatalogue.ok === true && realCatalogue.catalogues.every((catalogue) => principalOnly.every((name) => !catalogue.includes(name))),
    realCatalogue.ok ? JSON.stringify(realCatalogue.catalogues) : realCatalogue.detail,
  );


  /* ---- §33: real ephemeral DSH branches through the packaged capability ------ */
  const coordinationBefore = rawRows(join(state, 'coordination.sqlite'), 'coordination_events');
  const result = await deployment.installed.application.collaboration.run({
    task: EXPLORE_TASK,
    intent: 'PARALLEL',
    branchCountHint: 2,
    requestedBy: 'uxc-dogfood:user',
  });
  const cellId = result.details.cellId;
  const cells = deployment.installed.reasoningCells;
  const events = cellId === undefined ? [] : await cells.service.events({ cellId });
  const eventTypes = events.map((event) => event.type);
  const completedBranches = branchRuns.filter((run) => run?.status === 'completed').length;
  const branchReportedDigests = branchRuns.map((run) => run?.candidateDigest).filter((digest) => typeof digest === 'string');
  const submitted = eventTypes.filter((type) => type === 'CANDIDATE_SUBMITTED').length;
  const deduplicated = eventTypes.filter((type) => type === 'CANDIDATE_DEDUPLICATED').length;

  check('parallel_ran_real_ephemeral_branches', completedBranches >= 2, `completed=${completedBranches}/${branchRuns.length} detail=${JSON.stringify(branchRuns.map((r) => r?.detail))}`);
  check('useful_findings_returned', result.findings.length >= 2, JSON.stringify(result.findings.map((f) => f.content)));
  check(
    'exactly_one_candidate_owner',
    branchReportedDigests.length === 0 && submitted === completedBranches && deduplicated === 0,
    JSON.stringify({ branchReportedDigests, submitted, completedBranches, deduplicated, note: 'the branch has no ReasoningCell; RecipeExecution submitted once per branch' }),
  );
  check(
    'default_explore_standing_is_inconclusive_with_no_evidence',
    events
      .filter((event) => event.type === 'VERIFICATION_RECORDED')
      .every((event) => {
        const v = event.payload.verification;
        return v.standing === 'INCONCLUSIVE' && v.supportingEvidenceIds.length === 0 && v.contradictingEvidenceIds.length === 0;
      }) &&
      eventTypes.filter((type) => type === 'VERIFICATION_RECORDED').length >= 1,
    JSON.stringify(events.filter((event) => event.type === 'VERIFICATION_RECORDED').map((event) => event.payload.verification.standing)),
  );
  check('no_supported_standing_without_real_evidence', !JSON.stringify(events.filter((e) => e.type === 'VERIFICATION_RECORDED')).includes('"SUPPORTED"'), 'no VERIFICATION_RECORDED carried SUPPORTED');
  check(
    'primary_result_labels_findings_exploratory_not_truth',
    result.findingStanding === 'EXPLORATORY_CELL_LOCAL' &&
      typeof result.findingNote === 'string' &&
      result.summary.includes(result.findingNote) &&
      /not Evidence/u.test(result.findingNote) &&
      /not independently verified as true/u.test(result.findingNote),
    result.findingNote,
  );

  /* ---- §33: fan-out bound holds and is refused, never clamped ---------------- */
  let refused = false;
  try {
    await deployment.installed.application.collaboration.run({ task: EXPLORE_TASK, intent: 'PARALLEL', branchCountHint: 9, requestedBy: 'uxc-dogfood:user' });
  } catch (error) {
    refused = /between 2 and 8/u.test(error?.message ?? '');
  }
  const runsBeforeBound = branchRuns.length;
  const bounded = await deployment.installed.application.collaboration.run({ task: `${EXPLORE_TASK} bound check`, intent: 'PARALLEL', branchCountHint: 3, requestedBy: 'uxc-dogfood:user' });
  check('fan_out_bound_refused_not_clamped', refused, 'branchCountHint 9 was refused with the 2..8 bound');
  check('fan_out_bound_holds', branchRuns.length - runsBeforeBound === 3, `branches=${branchRuns.length - runsBeforeBound} (hint 3)`);
  void bounded;

  /* ---- §33: no durable peer / persistent point / commitment ------------------ */
  const coordinationAfter = rawRows(join(state, 'coordination.sqlite'), 'coordination_events');
  const commitmentsAfter = await deployment.installed.federation.commitments();
  const inboxAfter = await deployment.installed.federation.inbox({ schemaVersion: 1, peerId: PEER });
  check(
    'no_durable_peer_persistent_point_or_commitment_created',
    coordinationBefore === coordinationAfter && commitmentsAfter.length === 0 && inboxAfter.received.length === 0,
    JSON.stringify({ coordinationUnchanged: coordinationBefore === coordinationAfter, commitments: commitmentsAfter.length, received: inboxAfter.received.length }),
  );

  /* ---- §34: memoryless AUTO FOCUS / EXPLORE --------------------------------- */
  const focus = await deployment.installed.application.collaboration.run({ task: COUPLED_TASK, intent: 'AUTO', requestedBy: 'uxc-dogfood:user' });
  const explore = await deployment.installed.application.collaboration.run({ task: EXPLORE_TASK, intent: 'AUTO', requestedBy: 'uxc-dogfood:user' });
  check('memoryless_auto_selects_focus_for_a_coupled_task', focus.executionKind === 'PRINCIPAL_CONTINUES' && focus.findings.length === 0, `${focus.executionKind} verb=${focus.verb}`);
  check('memoryless_auto_selects_explore_for_a_decomposable_task', explore.executionKind === 'LOCAL_EXPLORE' && explore.findings.length >= 2, `${explore.executionKind} findings=${explore.findings.length}`);
  const advisor = deployment.installed.application.advisor;
  const recommendation = await advisor.recommend({ taskProfile: await advisor.profile({ task: EXPLORE_TASK }) });
  check(
    'memoryless_advisor_claims_no_empirical_evidence',
    recommendation.empiricalSupport.length === 0 && recommendation.rationale.join(' ').includes('No empirical evaluation is available'),
    recommendation.rationale.join(' ').slice(0, 240),
  );

  return { elapsedMs: Date.now() - startedAt };
}

let outcome;
try {
  outcome = await main();
} catch (error) {
  failures.push(`unhandled: ${error?.stack ?? String(error)}`);
} finally {
  try {
    await deployment?.close();
  } catch {
    /* already closed */
  }
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    /* windows may hold a handle briefly */
  }
}

const summary = {
  campaign: 'UX-C packaged DSH local collaboration',
  evidence,
  failures,
  ...(outcome === undefined ? {} : { elapsedMs: outcome.elapsedMs }),
  pass: failures.length === 0,
};
console.log(JSON.stringify(summary, null, 2));
console.log(`pass=${failures.length === 0}`);
process.exit(failures.length === 0 ? 0 : 1);
