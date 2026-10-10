/**
 * R3-L0C-I-A-R-L-C-F-S-H §4 H2 — FAIL-CLOSED DISPOSABLE-WORKTREE CLEANUP.
 *
 * THE DEFECT THIS CLOSES, measured by `baseline/legacy-controls.mjs controlCleanupDefects` against the real
 * `80823c4` code. Four independent measurements, three of which DESTROYED data outside the intended root:
 *
 *   1. `safe-cleanup.mjs:122` accepted a caller-supplied `checkout.owned === true` as sufficient proof, so a
 *      directory carrying NO marker was `CLEANED` with `destructiveFallbackExecuted: true` and its user file was gone.
 *   2. `:141` compared roots with `normalizedRoot.startsWith(normalizedExpected)`, so a SIBLING directory whose name
 *      shares a textual prefix was `CLEANED` and its data file was gone.
 *   3. `:159` enumerated only the worktree ROOT's entries, so a link nested below it was seen zero times and the
 *      worktree was still `CLEANED`.
 *   4. `:204` used `fs.exists(entry.path)` — an `existsSync` — as the post-unlink witness, which reports `false` for
 *      a dangling link whose target is absent even though `lstat` proves the link itself remains.
 *
 * WHAT THIS MODULE DOES INSTEAD. Every §4 requirement is an OBSERVATION the cleanup makes rather than a comment it
 * carries, and a failure at any one returns `CLEANUP_BLOCKED` with the worktree PRESERVED. The destructive
 * operations are never reached.
 *
 *   OWNERSHIP   six witnesses must agree — the marker exists, it names THIS stage, it records the resolved root it
 *               was written into, it carries the per-checkout random identifier the factory issued, the path lies
 *               under the disposable root the factory creates, and Git registers the path as a worktree of this
 *               repository. A caller-supplied boolean is diagnostic input, not authority, and is recorded as such.
 *   ROOT        `path.relative()` decides containment, so the parent itself, a sibling with the same textual
 *               prefix, and anything resolving outside the expected root are all refused. A lexical check is not
 *               by itself filesystem identity, so the resolved real path is compared too.
 *   ENUMERATION RECURSIVE and by `lstat`, so nested links are found. An entry that is not a file, a directory and
 *               not a link — an unknown reparse point or a special file — is UNCLASSIFIED and blocks.
 *   REMOVAL     a link-only unlink, then a `lstat` reinspection of the SAME path. Only `ENOENT` counts as proof of
 *               removal; a permission error, an ambiguous state and any other inspection error are FAILURES.
 *   GIT         no automatic recursive fallback. If a link cannot be confirmed removed, or Git removal fails and
 *               safety cannot be re-established, the worktree is KEPT and reported.
 *
 * THE THREAT MODEL, stated so the claim is bounded. §4: "Do not claim protection against an adversarial process
 * able to modify arbitrary filesystem entries concurrently unless that threat model has actually been addressed and
 * tested." It has not been, and `CLEANUP_THREAT_MODEL` says so. This protects against accidental misuse, a
 * substituted ownership assertion, an unsafe root, residual and nested links, and failed operations — in the
 * declared disposable environment.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

import {
  CLEANUP_OUTCOMES,
  CLEANUP_SAFETY_STEPS,
  CLEANUP_THREAT_MODEL,
  NL,
  OWNERSHIP_WITNESSES,
  REPO_ROOT,
  STAGE_CODE_PATH,
} from './contract.mjs';

/** §4: the marker file a checkout created by this stage carries, so ownership is PROVABLE rather than assumed. */
export const DISPOSABLE_MARKER = '.r3lcfsh-disposable-worktree.json';

/** §4: the stage identity the marker must name, so a marker written by ANOTHER stage does not authorise this one. */
export const MARKER_STAGE_IDENTITY = 'R3-L0C-I-A-R-L-C-F-S-H';

/** §4: the names a disposable checkout's links carry, plus any other link the recursive enumeration finds. */
export const EXPECTED_LINK_NAMES = Object.freeze(['node_modules', 'dist']);

/** §4: the depth bound for the recursive enumeration, so a pathological tree cannot run away. */
export const MAX_ENUMERATION_DEPTH = 12;

/** §4: the expected disposable root: the system temp root, where this stage's factory creates its checkouts. */
export function disposableRoot() {
  return resolve(tmpdir());
}

/**
 * §4: THE REAL FILESYSTEM ADAPTER.
 *
 * Every operation is a named function so a test can substitute one and exercise the SAME production control flow
 * with a fault injected — which is how §4 requires the dangerous branches to be tested without risking real data.
 */
