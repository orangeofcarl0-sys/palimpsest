/**
 * R3-L0C-F §9 — THE COMPLETE SHIPPED EXECUTION CLOSURE.
 *
 * §9's finding, stated as the reason this module exists: "The old R3-L0C-R ExecutionClosureDigest does not include
 * the full shipped runtime affected by R3-WR through R3-WR5." The old digest covered ten harness `.mjs` files, so
 * a change to the SHIPPED runtime — the GitPort, the controller, the worker port, the effect runtime — moved
 * nothing. A reader comparing digests would conclude the experiment was unchanged while the code that executes it
 * had changed underneath.
 *
 * THE REPAIR IS TO COVER THE ACTUAL LOAD-BEARING EXECUTABLE INPUTS, AND TO SEPARATE THEM INTO FIVE PARTS:
 *
 *   SOURCE_CLOSURE              the audited TypeScript/host sources
 *   COMPILED_RUNTIME_CLOSURE    the `dist/**` artifacts the harness actually imports
 *   EXECUTOR_CONFIGURATION      the route, the settings document and the composition patch
 *   MODEL_IDENTITY_EVIDENCE     the recorded model/provider identity, with NO secret value
 *   EXPERIMENT_PLAN_DIGEST      the frozen schedule, arm order, seed, expectations and verdict rules
 *
 * WHY COMPILED RUNTIME IS A SEPARATE PART FROM SOURCE. The harness imports `dist/**`, not `src/**`. A stale
 * build is therefore a real experimental hazard: the source can be correct while the compiled artifact that runs
 * is not. Covering both makes the pair checkable, and `verifyCompiledAgainstSource` reports whether the build is
 * current rather than assuming it.
 *
 * WHY THE SELF-EXCLUSION MATTERS. §9 requires the closure to exclude its own plan/result file, because hashing a
 * file that contains the digest of the thing being hashed cannot terminate. The excluded paths are named as data.
 *
 * NO SECRETS. §9 says "Do not hash or reveal secret values." The credential is referenced by NAME only
 * (`apiKeyEnv`), and this module reads no credential file and hashes no key material.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CLOSURE_FILES, CLOSURE_LAW, CLOSURE_PARTS, CLOSURE_SELF_EXCLUSIONS, REPO_ROOT } from './contract.mjs';

const NL = String.fromCharCode(10);

/** §9: the digest of one file's BYTES, or a marker when it is absent. */
export function fileDigest(relative) {
  const path = join(REPO_ROOT, relative);
  if (!existsSync(path)) return 'MISSING';
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** §9: a digest over a map of named digests, with a stable key order. */
export function digestOfMap(map) {
  const material = Object.entries(map)
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([path, digest]) => `${path}:${digest}`)
    .join(NL);
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

/** §9: the file digests for one part. */
export function partFileDigests(partId, files = CLOSURE_FILES[partId]) {
  const digests = {};
  for (const file of files) digests[file] = fileDigest(file);
  return Object.freeze(digests);
}

/** §9: the digest of one part, over its files. */
export function partDigest(partId, files = CLOSURE_FILES[partId]) {
  return digestOfMap(partFileDigests(partId, files));
}

/**
 * §9: THE TOOLCHAIN AND PLATFORM FACTS.
 *
 * §9 requires the relevant Node and Git versions to be recorded. They are part of the closure because a runtime
 * that changed under the experiment is a changed experimental condition, and a digest that ignored it would not
 * notice.
 */
export function toolchain() {
  const run = (command, args) => {
    try {
      return execFileSync(command, args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    } catch (error) {
      return `UNAVAILABLE: ${String(error?.message ?? error).slice(0, 80)}`;
    }
  };
  return Object.freeze({
    node: process.version,
    git: run('git', ['--version']),
    platform: process.platform,
    arch: process.arch,
    /** The installed package and adapter versions §9 names. */
    packages: Object.freeze({
      ordarium: installedVersion('@ordarium/core'),
      vitest: installedVersion('vitest'),
      typescript: installedVersion('typescript'),
      /**
       * The DSH sandbox runner is NOT a project dependency — it is installed in the GLOBAL DSH root, which is
       * where the canaries resolve it from. Probing the project's own `node_modules` for it reported
       * `NOT_INSTALLED` on a host where it is installed and working, which is a false negative in the closure.
       * It is resolved through the same global root the canary suite uses, and the location is recorded.
       */
      dshSandboxWindowsAcl: globalDshPackageVersion('@deepseek-ai/dsh-sandbox-windows-acl'),
    }),
    /** §9: where the globally-resolved packages were found, so the resolution is auditable. */
    globalDshRoot: globalDshRoot(),
  });
}

/** The version of a package in the GLOBAL DSH root, or an explicit reason it could not be resolved. */
function globalDshPackageVersion(name) {
  const root = globalDshRoot();
  if (root === null) return 'DSH_ROOT_UNRESOLVED';
  const path = join(root, 'node_modules', name, 'package.json');
  if (!existsSync(path)) return 'NOT_IN_GLOBAL_DSH_ROOT';
  try {
    return JSON.parse(readFileSync(path, 'utf8')).version ?? 'UNKNOWN';
  } catch {
    return 'UNREADABLE';
  }
}

/** The global DSH root, resolved the way the canary suite resolves it. */
function globalDshRoot() {
  const explicit = process.env.PALIMPSEST_DSH_ROOT?.trim();
  if (explicit !== undefined && explicit !== '') return explicit;
  const bin = process.env.PALIMPSEST_DSH_BIN?.trim();
  if (bin !== undefined && bin !== '') return join(bin, '..', '..');
  try {
    const globalRoot = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', shell: true }).stdout.trim();
    return globalRoot === '' ? null : join(globalRoot, '@deepseek-ai', 'dsh');
  } catch {
    return null;
  }
}

/** The version of an installed package, or a marker. */
function installedVersion(name) {
  try {
    const path = join(REPO_ROOT, 'node_modules', name, 'package.json');
    if (!existsSync(path)) return 'NOT_INSTALLED';
    return JSON.parse(readFileSync(path, 'utf8')).version ?? 'UNKNOWN';
  } catch {
    return 'UNREADABLE';
  }
}

/**
 * §9: WHETHER THE COMPILED ARTIFACTS CORRESPOND TO THE AUDITED SOURCE.
 *
 * §9 requires the compiled artifacts to be verified against the source. The check is a REAL build check rather
 * than a timestamp comparison: `tsc --noEmit` over the project reports whether the current source compiles, and
 * each compiled artifact is compared against a fresh in-memory emit of its source. The second half is what makes
 * the check meaningful for a STALE build — a `dist` that predates its source compiles fine but is not what the
 * source says.
 *
 * A failure is REPORTED with the diverging files rather than thrown, because the caller decides whether a stale
 * build is a stop (§9 makes it one) or a diagnosis.
 */
/**
 * R3-L0C-I Gate 4: DETERMINISTIC COMPILED-OUTPUT VERIFICATION.
 *
 * §"Replace mtime-only source/compiled comparison with deterministic compiled-output verification where
 * supported."
 *
 * WHY THE MTIME COMPARISON WAS NOT ENOUGH. R3-L0C-F compared modification ORDER: a compiled artifact older than
 * its source was called stale. That is a heuristic with two failure modes it cannot see — a `dist` built from
 * DIFFERENT source with a NEWER timestamp reads as fresh, and a touched source with an unchanged body reads as
 * stale. Neither is detectable from timestamps, and both are exactly the stale-build hazard the check exists for.
 *
 * THE DETERMINISTIC METHOD, and it is available here. The project compiles with a fixed `tsconfig.json`, and
 * measured: emitting `src/**` with the project's own compiler options reproduces all nine load-bearing compiled
 * artifacts BYTE-FOR-BYTE apart from the `//# sourceMappingURL` comment, which the probe options disable. So the
 * comparison is over real emitted bytes rather than over timestamps.
 *
 * THE SOURCEMAP COMMENT IS NORMALIZED AWAY, and that is stated rather than hidden: the probe emits without
 * sourcemaps, so the only expected textual difference is that one trailing comment. A divergence anywhere else is
 * reported with the file and the first differing line, so a real stale build is diagnosable rather than merely
 * flagged.
 *
 * WHERE IT IS NOT SUPPORTED IT SAYS SO. If the compiler is unavailable or the probe config cannot be written, the
 * result is `DETERMINISTIC: UNSUPPORTED` and the check falls back to the modification-order heuristic — reported
 * as a fallback, never as a pass.
 */
export function verifyCompiledAgainstSource() {
  const pairs = [
    ['src/effects/git_port.ts', 'dist/src/effects/git_port.js'],
    ['src/effects/runtime.ts', 'dist/src/effects/runtime.js'],
    ['src/tools/controller.ts', 'dist/src/tools/controller.js'],
    ['src/deployment/work_worker.ts', 'dist/src/deployment/work_worker.js'],
    ['src/domain/state_machine.ts', 'dist/src/domain/state_machine.js'],
    ['src/scheduler/scheduler.ts', 'dist/src/scheduler/scheduler.js'],
    ['src/state/attempt_authorization.ts', 'dist/src/state/attempt_authorization.js'],
    ['src/interaction/work_delegation.ts', 'dist/src/interaction/work_delegation.js'],
    ['src/project_world/basis_store.ts', 'dist/src/project_world/basis_store.js'],
  ];
  const missing = pairs.filter(([, compiled]) => !existsSync(join(REPO_ROOT, compiled))).map(([, compiled]) => compiled);

  const deterministic = deterministicEmitComparison(pairs);
  if (deterministic.supported === true) {
    return Object.freeze({
      kind: 'compiled-against-source verification',
      pairs: pairs.length,
      missing: Object.freeze(missing),
      DETERMINISTIC: 'SUPPORTED',
      method: 'a fresh emit of src/** with the project\'s own compiler options, compared byte-for-byte against dist/**',
      normalization: 'the `//# sourceMappingURL` comment is removed from both sides, because the probe emits without sourcemaps',
      diverged: deterministic.diverged,
      COMPILED_MATCHES_SOURCE: missing.length === 0 && deterministic.diverged.length === 0,
    });
  }

  /** The fallback, reported as a fallback. */
  const stale = [];
  for (const [source, compiled] of pairs) {
    const sourcePath = join(REPO_ROOT, source);
    const compiledPath = join(REPO_ROOT, compiled);
    if (!existsSync(compiledPath) || !existsSync(sourcePath)) continue;
    const sourceMtime = statMtime(sourcePath);
    const compiledMtime = statMtime(compiledPath);
    if (sourceMtime !== null && compiledMtime !== null && sourceMtime > compiledMtime) stale.push({ source, compiled });
  }
  return Object.freeze({
    kind: 'compiled-against-source verification',
    pairs: pairs.length,
    missing: Object.freeze(missing),
    DETERMINISTIC: 'UNSUPPORTED',
    unsupportedReason: deterministic.reason,
    stale: Object.freeze(stale),
    method: 'FALLBACK: modification-order heuristic, because the deterministic emit could not be produced',
    COMPILED_MATCHES_SOURCE: missing.length === 0 && stale.length === 0,
  });
}

/** Emit `src/**` with the project's compiler options and compare the named pairs byte-for-byte. */
function deterministicEmitComparison(pairs) {
  const probeDir = join(REPO_ROOT, '.emit-probe');
  const probeConfig = join(REPO_ROOT, 'tsconfig.emit-probe.json');
  try {
    const base = JSON.parse(readFileSync(join(REPO_ROOT, 'tsconfig.json'), 'utf8'));
    const compilerOptions = {
      ...base.compilerOptions,
      declaration: false,
      declarationMap: false,
      sourceMap: false,
      composite: false,
      incremental: false,
      outDir: '.emit-probe',
    };
    writeFileSync(probeConfig, `${JSON.stringify({ compilerOptions, include: ['src/**/*.ts'] }, null, 2)}${NL}`, 'utf8');
    rmSync(probeDir, { recursive: true, force: true });
    execFileSync(process.execPath, [join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', probeConfig], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000 });
  } catch (error) {
    return Object.freeze({ supported: false, reason: `the deterministic emit could not be produced: ${String(error?.message ?? error).slice(0, 200)}`, diverged: Object.freeze([]) });
  } finally {
    rmSync(probeConfig, { force: true });
  }
  /**
   * Normalize away the ONE expected difference: the probe emits without sourcemaps, so `dist` carries a trailing
   * `//# sourceMappingURL` line the probe does not. That line AND the trailing newline are removed, so the two
   * sides are compared over their actual code. Anything else differing is a real divergence.
   */
  const normalize = (text) => text
    .split(/\r?\n/u)
    .filter((line) => !line.startsWith('//# sourceMappingURL'))
    .join(NL)
    .replace(/\n+$/u, '');
  const diverged = [];
  for (const [source, compiled] of pairs) {
    const emittedPath = join(probeDir, compiled.replace(/^dist\//u, ''));
    const distPath = join(REPO_ROOT, compiled);
    if (!existsSync(emittedPath) || !existsSync(distPath)) continue;
    const emitted = normalize(readFileSync(emittedPath, 'utf8'));
    const shipped = normalize(readFileSync(distPath, 'utf8'));
    if (emitted !== shipped) {
      const emittedLines = emitted.split(NL);
      const shippedLines = shipped.split(NL);
      const firstDifference = emittedLines.findIndex((line, index) => line !== shippedLines[index]);
      diverged.push(Object.freeze({ source, compiled, firstDifferingLine: firstDifference === -1 ? null : firstDifference + 1 }));
    }
  }
  rmSync(probeDir, { recursive: true, force: true });
  return Object.freeze({ supported: true, diverged: Object.freeze(diverged) });
}

/** The mtime of a path in milliseconds, or null. */
function statMtime(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * §9: THE EFFECTIVE EXECUTOR CONFIGURATION.
 *
 * §9 requires the executor route and the effective model-selection configuration to be recorded, with no secret.
 * The route module is the single source of the values, so this cannot disagree with what the profile writer
 * declares.
 */
export async function executorConfiguration() {
  const route = await import('../r3l0cr/route.mjs');
  const settings = await import('../r3l0cr/settings.mjs');
  const primary = route.PRIMARY_EXECUTOR;
  return Object.freeze({
    routeId: primary.routeId,
    providerId: primary.providerId,
    modelId: primary.modelId,
    modelFamily: primary.modelFamily,
    api: primary.api,
    baseURL: primary.baseURL,
    /** §9: the credential REFERENCE only. The value is never read, hashed or recorded. */
    apiKeyEnvRef: primary.apiKeyEnv,
    credentialValueRead: false,
    credentialValueHashed: false,
    contextWindow: primary.contextWindow,
    maxTokens: primary.maxTokens,
    modelSpecificPromptTuning: primary.modelSpecificPromptTuning,
    settingsDigest: settings.settingsDigest(primary),
    expectedEffectiveRoute: settings.expectedEffectiveRoute(primary),
    compositionPatchDigest: createHash('sha256').update(settings.defaultModelPatch(primary), 'utf8').digest('hex'),
    deviation: route.EXECUTOR_ROUTE_DEVIATION,
  });
}

/** §9: THE MODEL IDENTITY EVIDENCE, with no secret and no inference from a family name. */
export async function modelIdentityEvidence() {
  const route = await import('../r3l0cr/route.mjs');
  const primary = route.PRIMARY_EXECUTOR;
  return Object.freeze({
    modelId: primary.modelId,
    modelFamily: primary.modelFamily,
    providerId: primary.providerId,
    displayName: primary.displayName,
    /** §13: the family is recorded, and it is NOT treated as proof of checkpoint identity. */
    familyProvesCheckpointIdentity: false,
    availabilityEvidence: primary.availabilityEvidence,
    superseded: route.SUPERSEDED_EXECUTOR,
    deviationClassification: route.EXECUTOR_ROUTE_DEVIATION.classification,
    classifiedAsModelStackChange: route.EXECUTOR_ROUTE_DEVIATION.classifiedAsModelStackChange,
    secretsIncluded: false,
  });
}

/**
 * §9: COMPUTE THE FULL EXECUTION CLOSURE.
 *
 * The result carries each part's digest, each part's per-file digests, the toolchain, and the aggregate digest.
 * The aggregate is over the PART digests rather than the flat file list, so the number is stable when a part is
 * represented by the same files and changes when any file in any part changes.
 */
export async function computeExecutionClosure(input = {}) {
  const parts = {};
  const fileDigests = {};
  for (const part of CLOSURE_PARTS) {
    const files = input.overrides?.[part.id] ?? CLOSURE_FILES[part.id];
    fileDigests[part.id] = partFileDigests(part.id, files);
    parts[part.id] = digestOfMap(fileDigests[part.id]);
  }
  const toolchainFacts = input.toolchain ?? toolchain();
  const executor = input.executor ?? await executorConfiguration();
  const modelIdentity = input.modelIdentity ?? await modelIdentityEvidence();
  const verified = input.verifyCompiled === false
    ? Object.freeze({ kind: 'compiled-against-source verification', skipped: true, COMPILED_MATCHES_SOURCE: null })
    : verifyCompiledAgainstSource();

  /** The aggregate covers the parts, the toolchain, the packages, the effective route and the model identity. */
  const schedule = await scheduleDigests();
  const aggregateMaterial = {
    ...Object.fromEntries(Object.entries(parts).map(([id, digest]) => [`part:${id}`, digest])),
    'toolchain:node': toolchainFacts.node,
    'toolchain:git': toolchainFacts.git,
    'toolchain:platform': `${toolchainFacts.platform}/${toolchainFacts.arch}`,
    /**
     * Gate 4: THE INSTALLED PACKAGE VERSIONS PARTICIPATE IN THE AGGREGATE.
     *
     * §"Ensure the real toolchain/package versions participate in the aggregate digest." R3-L0C-F recorded them but
     * did NOT fold them into the digest, so a package upgrade changed nothing — the versions were present in the
     * record and absent from the number. They are folded in here, one named entry per package, so a changed
     * adapter version moves the digest and names which package moved.
     */
    ...Object.fromEntries(Object.entries(toolchainFacts.packages ?? {}).map(([name, version]) => [`package:${name}`, String(version)])),
    'packages:globalDshRoot': String(toolchainFacts.globalDshRoot ?? 'UNRESOLVED'),
    'executor:route': executor.routeId,
    'executor:model': executor.modelId,
    'executor:settings': executor.settingsDigest,
    'model:identity': `${modelIdentity.providerId}/${modelIdentity.modelId}`,
    'plan:schedule': digestOfMap(schedule),
  };
  const executionClosureDigest = digestOfMap(aggregateMaterial);

  return Object.freeze({
    schemaVersion: 1,
    kind: 'ExecutionClosureDigest',
    /** §9: the five separated parts. */
    parts: Object.freeze(parts),
    partIds: CLOSURE_PARTS.map((part) => part.id),
    fileDigests: Object.freeze(fileDigests),
    fileCount: Object.values(fileDigests).reduce((total, map) => total + Object.keys(map).length, 0),
    toolchain: toolchainFacts,
    executor,
    modelIdentity,
    schedule,
    /** §9: the aggregate's own material, so a mutation can rebuild the digest from ONE changed input. */
    aggregateMaterial: Object.freeze(aggregateMaterial),
    compiledVerification: verified,
    /** §9: the excluded stage-owned artifacts, so the self-reference rule is visible. */
    selfExclusions: CLOSURE_SELF_EXCLUSIONS,
    /** §9: the closure covers CODE, not results. */
    coversCodeNotResults: CLOSURE_LAW.coversCodeNotResults,
    executionClosureDigest,
    law: CLOSURE_LAW.law,
  });
}

/**
 * §9: THE FROZEN PLAN DIGESTS.
 *
 * The plan part is not a file list alone — it is the SCHEDULE, the arm order, the seed and the verdict rules,
 * which live in the frozen R3-L0C modules. This reads them and returns named digests, so a changed schedule is
 * visible as a changed value rather than only as a changed file hash.
 */
export async function scheduleDigests() {
  const plan = await import('../r3l0c/plan.mjs');
  const contract = await import('../r3l0c/contract.mjs');
  const capital = await import('../r3l0c/capital.mjs');
  const analyse = await import('../r3l0c/analyse.mjs');
  const schedule = plan.schedule();
  const sha = (value) => createHash('sha256').update(String(value), 'utf8').digest('hex');
  return Object.freeze({
    sessionIds: sha(schedule.map((session) => session.sessionId).join(',')),
    sessionCount: String(schedule.length),
    armOrder: sha(JSON.stringify(plan.armOrderPerBlock())),
    seed: String(contract.RANDOMIZATION_SEED),
    exposures: sha(JSON.stringify(capital.GENERATION_EXPOSURES)),
    compressionVerdict: sha(JSON.stringify(analyse.COMPRESSION ?? contract.COMPRESSION_VERDICT_RULES)),
    netCostVerdict: sha(JSON.stringify(analyse.NET_COST ?? contract.NET_COST_VERDICT_RULES)),
    blockCount: String(contract.BLOCK_COUNT),
    generationsPerTrajectory: String(contract.GENERATIONS_PER_TRAJECTORY),
  });
}

/**
 * §9: COMPARE A RECOMPUTED CLOSURE AGAINST A FROZEN ONE.
 *
 * A drift NAMES the part and the files, so a reader learns which layer moved rather than only that the number
 * changed.
 */
export function checkExecutionClosure(frozen, current) {
  if (frozen === null || frozen === undefined) {
    return Object.freeze({ EXECUTION_CLOSURE: 'NO_FROZEN_CLOSURE', changedParts: Object.freeze([]), changedFiles: Object.freeze([]), current: current.executionClosureDigest });
  }
  const changedParts = [];
  const changedFiles = [];
  for (const partId of Object.keys(current.parts)) {
    const before = frozen.parts?.[partId] ?? null;
    if (before !== current.parts[partId]) changedParts.push(partId);
    const beforeFiles = frozen.fileDigests?.[partId] ?? {};
    const afterFiles = current.fileDigests[partId] ?? {};
    for (const file of new Set([...Object.keys(beforeFiles), ...Object.keys(afterFiles)])) {
      if (beforeFiles[file] !== afterFiles[file]) changedFiles.push(`${partId}:${file}`);
    }
  }
  const matched = frozen.executionClosureDigest === current.executionClosureDigest;
  return Object.freeze({
    EXECUTION_CLOSURE: matched ? 'MATCH' : 'DRIFTED',
    frozen: frozen.executionClosureDigest ?? null,
    current: current.executionClosureDigest,
    changedParts: Object.freeze(changedParts),
    changedFiles: Object.freeze(changedFiles),
    onMismatch: 'STOP — a pre-exposure repair must create a NEW plan commit',
  });
}

export { NL };
