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

import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, parse, resolve } from 'node:path';

/**
 * The two capabilities that name no filesystem path, so a diverged basis cannot change their meaning.
 *
 * They are named here rather than derived from the classification table because this list answers a different
 * question: not "can this tool disclose content" but "can a moving directory change what this call does".
 */
export const BASIS_INDEPENDENT_TOOLS = Object.freeze(['palimpsest_worker_result', 'palimpsest_worker_context_pull']);

/**
 * THE DELEGATION TOOLS THAT ACCEPT A MODEL-SUPPLIED CHILD DIRECTORY (E1RE RE-A, extended by E1RF RF-A).
 *
 * WHY THIS LIST IS SEPARATE FROM THE READ GUARD. `read_guard.js` fences tools whose ARGUMENT names content to
 * return. `subagent` returns no file content itself, so the read guard ignores it — and that was the gap:
 * measured against the real first-party host, `subagent { cwd: <protected root> }` caused the child's
 * `agent/pre-step` to read that directory's `AGENTS.md` through `ctx.fs` and inject it as a `user/message`
 * BEFORE the child's first guarded tool call. A refusal after that read is too late.
 *
 * E1RF RF-A §4.6: THE LIST IS NOW CROSS-CHECKED AGAINST THE INSTALLED RELEASE, not trusted on its own.
 *
 * The E1RE list named `subagent` and `subagent_fork`. An audit of the installed DSH 0.2.1-rc.2 found that
 * `subagent_fork` is NOT a tool this release registers at all: `dsh-tool-subagent` registers exactly one name
 * (`subagent`, with `toolName` configurable), and no package defines a `subagent_fork` tool. The entry was
 * harmless but it described a surface that does not exist, which is the failure mode a hardcoded list always
 * has — a name that is absent reads as coverage while providing none.
 *
 * So the guard now declares the two PROPERTIES that make a capability a delegation-with-directory surface, and
 * `delegationCwdToolsFor()` derives the enforced set from the classification table plus the caller's actual
 * visible surface. `subagent` is kept as a DECLARED MINIMUM: if a future release stops advertising `cwd`, the
 * guard still enforces the name it knows rather than silently narrowing to nothing.
 */
export const DELEGATION_CWD_TOOLS = Object.freeze(['subagent', 'subagent_fork']);

/**
 * The tools in the ACTUAL surface that can place a child agent in a model-chosen directory.
 *
 * EVERY `DELEGATED_SURFACE` NAME IS INCLUDED, not only the ones that spell `subagent`. The reason is that the
 * class is the fail-closed declaration: a capability that "reads nothing itself but reaches scopes that can" is
 * exactly a capability whose directory semantics a guard must not assume. Applying the guard to one that turns
 * out to accept no `cwd` costs nothing — the guard's `requested === undefined` branch admits the call without
 * inspecting anything — while omitting one that DOES accept a `cwd` would be a silent hole. That asymmetry is
 * why the rule is "guard the class", not "guard the names I know".
 *
 * `workflow` and `job_output` are in the class and neither exposes a child `cwd`, so they pass through
 * untouched. A future `subagent_*` provider, or any new delegated capability that grows a `cwd`, is covered
 * without a code change.
 *
 * `DELEGATION_CWD_TOOLS` remains the DECLARED MINIMUM: if a future release stops classifying `subagent` while
 * still shipping it, the guard still enforces the name it knows rather than narrowing to nothing.
 *
 * @param {readonly string[] | undefined} visibleNames - the surface the worker can actually reach, or
 *   `undefined` to take every declared delegation surface. Omitting it is the FAIL-CLOSED choice: the guard
 *   then covers a name even when this particular surface does not happen to show it.
 * @param {readonly { readonly name: string, readonly class: string }[]} classes - the classification table.
 * @returns {readonly string[]}
 */
export function delegationCwdToolsFor(visibleNames, classes) {
  const derived = classes.filter((entry) => entry.class === 'DELEGATED_SURFACE' && typeof entry.name === 'string').map((entry) => entry.name);
  const all = [...new Set([...DELEGATION_CWD_TOOLS, ...derived])].sort();
  if (!Array.isArray(visibleNames)) return all;
  const visible = new Set(visibleNames.filter((name) => typeof name === 'string'));
  return all.filter((name) => visible.has(name));
}


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
 * @param {{ world: string, directories?: { get?: (session: unknown) => unknown } | (() => { get?: (session: unknown) => unknown } | undefined) }} config
 * @returns {() => void} the disposer the caller owns.
 */