export function realFilesystemAdapter() {
  return Object.freeze({
    exists: (path) => { try { lstatSync(path); return true; } catch { return false; } },
    lstat: (path) => lstatSync(path),
    /**
     * §3 S1-B: an ERROR-AWARE inspection that does NOT collapse every failure into "absent". It reports the raw
     * outcome so the caller can distinguish `ENOENT` (positively absent) from a permission error or any other
     * unclassified failure, which must never be read as a successful removal.
     */
    inspect: (path) => {
      try { lstatSync(path); return { present: true, absent: false, code: null, error: null }; }
      catch (error) {
        const code = error?.code ?? null;
        if (code === 'ENOENT') return { present: false, absent: true, code, error: null };
        return { present: null, absent: false, code, error: String(error?.message ?? error).slice(0, 160) };
      }
    },
    realpath: (path) => realpathSync(path),
    readdir: (path) => readdirSync(path, { withFileTypes: true }),
    /**
     * §4: remove a LINK without traversing its target. `rmdir` on a Windows junction removes the link itself; on
     * POSIX a symlink is removed by `unlink`. Neither follows the target.
     */
    unlinkLink: (path) => {
      if (process.platform === 'win32') execFileSync('cmd', ['/c', 'rmdir', path], { stdio: ['ignore', 'pipe', 'pipe'] });
      else execFileSync('rm', ['-f', path], { stdio: ['ignore', 'pipe', 'pipe'] });
    },
    removeTree: (path) => rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }),
  });
}

/** §4: the REAL git adapter, so a forced removal is a named operation a test can observe or refuse. */
export function realGitAdapter() {
  return Object.freeze({
    removeWorktreeForce: (root) => { execFileSync('git', ['worktree', 'remove', '--force', root], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] }); },
    listWorktrees: () => {
      try { return execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch { return null; }
    },
  });
}

/**
 * §4: THE BLOCKED RESULT.
 *
 * Every unresolved safety case returns this, and it states the three properties §4 requires by name, so a caller
 * reads them rather than inferring them from an outcome string.
 */
function blocked(input) {
  return Object.freeze({
    outcome: CLEANUP_OUTCOMES.CLEANUP_BLOCKED,
    blocked: true,
    destructiveFallbackExecuted: false,
    worktreeRemoved: false,
    /** §4: the three required properties, stated explicitly on every blocked result. */
    recursiveRemoveExecuted: false,
    gitWorktreeRemoveForceExecuted: false,
    worktreePreserved: true,
    root: input.root ?? null,
    preserved: true,
    steps: input.steps ?? Object.freeze([]),
    ownership: input.ownership ?? null,
    linksRemoved: Object.freeze([]),
    linksRemaining: Object.freeze(input.linksRemaining ?? []),
    unclassified: Object.freeze(input.unclassified ?? []),
    /** §3 S1-A: the named depth-exhaustion condition is carried onto the blocked result, never dropped. */
    ENUMERATION_COMPLETE: input.ENUMERATION_COMPLETE ?? null,
    DEPTH_LIMIT_EXCEEDED: input.DEPTH_LIMIT_EXCEEDED ?? null,
    depthExhausted: Object.freeze(input.depthExhausted ?? []),
    /** §3 S1-B: the classified removal state, when the block happened after a removal attempt. */
    removalState: input.removalState ?? null,
    gitRemovalThrew: input.gitRemovalThrew ?? null,
    gitError: input.gitError ?? null,
    inspectionCode: input.inspectionCode ?? null,
    reason: input.reason,
    /** §4: a leaked disposable directory is preferable to a destructive delete, so its location is reported. */
    diagnosticLocation: input.root ?? null,
    safetyOrdering: CLEANUP_SAFETY_STEPS,
    law: 'an unresolved safety case preserves the worktree for diagnosis and reports CLEANUP_BLOCKED; it never proceeds to git worktree remove --force or a recursive delete',
  });
}

/**
 * §4: VERIFY THE ROOT IS A PROPER DESCENDANT OF THE EXPECTED DISPOSABLE PARENT.
 *
 * §4 forbids raw string-prefix comparison and requires `path.relative()` with path canonicalization. It also
 * requires the rejections to be explicit: the parent itself, a sibling with the same textual prefix, a path
 * resolving outside the expected root, a symbolic-link root, and an unresolved or ambiguous real path.
 */
