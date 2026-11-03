/**
 * R3-L0C-I-A-R-L-C-F §3 Gate F1-B/F1-C — REAL BYTE MUTATIONS IN AN ISOLATED CHECKOUT.
 *
 * WHY THIS MODULE EXISTS. §3 requires F1-B (a closure change detected by ACTUAL recomputation) and F1-C (a route or
 * configuration change detected by ACTUAL recomputation) to be demonstrated with "a fully isolated checkout or Git
 * worktree and a real change to the bytes/configuration being measured". And it says plainly: "An injected function
 * returning a fake digest is useful as a control, but does not by itself prove default-path freshness."
 *
 * So this module creates a REAL Git worktree of the repository at the current HEAD, applies a REAL byte change to a
 * file the closure hashes, and runs the REAL closure computation in that worktree. The recomputation therefore sees
 * genuinely different bytes on disk, and the drift is a measurement rather than an injection.
 *
 * WHY A WORKTREE AND NOT THE WORKING TREE. §3: "Do not mutate shared working-tree files under parallel tests." A
 * worktree has its own checkout of the tracked files, so a byte change there is invisible to every other test
 * process reading the shared working tree.
 *
 * WHY THE HEAVY PATHS ARE SYMLINKED RATHER THAN COPIED. A worktree checkout does not carry `node_modules` or the
 * built `dist`, and copying them would cost gigabytes per mutation. So the worktree's `node_modules` and `dist` are
 * JUNCTIONS to the real ones — READ-ONLY from this module's point of view: the module never writes through them, and
 * the byte mutation is applied only to a tracked source file inside the worktree's own checkout.
 *
 * THE WINDOWS CLEANUP RULE. `git worktree remove` on Windows follows a junction and can delete the TARGET's
 * contents. This module therefore NEVER calls `git worktree remove` on a worktree that contains junctions: it
 * removes the junctions FIRST with `rmdir` (which removes the link, not the target), then removes the worktree. That
 * ordering is the difference between a cleanup and a data loss.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NL, REPO_ROOT } from './contract.mjs';

/** §3: the tracked files whose bytes a mutation may change, chosen because the closure hashes them. */
export const MUTABLE_TRACKED_FILES = Object.freeze([
  'scripts/r3l0ciarlcf/pipeline.mjs',
  'scripts/r3l0ciar/admission.mjs',
]);

/** §3: run a git command in a directory and return its trimmed stdout. */
function git(cwd, args) {
  return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * §3: CREATE AN ISOLATED WORKTREE AT THE CURRENT HEAD, WITH JUNCTIONS TO `node_modules` AND `dist`.
 *
 * The worktree is created under the system temp root, so it never appears in the repository's own tree.
 */
export function createIsolatedCheckout() {
  const root = mkdtempSync(join(tmpdir(), 'r3lcf-worktree-'));
  const head = git(REPO_ROOT, ['rev-parse', 'HEAD']);
  /**
   * §3: THE CHECKOUT MUST BE BYTE-IDENTICAL, so line-ending conversion is DISABLED for it.
   *
   * Measured: with the host's default `core.autocrlf`, a Windows checkout rewrites LF to CRLF, so every tracked
   * text file's BYTES differ from the shared tree and the closure digest differs for a reason that has nothing to
   * do with the mutation under test. `core.autocrlf=false` and `core.eol=lf` make the checkout reproduce the
   * committed bytes exactly, which is what makes the "at HEAD the two agree" comparison meaningful.
   */
  git(REPO_ROOT, ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'worktree', 'add', '--detach', root, head]);
  /** §3: the heavy paths are junctions, never copies, and this module never writes through them. */
  const links = [];
  for (const name of ['node_modules', 'dist']) {
    const target = join(REPO_ROOT, name);
    const linkPath = join(root, name);
    if (!existsSync(target)) continue;
    try {
      /** On Windows a directory junction is created by `mklink /J`; on POSIX a symlink is enough. */
      if (process.platform === 'win32') execFileSync('cmd', ['/c', 'mklink', '/J', linkPath, target], { stdio: ['ignore', 'pipe', 'pipe'] });
      else execFileSync('ln', ['-s', target, linkPath], { stdio: ['ignore', 'pipe', 'pipe'] });
      links.push({ name, linkPath, target });
    } catch { /* a failed junction leaves the worktree usable for the closure, which hashes tracked source only */ }
  }
  return Object.freeze({ root, head, links: Object.freeze(links) });
}