export function installCwdFence(scope, config) {
  return scope.tools.guard(createCwdFenceGuard(config));
}

/**
 * Decide whether a DELEGATION call may create a child, BEFORE the child exists.
 *
 * THE ORDERING IS THE POINT (E1RE RE-A). This runs as a `tools.guard()` on the PARENT's dispatch of `subagent`.
 * A guard is evaluated after `tools/pre-execute` and before the tool body, so it precedes `startActivation()`,
 * child Session creation, `workingDirectory.set(child, ...)` and therefore the child's `agent/pre-step`
 * instruction discovery. Refusing here is the earliest boundary that can be reached through a supported seam.
 *
 * THE SEMANTICS COPIED FROM DSH, not invented:
 *   · an ABSENT `cwd` inherits the parent's effective directory, which the basis fence already pins to the
 *     world — so it is admitted;
 *   · a RELATIVE `cwd` is resolved against the parent's effective directory, exactly as
 *     `SubagentManager.resolveDirectory` does (`resolve(await ensure(parent), request.cwd ?? ".")`);
 *   · an ABSOLUTE `cwd` is used as given.
 *
 * THE RESULT MUST EQUAL THE WORLD, AND THE TEST IS LEXICAL FIRST (E1RF RF-A §4.2).
 *
 * E1RE decided from `realpath()`. That admitted a path the model controls through a MUTABLE INDIRECTION: in a
 * test-owned fixture, `world/alias-to-world` — a junction whose current target IS the world — canonicalized to
 * the world and was approved. The current target is not the property that matters. A link can be re-pointed
 * after the decision, and the child's pre-step discovery would then traverse a tree this guard never examined.
 * Deciding from the target means deciding from a value the model can change.
 *
 * So the order is now:
 *   1. NORMALIZE lexically, exactly as `resolve()` does — which is also what `fs.resolve` and
 *      `workingDirectory.set` ultimately use, so the guard and the executor agree about the string;
 *   2. require LEXICAL identity with the world (case-folded on win32, because NTFS is);
 *   3. reject a REPARSE POINT anywhere on the path AS SPELLED, including a component that lexical
 *      normalization would erase (`world/link/..` normalizes to the world but names a link in transit);
 *   4. only then require that canonicalization AGREES, as a consistency check rather than as the decision.
 *
 * WHY THIS DOES NOT DEPEND ON A RACE. Step 2 compares the committed spelling against a fixed string. Link
 * retargeting cannot change that comparison, so there is no check/use window in which a different answer could
 * be produced. Step 3 is defence in depth for the spelling; step 4 only detects a host whose world path
 * canonicalizes somewhere unexpected, which is a configuration fault and is refused rather than assumed benign.
 *
 * CONTAINMENT IS STILL NOT ENOUGH. A child in a SUBDIRECTORY of the world would resolve
 * `../../durable-state/AGENTS.md` against a different ancestor chain, and a sibling world is a disclosed
 * residual that containment would admit.
 *
 * @param {{ world: string, directories?: unknown, realpath?: (path: string) => string | undefined, lstat?: (path: string) => { isSymbolicLink: () => boolean } | undefined, tools?: readonly string[] }} config
 * @returns {(execution: any) => string | undefined}
 */
