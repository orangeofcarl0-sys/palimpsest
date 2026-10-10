/**
 * R3-L0C-I-A-R-L-C-F-S §4 Gate S2 — FAIL-CLOSED WORKTREE AND JUNCTION CLEANUP.
 *
 * THE DEFECT THIS CLOSES, measured by `baseline/legacy-controls.mjs controlUnsafeCleanupFallback` against the real
 * `8bf8d42` code: `destroyIsolatedCheckout` swallowed a failed junction unlink — its catch block was an empty
 * comment — and then ran `git worktree remove --force` and a recursive `rmSync` UNCONDITIONALLY. An attempted
 * unlink was treated as a successful one, and no state existed in which cleanup could be refused.
 *
 * THE SAFETY INVARIANT §4 STATES. Before any recursive deletion or forced Git worktree removal, every link capable
 * of referring outside the disposable worktree must be POSITIVELY IDENTIFIED AND CONFIRMED REMOVED. "An attempted
 * unlink is not proof of successful unlink."
 *
 * THE ORDERED STEPS §4 REQUIRES, each an observation this module makes rather than a comment it carries:
 *
 *   1. verify the target is an owned disposable worktree
 *   2. verify the worktree is within the expected disposable root
 *   3. enumerate known junctions/symlinks and unexpected link-like entries
 *   4. use `lstat` to classify each entry without traversing it
 *   5. attempt link removal WITHOUT traversing the target
 *   6. REINSPECT each link path after removal
 *   7. abort if any link remains, cannot be classified, or cannot be safely unlinked
 *   8. never proceed to `git worktree remove --force` or recursive deletion after such a failure
 *   9. preserve the worktree for diagnosis and report its exact location
 *  10. return an explicit `CLEANUP_BLOCKED` rather than silently ignoring the error
 *
 * WHY THE FILE-SYSTEM OPERATIONS ARE INJECTABLE. §4 requires the failure branches to be tested "with fault-injected
 * filesystem/Git adapters or another controlled simulation", because "Do not test by risking deletion of real shared
 * directories." The default adapter is the real one; a test supplies an adapter whose unlink throws, or whose unlink
 * reports success while the link remains, and the SAME production control flow is exercised.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { CLEANUP_OUTCOMES, CLEANUP_SAFETY_STEPS, LINK_KINDS, NL, REPO_ROOT } from './contract.mjs';

/** §4: the marker file a checkout created by this stage carries, so ownership is provable rather than assumed. */
export const DISPOSABLE_MARKER = '.r3lcfs-disposable-worktree.json';

/** §4: the names a disposable checkout's links carry, and the only entries this module will unlink. */
export const EXPECTED_LINK_NAMES = Object.freeze(['node_modules', 'dist']);

/** §4: the expected disposable root, under the system temp root, so a worktree outside it is refused. */
export function disposableRoot() {
  return resolve(tmpdir());
}

/** §4: the REAL filesystem adapter. Every operation is a named function so a test can substitute one. */
export function realFilesystemAdapter() {
  return Object.freeze({
    exists: (path) => existsSync(path),
    lstat: (path) => lstatSync(path),
    readdir: (path) => readdirSync(path, { withFileTypes: true }),
    /** §4: remove a LINK without traversing its target. `rmdir` on a Windows junction removes the link, not the target. */
    unlinkLink: (path) => {
      if (process.platform === 'win32') execFileSync('cmd', ['/c', 'rmdir', path], { stdio: ['ignore', 'pipe', 'pipe'] });
      else rmSync(path, { force: true });
    },
    removeTree: (path) => rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }),
  });
}

/** §4: the REAL git adapter, so the forced removal is a named operation a test can observe or refuse. */
export function realGitAdapter() {
  return Object.freeze({
    removeWorktreeForce: (root) => { execFileSync('git', ['worktree', 'remove', '--force', root], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] }); },
  });
}

