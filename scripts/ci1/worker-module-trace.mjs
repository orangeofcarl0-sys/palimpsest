/**
 * Palimpsest-CI1 §3 C0-C — DRIVE THE REAL WORKER AND COLLECT ITS OWN MODULE TRACE.
 *
 * This is the rig `close-e4-evidence.mjs` invokes. It reuses the E4 live gate's proven recipe — install the host
 * bundle into a run-owned test home, link the shared runtime modules, write a test-owned profile, mount the trace
 * plugin — and then runs the REAL `dshSubprocessWorkWorkerPort` against a bounded deterministic task.
 *
 * WHY A SEPARATE RIG RATHER THAN A FLAG ON THE E4 GATE. The E4 gate's job is to produce a PASS/FAIL qualification.
 * This rig's job is to produce a TRACE. Mixing them would let a trace-only run be mistaken for a qualification run,
 * and the E4 gate is frozen evidence that must not acquire new behaviour.
 *
 * WHAT IT PROVES. The trace is written by the plugin from inside the worker child, so the resolved paths are the
 * child's own. The rig reports the trace, the worker's session identity, and the parent outcome as SEPARATE facts.
 *
 * SAFETY. Run-owned root under a private gate root, disposed by the caller through the E3 quarantine path. No model
 * is called: the mounted probe tool is unclassified, so the SHIPPED fail-closed capability refusal fires — the same
 * deterministic no-model stop the E4 gate uses.
 *
 * Usage (invoked by close-e4-evidence.mjs):
 *   node scripts/ci1/worker-module-trace.mjs --rig=<run-owned-dir>
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { applyRuntimeHome, captureRuntimeHome, restoreRuntimeHome, runtimeHomePath } from "../gates/runtime-home.mjs";
import * as rig from "../trajectory_p2b/rig.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);

const REPO = resolve(import.meta.dirname, "..", "..");
const RIG_ARG = args.get("rig");
if (typeof RIG_ARG !== "string" || RIG_ARG.length === 0) {
  process.stderr.write("--rig is required\n");
  process.exit(2);
}
/**
 * THE RIG MUST BE ABSOLUTE.
 *
 * The profile's `cordis.patch.yml` embeds the deployment profile path, and the runtime resolves it relative to
 * the CHILD's cwd (the world directory), not to the repo. A relative `--rig` therefore produced a relative
 * `deploymentProfile` that the child could not resolve, and the symptom was a `kernel-coverage` refusal that
 * looked like a policy problem rather than a path problem. Resolving once, here, removes the whole class.
 */
const RIG = resolve(RIG_ARG);

const REAL_runtime_HOME = runtimeHomePath().replace(/\\/gu, "/");
const REAL_MODULES = join(REAL_runtime_HOME, "profiles", "node_modules");
const PROFILE = "ci1-trace";

const HOME = join(RIG, "home");
const WORLD = join(RIG, "world");
const TRACE_OUT = join(RIG, "worker-module-trace.json");
mkdirSync(WORLD, { recursive: true });
mkdirSync(join(HOME, "profiles"), { recursive: true });

/** Install the host bundle into the TEST home, exactly as the live gate does, so the child's base is the test home. */
const installHostBundle = (home) => {
  const nodeModules = join(home, "profiles", "node_modules");
  mkdirSync(nodeModules, { recursive: true });
  for (const [source, name] of [
    [join(REPO, "host", "dsh"), "palimpsest-dsh-host"],
    [join(REPO, "host", "deployment"), "palimpsest-host-deployment"],
  ]) {
    const target = join(nodeModules, name);
    rmSync(target, { recursive: true, force: true });
    cpSync(source, target, { recursive: true });
  }
};

installHostBundle(HOME);
/**
 * THE SHARING STEP DELEGATES TO THE RIG.
 *
 * The rig's `linkSharedModules` already declares the two caller-installed host bundles AND checks them against the
 * fingerprints of the trees `installHostBundle` copies from. Re-implementing that here would create a second
 * destination-admission path — the exact drift E3 spent a stage removing — and my first version of this file did
 * re-implement it, which refused both bundles and failed the worker boot.
 */
const sharing = rig.linkSharedModules(HOME);

const profileDir = join(HOME, "profiles", PROFILE);
mkdirSync(profileDir, { recursive: true });
writeFileSync(
  join(profileDir, "package.json"),
  `${JSON.stringify(
    {
      name: `dsh-profile-${PROFILE}`,
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], patchReload: "startup" } },
    },
    null,
    2,
  )}\n`,
);

