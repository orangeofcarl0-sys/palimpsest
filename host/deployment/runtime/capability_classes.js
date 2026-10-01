// palimpsest-host-deployment/runtime — WORKER CAPABILITY CLASSIFICATION: FAIL-CLOSED BY CONSTRUCTION.
//
// R1-H protected the worker's reads with a named list of content-returning tools. That list was the SOLE
// safety mechanism, and a list has a failure mode that is invisible at review time: a tool added later, or
// renamed, simply is not on it, and the worker runs with an unguarded read route while every test still
// passes. R1-HR §10 replaces the list with a CLASSIFICATION, and §11 makes the consequence explicit —
// `capability-open + authority-closed` becomes `authority-closed, capability-open only after
// confidentiality classification`.
//
// EVERY worker-visible capability must belong to exactly one class:
//
//   WORKER_PRIVATE     the two worker-private tools; read-only or reporting, no host file read.
//   CONFINED_CHILD     arbitrary model-controlled code/process execution, which runs under the Low token.
//   GUARDED_HOST_READ  a trusted Medium-host capability that can return filesystem content, and therefore
//                      must pass the read guard.
//   NO_HOST_FILE_READ  a capability mechanically shown not to expose host filesystem content.
//
// AT WORKER STARTUP the actual visible surface is ENUMERATED and every name must classify. An unclassified
// name REFUSES THE WORKER START. Unknown is not assumed safe — that is the whole point of the change.
//
// THE DELEGATION PROBLEM, AND WHY IT FORCED A FIFTH CLASS.
//
// Three shipped capabilities return no file content THEMSELVES but can cause content to be returned:
//
//   `subagent` / `subagent_fork`  spawn a child agent that JOINS THE PARENT'S PRESET, so the child inherits
//                                 `read` and can be asked to read any path and report it.
//   `workflow`                    runs a model-authored script whose `agent()` binding spawns those same
//                                 children; the script has no filesystem binding of its own, but the
//                                 children's text comes back as the script's return value.
//   `job_output`                  returns a background job's captured stdout/stderr, and jobs are produced
//                                 by bash/pwsh/subagent/workflow.
//
// Classifying these `NO_HOST_FILE_READ` would be FALSE: they are exactly how a worker would reach protected
// bytes if the guard only covered the worker's own scope. The correct statement is conditional — they read
// nothing themselves, PROVIDED the guard also covers the scopes they delegate to.
//
// So they get their own class, DELEGATED_SURFACE, and a PRECONDITION: a worker that can reach one of them
// may only start when the read guard is registered GLOBALLY (on the process, covering descendants) rather
// than on the worker's own scope alone. That precondition is checked at startup, not assumed, and a host that
// registers the guard per-agent gets a REFUSAL instead of a silent hole.
//
// EVERY worker-visible capability must belong to exactly one class:
//
//   WORKER_PRIVATE     the two worker-private tools; read-only or reporting, no host file read.
//   CONFINED_CHILD     arbitrary model-controlled code/process execution, which runs under the Low token.
//   GUARDED_HOST_READ  a trusted Medium-host capability that can return filesystem content, and therefore
//                      must pass the read guard.
//   DELEGATED_SURFACE  reads nothing itself, but reaches scopes that can; requires a GLOBAL guard.
//   NO_HOST_FILE_READ  a capability mechanically shown not to expose host filesystem content, directly or by
//                      delegation.
//
// CLASSIFYING BY IMPLEMENTATION, NOT BY NAME (§12). The classes below were derived by reading each tool's
// own code, and the evidence is recorded per entry:
//   · `grep`/`glob` spawn packaged ripgrep through `ctx.subprocess` and NEVER touch `ctx.fs` — so a fence
//     placed only on the filesystem service would leave them open. They are GUARDED_HOST_READ.
//   · `read_image` returns a file's BYTES, so it is a content reader exactly like `read`.
//   · `bash`/`pwsh` go through `ctx.sandbox.confine()`, so their computation is CONFINED_CHILD.
//   · `subagent` joins the parent preset for the child, which is why it is DELEGATED_SURFACE and not safe.
//
// PLAIN JAVASCRIPT. `host/**` is scanned by the architecture checker as JavaScript.