export function createDelegationCwdGuard(config) {
  const world = resolve(config.world);
  const resolveDirectories = typeof config.directories === 'function' ? config.directories : () => config.directories;
  /**
   * THE ENFORCED NAME SET. A caller that knows the actual surface supplies it (derived by
   * `delegationCwdToolsFor`); otherwise the declared minimum applies. Supplying it is what makes the guard
   * cover a delegation capability this module has never heard of.
   */
  const tools = Array.isArray(config.tools) && config.tools.length > 0 ? new Set(config.tools) : new Set(DELEGATION_CWD_TOOLS);
  const canonicalize = typeof config.realpath === 'function' ? config.realpath : (path) => {
    try {
      const native = realpathSync.native;
      return typeof native === 'function' ? native(path) : realpathSync(path);
    } catch {
      return undefined;
    }
  };
  const inspect = typeof config.lstat === 'function' ? config.lstat : (path) => {
    try {
      return lstatSync(path);
    } catch {
      return undefined;
    }
  };
  return (execution) => {
    const name = typeof execution?.name === 'string' ? execution.name : undefined;
    if (name === undefined || !tools.has(name)) return undefined;
    const args = execution?.arguments;
    const requested = typeof args === 'object' && args !== null ? args.cwd : undefined;
    if (requested === undefined || requested === null) return undefined;
    if (typeof requested !== 'string') return `${name}: "cwd" must be a string; the delegation fence cannot evaluate a non-string directory`;
    if (requested.trim() === '') return `${name}: "cwd" is empty; an empty directory cannot be shown to be the execution world`;
    /** The parent's effective directory is the resolution basis, exactly as DSH resolves it. */
    const parent = execution?.agent === undefined ? undefined : effectiveDirectoryOf(resolveDirectories(), execution.agent.session);
    if (parent !== undefined && parent.read === false) {
      return `${name}: the parent Session's effective working directory could not be established (${parent.why}), so a relative child directory cannot be resolved`;
    }
    const basis = parent !== undefined && parent.read === true ? parent.cwd : world;
    const absolute = isAbsolute(requested) ? resolve(requested) : resolve(basis, requested);

    /* ---- 2. REPARSE POINTS ON THE PATH AS SPELLED, including components normalization erases. */
    /**
     * CHECKED FIRST SO THE REFUSAL NAMES THE REAL CAUSE. `world/alias-to-world` is ALSO lexically outside the
     * world, so the identity test below would refuse it too — but it would report "not the authorized execution
     * world", which describes a path pointing elsewhere rather than a path pointing at the world through a
     * mutable link. The two are different facts and only one of them is the reason a legitimate-looking
     * spelling is refused.
     */
    for (const component of spelledComponents(basis, requested)) {
      const entry = inspect(component);
      /**
       * A component that does not exist is not a link: `lstat` fails for a missing path, and a missing path has
       * no indirection to follow. It is left to the executor, which will reject a nonexistent directory.
       */
      if (entry === undefined) continue;
      if (typeof entry?.isSymbolicLink === 'function' && entry.isSymbolicLink() === true) {
        return `${name}: the child working directory "${requested}" passes through "${component}", which is a reparse point (junction or symlink). A link is a mutable indirection: the directory this guard approved is not the directory a later re-point would select, so the call is refused rather than approved from the link's current target.`;
      }
    }

    /* ---- 3. LEXICAL IDENTITY. This is the decision; everything below only strengthens it. */
    if (!sameDirectory(absolute, world)) {
      return `${name}: the child working directory "${requested}" resolves to ${absolute}, which is not the authorized execution world (${world}). A child created there would run its pre-step instruction discovery outside the world, and that read happens BEFORE any guarded tool call.`;
    }

    /* ---- 4. CANONICAL AGREEMENT. A consistency check on the HOST's world, not the decision. */
    const canonicalWorld = canonicalize(world);
    if (canonicalWorld === undefined) {
      return `${name}: the authorized execution world (${world}) could not be canonicalized, so the directory this call would reach cannot be shown to be the world. Refusing rather than assuming the spelling is the object.`;
    }
    const canonicalTarget = canonicalize(absolute);
    if (canonicalTarget === undefined || !sameDirectory(canonicalTarget, canonicalWorld)) {
      return `${name}: the child working directory "${requested}" is spelled as the authorized execution world, but canonicalizes to ${String(canonicalTarget)}, which differs from the world's canonical form (${canonicalWorld}). The spelling and the object disagree, so the call is refused.`;
    }
    return undefined;
  };
}

/**
 * The components of a model-supplied path AS SPELLED, from the resolution basis outward.
 *
 * WHY THE RAW SEGMENTS AND NOT THE NORMALIZED PATH. `resolve()` is lexical: `world/link/..` becomes `world`,
 * and the `link` segment disappears. If that segment is a junction, the executor never traverses it either —
 * but a model that names a link inside the world, even in a form normalization erases, is asking for a
 * directory whose meaning is not fixed by the string. Refusing it keeps the guard's statement about the
 * spelling true, and it removes any dependence on which normalizer the executor happens to use.
 *
 * Absolute paths are walked from their root; relative paths are walked from `basis`, which is the parent
 * Session's effective directory — the same basis `resolve()` used.
 *
 * @param {string} basis
 * @param {string} requested
 * @returns {readonly string[]}
 */
function spelledComponents(basis, requested) {
  const absolute = isAbsolute(requested);
  let current = absolute ? parse(requested).root : basis;
  /** @type {string[]} */
  const out = [];
  for (const segment of requested.split(/[\\/]+/u)) {
    if (segment === '' || segment === '.' || /^[A-Za-z]:$/u.test(segment)) continue;
    current = resolve(current, segment);
    /** `..` is a traversal, not a named object: there is no component to inspect. */
    if (segment === '..') continue;
    out.push(current);
  }
  return out;
}