/**
 * §4: CLASSIFY ONE DIRECTORY ENTRY WITHOUT TRAVERSING IT.
 *
 * `lstat` describes the LINK itself rather than what it points at, which is exactly what a link-safety decision
 * needs. A directory entry that is not a link, not a file and not a directory is UNCLASSIFIED and blocks cleanup.
 */
export function classifyEntry(input) {
  const { path, fs } = input;
  let stats;
  try { stats = fs.lstat(path); } catch (error) {
    return Object.freeze({ path, kind: 'UNCLASSIFIABLE', isLink: null, reason: `lstat failed: ${String(error?.message ?? error).slice(0, 160)}` });
  }
  const isSymbolicLink = stats.isSymbolicLink() === true;
  /** A Windows directory junction is reported by Node as a symbolic link with the directory bit set. */
  const isDirectory = stats.isDirectory() === true;
  const kind = isSymbolicLink ? (isDirectory ? 'directory-symlink-or-junction' : 'file-symlink') : isDirectory ? 'directory' : stats.isFile() === true ? 'file' : 'UNCLASSIFIABLE';
  return Object.freeze({
    path,
    kind,
    isLink: isSymbolicLink,
    /** §4: a link is the only entry that can refer outside the worktree, so only links require confirmation. */
    canReferOutside: isSymbolicLink,
    isUnclassifiable: kind === 'UNCLASSIFIABLE',
  });
}

/**
 * §4: DESTROY A DISPOSABLE CHECKOUT, FAIL-CLOSED.
 *
 * The control flow is: verify ownership, verify the root, enumerate and classify, unlink each link WITHOUT
 * traversing, REINSPECT each link path, and only then remove the tree. A failure at any link returns
 * `CLEANUP_BLOCKED` and the tree is PRESERVED — `removeWorktreeForce` and `removeTree` are never reached.
 */