/**
 * @typedef {'WORKER_PRIVATE' | 'CONFINED_CHILD' | 'GUARDED_HOST_READ' | 'DELEGATED_SURFACE' | 'NO_HOST_FILE_READ'} CapabilityClass
 * @typedef {{ readonly name: string, readonly class: CapabilityClass, readonly why: string,
 *   readonly seam?: string, readonly guardArg?: string, readonly requiresGlobalGuard?: boolean }} CapabilityEntry
 * @typedef {{ readonly ok: boolean, readonly unclassified: readonly string[],
 *   readonly classified: readonly CapabilityEntry[], readonly detail: string,
 *   readonly requiresGlobalGuard: boolean }} ClassificationResult
 */

/** Where the read guard is registered. Only `global` covers the scopes a delegation reaches. */
export const GUARD_SCOPES = Object.freeze({ GLOBAL: 'global', WORKER_SCOPE: 'worker-scope' });

/**
 * The classification table.
 *
 * `guardArg` names the argument carrying a model-controlled path — the read guard reads it to decide. It is
 * present for GUARDED_HOST_READ entries only, and it is what makes a RENAME visible: a tool that keeps its
 * name but changes the argument it reads would be caught by the guard's own conformance test, and a tool that
 * changes its NAME is caught here.
 */
