/**
 * R3-WR GATE 1 — GIT OBJECT-STORE FORENSICS.
 *
 * Records, for a chosen worktree, exactly what Git itself reports about its object store: the metadata shape,
 * the alternates bytes and their decoded target, whether that target exists and what it is, and whether the
 * objects a worker needs are reachable. The point of running Git's OWN commands rather than inspecting files by
 * hand is that a defect in a worktree is defined by what Git resolves, not by what a reader thinks the files say.
 *
 * THE STAGE NEVER MODIFIES THE EVIDENCE IT AUDITS. Every operation here is a read. The one place a write would
 * be tempting — repairing a malformed alternates file in place — is deliberately absent, because a repaired
 * original cannot be re-measured, and the ruling requires the failing bytes to survive the audit.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const NL = String.fromCharCode(10);

/** Run a Git command and capture its verdict without throwing. */
function git(cwd, args) {
  try {
    return Object.freeze({ ok: true, stdout: execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(), stderr: '' });
  } catch (error) {
    return Object.freeze({ ok: false, stdout: String(error?.stdout ?? '').trim(), stderr: String(error?.stderr ?? error?.message ?? error).trim() });
  }
}

/** The raw bytes of a file, or null when it is absent. */
function rawBytes(path) {
  if (!existsSync(path)) return null;
  const buffer = readFileSync(path);
  return Object.freeze({ bytes: buffer.length, text: buffer.toString('utf8'), hex: buffer.toString('hex') });
}

/**
 * GATE 1: THE METADATA SHAPE.
 *
 * `git` as a FILE is a linked worktree pointing at a `gitdir`; `git` as a DIRECTORY is a self-contained
 * repository. The distinction decides which failure modes are even possible, so it is measured rather than
 * assumed — the ruling says explicitly not to assume `.git` is always a directory.
 */
export function metadataShape(worktree) {
  const dotGit = join(worktree, '.git');
  if (!existsSync(dotGit)) return Object.freeze({ present: false, shape: 'ABSENT' });
  const stat = lstatSync(dotGit);
  const shape = stat.isDirectory() ? 'DIRECTORY' : 'FILE';
  return Object.freeze({
    present: true,
    shape,
    /** A linked worktree records its gitdir as a one-line file; a self-contained repo has the directory. */
    gitdirPointer: shape === 'FILE' ? readFileSync(dotGit, 'utf8').trim() : null,
    isSymbolicLink: stat.isSymbolicLink(),
  });
}

/**
 * GATE 1: THE ALTERNATES.
 *
 * `objects/info/alternates` is a list of OTHER object directories Git reads objects from. When an entry cannot be
 * normalized, Git reports `unable to normalize alternate object path` and every object that lives only in that
 * alternate becomes unreachable — which is how a commit that must read its base through the alternate fails.
 *
 * Each entry is decoded to the path Git would use, and that path is then TYPED (file, directory, absent) rather
 * than merely existence-tested, because `existsSync` is satisfied by a file where a directory is required.
 */
export function alternatesReport(worktree) {
  const dotGit = join(worktree, '.git');
  if (!existsSync(dotGit)) return Object.freeze({ present: false, entries: Object.freeze([]) });
  /** A linked worktree keeps its objects elsewhere, so the alternates live under the resolved gitdir. */
  const gitDirResult = git(worktree, ['rev-parse', '--git-dir']);
  const gitDir = gitDirResult.ok ? gitDirResult.stdout : dotGit;
  const path = join(worktree, gitDir, 'objects', 'info', 'alternates');
  if (!existsSync(path)) return Object.freeze({ present: false, entries: Object.freeze([]), path });
  const raw = rawBytes(path);
  const entries = raw.text.split(/\r?\n/u).filter((line) => line.trim() !== '').map((line) => {
    const resolved = line.trim();
    const targetExists = existsSync(resolved);
    let targetType = 'ABSENT';
    if (targetExists) {
      const stat = statSync(resolved);
      targetType = stat.isDirectory() ? 'DIRECTORY' : 'FILE';
    }
    /** A mixed separator is the shape that made Git refuse to normalize an entry. */
    const mixedSeparator = /\\[^\\]*\//u.test(resolved) || /\/[^/]*\\/u.test(resolved);
    return Object.freeze({ raw: line, resolved, targetExists, targetType, mixedSeparator, usesBackslash: resolved.includes('\\'), usesForwardSlash: resolved.includes('/') });
  });
  return Object.freeze({ present: true, path, bytes: raw.bytes, hex: raw.hex, entries: Object.freeze(entries) });
}

/**
 * GATE 1: THE READINESS FACTS.
 *
 * These are the four questions the ruling names, answered by Git itself. They are the same questions the runtime
 * must be able to answer before it declares a worktree usable, which is why they are collected in this shape.
 */
export function gitReadiness(worktree) {
  const head = git(worktree, ['rev-parse', '--verify', 'HEAD']);
  const headObject = git(worktree, ['cat-file', '-e', 'HEAD^{commit}']);
  const objects = git(worktree, ['rev-parse', '--git-path', 'objects']);
  const commonDir = git(worktree, ['rev-parse', '--git-common-dir']);
  const topLevel = git(worktree, ['rev-parse', '--show-toplevel']);
  const status = git(worktree, ['status', '--porcelain']);
  /** §12: an fsck that reports a broken link is the object-level statement of the same failure. */
  const fsck = git(worktree, ['fsck', '--no-progress', '--connectivity-only']);
  return Object.freeze({
    topLevel: topLevel.ok ? topLevel.stdout : null,
    gitDir: git(worktree, ['rev-parse', '--git-dir']).stdout,
    gitCommonDir: commonDir.ok ? commonDir.stdout : null,
    gitPathObjects: objects.ok ? objects.stdout : null,
    headResolvable: head.ok,
    head: head.ok ? head.stdout : null,
    headError: head.ok ? null : head.stderr,
    headObjectPresent: headObject.ok,
    headObjectError: headObject.ok ? null : headObject.stderr,
    statusClean: status.ok && status.stdout === '',
    statusPorcelain: status.ok ? status.stdout : null,
    fsckOk: fsck.ok,
    fsckOutput: `${fsck.stdout}${NL}${fsck.stderr}`.trim().slice(0, 600),
  });
}

/**
 * GATE 1: WHETHER A COMMIT IS POSSIBLE.
 *
 * The measurement the whole stage turns on. It is taken WITHOUT committing — `git commit --dry-run` reads the
 * index and the base and stops before writing — so the audit cannot itself change the evidence.
 */
export function commitCapability(worktree) {
  const dryRun = git(worktree, ['-c', 'user.email=probe@probe', '-c', 'user.name=probe', 'commit', '--dry-run', '-m', 'r3-wr-probe']);
  const combined = `${dryRun.stdout}${NL}${dryRun.stderr}`;
  return Object.freeze({
    ok: dryRun.ok,
    /** The exact failure signature this stage was opened for. */
    couldNotParseHead: /could not parse HEAD/iu.test(combined),
    unableToNormalizeAlternate: /unable to normalize alternate object path/iu.test(combined),
    output: combined.trim().slice(0, 400),
  });
}

/** GATE 1: everything above, for one worktree. */
export function auditWorktree(worktree) {
  const shape = metadataShape(worktree);
  return Object.freeze({
    worktree,
    exists: existsSync(worktree),
    shape,
    alternates: alternatesReport(worktree),
    readiness: gitReadiness(worktree),
    commit: commitCapability(worktree),
  });
}

export { NL, git };
