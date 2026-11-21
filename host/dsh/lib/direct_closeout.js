import { execFileSync } from 'node:child_process';

function git(repository, args) {
  return execFileSync('git', args, { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5_000 });
}

function headOf(repository) {
  const head = git(repository, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(head) ? head : null;
}

function cleanAt(repository, head) {
  return git(repository, ['status', '--porcelain=v1', '--untracked-files=all']) === '' && headOf(repository) === head;
}

/** Capture the checkout and the prior conclusion before delivering the business turn. */
export async function captureDirectCloseout(repository, workspace) {
  if (!repository || typeof workspace?.pulse !== 'function') return null;
  try {
    const head = headOf(repository);
    if (!head) return null;
    const pulse = await workspace.pulse();
    if (!pulse?.episode || headOf(repository) !== head) return null;
    return { head, conclusionId: pulse.episode.conclusion?.conclusionId ?? null };
  } catch {
    return null;
  }
}

/** Advise once at a clean direct-work boundary, leaving all episode decisions to the principal. */
export async function directCloseoutAdvice(repository, initial, workspace, controller) {
  if (!initial || !repository || typeof workspace?.pulse !== 'function' || typeof controller?.status !== 'function') return null;
  try {
    const head = headOf(repository);
    if (!head || head === initial.head || !cleanAt(repository, head)) return null;
    git(repository, ['merge-base', '--is-ancestor', initial.head, head]);
    if (!git(repository, ['diff', '--name-only', '-z', initial.head, head, '--'])) return null;

    const pulse = await workspace.pulse();
    const episode = pulse.episode;
    const conclusionId = episode.conclusion?.conclusionId ?? null;
    if ((conclusionId !== null && (episode.current || conclusionId !== initial.conclusionId)) ||
      episode.readiness.deliveryBlockers.length > 0 || episode.readiness.failedOrBlockedTasks.length > 0 ||
      episode.readiness.unresolvedQuestions.length > 0 ||
      pulse.execution.jobs.some(job => job.phase === 'QUEUED' || job.phase === 'RUNNING')) return null;

    const status = controller.status();
    if (status.directOutcome?.relation !== 'DIRECT_AHEAD' || status.directOutcome.repositoryHead !== head ||
      status.revision !== pulse.basis.projectRevision || status.headCommit !== pulse.basis.headCommit ||
      status.attempts.some(attempt => attempt.orphaned === true) || !cleanAt(repository, head)) return null;

    return {
      initialHead: initial.head, head, reason: 'DIRECT_DELIVERY_UNRECORDED',
      message: `[Project closeout] This turn left a clean committed change at ${head} and no new episode conclusion. ` +
        'If the committed work satisfies the current request, call palimpsest_work action=conclude intent=DELIVER with your statement and the committed artifact paths, then reply and end the session. If a blocker remains, report it or choose the applicable conclusion.',
    };
  } catch {
    return null;
  }
}