export const CAPABILITY_CLASSES = Object.freeze([
  // ---- WORKER_PRIVATE ------------------------------------------------------------------------------
  Object.freeze({ name: 'palimpsest_worker_result', class: 'WORKER_PRIVATE', why: 'the worker reports its own outcome; it reads no file and settles nothing', seam: 'worker-private scope registration' }),
  Object.freeze({ name: 'palimpsest_worker_context_pull', class: 'WORKER_PRIVATE', why: 'resolves ONE bound handle through the host IPC channel; it cannot name a path, so it is not a filesystem route', seam: 'worker-private scope registration' }),

  // ---- CONFINED_CHILD ------------------------------------------------------------------------------
  Object.freeze({ name: 'run_code', class: 'CONFINED_CHILD', why: 'the PTC transport: the program body runs in the confined child process, and its tool bindings are classified separately', seam: 'dsh-ptc-runtime-node -> ctx.sandbox.confine()' }),
  Object.freeze({ name: 'bash', class: 'CONFINED_CHILD', why: 'a shell command is spawned through ctx.sandbox.confine(), so its computation runs under the Low token', seam: 'dsh-bash-sandbox -> ctx.sandbox.confine()' }),
  Object.freeze({ name: 'pwsh', class: 'CONFINED_CHILD', why: 'a PowerShell command is spawned through ctx.sandbox.confine(), so its computation runs under the Low token', seam: 'dsh-pwsh-sandbox -> ctx.sandbox.confine()' }),
  Object.freeze({ name: 'bash_persistent', class: 'CONFINED_CHILD', why: 'a long-lived shell session is still a confined child process', seam: 'dsh-tool-bash-persistent' }),
  Object.freeze({ name: 'pwsh_persistent', class: 'CONFINED_CHILD', why: 'a long-lived PowerShell session is still a confined child process', seam: 'dsh-tool-pwsh-persistent' }),

  // ---- GUARDED_HOST_READ ---------------------------------------------------------------------------
  Object.freeze({ name: 'read', class: 'GUARDED_HOST_READ', why: 'returns a file body through ctx.fs, in the trusted host process', seam: 'dsh-tool-fs -> ctx.fs.readText', guardArg: 'file_path' }),
  Object.freeze({ name: 'read_image', class: 'GUARDED_HOST_READ', why: 'returns a file\'s BYTES as an image, so it is a content reader exactly like read', seam: 'dsh-tool-fs -> ctx.fs.readBytes', guardArg: 'file_path' }),
  Object.freeze({ name: 'grep', class: 'GUARDED_HOST_READ', why: 'spawns packaged ripgrep through ctx.subprocess and NEVER touches ctx.fs, so a filesystem-only fence would leave it open', seam: 'dsh-tool-fs-search -> ctx.subprocess.spawn(rg)', guardArg: 'path' }),
  Object.freeze({ name: 'glob', class: 'GUARDED_HOST_READ', why: 'spawns packaged ripgrep through ctx.subprocess and NEVER touches ctx.fs', seam: 'dsh-tool-fs-search -> ctx.subprocess.spawn(rg)', guardArg: 'path' }),
  Object.freeze({ name: 'ls', class: 'GUARDED_HOST_READ', why: 'lists a directory through ctx.fs, which reveals protected names and their metadata', seam: 'dsh-tool-fs -> ctx.fs.listDir', guardArg: 'path' }),
  Object.freeze({ name: 'str_replace_editor', class: 'GUARDED_HOST_READ', why: 'its read half returns file content through ctx.fs before editing', seam: 'dsh-tool-str-replace-editor', guardArg: 'path' }),

  // ---- DELEGATED_SURFACE ---------------------------------------------------------------------------
  // These read nothing themselves. Each reaches scopes that can, so each REQUIRES a global guard.
  Object.freeze({ name: 'subagent', class: 'DELEGATED_SURFACE', requiresGlobalGuard: true, why: 'spawns a child agent that JOINS THE PARENT PRESET, inheriting `read`; the child\'s final text returns as the tool result, so a prompt like "read <path> and quote it" is a content route', seam: 'dsh-tool-subagent -> dsh-subagent (composeFrom parent preset)' }),
  Object.freeze({ name: 'subagent_fork', class: 'DELEGATED_SURFACE', requiresGlobalGuard: true, why: 'same provider driver as subagent, seeded from history; the child carries the same tool surface', seam: 'dsh-tool-subagent -> dsh-subagent-fork-in-process' }),
  Object.freeze({ name: 'subagent_codex', class: 'DELEGATED_SURFACE', requiresGlobalGuard: true, why: 'an out-of-process provider whose child has its own tool surface; disabled in the shipped presets, classified so enabling it cannot silently bypass the fence', seam: 'dsh-tool-subagent (provider: codex)' }),
  Object.freeze({ name: 'subagent_claude_code', class: 'DELEGATED_SURFACE', requiresGlobalGuard: true, why: 'an out-of-process provider whose child has its own tool surface; disabled in the shipped presets, classified so enabling it cannot silently bypass the fence', seam: 'dsh-tool-subagent (provider: claude-code)' }),
  Object.freeze({ name: 'workflow', class: 'DELEGATED_SURFACE', requiresGlobalGuard: true, why: 'runs a model-authored script with no filesystem binding of its own, but its agent() binding spawns subagents whose text becomes the script return value', seam: 'dsh-tool-workflow -> dsh-workflow-ptc' }),
  Object.freeze({ name: 'job_output', class: 'DELEGATED_SURFACE', requiresGlobalGuard: true, why: 'returns a background job\'s captured stdout/stderr, and jobs are produced by bash/pwsh/subagent/workflow', seam: 'dsh-tool-jobs -> ctx.jobs.read' }),

  // ---- NO_HOST_FILE_READ ---------------------------------------------------------------------------
  Object.freeze({ name: 'write', class: 'NO_HOST_FILE_READ', why: 'mutates a path but returns no content; write confinement already governs it, and a write cannot disclose protected bytes', seam: 'dsh-tool-fs -> ctx.fs.writeText' }),
  Object.freeze({ name: 'edit', class: 'NO_HOST_FILE_READ', why: 'mutates a path but returns a diff of the caller\'s own replacement, not protected content', seam: 'dsh-tool-fs -> ctx.fs.editText' }),
  Object.freeze({ name: 'todo_write', class: 'NO_HOST_FILE_READ', why: 'stores a model-authored task list in host memory', seam: 'dsh-tool-todo' }),
  Object.freeze({ name: 'create_goal', class: 'NO_HOST_FILE_READ', why: 'records a model-authored goal', seam: 'dsh-tool-goal' }),
  Object.freeze({ name: 'skill', class: 'NO_HOST_FILE_READ', why: 'returns a packaged skill document, not host project content', seam: 'dsh-tool-skill' }),
  Object.freeze({ name: 'present', class: 'NO_HOST_FILE_READ', why: 'renders a model-authored card', seam: 'dsh-tool-present' }),
  Object.freeze({ name: 'ask_user_question', class: 'NO_HOST_FILE_READ', why: 'returns a person\'s answer', seam: 'dsh-tool-ask-user' }),
  Object.freeze({ name: 'web_fetch', class: 'NO_HOST_FILE_READ', why: 'fetches a URL over the network; it cannot name a local path', seam: 'dsh-tool-web' }),
  Object.freeze({ name: 'web_search', class: 'NO_HOST_FILE_READ', why: 'queries a search provider; it cannot name a local path', seam: 'dsh-tool-web' }),
  Object.freeze({ name: 'list_subagent_models', class: 'NO_HOST_FILE_READ', why: 'reads the LLM provider catalog only; it names no path', seam: 'dsh-tool-subagent' }),
  Object.freeze({ name: 'send_message', class: 'NO_HOST_FILE_READ', why: 'returns delivery confirmation, never the target agent\'s answer', seam: 'dsh-tool-subagent-control' }),
  Object.freeze({ name: 'interrupt_agent', class: 'NO_HOST_FILE_READ', why: 'returns acceptance of a cancellation', seam: 'dsh-tool-subagent-control' }),
  Object.freeze({ name: 'list_agents', class: 'NO_HOST_FILE_READ', why: 'returns agent identity and status projections', seam: 'dsh-tool-subagent-control/list-agents' }),
  Object.freeze({ name: 'job_list', class: 'NO_HOST_FILE_READ', why: 'returns job id/kind/status/label projections, never job output', seam: 'dsh-tool-jobs' }),
  Object.freeze({ name: 'job_kill', class: 'NO_HOST_FILE_READ', why: 'returns a cancellation outcome and status', seam: 'dsh-tool-jobs' }),
  /**
   * The plan/goal tools were FOUND by the fail-closed gate rather than added by hand: a live worker refused
   * to start because these three were unclassified. That is the mechanism working, and each is classified
   * here on its own evidence — model-authored plan/goal state, no path parameter, no filesystem read.
   */
  Object.freeze({ name: 'exit_plan_mode', class: 'NO_HOST_FILE_READ', why: 'presents a model-authored plan string for review and returns the person\'s decision; its only parameter is the plan text', seam: 'dsh-plan-mode' }),
  Object.freeze({ name: 'get_goal', class: 'NO_HOST_FILE_READ', why: 'reads the current model-authored goal from host memory; it takes no parameters', seam: 'dsh-tool-goal -> ctx.goals.get' }),
  Object.freeze({ name: 'update_goal', class: 'NO_HOST_FILE_READ', why: 'updates the current model-authored goal by id; it names no path', seam: 'dsh-tool-goal' }),
  Object.freeze({ name: 'goal_round_driver', class: 'NO_HOST_FILE_READ', why: 'drives the goal round loop; it names no path and reads no file', seam: 'dsh-tool-goal' }),
  Object.freeze({ name: 'command_goal', class: 'NO_HOST_FILE_READ', why: 'a slash-command surface over the goal store; it names no path', seam: 'dsh-tool-goal' }),
  Object.freeze({ name: 'command_compact', class: 'NO_HOST_FILE_READ', why: 'compacts the conversation; it names no path', seam: 'dsh-compaction-basic' }),
  Object.freeze({ name: 'token_meter', class: 'NO_HOST_FILE_READ', why: 'reports token accounting; it names no path', seam: 'dsh-tool-goal' }),
]);