export function verifyRootContainment(input) {
  const { root, expectedRoot, fs } = input;
  const resolvedRoot = resolve(root);
  const resolvedExpected = resolve(expectedRoot);
  const problems = [];

  const rel = relative(resolvedExpected, resolvedRoot);
  const insideByRelative = rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
  if (rel === '') problems.push('the candidate root IS the expected disposable parent, which is not a disposable checkout');
  else if (!insideByRelative) problems.push(`the candidate root is not inside the expected disposable parent (relative path is "${rel}")`);

  /** §4: a lexical check is not by itself filesystem identity, so the real path is compared too. */
  let realRoot = null;
  let realExpected = null;
  try { realRoot = fs.realpath(resolvedRoot); } catch (error) { problems.push(`the candidate root's real path could not be resolved: ${String(error?.message ?? error).slice(0, 160)}`); }
  try { realExpected = fs.realpath(resolvedExpected); } catch (error) { problems.push(`the expected disposable root's real path could not be resolved: ${String(error?.message ?? error).slice(0, 160)}`); }
  if (realRoot !== null && realExpected !== null) {
    const realRel = relative(realExpected, realRoot);
    if (realRel === '' || realRel.startsWith('..') || isAbsolute(realRel)) problems.push(`the candidate root resolves outside the expected disposable root (real relative path is "${realRel}")`);
  }

  /** §4: a SYMBOLIC-LINK root is refused, because its identity is the target's rather than the path's. */
  let rootIsLink = null;
  try { rootIsLink = fs.lstat(resolvedRoot).isSymbolicLink() === true; } catch { rootIsLink = null; }
  if (rootIsLink === true) problems.push('the candidate root is itself a symbolic link or reparse point, so its identity is not the path\'s');

  return Object.freeze({
    contained: problems.length === 0,
    resolvedRoot,
    resolvedExpected,
    relativePath: rel,
    realRoot,
    realExpected,
    rootIsLink,
    problems: Object.freeze(problems),
    method: 'path.relative + realpath canonicalization',
    stringPrefixComparisonUsed: false,
  });
}

/**
 * §4: VERIFY OWNERSHIP FROM SIX WITNESSES THAT MUST AGREE.
 *
 * §4: "A caller-provided boolean is diagnostic input, not authority. A marker's existence alone is also
 * insufficient when its contents or location are inconsistent."
 */
export function verifyOwnership(input) {
  const { checkout, resolvedRoot, fs, git, expectedRoot } = input;
  const markerPath = join(resolvedRoot, DISPOSABLE_MARKER);
  const markerPresent = fs.exists(markerPath) === true;
  let marker = null;
  let markerReadable = false;
  if (markerPresent) {
    try {
      marker = JSON.parse(readFileSync(markerPath, 'utf8'));
      markerReadable = true;
    } catch { markerReadable = false; }
  }

  const markerStageIdentity = markerReadable && marker?.stage === MARKER_STAGE_IDENTITY;
  const recordedRoot = marker?.root ?? null;
  const markerRootIdentity = markerReadable && recordedRoot !== null
    && resolve(String(recordedRoot)) === resolvedRoot;
  const checkoutNonce = checkout?.nonce ?? null;
  const markerNonce = marker?.nonce ?? null;
  const markerCheckoutNonce = markerReadable && typeof markerNonce === 'string' && markerNonce !== ''
    && typeof checkoutNonce === 'string' && checkoutNonce === markerNonce;

  /** §4: the factory-created root — the path must lie under the disposable root the factory uses. */
  const underFactoryRoot = verifyRootContainment({ root: resolvedRoot, expectedRoot, fs }).contained === true;

  /** §4: Git must register the path as a worktree of THIS repository. */
  const listing = git.listWorktrees();
  const registeredPaths = listing === null ? null : listing.split(/\r?\n/u)
    .filter((line) => line.startsWith('worktree '))
    .map((line) => resolve(line.slice('worktree '.length).trim()));
  const gitWorktreeRegistration = registeredPaths !== null
    && registeredPaths.some((path) => path === resolvedRoot);

  const witnesses = Object.freeze({
    STAGE_MARKER_PRESENT: markerPresent && markerReadable,
    MARKER_STAGE_IDENTITY: markerStageIdentity,
    MARKER_ROOT_IDENTITY: markerRootIdentity,
    MARKER_CHECKOUT_NONCE: markerCheckoutNonce,
    FACTORY_CREATED_ROOT: underFactoryRoot,
    GIT_WORKTREE_REGISTRATION: gitWorktreeRegistration,
  });

  const failing = OWNERSHIP_WITNESSES.map((entry) => entry.id).filter((id) => witnesses[id] !== true);
  return Object.freeze({
    owned: failing.length === 0,
    witnesses,
    failing: Object.freeze(failing),
    markerPath,
    markerPresent,
    markerReadable,
    /** §4: the caller's own claim, carried for DIAGNOSIS and explicitly NOT decisive. */
    callerClaimedOwned: checkout?.owned === true,
    callerClaimDecidesOwnership: false,
    gitWorktreeRegistered: gitWorktreeRegistration,
    gitRegistrationUnavailable: registeredPaths === null,
    witnessCount: OWNERSHIP_WITNESSES.length,
  });
}

