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

import { admitWorldForFencing } from './alias_guard.js';
import { CAPABILITY_CLASSES, GUARD_SCOPES, admitWorkerStart, classCounts } from './capability_classes.js';
import { CONFIDENTIAL_PROFILE, admitConfidentialWorker, openConfidentialSlot } from './confidential_profile.js';
import { createCwdFenceGuard, createDelegationCwdGuard, delegationCwdToolsFor } from './cwd_fence.js';
import { applyReadFence, disclosedResiduals, isAncestorOf, protectedRootsFor, verifyTree } from './read_fence.js';
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
  /**
   * PRE-ADMISSION: can this world be fenced AT ALL?
   *
   * A world that shares a file record with protected content, or that holds a reparse point into a protected
   * root, cannot be: the sandbox's own write grant re-labels the world tree, and through such an alias that
   * grant lands on the protected object and replaces NO_READ_UP with NO_WRITE_UP. Measured end to end (see
   * `alias_guard.js`). Labelling harder does not help — two writers, one descriptor, last writer wins — so
   * the alias is refused instead.
   */
  const aliases = admitWorldForFencing({ world: config.world, protectedRoots: config.roots });
  /**
   * E1RG RG-0-F3 / RG-A §4.4: A REJECTED WORLD MUST NOT TRIGGER A LABEL WRITE.
   *
   * MEASURED ON THE PARENT COMMIT (`test/trajectory_p2e1rg_baseline_admission.test.ts` F3). `applyReadFence()`
   * ran unconditionally AFTER this scan had already refused the world, so a world holding a junction into a
   * protected root still caused the protected root's descriptor to be written. The whole point of the alias
   * scan is that such a world cannot be fenced — because the sandbox's write grant travels through the link and
   * REPLACES the protected object's NO_READ_UP — so mutating through it is precisely the harm being avoided.
   *
   * The kernel result is therefore EMPTY on a rejected world, with a reason, rather than a real application.
   * This is not a silent skip: `kernel.applied === false` and `coverage.complete === false` both follow, and the
   * admission gate refuses.
   */
  /**
   * THE KERNEL LAYER, GATED ON THE ALIAS VERDICT.
   *
   * The shape is deliberately `if` rather than a ternary so the shipped order is readable as code: the alias
   * scan's result is consulted, and only then is `applyReadFence` reached at all. `R1-HC HC-01` asserts this
   * order from the shipped source.
   */
  /** @type {ReturnType<typeof applyReadFence> | { supported: false, platform: string, outcomes: readonly never[], skipped: readonly never[], unavailable: string, coverage: Record<string, unknown>, noMutationPerformed: true }} */
  let kernel;
  if (aliases.allowed === true) {
    // Layer 1 — the kernel label. Applied by this process, which runs at Medium integrity precisely so it can
    // still read what it fences. It is STANDING host security state (§3): the labels outlive this process, so a
    // worker crash cannot leave the deployment unprotected, and the next host verifies what is already there.
    kernel = applyReadFence({ roots: config.roots, world: config.world });
  } else {
    kernel = {
      supported: false,
      platform: process.platform,
      outcomes: [],
      skipped: [],
      unavailable: `the execution world was rejected by alias admission (${aliases.reason ?? 'a reparse point or shared file record reaches protected content'}), so no label was written through it`,
      coverage: { planned: [], skipped: [], labelled: [], verified: [], unverified: [], unresolved: [], skippedWithoutDerivedCoverage: [], complete: false },
      noMutationPerformed: true,
    };
  }
  /**
   * Layer 2 — the tool guard, registered GLOBALLY.
   *
   * The scope is not a detail. A guard registered through `agent.ctx` applies only to that agent, and the
   * shipped `subagent`/`workflow`/`job_output` capabilities reach OTHER scopes whose children inherit `read`.
   * A per-agent guard would therefore leave exactly the hole this stage exists to close, so the guard is
   * registered on the process context and the capability classification treats a per-agent registration as a
   * REFUSAL (§10).
   *
   * A guard can only deny — the shipped contract gives it no allow result — so registering one can never
   * widen what a worker may do.
   */
  const context = input.context;
  /**
   * The tools service is fetched with `ctx.get("tools")` rather than read as `ctx.tools`: in Cordis a service
   * is only reachable as a property on a context that DECLARED it in `inject`, and the host plugin's own
   * context does not. `get` asks the registry directly, which is the same access the plugin already uses for
   * `agents`, and it returns `undefined` when the service is absent — the case this code must treat as "no
   * guard installed" rather than as a crash.
   */
  const tools = context === undefined || typeof context?.get !== 'function' ? undefined : context.get('tools');
  /**
   * The working-directory service is resolved PER CALL, not captured here.
   *
   * The basis it reports is mutable, so a value read once at admission would be the basis at admission rather
   * than the basis at dispatch — the check/use gap this fence exists to close. Resolving lazily also covers a
   * service mounted after the boundary is installed.
   */
  const resolveDirectories = () => (context === undefined || typeof context?.get !== 'function' ? undefined : context.get('workingDirectory'));
  let guardScope = GUARD_SCOPES.WORKER_SCOPE;
  /** @type {undefined | (() => void)} */
  let guardDisposer;
  /** @type {undefined | (() => void)} */
  let cwdFenceDisposer;
  /** @type {undefined | (() => void)} */
  let delegationFenceDisposer;
  if (tools !== undefined && typeof tools.guard === 'function') {
    guardDisposer = tools.guard(createReadGuard({ roots: config.roots, world: config.world }));
    /**
     * Layer 3 — the basis fence (E1RD §5). Installed in the SAME global scope as the read guard, because the
     * divergence it refuses is reachable through delegation: a `subagent { cwd }` child would otherwise resolve
     * against a directory the worker chose while the read guard kept approving against the world.
     */
    cwdFenceDisposer = tools.guard(createCwdFenceGuard({ world: config.world, directories: resolveDirectories }));
    /**
     * Layer 4 — the DELEGATION fence (E1RE RE-A, extended by E1RF RF-A). A `subagent { cwd: <elsewhere> }`
     * child runs its own `agent/pre-step` instruction discovery through `ctx.fs`, which NO tool guard observes.
     * Measured against the real host, that read delivered a protected canary as a `user/message` before the
     * child's first guarded call. This guard runs on the PARENT's dispatch, before `startActivation()`, so the
     * child is never created.
     *
     * THE NAME SET IS DERIVED FROM THE CLASSIFICATION TABLE, not from a literal pair. E1RE enforced
     * `subagent` and `subagent_fork`; the audit in RF-A §4.6 found `subagent_fork` is not registered by this
     * release at all, which is how a hardcoded list reads as coverage while providing none. Every declared
     * `DELEGATED_SURFACE` is now covered, so a delegated capability this module has never heard of is fenced
     * by class rather than missed by name.
     */
    delegationFenceDisposer = tools.guard(
      createDelegationCwdGuard({
        world: config.world,
        directories: resolveDirectories,
        tools: delegationCwdToolsFor(undefined, CAPABILITY_CLASSES),
      }),
    );
    guardScope = GUARD_SCOPES.GLOBAL;
  }
  return {
    config,
    kernel,
    aliasScan: aliases.scan,
    aliasesClean: aliases.allowed,
    ...(aliases.allowed ? {} : { aliasRefusal: aliases.reason }),
    guardInstalled: guardDisposer !== undefined,
    guardScope,
    ...(guardDisposer === undefined ? {} : { guardDisposer }),
    /**
     * Layer 3's own fact, reported separately from the read guard. A caller that requires a boundary must be
     * able to tell "the content fence is installed" from "the content fence is installed AND its basis is
     * pinned to the executor's" — they are different guarantees and only the second is sufficient here.
     */
    cwdFenceInstalled: cwdFenceDisposer !== undefined,
    ...(cwdFenceDisposer === undefined ? {} : { cwdFenceDisposer }),
    /** Layer 4's fact, reported for the same reason: a missing delegation fence is a missing guarantee. */
    delegationFenceInstalled: delegationFenceDisposer !== undefined,
    ...(delegationFenceDisposer === undefined ? {} : { delegationFenceDisposer }),
    fencedTools: FENCED_READ_TOOLS,
  };
}