export function destroyDisposableCheckout(input) {
  const { checkout, fs = realFilesystemAdapter(), git = realGitAdapter(), expectedRoot = disposableRoot() } = input;
  const steps = [];
  const record = (step, observation) => steps.push(Object.freeze({ step: steps.length + 1, id: step, observation }));

  const root = checkout?.root ?? null;
  if (root === null || root === undefined || root === '') {
    record('VERIFY_OWNERSHIP', Object.freeze({ owned: false, reason: 'no checkout root was supplied' }));
    return blocked(Object.freeze({ root, steps, reason: 'no checkout root was supplied', ownership: false }));
  }
  const resolvedRoot = resolve(root);

  /** 1. VERIFY OWNERSHIP. §4: the target must be an owned disposable worktree, not merely a directory. */
  const markerPath = join(resolvedRoot, DISPOSABLE_MARKER);
  const ownershipByMarker = fs.exists(markerPath) === true;
  const ownershipByFlag = checkout?.owned === true;
  const owned = ownershipByMarker === true || ownershipByFlag === true;
  record('VERIFY_OWNERSHIP', Object.freeze({ owned, ownershipByMarker, ownershipByFlag, markerPath }));
  if (owned !== true) {
    return Object.freeze({
      outcome: CLEANUP_OUTCOMES.REFUSED_NOT_OWNED, blocked: true, destructiveFallbackExecuted: false,
      root: resolvedRoot, preserved: fs.exists(resolvedRoot) === true, steps: Object.freeze(steps),
      reason: `the target ${resolvedRoot} carries neither the disposable marker ${DISPOSABLE_MARKER} nor an ownership flag, so it is not a checkout this stage owns and cleanup is REFUSED`,
      worktreeRemoved: false, linksRemoved: Object.freeze([]), linksRemaining: Object.freeze([]),
      law: 'a cleanup must prove the target is an owned disposable worktree before it removes anything',
    });
  }

  /** 2. VERIFY THE EXPECTED ROOT. §4: the worktree must be within the expected disposable root. */
  const normalizedRoot = resolvedRoot.replace(/\\/gu, '/');
  const normalizedExpected = resolve(expectedRoot).replace(/\\/gu, '/');
  const withinExpectedRoot = normalizedRoot.startsWith(normalizedExpected) || (checkout?.withinExpectedRoot === true);
  record('VERIFY_WITHIN_DISPOSABLE_ROOT', Object.freeze({ withinExpectedRoot, expectedRoot: normalizedExpected, actual: normalizedRoot }));
  if (withinExpectedRoot !== true) {
    return blocked(Object.freeze({
      root: resolvedRoot, steps,
      reason: `the worktree ${normalizedRoot} is not within the expected disposable root ${normalizedExpected}, so cleanup is REFUSED rather than risked`,
    }));
  }

  /** 3. ENUMERATE the expected link names plus any UNEXPECTED link-like entry at the worktree root. */
  const linkPaths = [];
  const unexpected = [];
  let entries = [];
  try { entries = fs.readdir(resolvedRoot); } catch (error) {
    return blocked(Object.freeze({ root: resolvedRoot, steps, reason: `the worktree could not be read: ${String(error?.message ?? error).slice(0, 160)}` }));
  }
  const declared = new Set((checkout?.links ?? []).map((link) => link.name));
  for (const name of EXPECTED_LINK_NAMES) if (declared.has(name) || fs.exists(join(resolvedRoot, name))) declared.add(name);
  for (const entry of entries) {
    const entryPath = join(resolvedRoot, entry.name);
    if (entry.name === DISPOSABLE_MARKER) continue;
    if (declared.has(entry.name)) { linkPaths.push(entryPath); continue; }
    /** §4: an UNEXPECTED link-like entry must be classified; if it is a link, it blocks unless safely removed. */
    const classification = classifyEntry({ path: entryPath, fs });
    if (classification.canReferOutside === true || classification.isUnclassifiable === true) unexpected.push(classification);
  }
  record('ENUMERATE_LINKS_AND_UNEXPECTED_LINK_LIKE_ENTRIES', Object.freeze({
    expected: Object.freeze(linkPaths.map((path) => path.split(/[/\\]/u).pop())),
    unexpected: Object.freeze(unexpected.map((entry) => Object.freeze({ path: entry.path, kind: entry.kind }))),
  }));
  for (const entry of unexpected) {
    linkPaths.push(entry.path);
  }

  /** 4. CLASSIFY each link by `lstat`, WITHOUT traversing it. */
  const classified = linkPaths.map((path) => classifyEntry({ path, fs }));
  record('CLASSIFY_BY_LSTAT_IDENTITY', Object.freeze({
    links: Object.freeze(classified.map((entry) => Object.freeze({ name: basename(entry.path), kind: entry.kind, isLink: entry.isLink, canReferOutside: entry.canReferOutside }))),
    linkKinds: LINK_KINDS,
  }));
  const unclassifiable = classified.filter((entry) => entry.isUnclassifiable === true);
  if (unclassifiable.length > 0) {
    return blocked(Object.freeze({
      root: resolvedRoot, steps,
      reason: `the entries [${unclassifiable.map((entry) => entry.path).join(', ')}] could not be classified, so cleanup cannot prove it is safe`,
      unclassified: Object.freeze(unclassifiable.map((entry) => entry.path)),
    }));
  }

  /** 5. ATTEMPT UNLINK without traversing the target. */
  const unlinkAttempts = [];
  for (const entry of classified) {
    if (entry.isLink !== true) { unlinkAttempts.push(Object.freeze({ path: entry.path, attempted: false, reason: 'the entry is not a link, so it is removed with the tree' })); continue; }
    try { fs.unlinkLink(entry.path); unlinkAttempts.push(Object.freeze({ path: entry.path, attempted: true, threw: false })); }
    catch (error) { unlinkAttempts.push(Object.freeze({ path: entry.path, attempted: true, threw: true, error: String(error?.message ?? error).slice(0, 160) })); }
  }
  record('ATTEMPT_UNLINK_WITHOUT_TRAVERSING', Object.freeze({ attempts: Object.freeze(unlinkAttempts) }));

  /** 6. REINSPECT each link path. §4: an attempted unlink is NOT proof of successful unlink. */
  const reinspection = classified.filter((entry) => entry.isLink === true).map((entry) => Object.freeze({
    path: entry.path,
    /** A link that still exists after the attempt — whether the attempt threw or silently did nothing — is REMOVAL_FAILED. */
    stillPresent: fs.exists(entry.path) === true,
    attempted: unlinkAttempts.find((attempt) => attempt.path === entry.path)?.attempted === true,
    threw: unlinkAttempts.find((attempt) => attempt.path === entry.path)?.threw === true,
  }));
  record('REINSPECT_EACH_LINK_PATH', Object.freeze({ reinspection: Object.freeze(reinspection) }));

  /** 7/8/9/10. ABORT if any link remains; NEVER force-remove or recurse after such a failure. */
  const linksRemaining = reinspection.filter((entry) => entry.stillPresent === true).map((entry) => entry.path);
  if (linksRemaining.length > 0) {
    return blocked(Object.freeze({
      root: resolvedRoot, steps,
      reason: `the link(s) [${linksRemaining.map((path) => path.split(/[/\\]/u).pop()).join(', ')}] remain after an unlink attempt, so the destructive fallback is NOT executed and the worktree is preserved for diagnosis`,
      linksRemaining: Object.freeze(linksRemaining),
      attemptedUnlinkFailed: true,
    }));
  }

  /** §4: only NOW, with every link CONFIRMED removed, may the worktree be removed. */
  const linksRemoved = classified.filter((entry) => entry.isLink === true).map((entry) => entry.path);
  record('CONFIRM_ALL_LINKS_REMOVED', Object.freeze({ linksRemoved: Object.freeze(linksRemoved.map((path) => path.split(/[/\\]/u).pop())), confirmed: true }));
  let worktreeRemoved = false;
  let gitRemovalThrew = false;
  try { git.removeWorktreeForce(resolvedRoot); } catch { gitRemovalThrew = true; }
  try { fs.removeTree(resolvedRoot); } catch { /* the OS may hold a handle briefly; the recheck below decides */ }
  worktreeRemoved = fs.exists(resolvedRoot) !== true;
  record('REMOVE_WORKTREE_AFTER_LINK_CONFIRMATION', Object.freeze({ gitRemovalThrew, worktreeRemoved }));

  return Object.freeze({
    outcome: worktreeRemoved ? CLEANUP_OUTCOMES.CLEANED : CLEANUP_OUTCOMES.CLEANUP_BLOCKED,
    blocked: worktreeRemoved !== true,
    destructiveFallbackExecuted: true,
    root: resolvedRoot,
    preserved: fs.exists(resolvedRoot) === true,
    steps: Object.freeze(steps),
    linksRemoved: Object.freeze(linksRemoved),
    linksRemaining: Object.freeze([]),
    worktreeRemoved,
    reason: worktreeRemoved ? null : 'every link was confirmed removed but the worktree directory itself could not be removed, so the result is reported as blocked rather than as a success',
    safetyOrdering: CLEANUP_SAFETY_STEPS,
    law: 'the destructive fallback runs only after every link capable of referring outside the worktree has been positively identified and CONFIRMED removed; a remaining, unclassifiable or unsafely-unlinkable link preserves the worktree and returns CLEANUP_BLOCKED',
  });
}

