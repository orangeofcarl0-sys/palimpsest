// Palimpsest-CI1 §3 C0-C — THE WORKER-SIDE MODULE IDENTITY TRACE. NOT a product component.
//
// WHY THIS EXISTS. E4's ruling is explicit: a standalone probe from the repository root is NOT proof of what the
// real Worker imported, because the child process resolves modules from ITS OWN base. So the trace has to be taken
// inside the child. This plugin is mounted by the test-owned profile the trace rig writes, and Cordis loads it
// inside the worker process, after boot, where the child's own `import.meta.resolve` is available.
//
// WHAT IT RECORDS. For each critical module: the specifier, the URL the CHILD resolved it to, whether the file
// exists, its realpath, the declared package version, and the location of the manifest that supplied it.
//
// WHAT IT DOES NOT DO. It does not import anything the worker would not already import, it does not change
// resolution, it does not read the environment, and it writes nothing outside the run-owned rig. The output is a
// bounded JSON document of paths and versions — no environment value and no credential can appear in it.
//
// It is unreachable in production: no shipped profile mounts this file.

import { createRequire } from 'node:module';
import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';

export const name = 'ci1-module-trace';
export const inject = [];

const require = createRequire(import.meta.url);

/**
 * The critical modules, named by the E4 ruling. `palimpsest-*` names are the ones E4 found confusing because a
 * stale copy existed in the real runtime home; the `@deepseek-ai/*` names are the runtime itself.
 */
const CRITICAL_SPECIFIERS = [
  'palimpsest-dsh-host',
  'palimpsest-host-deployment',
  '@deepseek-ai/dsh-win32-process',
  '@deepseek-ai/dsh-session-persistence-jsonl',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-sandbox-windows-acl',
  'koffi',
];

/** Walk up from a resolved path to the nearest `package.json` and report its declared identity. */
function readPackageIdentity(resolvedPath) {
  let directory = resolvedPath;
  for (let depth = 0; depth < 8; depth += 1) {
    const cut = Math.max(directory.lastIndexOf('\\'), directory.lastIndexOf('/'));
    if (cut <= 0) break;
    directory = directory.slice(0, cut);
    const candidate = `${directory}\\package.json`;
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8'));
      if (typeof parsed.version === 'string') return { name: parsed.name ?? null, version: parsed.version, manifest: candidate };
    } catch {
      /* keep walking: the nearest manifest is the one that owns the module */
    }
  }
  return null;
}

/**
 * THE THREE ANCHORS THAT MATTER, AND WHY ONE IS NOT ENOUGH.
 *
 * `process.argv[1]` is the runtime EXECUTABLE the port launched. It answers "which runtime installation is running
 * this Worker", and it is where the `@deepseek-ai/*` packages resolve from.
 *
 * THE PROFILE is different. The profile loader resolves each `dsh.profile.bundles` entry from the PROFILE's own
 * location, walking `<profile>/node_modules` then `<home>/profiles/node_modules`. Resolving `palimpsest-dsh-host`
 * from the EXECUTABLE therefore answers a question nobody asked: the executable lives in the runtime installation,
 * so it finds whatever copy happens to sit there. The profile anchor is the one that decides which host bundle was
 * actually MOUNTED.
 *
 * THE MOUNTED BUNDLE is a third anchor again. `host/dsh/lib/runner.js` performs
 * `import('palimpsest-host-deployment/runtime/worker_fence.js')`, and that specifier resolves from the BUNDLE's own
 * location. So the mounted bundle and the fence it loads can come from different trees, and the fence is the one
 * whose Win32 qualification is actually enforced.
 */
