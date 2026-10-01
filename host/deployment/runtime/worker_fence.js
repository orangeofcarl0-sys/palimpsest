// palimpsest-dsh-host/deployment/runtime — INSTALL THE WORKER'S READ BOUNDARY.
//
// This module is the one place the two fence layers are derived from where the worker actually IS, so a
// deployment does not have to be told its own layout twice. Everything here comes from the process's own
// position: a work worker is spawned with `cwd` set to its execution world, so the repository, the durable
// stores and the worlds root are all derivable from `process.cwd()`.
//
//     world      = cwd                              (the prepared worktree)
//     repository = the ancestor holding .palimpsest
//     state      = <repository>/.palimpsest         (durable owners, proof/reasoning/procedure backing)
//     home       = DSH_HOME                         (host session + credential material)
//
// LAYER 1 — THE KERNEL FENCE (`read_fence.js`): a MEDIUM + NO_READ_UP mandatory label on each protected
// root. It binds every PROCESS the model can start, because the backend already lowers that token to Low.
//
// LAYER 2 — THE TRUSTED-CODE FENCE (`read_guard.js`): a monotonic tool guard that denies content-returning
// tool calls aimed at a protected root. It exists because the PTC bindings execute in the Medium host
// process, where the label cannot bind (measured: GATE A assertion A-25).
//
// NEITHER LAYER ALONE IS THE BOUNDARY. Layer 1 without layer 2 leaves `tools.read` open; layer 2 without
// layer 1 leaves `run_code` and every subprocess open. The module reports what each achieved, and a caller
// that requires a boundary must check BOTH rather than trusting one.
//
// This is HOST EXECUTION capability. It creates no canonical owner, no event type, no table, no asset kind,
// and it changes no Work authority, no Context semantics and no promotion authority (R1-H §3/§16).

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { applyReadFence, disclosedResiduals, isAncestorOf, protectedRootsFor } from './read_fence.js';
import { createReadGuard, FENCED_READ_TOOLS } from './read_guard.js';

/** The marker directory that identifies a repository root from anywhere inside it. */
const PALIMPSEST_DIR = '.palimpsest';

/**
 * The environment variable a deployment uses to name protected roots that are NOT derivable from the
 * worker's own position.
 *
 * It is needed because a deployment may place its durable stores outside the repository — the acceptance
 * rigs do exactly that, and so does any deployment that separates state from source. This is HOST
 * CONFIGURATION, not canonical semantics: it names runtime locations, so it must never be encoded into a
 * `TaskEnvelope`, `ProjectIR` or `ContextManifest` (R1-H §12), and it carries no authority.
 *
 * The path-list separator follows the platform (`;` on Windows, `:` elsewhere), matching `PATH`.
 */
const ROOTS_ENV = 'PALIMPSEST_WORKER_PROTECTED_ROOTS';

