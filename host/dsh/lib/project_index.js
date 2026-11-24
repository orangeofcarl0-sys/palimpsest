import { createHash } from 'node:crypto';

const maxBytes = 4096;
const shorten = (text, length) => Array.from(text ?? '').slice(0, length).join('');
const versionOf = (pulse, head) => ({
  projectId: pulse.projectId,
  revision: pulse.basis.projectRevision,
  projectDigest: pulse.basis.projectDigest,
  acceptedHead: pulse.basis.headCommit,
  checkoutHead: head,
});

/** A bounded projection of the current version. Detailed records remain with their owners. */
export async function readProjectIndex(workspace, controller, paths = [], expected) {
  const head = () => controller?.status().directOutcome?.repositoryHead ?? null;
  const checkpoints = () => [...paths].sort().flatMap(path => {
    const saved = workspace.localAssetCheckpoints?.latest(path);
    return saved ? [{ path, id: saved.id, digest: saved.digest, revision: saved.basis.revision }] : [];
  });
  const links = (items, count) => items.slice(0, count).map(item => ({
    ref: item.id, title: shorten(item.title, 84), sources: item.sourceRefs.slice(0, 4),
  }));
  const recent = pulse => pulse.recentChanges.filter(item => !item.title.startsWith('Episode conclusion:'));
  const snapshot = (pulse, drafts) => ({
    basis: versionOf(pulse, head()),
    goal: shorten(pulse.goal, 240),
    episode: { state: pulse.episode.state, conclusion: pulse.episode.conclusion?.conclusionId ?? null },
    drafts: drafts.slice(0, 3),
    open: links(pulse.openQuestions.slice(-3).reverse(), 3),
    blocked: links(pulse.blocked, 2),
    negative: links(pulse.negativeFindings, 3),
    // Episode is already represented above. Do not mix a historical action title into today's instructions.
    recent: recent(pulse).slice(0, 4).map(item => ({ ref: item.id, title: shorten(item.title, 84) })),
    next: pulse.nextActions.mechanical.slice(0, 2).map(action => action.length <= 160 ? action : 'Read current Work readiness for this step.'),
    details: 'Expand a ref with palimpsest_continuity explain; use Pulse for full state. Restore an absent draft with its exact checkpoint before using a bound review.',
    omitted: {
      drafts: Math.max(0, drafts.length - 3), open: Math.max(0, pulse.openQuestions.length - 3),
      blocked: Math.max(0, pulse.blocked.length - 2), negative: Math.max(0, pulse.negativeFindings.length - 3),
      recent: Math.max(0, recent(pulse).length - 4),
      next: Math.max(0, pulse.nextActions.mechanical.length - 2),
      sourceCoverage: pulse.coverage.complete,
    },
  });
  const index = snapshot(await workspace.pulse(), checkpoints());
  const bytes = JSON.stringify(index);
  if (bytes !== JSON.stringify(snapshot(await workspace.pulse(), checkpoints()))) {
    return { state: 'PROJECT_INDEX_DRIFT', next: 'Read the current Pulse and retry.' };
  }
  if (Buffer.byteLength(bytes) > maxBytes) return { state: 'PROJECT_INDEX_TOO_LARGE', next: 'Read the current Pulse.' };
  const version = createHash('sha256').update(bytes).digest('hex');
  if (expected !== undefined && expected !== version) return { state: 'PROJECT_INDEX_VERSION_MISMATCH', version };
  return { state: 'CURRENT', version, index };
}