/**
 * Decide whether a worker may start, from its ACTUAL visible capability surface.
 *
 * This is the fail-closed gate (§10/§11). It is a separate function from the installation because the two
 * answer different questions — "is the boundary in force" and "may this worker run at all" — and a caller
 * that conflated them would start a worker whose surface it never checked.
 *
 * E1RE RE-B §4.1: THE BOUNDARY IS NOW A PRECONDITION, NOT A SIBLING FIELD.
 *
 * `installWorkerReadBoundary` reports `cwdFenceInstalled` and `delegationFenceInstalled` independently, and the
 * caller could previously ignore them: a missing basis fence read as "the read guard is installed, so the
 * worker is safe". That inference is false for DSH 0.2.1, where the executor resolves against a mutable basis.
 *
 * The required condition for this profile is therefore explicit and ALL of it must hold:
 *
 *     ReadGuardInstalled && CwdFenceInstalled && DelegationFenceInstalled
 *       && GlobalGuardScope && CapabilitySurfaceAdmitted
 *
 * Each part is reported separately in `boundary`, so a refusal names WHICH guarantee is missing rather than
 * collapsing five distinct facts into one boolean.
 *
 * E1RG RG-0-F4 / RG-B §5.6: THE KERNEL COVERAGE RESULT IS NOW PART OF THE REQUIRED SET.
 *
 * MEASURED ON THE PARENT COMMIT. The required set contained only the three guard layers, the guard scope and
 * the capability surface — so a worker was admitted with NO kernel input at all. A registered Tool Guard is not
 * evidence that the kernel boundary exists: the guard runs in the Medium host and covers tool ARGUMENTS, while
 * the kernel covers every PROCESS the model can start. `ancestor-root-probe.mjs` demonstrates the difference
 * concretely: with the label removed, a Low-integrity process reads durable state that no tool guard was asked
 * about.
 *
 * The kernel requirements are computed from the INSTALLATION REPORT, so they describe what actually happened:
 *
 *   kernelSupported         — the label binding table resolved and the mechanism is available
 *   kernelRootsVerified     — every root that could be labelled was labelled and verified
 *   kernelCoverageComplete  — no unresolved root, no skipped ancestor without derived coverage
 *   kernelContractNotDrifted — the Win32 seam is the one this fence was qualified against
 *
 * `kernelCoverageComplete` is the load-bearing one. `supported === true` alone is satisfied by a plan that
 * labels nothing, which is exactly the state the probe showed to be unprotected.
 *
 * @param {{ visibleNames: readonly string[], guardScope?: string, boundary?: { guardInstalled?: boolean, cwdFenceInstalled?: boolean, delegationFenceInstalled?: boolean, kernelSupported?: boolean, kernelRootsVerified?: boolean, kernelCoverageComplete?: boolean, kernelContractNotDrifted?: boolean } }} input
 * @returns {{ allowed: boolean, reason?: string, classification: ReturnType<typeof admitWorkerStart>['classification'], counts: ReturnType<typeof classCounts>, boundary: { required: Record<string, boolean>, satisfied: boolean } }}
 */