/**
 * §4: RECURSIVELY ENUMERATE EVERY LINK-LIKE ENTRY, INCLUDING NESTED ONES.
 *
 * §4 requires `lstat` or equivalent non-following inspection, inspection of nested link-like entries rather than
 * only top-level `node_modules` and `dist`, and it requires an unknown reparse-point or special-file classification
 * to BLOCK cleanup until safely resolved.
 */
export function enumerateLinks(input) {
  const { root, fs, depth = 0 } = input;
  const links = [];
  const unclassified = [];
  const directories = [];
  /** §3 S1-A: a named condition for "a further directory exists below the declared bound and cannot be inspected". */
  const depthExhausted = [];
  let entries;
  try { entries = fs.readdir(root); } catch (error) {
    return Object.freeze({ ok: false, links: Object.freeze([]), unclassified: Object.freeze([]), directories: Object.freeze([]), depthExhausted: Object.freeze([]), DEPTH_LIMIT_EXCEEDED: false, reason: `the directory ${root} could not be read: ${String(error?.message ?? error).slice(0, 160)}` });
  }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.name === DISPOSABLE_MARKER) continue;
    let stats;
    try { stats = fs.lstat(path); } catch (error) {
      /** §4 H2-N8: an entry whose `lstat` fails is potentially dangerous and BLOCKS rather than being skipped. */
      unclassified.push(Object.freeze({ path, kind: 'UNCLASSIFIABLE', reason: `lstat failed: ${String(error?.message ?? error).slice(0, 160)}` }));
      continue;
    }
    const isLink = stats.isSymbolicLink() === true;
    const isDirectory = stats.isDirectory() === true;
    const isFile = stats.isFile() === true;
    if (isLink) {
      links.push(Object.freeze({ path, kind: isDirectory ? 'directory-symlink-or-junction' : 'file-symlink', isLink: true }));
      continue;
    }
    if (isDirectory) {
      directories.push(path);
      if (depth + 1 <= MAX_ENUMERATION_DEPTH) {
        const nested = enumerateLinks({ root: path, fs, depth: depth + 1 });
        if (nested.ok !== true) return nested;
        links.push(...nested.links);
        unclassified.push(...nested.unclassified);
        directories.push(...nested.directories);
        depthExhausted.push(...nested.depthExhausted);
      } else {
        /**
         * §3 S1-A: DESCENDING ANY FURTHER WOULD EXCEED THE DECLARED BOUND. The baseline simply stopped here, so a
         * link below the boundary was never inspected while the enumeration still reported success. The resource
         * bound is kept — §3 forbids an arbitrarily enormous limit — but the exhaustion is now a NAMED CONDITION
         * that fails the enumeration closed instead of being silently treated as "nothing dangerous below".
         */
        depthExhausted.push(Object.freeze({ path, depth: depth + 1, bound: MAX_ENUMERATION_DEPTH }));
      }
      continue;
    }
    if (isFile) continue;
    /** §4: anything that is not a link, a directory and not a file is a special file or an unknown reparse point. */
    unclassified.push(Object.freeze({ path, kind: 'UNCLASSIFIABLE', reason: 'the entry is neither a file, a directory nor a link, so it may be a reparse point or a special file' }));
  }
  /**
   * §3 S1-A: FAIL CLOSED ON DEPTH EXHAUSTION. If any directory remained below the bound, the enumeration did NOT
   * inspect the whole tree, so it must not report success. `ok:false` is what stops `destroyDisposableCheckout`
   * before the Git removal decision, and the named condition travels with the result for diagnosis.
   */
  const depthLimitExceeded = depthExhausted.length > 0;
  return Object.freeze({
    ok: !depthLimitExceeded,
    links: Object.freeze(links),
    unclassified: Object.freeze(unclassified),
    directories: Object.freeze(directories),
    depthExhausted: Object.freeze(depthExhausted),
    DEPTH_LIMIT_EXCEEDED: depthLimitExceeded,
    depthBound: MAX_ENUMERATION_DEPTH,
    reason: depthLimitExceeded
      ? `the traversal reached the declared depth bound ${MAX_ENUMERATION_DEPTH} with ${depthExhausted.length} directory(ies) still uninspected below it, so the tree was NOT fully enumerated and cleanup cannot be proven safe`
      : null,
  });
}

/**
 * §4: REINSPECT A LINK PATH BY `lstat`, REQUIRING `ENOENT` AS THE ONLY PROOF OF REMOVAL.
 *
 * §4: "Do not use `existsSync()` as the sole post-unlink witness. A dangling symlink must not be classified as
 * removed merely because its target is absent." So the inspection uses `lstat` directly and reads the error code:
 * `ENOENT` proves the path is gone; anything else is a FAILURE that blocks.
 */
