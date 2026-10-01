// palimpsest-dsh-host/deployment/runtime — THE TRUSTED-CODE READ FENCE FOR MODEL-CONTROLLED TOOL CALLS.
//
// WHY A SECOND LAYER EXISTS, AND WHY IT IS NOT REDUNDANT.
//
// `read_fence.js` puts a kernel boundary around the worker's PROCESSES: any code the model runs through
// `run_code`, bash, pwsh or a subprocess is a Low-integrity token and cannot read a labelled root. That
// covers arbitrary code.
//
// It does NOT cover the tool CALLS. Measured during GATE A (assertion A-25): under `presentAs('ptc')` the
// model's program runs in the confined child, but every `await tools.read(...)` it makes is dispatched on the
// control channel and executed by the HOST — in the trusted, Medium-integrity parent, where a mandatory
// label cannot bind. So `tools.read({ file_path: "<durable state>" })` would return protected bytes even
// with the kernel fence in place, and `grep`/`glob` are worse: they do not use the filesystem service at all
// and spawn ripgrep directly, bypassing every `ctx.fs` policy.
//
// This module closes that path in TRUSTED code, at the dispatch surface, for every capability that can
// return file CONTENT. It is the layer `dsh-fs-sandbox` would be if it fenced reads; it fences only writes,
// and its own documentation says so ("Reads pass through untouched: every mode permits reading").
//
// WHAT IT IS NOT. It is a policy check over model-controlled paths, not a kernel boundary — the same honesty
// `dsh-fs-sandbox` applies to its own fence. It is sound because the paths are the ONLY untrusted input to
// these calls: the operations themselves are the host's. TOCTOU is narrowed by canonicalizing immediately
// before the check and accepted for this threat model, exactly as the shipped write fence documents.
//
// WHERE IT HOOKS. `ctx.tools.guard(...)` — the shipped monotonic execution guard, evaluated after every
// pre-execute listener and before the tool body, which may DENY but never force-allow. A guard is the right
// seam because it sees every dispatch, including a `run_code` sub-dispatch (`parent` set), and because no
// listener ordering can turn its denial back into permission.

import { isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * The tool calls that can return file CONTENT, with the argument that names the path.
 *
 * Named explicitly rather than matched by pattern, because a name-based heuristic is exactly the inference
 * this project forbids elsewhere. `grep`/`glob` are here for the measured reason above: they spawn ripgrep
 * and never touch the filesystem service, so a fence placed only on `ctx.fs` would leave them open.
 *
 * `path` on grep/glob is optional; when it is absent the tool defaults to the session cwd, which is the
 * worker's own world and therefore allowed.
 */
const CONTENT_READERS = Object.freeze([
  Object.freeze({ name: 'read', arg: 'file_path' }),
  // `read_image` returns a file's BYTES as an image, so it is a content reader like `read` and takes the
  // same argument. Omitting it would leave a way to pull protected bytes through a different tool name.
  Object.freeze({ name: 'read_image', arg: 'file_path' }),
  Object.freeze({ name: 'grep', arg: 'path' }),
  Object.freeze({ name: 'glob', arg: 'path' }),
  Object.freeze({ name: 'ls', arg: 'path' }),
  Object.freeze({ name: 'str_replace_editor', arg: 'path' }),
]);

/**
 * @typedef {{ readonly name: string, readonly arg: string }} ContentReader
 * @typedef {{ readonly roots: readonly string[], readonly world: string }} FenceConfig
 */

/**
 * Decide whether a model-supplied path is inside the worker's allowed read set.
 *
 * THE ORDER MATTERS, and it is what makes this layer strictly stronger than the kernel one. The kernel label
 * cannot be applied to a root that contains the world (labelling an ancestor refuses the startup traverse),
 * so the kernel layer must skip such a root entirely. This layer is trusted code, so it can do the
 * finer-grained thing: allow the world FIRST, then deny the protected roots — which means a protected root
 * that happens to contain the world is still denied for every path outside the world.
 *
 * ALLOWED: the execution world, and anything under no protected root at all — the runtime, the toolchain and
 * the package dependencies. A worker needs those to do ordinary work, and `AllowedExecutionReads` exists
 * precisely so this stays honest rather than claiming "only the world", which no runtime permits.
 *
 * @param {{ path: string, roots: readonly string[], world: string, cwd: string }} input
 * @returns {{ allowed: true } | { allowed: false, reason: string }}
 */
export function decideRead(input) {
  const target = resolve(input.cwd, input.path);
  if (isUnder(input.world, target)) return { allowed: true };
  for (const root of input.roots) {
    if (!isUnder(root, target)) continue;
    const resolvedRoot = resolve(root);
    const shown = relative(resolvedRoot, target);
    return {
      allowed: false,
      reason: `"${shown === '' ? resolvedRoot : shown}" is under a protected root (${resolvedRoot}); a work worker may read its own execution world and the runtime, not durable state, sibling worlds, other projects or host session material`,
    };
  }
  return { allowed: true };
}

/**
 * True when `child` is `parent` or sits underneath it.
 *
 * Windows paths compare case-insensitively, and this is a confidentiality check rather than a lookup, so the
 * comparison folds case on win32 — a fence that could be bypassed by changing a path's capitalization would
 * be worse than no fence, because it would be trusted.
 *
 * @param {string} parent
 * @param {string} child
 * @returns {boolean}
 */
function isUnder(parent, child) {
  const p = resolve(parent).replace(/[\\/]+$/u, '');
  const c = resolve(child).replace(/[\\/]+$/u, '');
  const fold = (/** @type {string} */ s) => (process.platform === 'win32' ? s.toLowerCase() : s);
  const a = fold(p);
  const b = fold(c);
  if (a === b) return true;
  return b.startsWith(a.endsWith(sep) ? a : `${a}${sep}`);
}

/**
 * Build the guard function for a worker's tool registry.
 *
 * The returned function has the shipped `ToolGuard` shape: it receives the read-only execution and returns a
 * denial reason, or `undefined` to leave the call allowed. Returning a string is the ONLY way to deny, and
 * no other guard can undo it.
 *
 * A path argument that is present but not a string is DENIED rather than skipped: a call whose path cannot be
 * interpreted must not fall through to the tool body, where the tool would apply its own default.
 *
 * @param {FenceConfig & { cwd?: string }} config
 * @returns {(execution: any) => string | undefined}
 */
export function createReadGuard(config) {
  const cwd = typeof config.cwd === 'string' && config.cwd !== '' ? config.cwd : config.world;
  return (execution) => {
    const name = typeof execution?.name === 'string' ? execution.name : undefined;
    if (name === undefined) return undefined;
    const reader = CONTENT_READERS.find((entry) => entry.name === name);
    if (reader === undefined) return undefined;
    const args = execution?.arguments;
    const raw = typeof args === 'object' && args !== null ? args[reader.arg] : undefined;
    if (raw === undefined) return undefined;
    if (typeof raw !== 'string') return `${name}: "${reader.arg}" must be a string; the read fence cannot evaluate a non-string path`;
    if (raw.trim() === '') return undefined;
    const verdict = decideRead({ path: raw, roots: config.roots, world: config.world, cwd });
    if (verdict.allowed) return undefined;
    return `${name} refused: ${verdict.reason}`;
  };
}

/**
 * Register the read guard on a tool registry for the lifetime of one worker.
 *
 * @param {{ tools: { guard: (guard: (execution: any) => string | undefined) => () => void } }} scope - the agent's scope context.
 * @param {FenceConfig} config
 * @returns {() => void} the disposer the caller owns.
 */
export function installReadGuard(scope, config) {
  return scope.tools.guard(createReadGuard(config));
}

/** Exposed for the conformance suite, so the tool set under test cannot drift from the tool set in force. */
export const FENCED_READ_TOOLS = CONTENT_READERS.map((entry) => entry.name);