const tracePluginUrl = pathToFileURL(join(REPO, "scripts", "ci1", "worker-trace-plugin.mjs")).href;
const refusalProbeUrl = pathToFileURL(join(REPO, "scripts", "trajectory_p2a", "refusal-probe-plugin.mjs")).href;
writeFileSync(
  join(profileDir, "cordis.patch.yml"),
  [
    "- id: palimpsest-tools",
    "  config:",
    `    palimpsestEntry: '${join(REPO, "dist", "src", "advanced.js").replace(/\\/gu, "/")}'`,
    `    deploymentProfile: '${join(profileDir, "deployment.json").replace(/\\/gu, "/")}'`,
    "    serve: false",
    "    openDashboard: false",
    "",
    "- insert:",
    ...(process.env.PALIMPSEST_CI1_NO_TRACE === "1" ? [] : ["    - id: ci1-module-trace", `      name: '${tracePluginUrl}'`]),
    "    - id: ci1-refusal-probe",
    `      name: '${refusalProbeUrl}'`,
    "",
  ].join("\n"),
);
writeFileSync(
  join(profileDir, "deployment.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      profileId: PROFILE,
      projectId: "ci1",
      localPeer: "ci1-peer",
      persistentPoint: "pp-ci1",
      transport: { namespace: PROFILE, databasePath: join(RIG, "transport.sqlite") },
      databases: { orchestration: join(RIG, "orch.sqlite"), ordarium: join(RIG, "ord.sqlite") },
      reasoning: {},
      execution: "worktree",
      concurrency: 1,
      policy: {},
      standard: { statement: "ci1 trace" },
    },
    null,
    2,
  )}\n`,
);

if (!existsSync(join(REPO, "dist", "src", "advanced.js"))) {
  process.stdout.write(`${JSON.stringify({ traced: false, blocker: "dist/src/advanced.js is absent; build first" }, null, 2)}\n`);
  process.exit(1);
}

const context = {
  work: {
    projectGoal: "CI1 module identity trace",
    requirements: [],
    decisions: [],
    objective: "record which modules the worker resolves",
    writeScope: [],
    requiredArtifacts: [],
    baseCommit: "0".repeat(40),
    completionChecks: [],
    independentVerificationRequired: false,
  },
  compiled: { manifestId: "m", boot: [], handles: [] },
};

const workWorker = await import(pathToFileURL(join(REPO, "dist", "src", "deployment", "work_worker.js")).href);

/**
 * THE TRACE OUTPUT PATH REACHES THE CHILD THROUGH ITS ENVIRONMENT.
 *
 * The child gets a fresh environment, so this must be set before the port spawns it, and it must be an ABSOLUTE
 * path because the child's cwd is the world directory rather than the repository.
 */
const previousHome = captureRuntimeHome();
applyRuntimeHome(HOME);
process.env.PALIMPSEST_CI1_TRACE_OUT = TRACE_OUT;
/** The trace resolves the mounted bundle from the PROFILE, so the profile directory must reach the child. */
process.env.PALIMPSEST_CI1_PROFILE_DIR = profileDir.replace(/\\/gu, "/");

const observations = [];
let outcome;
try {
  const port = workWorker.dshSubprocessWorkWorkerPort({
    dshBin: process.env.PALIMPSEST_runtime_BIN ?? join(REAL_MODULES, "@deepseek-ai", "dsh", "lib", "bin.js"),
    profile: PROFILE,
    timeoutMs: 240_000,
  });
  outcome = await port.run({
    workDir: WORLD,
    context,
    sessionSourceQualification: "FIRST_PARTY_runtime_QUALIFIED",
    observeSessionIdentity: (observation) => observations.push(observation),
  });
} finally {
  restoreRuntimeHome(previousHome);
  delete process.env.PALIMPSEST_CI1_TRACE_OUT;
  delete process.env.PALIMPSEST_CI1_PROFILE_DIR;
}

const identity = observations.length > 0 ? observations[0] : null;
const trace = existsSync(TRACE_OUT) ? JSON.parse(readFileSync(TRACE_OUT, "utf8")) : null;

/**
 * CLASSIFY EACH RESOLUTION BY WHICH TREE IT CAME FROM.
 *
 * This is the question E4 could not answer: a `palimpsest-*` module resolved from the real runtime home is a copy
 * OUTSIDE the frozen tree, one resolved from the run-owned test home is THIS RUN's bundle, and one resolved from
 * the repository is the source checkout. The classification is derived from the resolved path, not the specifier.
 */
const classify = (realpath) => {
  if (typeof realpath !== "string") return "UNRESOLVED";
  const normalised = realpath.replace(/\\/gu, "/").toLowerCase();
  if (normalised.startsWith(HOME.replace(/\\/gu, "/").toLowerCase())) return "RUN_OWNED_TEST_HOME";
  if (normalised.startsWith(REPO.replace(/\\/gu, "/").toLowerCase())) return "REPOSITORY_CHECKOUT";
  if (normalised.startsWith(REAL_runtime_HOME.replace(/\\/gu, "/").toLowerCase())) return "REAL_runtime_HOME";
  return "EXTERNAL_RUNTIME_INSTALL";
};

const classifiedAnchors = (trace?.anchors ?? []).map((anchor) => ({
  anchor: anchor.anchor,
  path: anchor.path,
  modules: (anchor.modules ?? []).map((entry) => ({ ...entry, tree: classify(entry.realpath) })),
}));

/**
 * THE FENCE QUESTION, ANSWERED SEPARATELY.
 *
 * The Win32 qualification actually ENFORCED is the one in the copy that the mounted bundle's `runner.js` loads when
 * it imports `palimpsest-host-deployment/runtime/win32_label.js`. That is the `fence:runtime/win32_label.js`
 * anchor's resolution — not the executable's, and not the bundle's bare-name resolution. Reporting only the
 * executable's answer would repeat the E4 confusion.
 */
const fenceAnchor = classifiedAnchors.find((entry) => entry.anchor === "fence:runtime/win32_label.js") ?? null;
const fenceModule = fenceAnchor?.modules[0] ?? null;

/**
 * Read the file the fence would ACTUALLY load and report the `qualifiedVersion` literal it declares. This is the
 * difference between "the repo says rc.3" and "the code that ran says rc.3".
 */
const fencePin = (() => {
  if (typeof fenceModule?.realpath !== "string") return null;
  try {
    const source = readFileSync(fenceModule.realpath, "utf8");
    const match = /qualifiedVersion:\s*'([^']+)'/u.exec(source);
    const previous = /previouslyQualifiedVersion:\s*'([^']+)'/u.exec(source);
    /**
     * The session-reader helper lives in a SIBLING file, so it is read from there rather than from the fence. Its
     * presence distinguishes the rc.3-capable deployment copy from the pre-E4 one.
     */
    const readerPath = join(dirname(fenceModule.realpath), "session_reader.js");
    let carriesHelper = null;
    try {
      carriesHelper = /resolvePersistencePlugin/u.test(readFileSync(readerPath, "utf8"));
    } catch {
      carriesHelper = null;
    }
    return {
      path: fenceModule.realpath.replace(/\\/gu, "/"),
      declaredQualifiedVersion: match === null ? null : match[1],
      declaredPreviouslyQualifiedVersion: previous === null ? null : previous[1],
      siblingSessionReader: readerPath.replace(/\\/gu, "/"),
      carriesResolvePersistencePlugin: carriesHelper,
    };
  } catch (error) {
    return { declaredQualifiedVersion: null, error: error instanceof Error ? error.message : String(error) };
  }
})();

process.stdout.write(
  `${JSON.stringify(
    {
      traced: trace !== null,
      rig: RIG.replace(/\\/gu, "/"),
      profile: PROFILE,
      moduleSharing: {
        established: sharing.established,
        strategy: sharing.strategy,
        entries: sharing.entries ?? null,
        linked: sharing.linked ?? null,
        refused: sharing.refused ?? null,
        provenance: sharing.provenance ?? null,
      },
      parentOutcomeKind: outcome.kind,
      parentFailureDetail: outcome.kind === "HOST_FAILURE" ? (outcome.detail ?? null).slice(0, 500) : null,
      identityObservationCount: observations.length,
      observedSessionId: identity?.dshSessionId ?? null,
      observedInvocationId: identity?.invocationId ?? null,
      observedState: identity?.observationState ?? null,
      traceRecordedInsideWorker: trace !== null,
      tracePid: trace?.pid ?? null,
      workerEntry: trace?.workerEntry ?? null,
      workerHome: trace?.workerHome ?? null,
      anchors: classifiedAnchors,
      fence: { anchor: "mounted-host-bundle", module: fenceModule, pin: fencePin },
      /**
       * THE SEPARATION E4 ASKED FOR. Each of these is a distinct claim and none implies another.
       */
      facts: {
        traceWasProducedByTheChild: trace !== null && typeof trace.pid === "number" && trace.pid !== process.pid,
        runtimeResolvedFromExternalInstall: classifiedAnchors
          .find((entry) => entry.anchor === "worker-executable")
          ?.modules.filter((entry) => entry.specifier.startsWith("@deepseek-ai/"))
          .every((entry) => entry.tree === "EXTERNAL_RUNTIME_INSTALL") ?? false,
        hostBundleResolvedFromRunOwnedHome:
          classifiedAnchors.find((entry) => entry.anchor === "mounted-host-bundle")?.modules[0]?.tree === "RUN_OWNED_TEST_HOME",
        fenceLoadsFromRunOwnedHome: fenceModule?.tree === "RUN_OWNED_TEST_HOME",
        fenceLoadsFromRealRuntimeHome: fenceModule?.tree === "REAL_runtime_HOME",
        fenceDeclaredPin: fencePin?.declaredQualifiedVersion ?? null,
        /** The claim that matters: does the code that RAN declare the pin this stage adopted? */
        enforcedPinMatchesAdoptedPin: fencePin?.declaredQualifiedVersion === "0.2.1-rc.3",
      },
    },
    null,
    2,
  )}\n`,
);