export function reinspectLink(input) {
  const { path, fs } = input;
  try {
    fs.lstat(path);
    return Object.freeze({ path, removed: false, proof: 'STILL_PRESENT', reason: 'the link path still exists under lstat' });
  } catch (error) {
    const code = error?.code ?? null;
    if (code === 'ENOENT') return Object.freeze({ path, removed: true, proof: 'ENOENT', reason: null });
    return Object.freeze({ path, removed: false, proof: 'INSPECTION_ERROR', code, reason: `the link path could not be inspected: ${String(error?.message ?? error).slice(0, 160)}` });
  }
}

/** §3 S1-B: the removal-state vocabulary, so success, failure and indeterminacy are DISTINCT outcomes. */
export const REMOVAL_STATES = Object.freeze({
  REMOVED_CONFIRMED: 'REMOVED_CONFIRMED',
  STILL_PRESENT: 'STILL_PRESENT',
  STATE_UNKNOWN: 'STATE_UNKNOWN',
});

/**
 * §3 S1-B: CLASSIFY THE PHYSICAL STATE OF THE WORKTREE PATH AFTER A REMOVAL ATTEMPT.
 *
 * §3 requires: `REMOVED_CONFIRMED` only when absence is POSITIVELY established (`ENOENT`); `STILL_PRESENT` when
 * the directory remains; `STATE_UNKNOWN` for a permission error or any unclassified inspection failure. A
 * swallowed error must never become "removed", which is the baseline defect this closes.
 */
export function classifyRemovalState(input) {
  const { path, fs } = input;
  const inspection = typeof fs.inspect === 'function'
    ? fs.inspect(path)
    /** §3: if an adapter predates `inspect`, fall back to `lstat` and read the code rather than assuming absence. */
    : (() => {
      try { fs.lstat(path); return { present: true, absent: false, code: null, error: null }; }
      catch (error) {
        const code = error?.code ?? null;
        if (code === 'ENOENT') return { present: false, absent: true, code, error: null };
        return { present: null, absent: false, code, error: String(error?.message ?? error).slice(0, 160) };
      }
    })();
  if (inspection.present === true) return Object.freeze({ state: REMOVAL_STATES.STILL_PRESENT, code: inspection.code ?? null, observation: inspection.error ?? null, positivelyAbsent: false, positivelyPresent: true });
  if (inspection.absent === true) return Object.freeze({ state: REMOVAL_STATES.REMOVED_CONFIRMED, code: inspection.code ?? 'ENOENT', observation: null, positivelyAbsent: true, positivelyPresent: false });
  return Object.freeze({
    state: REMOVAL_STATES.STATE_UNKNOWN,
    code: inspection.code ?? null,
    observation: inspection.error ?? null,
    positivelyAbsent: false,
    positivelyPresent: false,
    reason: `the worktree path could not be inspected, so its physical state is UNKNOWN${inspection.code ? ` (code ${inspection.code})` : ''}`,
  });
}

/**
 * §4: DESTROY A DISPOSABLE CHECKOUT, FAIL-CLOSED.
 *
 * The order is: verify ownership from six witnesses, verify path containment by relative resolution, enumerate and
 * classify links recursively, unlink each link WITHOUT traversing, REINSPECT each link path by `lstat`, and only
 * then remove the worktree. A failure at any step returns `CLEANUP_BLOCKED` and the worktree is PRESERVED.
 */
