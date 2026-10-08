/**
 * R3-WR3 GATE A5 — READINESS REGRESSION AND THE REMOTE CONTRACT.
 *
 * The R3-WR2 readiness criterion (four positive exit-code facts) is CARRIED FORWARD, and this harness proves it
 * still behaves correctly on every state the ruling names. The point is not to re-derive the criterion but to
 * show the R3-WR3 changes did not disturb it, and to pin the ordinary states it must ACCEPT alongside the
 * faults it must REFUSE.
 *
 * THE DOCUMENTATION MISMATCH the ruling asks to audit. R3-WR2's comment claimed `commit --dry-run` exit 1 was
 * honoured "ONLY together with an empty tracked status", while the code accepted exit 1 unconditionally. The
 * CODE was right: `--dry-run` does not run the `pre-commit` hook, so exit 1 can only mean "nothing to commit",
 * which is the legitimate state of a clean world AND of a world holding UNSTAGED edits. Requiring a clean
 * status would have refused the resumed-attempt state. The comment is corrected in the fix; this harness pins
 * the BEHAVIOUR so the correction cannot drift back.
 *
 * THE REMOTE CONTRACT. R3-WR2 wrapped `remote remove origin` in a bare `catch`, so a FAILED removal looked
 * exactly like "there was no origin". Those are different facts: the first leaves a path back into the canonical
 * project on a world a strong worker can reach. Three cases are measured here: a remote present and removable,
 * no remote at all, and a remote that CANNOT be removed.
 *
 * PLAIN JAVASCRIPT (`.mjs`). Temporary roots only. No LLM.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NL = String.fromCharCode(10);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const git = (cwd, args) => {
  try {
    return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return `ERR:${String(error?.stderr ?? error?.message ?? error).trim().slice(0, 120)}`;
  }
};

async function loadPort() {
  const module = await import(pathToFileURL(join(REPO, 'dist', 'src', 'effects', 'git_port.js')).href);
  return module.GitCliPort;
}

function makeBasis(root) {
  const repo = join(root, 'canonical');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'ledger.mjs'), `export const answer = 0;${NL}`, 'utf8');
  git(repo, ['init', '-q']);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=b@b.b', '-c', 'user.name=b', 'commit', '-qm', 'basis']);
  return Object.freeze({ repo, basisCommit: git(repo, ['rev-parse', 'HEAD']) });
}

/**
 * GATE A5 — the readiness states.
 *
 * Each row arranges a world, applies a fault where relevant, and asks the real port to reuse it. The required
 * outcome is ACCEPT for the ordinary states and REFUSE for the faults.
 */