/** §4: the blocked result, with the destructive operations explicitly NOT executed. */
function blocked(input) {
  return Object.freeze({
    outcome: CLEANUP_OUTCOMES.CLEANUP_BLOCKED,
    blocked: true,
    destructiveFallbackExecuted: false,
    worktreeRemoved: false,
    root: input.root ?? null,
    preserved: true,
    steps: input.steps ?? Object.freeze([]),
    linksRemoved: Object.freeze([]),
    linksRemaining: Object.freeze(input.linksRemaining ?? []),
    unclassified: Object.freeze(input.unclassified ?? []),
    reason: input.reason,
    diagnosticLocation: input.root ?? null,
    gitWorktreeRemoveForceExecuted: false,
    recursiveRemoveExecuted: false,
    safetyOrdering: CLEANUP_SAFETY_STEPS,
    law: 'a cleanup failure preserves the worktree for diagnosis and reports CLEANUP_BLOCKED; it never proceeds to git worktree remove --force or a recursive delete',
  });
}

/** A path's final segment, without importing `path.basename` under a name that shadows it. */
function basename(path) {
  return String(path).split(/[/\\]/u).pop();
}

/**
 * §4: CREATE A DISPOSABLE CHECKOUT THAT THE FAIL-CLOSED CLEANUP OWNS.
 *
 * A real Git worktree at the current HEAD, with the disposable marker written into it so ownership is PROVABLE, and
 * with `node_modules` and `dist` as junctions to the real ones — never copies, and never written through. The
 * worktree is created under the system temp root, so it never appears in the repository's own tree.
 *
 * §4: this REPLACES the prior stage's `createIsolatedCheckout`/`destroyIsolatedCheckout` pair for this stage's
 * safety-sensitive operations. The prior helper remains byte-identical and physically executable; that limitation is
 * disclosed on `LEGACY_HELPER_QUARANTINE` rather than papered over.
 */