export function destroyDisposableCheckout(input) {
  const {
    checkout, fs = realFilesystemAdapter(), git = realGitAdapter(),
    expectedRoot = disposableRoot(), removeWorktree = true,
  } = input;
  const steps = [];
  const record = (id, observation) => steps.push(Object.freeze({ step: steps.length + 1, id, observation }));

  const rawRoot = checkout?.root ?? null;
  if (rawRoot === null || rawRoot === undefined || rawRoot === '') {
    record('VERIFY_OWNERSHIP_FROM_MARKER_IDENTITY_AND_GIT_REGISTRATION', Object.freeze({ owned: false, reason: 'no checkout root was supplied' }));
    return blocked(Object.freeze({ root: null, steps, reason: 'no checkout root was supplied' }));
  }
  const resolvedRoot = resolve(rawRoot);

  /** 1. OWNERSHIP, from witnesses that must AGREE. A caller boolean is not authority. */
  const ownership = verifyOwnership({ checkout, resolvedRoot, fs, git, expectedRoot });
  record('VERIFY_OWNERSHIP_FROM_MARKER_IDENTITY_AND_GIT_REGISTRATION', Object.freeze({ owned: ownership.owned, witnesses: ownership.witnesses, failing: ownership.failing, callerClaimedOwned: ownership.callerClaimedOwned }));
  if (ownership.owned !== true) {
    return Object.freeze({
      outcome: CLEANUP_OUTCOMES.REFUSED_NOT_OWNED, blocked: true, destructiveFallbackExecuted: false,
      worktreeRemoved: false, recursiveRemoveExecuted: false, gitWorktreeRemoveForceExecuted: false,
      worktreePreserved: true, root: resolvedRoot, preserved: fs.exists(resolvedRoot) === true,
      ownership, steps: Object.freeze(steps), linksRemoved: Object.freeze([]), linksRemaining: Object.freeze([]),
      reason: `the target ${resolvedRoot} did not satisfy every ownership witness [failing: ${ownership.failing.join(', ')}], so it is not a checkout this stage owns and cleanup is REFUSED`,
      diagnosticLocation: resolvedRoot,
      safetyOrdering: CLEANUP_SAFETY_STEPS,
      law: 'ownership requires the marker, its stage identity, its recorded root, its checkout nonce, the factory-created root and the Git worktree registration to AGREE; a caller-supplied boolean is diagnostic input, not authority',
    });
  }

  /** 2. PATH CONTAINMENT, by `path.relative` and real-path canonicalization. */
  const containment = verifyRootContainment({ root: resolvedRoot, expectedRoot, fs });
  record('VERIFY_PATH_CONTAINMENT_BY_RELATIVE_RESOLUTION', Object.freeze({ contained: containment.contained, relativePath: containment.relativePath, rootIsLink: containment.rootIsLink, problems: containment.problems }));
  if (containment.contained !== true) {
    return blocked(Object.freeze({
      root: resolvedRoot, steps, ownership,
      reason: `the worktree is not a proper descendant of the expected disposable root: [${containment.problems.join('; ')}]`,
    }));
  }

  /** 3. ENUMERATE, RECURSIVELY, so a nested link is not invisible. */
  const enumeration = enumerateLinks({ root: resolvedRoot, fs });
  record('ENUMERATE_LINKS_RECURSIVELY_INCLUDING_NESTED_ENTRIES', Object.freeze({
    ok: enumeration.ok,
    linkCount: enumeration.links.length,
    links: Object.freeze(enumeration.links.map((entry) => Object.freeze({ relative: relative(resolvedRoot, entry.path), kind: entry.kind }))),
    unclassifiedCount: enumeration.unclassified.length,
    unclassified: Object.freeze(enumeration.unclassified.map((entry) => relative(resolvedRoot, entry.path))),
    directoryCount: enumeration.directories.length,
    depthBound: MAX_ENUMERATION_DEPTH,
    /** §3 S1-A: the named depth-exhaustion condition travels into the durable step record. */
    DEPTH_LIMIT_EXCEEDED: enumeration.DEPTH_LIMIT_EXCEEDED === true,
    depthExhausted: Object.freeze((enumeration.depthExhausted ?? []).map((entry) => relative(resolvedRoot, entry.path))),
  }));
  if (enumeration.ok !== true) {
    return blocked(Object.freeze({
      root: resolvedRoot, steps, ownership, reason: enumeration.reason,
      /** §3 S1-A: the required named fields on the blocked result. */
      ENUMERATION_COMPLETE: false,
      DEPTH_LIMIT_EXCEEDED: enumeration.DEPTH_LIMIT_EXCEEDED === true,
      depthExhausted: Object.freeze((enumeration.depthExhausted ?? []).map((entry) => entry.path)),
    }));
  }

  /** 4. CLASSIFY: an unknown reparse point or special file BLOCKS. */
  record('CLASSIFY_EVERY_ENTRY_BY_LSTAT_WITHOUT_TRAVERSING', Object.freeze({
    links: Object.freeze(enumeration.links.map((entry) => Object.freeze({ relative: relative(resolvedRoot, entry.path), kind: entry.kind }))),
    unclassifiable: Object.freeze(enumeration.unclassified.map((entry) => relative(resolvedRoot, entry.path))),
  }));
  if (enumeration.unclassified.length > 0) {
    return blocked(Object.freeze({
      root: resolvedRoot, steps, ownership,
      reason: `the entries [${enumeration.unclassified.map((entry) => relative(resolvedRoot, entry.path)).join(', ')}] could not be classified, so cleanup cannot prove it is safe`,
      unclassified: Object.freeze(enumeration.unclassified.map((entry) => entry.path)),
    }));
  }

  /** 5. ATTEMPT A LINK-ONLY REMOVAL for every link found, nested ones included. */
  const attempts = [];
  for (const link of enumeration.links) {
    try { fs.unlinkLink(link.path); attempts.push(Object.freeze({ path: link.path, attempted: true, threw: false })); }
    catch (error) { attempts.push(Object.freeze({ path: link.path, attempted: true, threw: true, error: String(error?.message ?? error).slice(0, 160) })); }
  }
  record('ATTEMPT_LINK_ONLY_REMOVAL', Object.freeze({ attempts: Object.freeze(attempts.map((entry) => Object.freeze({ relative: relative(resolvedRoot, entry.path), attempted: entry.attempted, threw: entry.threw }))) }));

  /** 6/7. REINSPECT every link path by `lstat`, requiring `ENOENT` as the only proof. */
  const reinspections = enumeration.links.map((link) => reinspectLink({ path: link.path, fs }));
  record('REINSPECT_EVERY_LINK_PATH_BY_LSTAT', Object.freeze({
    reinspections: Object.freeze(reinspections.map((entry) => Object.freeze({ relative: relative(resolvedRoot, entry.path), removed: entry.removed, proof: entry.proof, code: entry.code ?? null }))),
    existsSyncUsedAsWitness: false,
  }));

  /** 8/9/10. ABORT if any link remains or cannot be proven removed. NEVER force-remove or recurse after failure. */
  const linksRemaining = reinspections.filter((entry) => entry.removed !== true);
  if (linksRemaining.length > 0) {
    return blocked(Object.freeze({
      root: resolvedRoot, steps, ownership,
      reason: `the link(s) [${linksRemaining.map((entry) => relative(resolvedRoot, entry.path)).join(', ')}] could not be PROVEN removed (proof: ${linksRemaining.map((entry) => entry.proof).join(', ')}), so the destructive fallback is NOT executed and the worktree is preserved for diagnosis`,
      linksRemaining: Object.freeze(linksRemaining.map((entry) => entry.path)),
    }));
  }

  /** §4: only NOW, with every link CONFIRMED removed, may the worktree itself be removed. */
  const linksRemoved = enumeration.links.map((entry) => entry.path);
  record('REQUIRE_ENOENT_AS_THE_ONLY_PROOF_OF_REMOVAL', Object.freeze({ confirmedRemoved: linksRemoved.length, confirmed: true }));

  if (removeWorktree !== true) {
    return Object.freeze({
      outcome: CLEANUP_OUTCOMES.CLEANED, blocked: false, destructiveFallbackExecuted: false,
      worktreeRemoved: false, recursiveRemoveExecuted: false, gitWorktreeRemoveForceExecuted: false,
      worktreePreserved: true, root: resolvedRoot, preserved: true, ownership, steps: Object.freeze(steps),
      linksRemoved: Object.freeze(linksRemoved), linksRemaining: Object.freeze([]),
      reason: null, diagnosticLocation: resolvedRoot, safetyOrdering: CLEANUP_SAFETY_STEPS,
      law: 'the links were confirmed removed and the worktree was preserved by request',
    });
  }

  let gitRemovalThrew = false;
  let gitError = null;
  try { git.removeWorktreeForce(resolvedRoot); } catch (error) { gitRemovalThrew = true; gitError = String(error?.message ?? error).slice(0, 200); }

  /**
   * §3 S1-B: THE POST-REMOVAL STATE IS CLASSIFIED, NOT ASSUMED.
   *
   * The baseline read `fs.exists(resolvedRoot) !== true` as proof of removal, which turned a swallowed `EPERM`,
   * `EACCES` or any unclassified `lstat` failure into a false `CLEANED` while the directory was still on disk. The
   * state is now derived from an error-aware inspection: `REMOVED_CONFIRMED` requires `ENOENT`, a present directory
   * is `STILL_PRESENT`, and anything else is `STATE_UNKNOWN` and blocks.
   */
  const removal = classifyRemovalState({ path: resolvedRoot, fs });
  const removalState = removal.state;
  const worktreeRemoved = removalState === REMOVAL_STATES.REMOVED_CONFIRMED;

  record('REMOVE_WORKTREE_AFTER_LINK_CONFIRMATION', Object.freeze({
    gitRemovalThrew, gitError, removalState, inspectionCode: removal.code ?? null,
    recursiveFallbackTaken: false,
  }));

  /** §3 S1-B: NEVER report `CLEANED` when the physical state is unknown or the directory is still present. */
  if (removalState !== REMOVAL_STATES.REMOVED_CONFIRMED) {
    const unknown = removalState === REMOVAL_STATES.STATE_UNKNOWN;
    return blocked(Object.freeze({
      root: resolvedRoot, steps, ownership,
      removalState,
      gitRemovalThrew,
      gitError,
      inspectionCode: removal.code ?? null,
      worktreeRemoved: false,
      reason: unknown
        ? `every link was confirmed removed, but the worktree directory's physical state is UNKNOWN (${removal.reason}); Git removal threw: ${String(gitRemovalThrew)}; the state is NOT treated as a removal and a recursive fallback is NOT taken`
        : `every link was confirmed removed, but the worktree directory is STILL_PRESENT after Git removal (Git removal threw: ${String(gitRemovalThrew)}); a recursive fallback is NOT taken and the worktree is preserved`,
    }));
  }

  return Object.freeze({
    outcome: CLEANUP_OUTCOMES.CLEANED, blocked: false, destructiveFallbackExecuted: true,
    worktreeRemoved: true, recursiveRemoveExecuted: false, gitWorktreeRemoveForceExecuted: true,
    worktreePreserved: false, root: resolvedRoot, preserved: false, ownership, steps: Object.freeze(steps),
    /** §3 S1-B: the explicit removal state and the Git outcome travel with every result. */
    removalState,
    gitRemovalThrew,
    gitError,
    inspectionCode: removal.code ?? null,
    linksRemoved: Object.freeze(linksRemoved), linksRemaining: Object.freeze([]),
    reason: null, diagnosticLocation: resolvedRoot, safetyOrdering: CLEANUP_SAFETY_STEPS,
    /** §4: the only path on which a destructive operation runs is one where every link was proven gone. */
    destructiveOperationGatedOnConfirmedLinkRemoval: true,
    /** §3 S1-B: absence was POSITIVELY established by `ENOENT`, not inferred from a swallowed error. */
    removalPositivelyConfirmed: removal.positivelyAbsent === true,
    law: 'the destructive operation runs only after every link capable of referring outside the worktree — nested ones included — has been positively identified and CONFIRMED removed by ENOENT, and the worktree itself is reported CLEANED only when its absence is POSITIVELY established; a remaining, unclassifiable, unsafely-unlinkable or UNKNOWN-STATE outcome preserves the worktree and returns CLEANUP_BLOCKED',
  });
}

