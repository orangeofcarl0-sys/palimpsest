// palimpsest-dsh-host/deployment/runtime — THE WORKING-DIRECTORY BASIS FENCE.
//
// WHY A THIRD LAYER EXISTS (Trajectory-P2-E1RD §5).
//
// `read_guard.js` decides whether a model-supplied path is inside the worker's allowed read set. It resolves
// that path against a FIXED basis — the execution world. That was complete while DSH resolved filesystem paths
// against the immutable Session Header CWD (measured in `@deepseek-ai/dsh-tool-fs@0.2.0-rc.2`, which reads
// `exec.agent?.session.header.cwd`).
//
// DSH 0.2.1-rc.2 changed the basis. `dsh-tool-fs`, `dsh-tool-fs-search`, `dsh-tool-bash` and the PTC transport
// now resolve through `ctx.workingDirectory.ensure(agent, signal)`, a MUTABLE per-Session value that a model
// can move with `working_directory { cd: <dir> }` — and that `subagent { cwd: <dir> }` moves for a CHILD
// session. The guard kept its fixed basis, so the two could disagree:
//
//     RealTarget(GuardCwd, modelPath) !== RealTarget(EffectiveSessionCwd, modelPath)
//
// A relative path the guard approved against the world would then be opened by the executor somewhere else —
// a sibling world, a durable store, any directory the model could name. The kernel label (layer 1) still
// covers PROCESSES, but tool calls execute in the Medium-integrity host, where the label cannot bind. That is
// the same reason layer 2 exists at all.
//
// THE INVARIANT THIS ENFORCES. Rather than trying to track a moving basis (which reintroduces the check/use
// gap the guard already closed for reparse points), this layer REFUSES the divergence itself:
//
//     the effective Session directory must BE the authorized execution world.
//
// Any deviation is a refusal, so a path approved against the world is only ever used against the world. The
// decision is about a committed state value, not a moment, so there is no race to win.
//
// WHY "MUST EQUAL" AND NOT "MUST BE INSIDE". A sibling attempt world is not a protected root — it is a
// disclosed residual, deliberately readable at the NAME level. A basis that moved into a sibling world would
// therefore pass a containment test while disclosing another attempt's contents. Equality is the only test
// that makes the guard's allowance meaningful.
//
// WHAT A REFUSED WORKER MAY STILL DO. The two worker-private tools resolve no path, so a worker whose basis
// diverged can still report its outcome. It can do nothing else. That keeps the refusal observable as a Work
// fact instead of turning it into a silent stall.
//
// PLAIN JAVASCRIPT. `host/**` is scanned by the architecture checker as JavaScript.

import { resolve } from 'node:path';

/**
 * The two capabilities that name no filesystem path, so a diverged basis cannot change their meaning.
 *
 * They are named here rather than derived from the classification table because this list answers a different
 * question: not "can this tool disclose content" but "can a moving directory change what this call does".
 */
export const BASIS_INDEPENDENT_TOOLS = Object.freeze(['palimpsest_worker_result', 'palimpsest_worker_context_pull']);

/**
 * Compare two absolute directories the way the containment test does: case-folded on win32.
 *
 * @param {string} left
 * @param {string} right
 * @returns {boolean}
 */
export function sameDirectory(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  if (left === '' || right === '') return false;
  const fold = (/** @type {string} */ value) => resolve(value).replace(/[\\/]+$/u, '').toLowerCase();
  return fold(left) === fold(right);
}

/**
 * Read a Session's effective working directory WITHOUT filesystem I/O.
 *
 * `WorkingDirectoryService.get(session)` reads the committed projection state and falls back to the service's
 * `defaultDirectory`. It is synchronous, which is what a tool guard requires — the shipped guard contract has
 * no await, deliberately, so a guard cannot be raced by an asynchronous read.
 *
 * A service that is absent, or a Session with no state, is reported as `undefined` so the caller can decide.
 * It is NOT silently treated as equal to the world: "could not read the basis" and "the basis is the world"
 * are different facts.
 *
 * @param {{ get?: (session: unknown) => unknown } | undefined} directories
 * @param {unknown} session
 * @returns {{ read: true, cwd: string } | { read: false, why: string }}
 */