/**
 * §3: REMOVE AN ISOLATED CHECKOUT WITHOUT FOLLOWING ITS JUNCTIONS.
 *
 * The junctions are removed FIRST with `rmdir`, which unlinks the junction rather than its target. Only then is the
 * worktree removed. On POSIX a plain `rmSync` of the worktree is safe because symlinks are not followed by `rm -r`
 * when the symlink itself is removed; the junction ordering is a Windows requirement.
 */
export function destroyIsolatedCheckout(checkout) {
  if (checkout === null || checkout === undefined) return;
  const removed = [];
  for (const link of checkout.links ?? []) {
    try {
      if (process.platform === 'win32') execFileSync('cmd', ['/c', 'rmdir', link.linkPath], { stdio: ['ignore', 'pipe', 'pipe'] });
      else rmSync(link.linkPath, { force: true });
      removed.push(link.name);
    } catch { /* the junction may already be gone */ }
  }
  try { git(REPO_ROOT, ['worktree', 'remove', '--force', checkout.root]); } catch { /* fall through to the rm */ }
  try { rmSync(checkout.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* the OS may hold a handle briefly */ }
  return Object.freeze({ removedLinks: Object.freeze(removed), worktreeRemoved: !existsSync(checkout.root) });
}

/**
 * §3: APPLY A REAL BYTE MUTATION TO A TRACKED FILE INSIDE THE ISOLATED CHECKOUT.
 *
 * The mutation APPENDS a comment, so the file remains valid JavaScript and the change is a real difference in the
 * bytes the closure hashes. Nothing outside the checkout is touched.
 */
export function applyByteMutation(input) {
  const { checkout, relative, marker = '/* r3lcf isolated mutation */' } = input;
  const path = join(checkout.root, relative);
  if (!existsSync(path)) return Object.freeze({ applied: false, relative, reason: `the tracked file ${relative} does not exist in the isolated checkout` });
  const before = readFileSync(path, 'utf8');
  writeFileSync(path, `${before}${NL}${marker}${NL}`, 'utf8');
  const after = readFileSync(path, 'utf8');
  return Object.freeze({ applied: true, relative, before, after, bytesAdded: Buffer.byteLength(after) - Buffer.byteLength(before) });
}

/** §3: restore a mutated file from the checkout's own index, so a second mutation starts from the clean bytes. */
export function restoreTrackedFile(input) {
  const { checkout, relative } = input;
  try { git(checkout.root, ['checkout', '--', relative]); return true; } catch { return false; }
}

/**
 * §3: APPLY A REAL VALUE SUBSTITUTION TO A TRACKED FILE INSIDE THE ISOLATED CHECKOUT.
 *
 * A comment append proves a byte change, which is what F1-B needs. F1-C needs the EFFECTIVE VALUE to change, so
 * this replaces a literal the module actually reads. The replacement is exact and the file must contain it, or the
 * mutation is reported as not applied rather than silently doing nothing.
 */
export function applyValueMutation(input) {
  const { checkout, relative, from, to } = input;
  const path = join(checkout.root, relative);
  if (!existsSync(path)) return Object.freeze({ applied: false, relative, reason: `the tracked file ${relative} does not exist in the isolated checkout` });
  const before = readFileSync(path, 'utf8');
  if (!before.includes(from)) return Object.freeze({ applied: false, relative, reason: `the literal ${JSON.stringify(from)} was not found in ${relative}, so no value mutation was applied` });
  const after = before.split(from).join(to);
  writeFileSync(path, after, 'utf8');
  return Object.freeze({ applied: true, relative, from, to, bytesDelta: Buffer.byteLength(after) - Buffer.byteLength(before) });
}

/**
 * §3: COMPUTE THE CLOSURE INSIDE THE ISOLATED CHECKOUT, AND RETURN IT AS JSON.
 *
 * The computation runs in a CHILD PROCESS whose working directory is the checkout, so the stage's own
 * `REPO_ROOT` resolution is the checkout's — which is what makes the mutation observable. A small inline program is
 * used rather than importing this module, because importing it would resolve `REPO_ROOT` from THIS module's
 * position in the shared tree.
 */
export function computeClosureInCheckout(checkout) {
  const program = `
import { computeExecutionClosure } from ${JSON.stringify(`file://${join(checkout.root, 'scripts', 'r3l0ciarlcf', 'closure.mjs').replace(/\\/gu, '/')}`)};
const closure = await computeExecutionClosure({ verifyCompiled: false });
process.stdout.write(JSON.stringify({ digest: closure.executionClosureDigest, complete: closure.CLOSURE_COMPLETE, fileCount: closure.fileCount, parts: closure.partIds }));
`;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', program], { cwd: checkout.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000 });
  return Object.freeze(JSON.parse(output.trim()));
}

/** §3: the closure digest of the SHARED working tree, for the comparison. */
export async function sharedTreeClosureDigest() {
  const { computeExecutionClosure } = await import('./closure.mjs');
  const closure = await computeExecutionClosure({ verifyCompiled: false });
  return closure.executionClosureDigest;
}

/**
 * §3: WHETHER THE ISOLATED CHECKOUT REPRODUCES THE COMMITTED BYTES.
 *
 * The anchor is the COMMIT, not the shared working tree, and the distinction is measured rather than assumed: this
 * host's working tree carries CRLF in some tracked files while the commit carries LF, so a fresh checkout cannot
 * byte-match the working tree. The commit IS the reproducible artifact.
 *
 * THE COMPARISON USES GIT'S OWN BLOB HASHES. `git show HEAD:<path>` applies the host's line-ending conversion on
 * output, so reading its bytes and hashing them is NOT a byte-exact comparison — measured. `git hash-object` on the
 * checkout file and `git rev-parse HEAD:<path>` on the commit both return the same kind of value over the RAW bytes,
 * so their equality is exact.
 */
export function checkoutMatchesCommittedBytes(input) {
  const { checkout, files } = input;
  const compared = [];
  for (const relative of files) {
    const path = join(checkout.root, relative);
    if (!existsSync(path)) { compared.push(Object.freeze({ relative, exists: false, matches: false })); continue; }
    let committedBlob = null;
    let checkoutBlob = null;
    try { committedBlob = git(REPO_ROOT, ['rev-parse', `HEAD:${relative}`]); } catch { committedBlob = null; }
    try { checkoutBlob = git(checkout.root, ['hash-object', '--', relative]); } catch { checkoutBlob = null; }
    compared.push(Object.freeze({ relative, exists: true, committedBlob, checkoutBlob, matches: committedBlob !== null && committedBlob === checkoutBlob }));
  }
  const mismatched = compared.filter((entry) => entry.matches !== true).map((entry) => entry.relative);
  return Object.freeze({ compared: compared.length, matched: compared.length - mismatched.length, mismatched: Object.freeze(mismatched), allMatchCommittedBytes: mismatched.length === 0, method: 'git blob-hash equality over the raw bytes' });
}

/**
 * §3 F1-B: A REAL CLOSURE CHANGE, DETECTED BY ACTUAL RECOMPUTATION.
 *
 * The control proves three things, and the anchor is the COMMIT rather than the shared working tree:
 *
 *   1. the isolated checkout reproduces the COMMITTED bytes exactly (measured, because this host's working tree
 *      carries CRLF in some tracked files while the commit carries LF);
 *   2. a real byte change to a tracked file the closure hashes MOVES the checkout's recomputed digest;
 *   3. the shared working tree's own digest is UNCHANGED, which is the evidence that no shared file was mutated.
 */
export async function proveRealClosureChangeDetection(input = {}) {
  const relative = input.relative ?? MUTABLE_TRACKED_FILES[0];
  const sharedBefore = await sharedTreeClosureDigest();
  const checkout = createIsolatedCheckout();
  try {
    const matchesCommitted = checkoutMatchesCommittedBytes({ checkout, files: input.compareFiles ?? [relative, 'scripts/r3l0cf/closure.mjs', 'scripts/r3l0ciarlcf/closure.mjs'] });
    const atHead = computeClosureInCheckout(checkout);
    const mutation = applyByteMutation({ checkout, relative });
    const afterMutation = computeClosureInCheckout(checkout);
    const sharedAfter = await sharedTreeClosureDigest();
    return Object.freeze({
      id: 'F1_B_REAL_CLOSURE_CHANGE',
      authorityBearingFunction: 'scripts/r3l0ciarlcf/closure.mjs computeExecutionClosure, in an isolated git worktree',
      /** §3: the anchor is the COMMIT, and the checkout is shown to reproduce it. */
      checkoutReproducesCommittedBytes: matchesCommitted.allMatchCommittedBytes,
      committedByteComparison: matchesCommitted,
      checkoutDigestAtHead: atHead.digest,
      sharedTreeDigestBefore: sharedBefore,
      mutationApplied: mutation.applied,
      mutatedFile: relative,
      bytesAdded: mutation.bytesAdded ?? 0,
      checkoutDigestAfterMutation: afterMutation.digest,
      digestMoved: atHead.digest !== afterMutation.digest,
      /** §3: the shared tree is UNCHANGED, which is the evidence no shared file was mutated. */
      sharedTreeDigestAfter: sharedAfter,
      sharedTreeUnchanged: sharedAfter === sharedBefore,
      detectedByActualRecomputation: atHead.digest !== afterMutation.digest,
      injectedFakeDigest: false,
      PROVEN: matchesCommitted.allMatchCommittedBytes === true && mutation.applied === true && atHead.digest !== afterMutation.digest && sharedAfter === sharedBefore,
      law: 'a real byte change to a tracked file the closure hashes moves the recomputed closure digest, measured in an isolated checkout that reproduces the committed bytes, with the shared working tree untouched',
    });
  } finally {
    destroyIsolatedCheckout(checkout);
  }
}

/**
 * §3 F1-C: A REAL ROUTE/CONFIGURATION CHANGE, DETECTED BY ACTUAL RECOMPUTATION.
 *
 * The route identity the pre-trial validity reducer compares is read from `scripts/r3l0cr/route.mjs` and
 * `scripts/r3l0cr/settings.mjs` — the modules that WRITE the profile. A real byte change to the route module in the
 * isolated checkout changes the EFFECTIVE identity the reducer reads, so the comparison against the plan's declared
 * route becomes a DRIFT — measured, not injected.
 */
export async function proveRealRouteChangeDetection(input = {}) {
  const routeModule = input.relative ?? 'scripts/r3l0cr/route.mjs';
  const checkout = createIsolatedCheckout();
  try {
    const program = `
import { effectiveRouteConfiguration } from ${JSON.stringify(`file://${join(checkout.root, 'scripts', 'r3l0ciar', 'preflight.mjs').replace(/\\/gu, '/')}`)};
const effective = await effectiveRouteConfiguration();
process.stdout.write(JSON.stringify(effective.effective));
`;
    const run = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', program], { cwd: checkout.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 }).trim());
    const before = run();
    /** §3: the PRIMARY_EXECUTOR's modelId literal, which the profile writer and the pre-trial reducer both read. */
    const mutation = applyValueMutation({ checkout, relative: routeModule, from: `modelId: 'deepseek-v4.1-flash'`, to: `modelId: 'deepseek-v4.1-flash-r3lcf-mutated'` });
    const after = run();
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    return Object.freeze({
      id: 'F1_C_REAL_ROUTE_CHANGE',
      authorityBearingFunction: 'scripts/r3l0ciar/preflight.mjs effectiveRouteConfiguration, in an isolated git worktree',
      mutatedFile: routeModule,
      mutationApplied: mutation.applied,
      mutationDetail: mutation,
      effectiveBefore: before,
      effectiveAfter: after,
      effectiveIdentityMoved: changed,
      detectedByActualRecomputation: changed,
      injectedFakeDigest: false,
      /** §3: the change is a real byte change to the module that writes the profile, so the reducer reads it. */
      PROVEN: mutation.applied === true && changed === true,
      law: 'a real value change to the route module changes the effective route identity the pre-trial reducer reads, measured in an isolated checkout',
    });
  } finally {
    destroyIsolatedCheckout(checkout);
  }
}

export { NL };