/** Index the table once, so a lookup cannot drift from the declaration. */
const BY_NAME = new Map(CAPABILITY_CLASSES.map((entry) => [entry.name, entry]));

/**
 * The guard-argument map the read guard consumes, derived from the SAME table.
 *
 * Deriving it rather than maintaining a second list is the point: a tool cannot be GUARDED_HOST_READ here and
 * absent from the guard there.
 *
 * @returns {readonly { readonly name: string, readonly arg: string }[]}
 */
export function guardedReadTools() {
  return CAPABILITY_CLASSES.filter((entry) => entry.class === 'GUARDED_HOST_READ' && typeof entry.guardArg === 'string').map((entry) => ({ name: entry.name, arg: entry.guardArg }));
}

/**
 * Classify an ACTUAL worker-visible capability surface.
 *
 * @param {readonly string[]} visibleNames - every tool name the worker can reach, read from the host's own
 *   registry view at startup rather than from a declaration.
 * @returns {ClassificationResult}
 */
export function classifyWorkerCapabilities(visibleNames) {
  const unique = [...new Set(visibleNames.filter((name) => typeof name === 'string' && name !== ''))].sort();
  /** @type {string[]} */
  const unclassified = [];
  /** @type {CapabilityEntry[]} */
  const classified = [];
  for (const name of unique) {
    const entry = BY_NAME.get(name);
    if (entry === undefined) {
      unclassified.push(name);
      continue;
    }
    classified.push(entry);
  }
  const requiresGlobalGuard = classified.some((entry) => entry.requiresGlobalGuard === true);
  return {
    ok: unclassified.length === 0,
    unclassified,
    classified,
    requiresGlobalGuard,
    detail: unclassified.length === 0
      ? `${String(classified.length)} worker-visible capabilities, all classified${requiresGlobalGuard ? ' (reaches delegation scopes, so a GLOBAL guard is required)' : ''}`
      : `UNCLASSIFIED worker-visible capability(ies): ${unclassified.join(', ')} — an unknown capability is not assumed safe, so the worker must not start`,
  };
}