/**
 * §4: CREATE A DISPOSABLE CHECKOUT THIS STAGE OWNS.
 *
 * A real Git worktree at the current HEAD, under the system temp root, with a marker recording THIS stage's
 * identity, the RESOLVED ROOT it was written into, and a per-checkout random identifier — so all three of the
 * marker-based ownership witnesses can be satisfied by construction. `node_modules` and `dist` are junctions to the
 * real ones, never copies, and are never written through.
 */
export function createDisposableCheckout(input = {}) {
  const root = mkdtempSync(join(tmpdir(), 'r3lcfsh-worktree-'));
  const nonce = randomUUID();
  const head = gitRun(REPO_ROOT, ['rev-parse', 'HEAD']);
  /** §4: line-ending conversion is DISABLED so the checkout reproduces the committed bytes exactly. */
  gitRun(REPO_ROOT, ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'worktree', 'add', '--detach', root, head]);
  const links = [];
  for (const name of EXPECTED_LINK_NAMES) {
    const target = join(REPO_ROOT, name);
    const linkPath = join(root, name);
    if (!realFilesystemAdapter().exists(target)) continue;
    if (makeLink(linkPath, target)) links.push(Object.freeze({ name, linkPath, target }));
  }
  writeFileSync(join(root, DISPOSABLE_MARKER), `${JSON.stringify({ stage: MARKER_STAGE_IDENTITY, root, nonce, head, at: new Date().toISOString() }, null, 2)}${NL}`, 'utf8');
  /** §4: an UNEXPECTED link-like entry can be injected, so the "unexpected entry blocks cleanup" branch is reachable. */
  if (typeof input.injectLink === 'function') {
    const injected = input.injectLink({ root, join });
    if (injected !== null && injected !== undefined) links.push(Object.freeze({ name: injected.name, linkPath: injected.linkPath, target: injected.target, unexpected: true }));
  }
  return Object.freeze({ root, head, nonce, links: Object.freeze(links), owned: true, marker: DISPOSABLE_MARKER });
}

/** §4: create a link without following it, reporting whether the platform permitted it. */
function makeLink(linkPath, target) {
  try {
    if (process.platform === 'win32') execFileSync('cmd', ['/c', 'mklink', '/J', linkPath, target], { stdio: ['ignore', 'pipe', 'pipe'] });
    else execFileSync('ln', ['-s', target, linkPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    return true;
  } catch { return false; }
}

/** §4: run a git command in a directory and return its trimmed stdout, or null. */
function gitRun(cwd, args) {
  try { return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return null; }
}

/** §4: whether a path is a directory at all, used by a caller's pre-check. */
export function isDirectoryPath(path) {
  try { return lstatSync(path).isDirectory(); } catch { return false; }
}

export { CLEANUP_THREAT_MODEL, readFileSync };
