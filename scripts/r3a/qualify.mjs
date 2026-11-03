#!/usr/bin/env node
/**
 * R3-A0 §13/§15 — THE BASELINE QUALIFICATION MATRIX.
 *
 * §13 requires the qualification plan to be FROZEN and written to disk BEFORE the first real baseline worker
 * run. §15 requires every scheduled run to be accounted for, the fixtures to be unmodified between runs, and
 * the bounds and renderer to be untouched.
 *
 * §10: strictly sequential — one ACTIVE confidential worker at a time.
 * §13: one process per trial, so no model session is reused across runs.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { FIXTURE_SPECS } from './fixture-content.mjs';
import { COMMON_RENDERER, MODEL_ROUTES, verifiedRoutes } from './models.mjs';
import { MIN_CLASS_HEADROOM, QUALIFICATION_BOUNDS } from './qualification.mjs';
import { CAPITAL_RELATIONSHIPS } from './capital.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));
const RIG = args.get('rig') ?? join(homedir(), '.palimpsest-r3a', 'qualification');
const NL = String.fromCharCode(10);
const out = (line) => process.stdout.write(`${line}${NL}`);

/** §13: the frozen plan, derived ONLY from the frozen specs — no run data enters it. */
export function qualificationPlan() {
  const routes = verifiedRoutes();
  const runs = [];
  for (const spec of FIXTURE_SPECS) {
    for (const route of routes) {
      for (let repetition = 0; repetition < MIN_CLASS_HEADROOM.Nq; repetition += 1) {
        runs.push(Object.freeze({ fixtureId: spec.fixtureId, fixtureName: spec.name, modelId: route.modelId, modelFamily: route.modelFamily, routeId: route.routeId, repetition }));
      }
    }
  }
  return Object.freeze(runs);
}

/** §13: the fixture digests, computed from the frozen content, so a later edit invalidates the plan. */
export function fixtureDigests() {
  return FIXTURE_SPECS.map((spec) => {
    const digest = createHash('sha256').update(Object.entries(spec.files).map(([path, content]) => `${path}:${createHash('sha256').update(content, 'utf8').digest('hex')}`).join('\n'), 'utf8').digest('hex');
    return { fixtureId: spec.fixtureId, fixtureRevision: spec.fixtureRevision, contentDigest: digest, files: Object.keys(spec.files).sort() };
  });
}

async function main() {
  const runs = qualificationPlan();
  mkdirSync(RIG, { recursive: true });
  const plan = {
    schemaVersion: 1,
    stage: 'R3-A0',
    kind: 'frozen baseline qualification plan',
    frozenBefore: 'the first baseline worker run',
    bounds: QUALIFICATION_BOUNDS,
    nq: MIN_CLASS_HEADROOM.Nq,
    renderer: COMMON_RENDERER,
    fixtures: fixtureDigests(),
    models: verifiedRoutes().map((route) => ({ modelId: route.modelId, modelFamily: route.modelFamily, routeId: route.routeId, providerId: route.providerId })),
    allRoutes: MODEL_ROUTES.map((route) => ({ modelId: route.modelId, modelFamily: route.modelFamily, verifiedEndToEnd: route.verifiedEndToEnd })),
    capitalRelationships: CAPITAL_RELATIONSHIPS,
    expectedRuns: runs.length,
    /** §10: no capital is delivered, so the run list carries no arm. */
    treatment: 'NONE — treatment-independent baseline',
    runs,
  };
  const runsDir = join(RIG, `runs-${new Date().toISOString().replace(/[:.]/gu, '-')}`);
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(join(RIG, 'plan.json'), JSON.stringify({ ...plan, runsDir }, null, 2), 'utf8');

  out(`R3-A0 BASELINE QUALIFICATION — ${String(runs.length)} runs planned`);
  out(`  fixtures: ${plan.fixtures.map((entry) => `${entry.fixtureId}@r${String(entry.fixtureRevision)}`).join(', ')}`);
  out(`  models:   ${plan.models.map((entry) => `${entry.modelId} (${entry.modelFamily})`).join(', ')}`);
  out(`  Nq=${String(plan.nq)}  bounds=(${String(QUALIFICATION_BOUNDS.lower)}, ${String(QUALIFICATION_BOUNDS.upper)})  renderer=${COMMON_RENDERER.rendererId}`);
  out('');

  const records = [];
  let index = 0;
  for (const run of runs) {
    index += 1;
    const started = Date.now();
    let line;
    try {
      line = execFileSync(process.execPath, [join(REPO_ROOT, 'scripts', 'r3a', 'trial.mjs'), `--fixture=${run.fixtureId}`, `--model=${run.modelId}`, `--repetition=${String(run.repetition)}`, `--rig=${runsDir}`], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim().split('\n').pop() ?? '';
    } catch (error) {
      line = `HARNESS_ERROR ${String(error?.message ?? error).slice(0, 200)}`;
    }
    const trialId = `${run.fixtureName}-${run.routeId}-q${String(run.repetition)}`;
    const recordPath = join(runsDir, trialId, 'out', 'trial.json');
    const record = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : null;
    if (record !== null) records.push(record);
    out(`[${String(index).padStart(2, ' ')}/${String(runs.length)}] ${trialId.padEnd(34)} ${String(Math.round((Date.now() - started) / 1000)).padStart(4)}s  ${line}`);
    writeFileSync(join(RIG, 'trials.partial.json'), JSON.stringify({ completed: records.length, expected: runs.length, trials: records }, null, 2), 'utf8');
  }

  writeFileSync(join(RIG, 'trials.json'), JSON.stringify({ schemaVersion: 1, stage: 'R3-A0', expected: runs.length, completed: records.length, runsDir, trials: records }, null, 2), 'utf8');
  out('');
  out(`BASELINE QUALIFICATION COMPLETE — ${String(records.length)}/${String(runs.length)} records written`);
  out(`record: ${join(RIG, 'trials.json')}`);
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