/** @returns {readonly string[]} */
function rootsFromEnvironment() {
  const raw = process.env[ROOTS_ENV]?.trim();
  if (raw === undefined || raw === '') return [];
  const separator = process.platform === 'win32' ? ';' : ':';
  return raw
    .split(separator)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/**
 * Walk up from a path until the directory holding `.palimpsest` is found.
 *
 * Bounded rather than unbounded: an unbounded walk would eventually reach a drive root and could pick up an
 * unrelated `.palimpsest` in an ancestor, which would silently fence the wrong tree.
 *
 * @param {string} from
 * @param {number} [maxLevels]
 * @returns {string | undefined}
 */
export function findRepository(from, maxLevels = 8) {
  let current = resolve(from);
  for (let level = 0; level < maxLevels; level += 1) {
    if (existsSync(join(current, PALIMPSEST_DIR))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return undefined;
}

/**
 * Derive the fence configuration for the worker whose world is `world`.
 *
 * ROOTS COME FROM TWO SOURCES, and both are needed because a deployment may place its durable stores
 * anywhere:
 *   · the REPOSITORY's `.palimpsest` — the default layout, and the only one derivable from the world alone;
 *   · any EXPLICIT roots the caller supplies — the deployment profile's own database directories, which a
 *     deployment is free to put outside the repository (the acceptance rigs do exactly that).
 *
 * `hostHome` is included only when it exists, and it is the DSH home rather than the user profile: fencing a
 * whole user profile would block the runtime, and the home is where the credential file lives.
 *
 * @param {{ world?: string, repository?: string, hostHome?: string, extraRoots?: readonly string[] }} [input]
 * @returns {{
 *   world: string,
 *   repository?: string,
 *   roots: readonly string[],
 *   residuals: readonly { path: string, why: string }[],
 *   notes: readonly string[],
 * }}
 */
export function deriveWorkerFence(input = {}) {
  const world = resolve(input.world ?? process.cwd());
  const repository = input.repository ?? findRepository(world);
  /** @type {string[]} */
  const notes = [];
  if (repository === undefined && (input.extraRoots ?? []).length === 0) {
    notes.push('no .palimpsest ancestor and no explicit root was found, so only the host home is protected');
  }
  const hostHome = typeof input.hostHome === 'string' && input.hostHome !== '' ? input.hostHome : process.env.DSH_HOME?.trim();
  /** @type {string[]} */
  const roots = [];
  if (repository !== undefined) {
    for (const root of protectedRootsFor({ repository })) roots.push(root);
  }
  for (const extra of input.extraRoots ?? []) {
    if (typeof extra === 'string' && extra !== '') roots.push(resolve(extra));
  }
  for (const declared of rootsFromEnvironment()) roots.push(resolve(declared));
  if (typeof hostHome === 'string' && hostHome !== '' && existsSync(hostHome)) roots.push(resolve(hostHome));
  const residuals = repository === undefined ? [] : disclosedResiduals({ repository, world });
  return { world, ...(repository === undefined ? {} : { repository }), roots, residuals, notes };
}

/**
 * Install BOTH layers for one worker and report exactly what each achieved.
 *
 * @param {{ scope?: any, world?: string, repository?: string, hostHome?: string }} input
 * @returns {{
 *   config: ReturnType<typeof deriveWorkerFence>,
 *   kernel: ReturnType<typeof applyReadFence>,
 *   guardInstalled: boolean,
 *   guardDisposer?: () => void,
 *   fencedTools: readonly string[],
 * }}
 */
export function installWorkerReadBoundary(input = {}) {
  const config = deriveWorkerFence(input);
  // Layer 1 — the kernel label. Applied by this process, which runs at Medium integrity precisely so it can
  // still read what it fences.
  const kernel = applyReadFence({ roots: config.roots, world: config.world });
  // Layer 2 — the tool guard. A guard can only deny, so its presence is fail-closed by construction.
  let guardInstalled = false;
  /** @type {undefined | (() => void)} */
  let guardDisposer;
  const scope = input.scope;
  if (scope !== undefined && typeof scope?.tools?.guard === 'function') {
    const guard = createReadGuard({ roots: config.roots, world: config.world });
    guardDisposer = scope.tools.guard(guard);
    guardInstalled = true;
  }
  return {
    config,
    kernel,
    guardInstalled,
    ...(guardDisposer === undefined ? {} : { guardDisposer }),
    fencedTools: FENCED_READ_TOOLS,
  };
}

/**
 * A compact, NONCANONICAL line for the worker's own telemetry, in the same spirit as `PALIMPSEST_WORKER_ENV`.
 *
 * It reports only what the boundary achieved — never a path, never a body, and never a credential. A reviewer
 * and the live gate read the firewall from here rather than from a prompt line.
 *
 * @param {ReturnType<typeof installWorkerReadBoundary>} installed
 * @returns {string}
 */
export function boundaryTelemetry(installed) {
  const outcomes = installed.kernel.outcomes ?? [];
  return JSON.stringify({
    kernel: {
      supported: installed.kernel.supported,
      ...(installed.kernel.unavailable === undefined ? {} : { unavailable: installed.kernel.unavailable }),
      labelled: outcomes.filter((entry) => entry.verified).length,
      attempted: outcomes.length,
      unverified: outcomes.filter((entry) => !entry.verified).map((entry) => entry.path),
      skipped: (installed.kernel.skipped ?? []).length,
    },
    guard: { installed: installed.guardInstalled, tools: installed.fencedTools },
    residuals: installed.config.residuals.length,
  });
}

/** True when a path is inside the world the worker was given — used by tests and the conformance suite. */
export { isAncestorOf };