export function admitWorker(input) {
  const verdict = admitWorkerStart(input.visibleNames, { ...(input.guardScope === undefined ? {} : { guardScope: input.guardScope }) });
  /**
   * The boundary conditions are evaluated ONLY when the caller supplies the installation report. A caller that
   * omits it is not silently treated as satisfying them: the requirement is then reported as unsatisfied with
   * a named reason, which is what makes the precondition real rather than advisory.
   */
  const installed = input.boundary;
  const required = {
    readGuardInstalled: installed?.guardInstalled === true,
    cwdFenceInstalled: installed?.cwdFenceInstalled === true,
    delegationFenceInstalled: installed?.delegationFenceInstalled === true,
    globalGuardScope: input.guardScope === GUARD_SCOPES.GLOBAL,
    capabilitySurfaceAdmitted: verdict.allowed === true,
    /** RG-B §5.6: the kernel facts, each independently reported. */
    kernelSupported: installed?.kernelSupported === true,
    kernelRootsVerified: installed?.kernelRootsVerified === true,
    kernelCoverageComplete: installed?.kernelCoverageComplete === true,
    kernelContractNotDrifted: installed?.kernelContractNotDrifted === true,
  };
  const satisfied = Object.values(required).every((value) => value === true);
  const counts = classCounts(verdict.classification.classified);
  if (satisfied) return { ...verdict, counts, boundary: { required, satisfied } };
  const missing = Object.entries(required).filter(([, ok]) => ok !== true).map(([key]) => key);
  return {
    ...verdict,
    counts,
    allowed: false,
    reason: installed === undefined
      ? `refusing to run this worker: the boundary installation report was not supplied, so the required boundary (${missing.join(', ')}) cannot be shown to be in force`
      : `refusing to run this worker: the required boundary is not fully in force (${missing.join(', ')}). ${verdict.reason ?? ''}`.trim(),
    boundary: { required, satisfied },
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
  const contract = installed.kernel.contract ?? {};
  return JSON.stringify({
    kernel: {
      supported: installed.kernel.supported,
      ...(installed.kernel.unavailable === undefined ? {} : { unavailable: installed.kernel.unavailable }),
      labelled: outcomes.filter((entry) => entry.verified).length,
      attempted: outcomes.length,
      unverified: outcomes.filter((entry) => !entry.verified).map((entry) => entry.path),
      alreadyProtected: outcomes.filter((entry) => entry.alreadyProtected === true).length,
      skipped: (installed.kernel.skipped ?? []).length,
    },
    guard: { installed: installed.guardInstalled, scope: installed.guardScope, tools: installed.fencedTools, cwdBasisPinned: installed.cwdFenceInstalled === true },
    aliases: { clean: installed.aliasesClean === true, found: (installed.aliasScan?.aliases ?? []).length },
    residuals: installed.config.residuals.length,
    // The pinned DSH contract this run depended on, so evidence names the host it ran against (§9).
    contract: { package: contract.package, resolvedVersion: contract.resolvedVersion, qualifiedVersion: contract.qualifiedVersion, drifted: contract.drifted === true },
  });
}

/** True when a path is inside the world the worker was given — used by tests and the conformance suite. */
export { isAncestorOf };

/**
 * Re-exported so the host runner reaches the capacity machinery through the ONE module it loads.
 *
 * The runner imports this module dynamically and nothing else, so a function that lives in a sibling file but
 * is not surfaced here would be invisible to it — which is exactly how the first live run reported "the
 * confidential profile slot was not consulted" while the protection assertions passed.
 */
export { CONFIDENTIAL_PROFILE, admitConfidentialWorker, openConfidentialSlot };

/**
 * Re-exported for the same reason, and for one more (E1RD §6).
 *
 * The runner must WITHDRAW `working_directory` before it enumerates the surface the gate classifies. That
 * filter is derived from the classification table, so it lives beside it; surfacing it here keeps the runner's
 * single dynamic import sufficient and prevents a second, hand-maintained withdrawal list.
 */
export { WITHDRAWN_CAPABILITIES, withdrawalFilter } from './capability_classes.js';
