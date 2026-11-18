// Short-lived second host used by the native browser check. Each step reopens the real ledger.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { launchDeployment, loadDeploymentProfile } from '../../dist/src/advanced.js';

const [deployment, action] = process.argv.slice(2);
const profile = loadDeploymentProfile(deployment);
assert.equal(profile.projectId, 'inspect-test');
const writer = launchDeployment(profile, { context: { tools: { register: () => () => {} } } });
try {
  const work = writer.installed.controller;
  let value;
  if (action === 'start') {
    const task = (id, objective, deps = []) => ({ task_id: id, objective, depends_on: deps, write_paths: [id + '.md'], required_artifacts: [id + '.md'] });
    const headCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: profile.repository, encoding: 'utf8' }).trim();
    work.start({ projectId: profile.projectId, headCommit, goal: '核对工作交接', tasks: [task('reading', '核对现场读数'), task('review', '复核读数来源', ['reading'])] });
  } else if (action === 'claim') {
    work.step();
    const created = work.step();
    assert.equal(created.event_type, 'ATTEMPT_CREATED');
    await work.claim(created.entity_id);
    assert.equal(work.status().attempts.find(a => a.attempt_id === created.entity_id)?.state, 'RUNNING');
    value = created.entity_id;
  } else if (action === 'tail') {
    value = work.store.projectTimeline(profile.projectId)[0];
  } else {
    throw new Error('Unknown fixture action');
  }
  console.log(JSON.stringify(value ?? null));
} finally {
  await writer.close();
}