export async function readinessRegression() {
  const GitCliPort = await loadPort();
  const root = mkdtempSync(join(tmpdir(), 'r3wr3-ready-'));
  const rows = [];

  /**
   * EACH ROW GETS ITS OWN CANONICAL REPOSITORY. Some rows damage the borrowed store or the canonical config to
   * produce their fault, and a shared repository would leak that damage into the next row — which would make a
   * later row fail for a reason that belongs to an earlier one. Per-row isolation is what keeps each result a
   * statement about its own fault.
   */
  const runRow = async (label, expected, arrange) => {
    const caseRoot = join(root, label.replace(/[^a-z0-9]+/giu, '-').toLowerCase());
    mkdirSync(caseRoot, { recursive: true });
    const basis = makeBasis(caseRoot);
    const worldsRoot = join(basis.repo, '.palimpsest', 'worlds');
    const port = new GitCliPort(basis.repo, worldsRoot);
    const worldId = 'attempt-under-test';
    await port.createWorld({ worktreeId: worldId, baseCommit: basis.basisCommit });
    const worldPath = join(worldsRoot, worldId);
    const override = arrange === undefined ? undefined : await arrange({ worldPath, worldId, basis, worldsRoot, port, caseRoot });
    let outcome;
    try {
      await port.createWorld({ worktreeId: worldId, baseCommit: override ?? basis.basisCommit });
      outcome = { accepted: true, error: null };
    } catch (error) {
      outcome = { accepted: false, error: String(error?.message ?? error).slice(0, 150) };
    }
    rows.push(Object.freeze({
      label,
      expected,
      outcome,
      satisfied: (expected === 'ACCEPT') === outcome.accepted,
      worldSurvived: existsSync(worldPath),
    }));
  };

  await runRow('healthy clean World', 'ACCEPT');
  await runRow('staged edit', 'ACCEPT', ({ worldPath }) => {
    writeFileSync(join(worldPath, 'src', 'ledger.mjs'), `export const answer = 31;${NL}`, 'utf8');
    git(worldPath, ['add', '-A']);
  });
  await runRow('unstaged edit', 'ACCEPT', ({ worldPath }) => {
    writeFileSync(join(worldPath, 'src', 'ledger.mjs'), `export const answer = 32;${NL}`, 'utf8');
  });
  await runRow('untracked file', 'ACCEPT', ({ worldPath }) => {
    writeFileSync(join(worldPath, 'notes.txt'), 'a note\n', 'utf8');
  });
  await runRow('corrupt index', 'REFUSE', ({ worldPath }) => {
    writeFileSync(join(worldPath, '.git', 'index'), 'GARBAGE-INDEX');
  });
  await runRow('index.lock contention', 'REFUSE', ({ worldPath }) => {
    writeFileSync(join(worldPath, '.git', 'index.lock'), '');
  });
  await runRow('malformed HEAD', 'REFUSE', ({ worldPath }) => {
    writeFileSync(join(worldPath, '.git', 'HEAD'), `ref: refs/heads/nonexistent${NL}`, 'utf8');
  });
  /** The borrowed store disappears, so the basis cannot be delivered. */
  await runRow('unavailable borrowed store', 'REFUSE', ({ basis, caseRoot }) => {
    renameSync(join(basis.repo, '.git', 'objects'), join(caseRoot, 'objects-elsewhere'));
  });
  /** An unresolvable basis: the requested commit does not exist anywhere. */
  await runRow('unresolvable basis commit', 'REFUSE', () => '0'.repeat(40));
  /** The world's `.git` points at a gitdir that does not exist: git cannot resolve anything here. */
  await runRow('unresolvable gitdir', 'REFUSE', ({ worldPath, basis }) => {
    rmSync(join(worldPath, '.git'), { recursive: true, force: true });
    writeFileSync(join(worldPath, '.git'), `gitdir: ${join(basis.repo, 'no-such-gitdir')}${NL}`, 'utf8');
  });

  try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene sweeps it */ }

  return Object.freeze({
    kind: 'R3-WR3 Gate A5 — readiness regression',
    rows: Object.freeze(rows),
    rowsSatisfied: rows.filter((row) => row.satisfied === true).length,
    rowsTotal: rows.length,
    UNKNOWN_READINESS_FAILURE_DETECTED: rows.filter((row) => row.expected === 'REFUSE').every((row) => row.outcome.accepted === false),
    ORDINARY_STATES_ACCEPTED: rows.filter((row) => row.expected === 'ACCEPT').every((row) => row.outcome.accepted === true),
    everyRefusalKeptWorldInPlace: rows.filter((row) => row.expected === 'REFUSE').every((row) => row.worldSurvived === true),
    pointInTimeOnly: true,
  });
}

/**
 * GATE A5 — the remote contract.
 *
 * Three cases: a removable remote, no remote, and a remote that CANNOT be removed. The third is the one R3-WR2
 * silently equated with the second.
 */