/**
 * The gate a host calls before running a worker.
 *
 * TWO CONDITIONS, and the second is the one a per-agent guard would silently fail:
 *   1. every visible capability classifies;
 *   2. if any of them reaches a DELEGATED_SURFACE, the read guard is registered GLOBALLY.
 *
 * A guard registered only on the worker's own scope does not cover a subagent's scope, so a worker holding
 * `subagent` could ask a child to read a protected path. The precondition makes that combination a refusal
 * rather than a hole.
 *
 * Returning a refusal reason rather than throwing keeps the decision at the caller, where the host can report
 * it as a structured host fact (the same shape as every other worker-start failure) instead of an exception.
 *
 * @param {readonly string[]} visibleNames
 * @param {{ guardScope?: string }} [options]
 * @returns {{ allowed: boolean, reason?: string, classification: ClassificationResult }}
 */
export function admitWorkerStart(visibleNames, options = {}) {
  const classification = classifyWorkerCapabilities(visibleNames);
  if (!classification.ok) return { allowed: false, reason: classification.detail, classification };
  const guardScope = options.guardScope ?? GUARD_SCOPES.WORKER_SCOPE;
  if (classification.requiresGlobalGuard && guardScope !== GUARD_SCOPES.GLOBAL) {
    const reachable = classification.classified.filter((entry) => entry.requiresGlobalGuard === true).map((entry) => entry.name);
    return {
      allowed: false,
      classification,
      reason: `this worker can reach ${reachable.join(', ')}, which delegate to scopes that can read files; the read guard is registered ${guardScope}, which does not cover those scopes — register it globally or remove the capability`,
    };
  }
  return { allowed: true, classification };
}

/**
 * The classes a caller may require to be present. A worker with no CONFINED_CHILD capability cannot run model
 * code at all, and one with no GUARDED_HOST_READ capability has no guarded route — both are legitimate
 * compositions, so this reports rather than refuses.
 *
 * @param {readonly CapabilityEntry[]} classified
 * @returns {Record<CapabilityClass, number>}
 */
export function classCounts(classified) {
  /** @type {Record<string, number>} */
  const counts = { WORKER_PRIVATE: 0, CONFINED_CHILD: 0, GUARDED_HOST_READ: 0, DELEGATED_SURFACE: 0, NO_HOST_FILE_READ: 0 };
  for (const entry of classified) counts[entry.class] = (counts[entry.class] ?? 0) + 1;
  return /** @type {Record<CapabilityClass, number>} */ (counts);
}