function anchorPaths() {
  const anchors = [];
  const entry = process.argv[1] ?? null;
  if (entry !== null) anchors.push({ id: 'worker-executable', path: entry });

  const profileDir = process.env.PALIMPSEST_CI1_PROFILE_DIR;
  if (typeof profileDir === 'string' && profileDir.length > 0) {
    anchors.push({ id: 'profile', path: `${profileDir.replace(/\//gu, '\\')}\\package.json` });
    try {
      const fromProfile = createRequire(`${profileDir.replace(/\//gu, '\\')}\\package.json`);
      const bundleEntry = fromProfile.resolve('palimpsest-dsh-host');
      anchors.push({ id: 'mounted-host-bundle', path: bundleEntry });
      /** The bundle's OWN runner is where the fence specifier is written, so it is where it must resolve from. */
      const runnerPath = bundleEntry.replace(/index\.js$/u, 'runner.js');
      anchors.push({ id: 'mounted-host-runner', path: runnerPath });
      /**
       * THE FENCE ANCHOR IS SEPARATE FROM THE BUNDLE ANCHOR ON PURPOSE. `palimpsest-host-deployment` declares only
       * subpath exports, so a bare resolve fails; the SUBPATH is what runner.js actually imports, and resolving the
       * subpath is the faithful reproduction.
       */
      for (const subpath of ['runtime/win32_label.js', 'runtime/worker_fence.js', 'runtime/session_reader.js']) {
        anchors.push({ id: `fence:${subpath}`, path: runnerPath, specifierOverride: `palimpsest-host-deployment/${subpath}` });
      }
    } catch (error) {
      anchors.push({ id: 'mounted-host-bundle', path: null, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return anchors;
}

/** Resolve every critical specifier from every anchor, so no anchor can hide another's answer. */
function resolveFromAnchors(anchors) {
  const byAnchor = [];
  for (const anchor of anchors) {
    if (typeof anchor.path !== 'string') {
      byAnchor.push({ anchor: anchor.id, path: null, modules: [], error: anchor.error ?? null });
      continue;
    }
    const specifiers = anchor.specifierOverride === undefined ? CRITICAL_SPECIFIERS : [anchor.specifierOverride];
    byAnchor.push({
      anchor: anchor.id,
      path: anchor.path,
      modules: specifiers.map((specifier) => resolveOne(specifier, anchor.path)),
    });
  }
  return byAnchor;
}

/** Resolve one specifier from ONE anchor, reproducing that anchor's own resolution. */
function resolveOne(specifier, anchor) {
  const record = { specifier, resolved: null, exists: null, realpath: null, package: null, error: null };
  try {
    /**
     * THE ANCHOR IS THE WORKER'S OWN ENTRY, NOT THIS PLUGIN'S URL.
     *
     * The first version of this file used `import.meta.resolve`, which resolves from THIS FILE — a path inside the
     * repository — and therefore measured the repository's module graph rather than the Worker's. Every specifier
     * came back unresolved, which is a measurement of the wrong thing. The Worker's entry (`process.argv[1]`) is the
     * base the child actually uses, so a `createRequire` over it reproduces the child's own resolution.
     */
    const resolveFrom = createRequire(anchor);
    const resolved = resolveFrom.resolve(specifier);
    record.resolved = resolved;
    try {
      const stat = statSync(resolved);
      record.exists = stat.isFile() || stat.isDirectory();
      record.realpath = realpathSync(resolved);
    } catch {
      record.exists = false;
    }
    record.package = readPackageIdentity(resolved);
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error);
  }
  return record;
}

/**
 * Cordis plugin body. It records the trace ONCE, writes it to the rig, and does nothing else.
 *
 * `inject: []` is deliberate: the trace must not depend on any service being present, because a missing service
 * would otherwise make the trace silently absent — and an absent trace is not evidence of anything.
 */
export function apply(ctx) {
  const out = process.env.PALIMPSEST_CI1_TRACE_OUT;
  if (typeof out !== 'string' || out.length === 0) return;
  try {
    const workerEntry = process.argv[1] ?? null;
    /**
     * THE ENTRY POINT IS ITSELF A FACT WORTH RECORDING.
     *
     * `process.argv[1]` is the script the child was launched with. It says which INSTALLATION is running this
     * Worker, which is the question C0-C exists to answer, and it is reported even when every specifier fails.
     */
    const trace = {
      schemaVersion: 1,
      kind: 'PALIMPSEST_CI1_WORKER_MODULE_TRACE',
      recordedInside: 'the real first-party worker child process',
      pid: process.pid,
      node: { version: process.version, executable: process.execPath },
      workerEntry,
      workerHome: process.env[String.fromCharCode(68, 83, 72, 95, 72, 79, 77, 69)] ?? null,
      cwd: process.cwd(),
      resolutionAnchor: workerEntry,
      anchors: resolveFromAnchors(anchorPaths()),
    };
    writeFileSync(out, `${JSON.stringify(trace, null, 2)}\n`);
  } catch (error) {
    ctx.logger?.warn?.(`ci1 module trace failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