export async function remoteContract() {
  const GitCliPort = await loadPort();
  const root = mkdtempSync(join(tmpdir(), 'r3wr3-remote-'));
  const basis = makeBasis(root);
  const worldsRoot = join(basis.repo, '.palimpsest', 'worlds');
  const port = new GitCliPort(basis.repo, worldsRoot);
  const cases = [];

  /** A world created the ordinary way: the clone has an origin, and it must be gone afterwards. */
  {
    const created = await port.createWorld({ worktreeId: 'attempt-remote-normal', baseCommit: basis.basisCommit });
    const remotes = git(created.worldPath, ['remote']);
    cases.push(Object.freeze({
      case: 'world created through the shipped path',
      remotesAfter: remotes === '' ? [] : remotes.split(NL),
      originAbsent: remotes === '',
      /** The canonical repository must never be a remote of a world. */
      noRemoteNamesCanonical: !git(created.worldPath, ['remote', '-v']).includes(basis.repo),
      accepted: true,
    }));
  }

  /** An added remote pointing at the canonical repository must be REMOVED, not tolerated. */
  {
    const created = await port.createWorld({ worktreeId: 'attempt-remote-added', baseCommit: basis.basisCommit });
    git(created.worldPath, ['remote', 'add', 'sneaky', basis.repo]);
    const before = git(created.worldPath, ['remote']);
    await port.createWorld({ worktreeId: 'attempt-remote-added', baseCommit: basis.basisCommit });
    const after = git(created.worldPath, ['remote']);
    cases.push(Object.freeze({
      case: 'a remote pointing at the canonical repository, added after creation',
      remotesBefore: before === '' ? [] : before.split(NL),
      remotesAfter: after === '' ? [] : after.split(NL),
      REMOVED: after === '',
      noRemoteNamesCanonical: !git(created.worldPath, ['remote', '-v']).includes(basis.repo),
    }));
  }

  /**
   * AN UNREMOVABLE REMOTE. The removal must genuinely FAIL while the config stays readable, which is a narrower
   * fault than making the config unreadable: with the config unreadable, git fails before it can even report
   * which remotes exist, and the case would then be about a broken repository rather than about a surviving
   * remote. A DIRECTORY at `.git/config.lock` produces exactly the right fault, measured:
   *
   *     error: could not lock config file .git/config
   *     error: Could not remove config section 'remote.stuck'
   *
   * The remote survives and the repository is otherwise healthy — which is precisely the state R3-WR2's bare
   * `catch` would have accepted in silence.
   */
  {
    const created = await port.createWorld({ worktreeId: 'attempt-remote-stuck', baseCommit: basis.basisCommit });
    git(created.worldPath, ['remote', 'add', 'stuck', basis.repo]);
    const lockPath = join(created.worldPath, '.git', 'config.lock');
    mkdirSync(lockPath, { recursive: true });
    let outcome;
    try {
      await port.createWorld({ worktreeId: 'attempt-remote-stuck', baseCommit: basis.basisCommit });
      outcome = { accepted: true, error: null };
    } catch (error) {
      outcome = { accepted: false, error: String(error?.message ?? error).slice(0, 180) };
    }
    /** The fault is removed so the temporary root can be torn down. */
    rmSync(lockPath, { recursive: true, force: true });
    const remotesAfter = git(created.worldPath, ['remote']);
    cases.push(Object.freeze({
      case: 'a remote whose removal FAILS (config.lock directory)',
      remotesAfter: remotesAfter === '' ? [] : remotesAfter.split(NL),
      outcome,
      /**
       * THE PROPERTY: the call must REFUSE. R3-WR2's bare `catch` would have returned success here, leaving a
       * world with a remote naming the canonical repository — a path back into the project on a world a strong
       * worker can reach.
       */
      REFUSED_RATHER_THAN_SILENT: outcome.accepted === false,
      refusalNamesTheRemote: outcome.accepted === false && String(outcome.error).includes('WORLD_REMOTE_NOT_REMOVED'),
      NO_SILENT_SURVIVING_REMOTE: outcome.accepted === false || !git(created.worldPath, ['remote', '-v']).includes(basis.repo),
    }));
  }

  try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene sweeps it */ }

  return Object.freeze({
    kind: 'R3-WR3 Gate A5 — remote contract',
    cases: Object.freeze(cases),
    REMOTE_REMOVAL_VERIFIED: cases.every((entry) => entry.NO_SILENT_SURVIVING_REMOTE !== false),
    anyRemoteNamesCanonical: cases.some((entry) => entry.noRemoteNamesCanonical === false),
  });
}

function main() {
  Promise.all([readinessRegression(), remoteContract()]).then(([readiness, remote]) => {
    process.stdout.write(`${NL}===== R3-WR3 GATE A5 — READINESS REGRESSION =====${NL}`);
    for (const row of readiness.rows) {
      process.stdout.write(`${(row.satisfied === true ? 'OK  ' : 'FAIL')} ${row.label.padEnd(46)} expect=${row.expected.padEnd(7)} got=${row.outcome.accepted ? 'ACCEPT' : 'REFUSE'}${row.outcome.error === null ? '' : ` ${row.outcome.error.slice(0, 60)}`}${NL}`);
    }
    process.stdout.write(`rows satisfied: ${String(readiness.rowsSatisfied)}/${String(readiness.rowsTotal)}  unknown failures refused: ${String(readiness.UNKNOWN_READINESS_FAILURE_DETECTED)}  ordinary accepted: ${String(readiness.ORDINARY_STATES_ACCEPTED)}  refusals kept world in place: ${String(readiness.everyRefusalKeptWorldInPlace)}${NL}`);
    process.stdout.write(`${NL}===== R3-WR3 GATE A5 — REMOTE CONTRACT =====${NL}`);
    for (const entry of remote.cases) {
      process.stdout.write(`${NL}${entry.case}${NL}`);
      process.stdout.write(`  ${JSON.stringify(entry, null, 2).split(NL).join(NL + '  ')}${NL}`);
    }
    process.stdout.write(`${NL}  REMOTE_REMOVAL_VERIFIED: ${String(remote.REMOTE_REMOVAL_VERIFIED)}${NL}`);
    process.stdout.write(`  any remote names canonical: ${String(remote.anyRemoteNamesCanonical)}${NL}`);
  }).catch((error) => {
    process.stderr.write(`gate A5 failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