export function createDisposableCheckout(input = {}) {
  const root = mkdtempSync(join(tmpdir(), 'r3lcfs-worktree-'));
  const head = git(REPO_ROOT, ['rev-parse', 'HEAD']);
  /** §4: line-ending conversion is DISABLED so the checkout reproduces the committed bytes exactly. */
  git(REPO_ROOT, ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'worktree', 'add', '--detach', root, head]);
  const links = [];
  for (const name of EXPECTED_LINK_NAMES) {
    const target = join(REPO_ROOT, name);
    const linkPath = join(root, name);
    if (!existsSync(target)) continue;
    try {
      if (process.platform === 'win32') execFileSync('cmd', ['/c', 'mklink', '/J', linkPath, target], { stdio: ['ignore', 'pipe', 'pipe'] });
      else execFileSync('ln', ['-s', target, linkPath], { stdio: ['ignore', 'pipe', 'pipe'] });
      links.push(Object.freeze({ name, linkPath, target }));
    } catch { /* a failed junction leaves the worktree usable for a closure, which hashes tracked source only */ }
  }
  writeFileSync(join(root, DISPOSABLE_MARKER), `${JSON.stringify({ stage: 'R3-L0C-I-A-R-L-C-F-S', head, at: new Date().toISOString(), injected: input.injectLink ?? null }, null, 2)}${NL}`, 'utf8');
  /**
   * §4 S2-D: an UNEXPECTED link-like entry can be injected by a caller, so the "unexpected entry blocks cleanup"
   * branch is reachable in a real disposable checkout rather than only in a simulation.
   */
  if (typeof input.injectLink === 'function') {
    const injected = input.injectLink({ root, join });
    if (injected !== null && injected !== undefined) links.push(Object.freeze({ name: injected.name, linkPath: injected.linkPath, target: injected.target, unexpected: true }));
  }
  return Object.freeze({ root, head, links: Object.freeze(links), owned: true, marker: DISPOSABLE_MARKER, withinExpectedRoot: true });
}

/** §4: run a git command and return its trimmed stdout, or null. */
function git(cwd, args) {
  try { return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return null; }
}

export { NL };

/** §4: whether a path is a directory at all, used by the ownership pre-check. */
export function isDirectoryPath(path) {
  try { return statSync(path).isDirectory(); } catch { return false; }
}