export function effectiveDirectoryOf(directories, session) {
  if (directories === undefined || directories === null) return { read: false, why: 'no working-directory service is mounted in this composition' };
  if (typeof directories.get !== 'function') return { read: false, why: 'the mounted working-directory service exposes no get()' };
  if (session === undefined || session === null) return { read: false, why: 'the tool call names no agent Session, so no effective directory applies' };
  let cwd;
  try {
    cwd = directories.get(session);
  } catch (error) {
    return { read: false, why: `reading the effective directory threw: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (typeof cwd !== 'string' || cwd === '') return { read: false, why: 'the effective directory is not a non-empty string' };
  return { read: true, cwd };
}

/**
 * Build the guard for one worker.
 *
 * THE SERVICE IS RESOLVED PER CALL, not once at installation. Two reasons, and both were measured:
 *   · a service mounted AFTER the boundary is installed would otherwise be invisible to the fence, leaving the
 *     executor free to resolve against a basis the fence never saw;
 *   · the effective directory is a MUTABLE value, so a value captured at install time would be the basis at
 *     admission rather than the basis at dispatch — which is the check/use gap this layer exists to close.
 *
 * The resolver is synchronous, which is what the shipped guard contract requires: `ToolGuard` returns a string
 * or `undefined` and has no await, deliberately, so a guard cannot be raced by an asynchronous read.
 *
 * @param {{ world: string, directories?: { get?: (session: unknown) => unknown } | (() => { get?: (session: unknown) => unknown } | undefined) }} config
 * @returns {(execution: any) => string | undefined}
 */
export function createCwdFenceGuard(config) {
  const world = resolve(config.world);
  const resolveDirectories = typeof config.directories === 'function'
    ? config.directories
    : () => config.directories;
  return (execution) => {
    const name = typeof execution?.name === 'string' ? execution.name : undefined;
    if (name === undefined) return undefined;
    if (BASIS_INDEPENDENT_TOOLS.includes(name)) return undefined;
    /**
     * A call with no agent cannot reach a Session directory, so there is no second basis to disagree with.
     * Every worker-visible tool call carries its agent; this branch exists for completeness, not as a bypass.
     */
    if (execution?.agent === undefined) return undefined;
    const effective = effectiveDirectoryOf(resolveDirectories(), execution.agent.session);
    if (effective.read === false) {
      /**
       * FAIL CLOSED. A basis that cannot be read is not a basis that equals the world. The only exception is a
       * composition with no working-directory service at all — there the executor cannot consult one either,
       * so it resolves against the process directory, which the host sets to the world when it spawns the
       * worker. That case is admitted only when the process directory IS the world.
       */
      if (effective.why === 'no working-directory service is mounted in this composition') {
        return sameDirectory(process.cwd(), world) ? undefined : `refusing ${name}: this composition mounts no working-directory service, so the filesystem basis is the process directory (${process.cwd()}), which is not the authorized execution world (${world})`;
      }
      return `refusing ${name}: the Session's effective working directory could not be established (${effective.why}), so a path approved against the world cannot be shown to be the path that would be opened`;
    }
    if (sameDirectory(effective.cwd, world)) return undefined;
    return `refusing ${name}: the Session's effective working directory (${effective.cwd}) is not the authorized execution world (${world}). A relative path approved against one basis is not approved against the other, so this call is refused.`;
  };
}

/**
 * Register the basis fence for the lifetime of one worker.
 *
 * @param {{ tools: { guard: (guard: (execution: any) => string | undefined) => () => void } }} scope
 * @param {{ world: string, directories?: { get?: (session: unknown) => unknown } }} config
 * @returns {() => void} the disposer the caller owns.
 */
export function installCwdFence(scope, config) {
  return scope.tools.guard(createCwdFenceGuard(config));
}
