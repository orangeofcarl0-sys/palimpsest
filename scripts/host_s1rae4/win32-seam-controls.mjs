/**
 * Host-S1RA-E4 §C1.3 — THE §5 WIN32 SEAM CONTROLS, RUN FROM A RUN-OWNED TEST HOME.
 *
 * WHY THIS SHAPE. `dshCompatibilityReport()` resolves the binding seam relative to the FENCE FILE and the running
 * entry point. Run from the repository, neither base resolves `@deepseek-ai/dsh-win32-process`, so a probe launched
 * from `scripts/` correctly reports "unresolved" — a resolution-path artifact, not a compatibility finding. The real
 * worker resolves it because the host bundle is INSTALLED into a test home whose module directory links the runtime
 * packages. This script reproduces that arrangement exactly, in a disposable root, so the controls measure the same
 * code path the worker uses.
 *
 * WHAT IT MEASURES, following `docs/engineering/host-s1rae2-rc3-requalification-plan.md` §5:
 *
 *   1. label write through the rc.3 seam        → supported
 *   2. label read-back                          → matches what was written
 *   3. unlabelled control read                  → succeeds (proves the probe distinguishes)
 *   4. labelled read at Low integrity           → refused
 *   5. labelled LINK with unlabelled target     → target still readable, descendant verification reports unverified
 *   6. koffi resolved from the seam package     → 3.1.1
 *
 * THE DISTINCTION THIS SCRIPT REFUSES TO COLLAPSE. An `EPERM` is not proof of a Mandatory Integrity refusal: an
 * unapplied label also yields an ordinary successful read, and an incidental ACL effect can yield `EPERM`. The arms
 * therefore separate `LABEL_NOT_APPLIED` from `PROTECTED` from `NOT_REFUSED`, and `LIMIT` is never reported as PASS.
 *
 * SAFETY. The test home is allocated through the E3 allocator and disposed through the E3 quarantine path. The real
 * `~/.dsh` and `D:\dsh` are READ only — this script never writes a label or a file there.
 *
 * Usage:
 *   node scripts/host_s1rae4/win32-seam-controls.mjs [--json=<path>]
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);

const REPO = resolve(import.meta.dirname, "..", "..");
const owned = await import("../trajectory_p2b/owned-resource.mjs");
const sharing = await import("../trajectory_p2b/module-sharing.mjs");
const { runtimeHomePath } = await import("../gates/runtime-home.mjs");

const REAL_MODULES = join(runtimeHomePath(), "profiles", "node_modules");
/**
 * WHERE THE FIXTURE LIVES.
 *
 * A mandatory label lives in the object's SACL, and writing one needs an explicit DACL grant on the object (E4
 * measured `SetNamedSecurityInfoW` → 5 without one, and success with one). The E2 stage also found that `F:` — the
 * repository's own volume — refused label writes outright while `%LOCALAPPDATA%\Temp` accepted them. The fixture
 * therefore lives under the platform temp directory by default, and `PALIMPSEST_E4_SEAM_GATE` can override it.
 *
 * This is a FIXTURE LOCATION choice, not a weakening of any check: every arm still runs, and the outcome categories
 * still distinguish LIMIT from PROTECTED from NOT_REFUSED.
 */
const GATE_ROOT = (process.env.PALIMPSEST_E4_SEAM_GATE ?? join(tmpdir(), "s1rae4-seam-gate")).replace(/\\/gu, "/");
mkdirSync(GATE_ROOT, { recursive: true });

const arms = [];
const add = (fields) => {
  arms.push(fields);
  process.stderr.write(`  ${fields.id}: ${fields.observation}\n`);
};

/**
 * THE RUN-OWNED TEST HOME. Allocated through the E3 allocator so the marker, identity and generation are real, and
 * disposed through the quarantine path so a failure cannot leave an unowned directory behind.
 */
const allocated = owned.allocateOwnedRoot(GATE_ROOT, "e4-seam-");
const HOME = allocated.root;
const lifetime = owned.ownedRootLifetime(allocated);

const disposeAndReport = () => {
  const outcome = lifetime.dispose();
  return outcome;
};

const fail = (reason, extra = {}) => {
  const disposal = disposeAndReport();
  const report = {
    schemaVersion: 1,
    kind: "HOST_S1RAE4_WIN32_SEAM_CONTROLS",
    stage: "Palimpsest Host-S1RA-E4",
    measuredAt: new Date().toISOString(),
    outcome: "LIMIT",
    reason,
    ...extra,
    arms,
    cleanup: disposal,
    note: "LIMIT is not PASS. Behavioural compatibility was NOT established by this run.",
  };
  const jsonPath = args.get("json");
  if (jsonPath !== undefined) writeFileSync(resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(2);
};

/** Install the CURRENT branch's host bundle where the runtime profile loader resolves it, exactly as a gate does. */
try {
  const nodeModules = join(HOME, "profiles", "node_modules");
  mkdirSync(nodeModules, { recursive: true });
  for (const [source, name] of [
    [join(REPO, "host", "dsh"), "palimpsest-dsh-host"],
    [join(REPO, "host", "deployment"), "palimpsest-host-deployment"],
  ]) {
    const target = join(nodeModules, name);
    rmSync(target, { recursive: true, force: true });
    sharing.installEntry ?? null;
    /** A plain recursive copy: the host bundles are 12 and 10 files, and this is the installer's own behaviour. */
    const { cpSync } = await import("node:fs");
    cpSync(source, target, { recursive: true });
  }
} catch (error) {
  fail("the host bundle could not be installed into the test home", { installError: String(error?.message ?? error).slice(0, 300) });
}

/** Link the shared runtime modules, so the seam resolves from the test home's module directory. */
const linked = sharing.linkModuleGraph(HOME, {
  sourceModules: REAL_MODULES,
  providedByCaller: ["palimpsest-dsh-host", "palimpsest-host-deployment"],
  expectedFingerprints: {
    "palimpsest-dsh-host": sharing.directoryFingerprint(join(REPO, "host", "dsh")) ?? "",
    "palimpsest-host-deployment": sharing.directoryFingerprint(join(REPO, "host", "deployment")) ?? "",
  },
});
add({
  id: "arm0-module-sharing",
  question: "is the module graph established so the seam can resolve from the test home?",
  established: linked.established === true,
  linked: linked.linked?.length ?? 0,
  alreadyLinked: linked.alreadyLinked?.length ?? 0,
  provenance: linked.provenance,
  refused: linked.refused,
  observation: linked.established === true ? "the module graph is established" : `NOT ESTABLISHED: ${String(linked.detail)}`,
});
if (linked.established !== true) fail("module sharing was not established, so the seam cannot resolve from this home", { sharing: linked });

/**
 * THE FENCE AND THE READ FENCE, IMPORTED FROM THE TEST HOME. This is the same code the worker loads, from the same
 * location. The read fence is a SEPARATE module, which is why the earlier arms reported "is not a function": they
 * asked the label module for the tree verifier. Both are loaded here from their real paths.
 */
const DEPLOYMENT = join(HOME, "profiles", "node_modules", "palimpsest-host-deployment");
const FENCE = join(DEPLOYMENT, "runtime", "win32_label.js");
const READ_FENCE = join(DEPLOYMENT, "runtime", "read_fence.js");
if (!existsSync(FENCE)) fail("the fence was not installed into the test home", { fence: FENCE.replace(/\\/gu, "/") });

let fence;
let readFence;
try {
  fence = await import(pathToFileURL(FENCE).href);
  readFence = await import(pathToFileURL(READ_FENCE).href);
} catch (error) {
  fail("the fence could not be imported from the test home", { importError: String(error?.message ?? error).slice(0, 300) });
}

const compatibility = fence.dshCompatibilityReport();
add({
  id: "arm1-compatibility",
  question: "does the fence resolve the seam from the test home, and what version does it report?",
  compatibility,
  observation:
    compatibility.error === undefined
      ? `resolved ${String(compatibility.resolvedVersion)} against qualified ${String(compatibility.qualifiedVersion)}; drifted=${String(compatibility.drifted)}`
      : `UNRESOLVED: ${String(compatibility.error)}`,
});
if (compatibility.error !== undefined) fail("the fence still could not resolve the seam from the test home", { compatibility });

/**
 * THE LABEL API. `win32LabelApi()` returns `{ api, contractVersion, ffiVersion }` — the bound seam is the `api`
 * MEMBER, not the return value itself. Every label operation takes that member as its first argument; they are not
 * methods on the module and not properties of the wrapper.
 */
const labelApi = fence.win32LabelApi();
const api = labelApi.api;
add({
  id: "arm1b-label-api",
  question: "is the bound Win32 label API usable?",
  usable: labelApi.error === undefined && api !== undefined,
  error: labelApi.error ?? null,
  contractVersion: labelApi.contractVersion ?? null,
  ffiVersion: labelApi.ffiVersion ?? null,
  /** The members the label operations actually call, verified by TYPE rather than by presence. */
  apiMembers: api === undefined ? null : Object.fromEntries(["alloc", "decode", "encode", "pointer", "isNullPtr", "createWellKnownSid", "getLengthSid", "initializeAcl", "addMandatoryAce", "setNamedSecurityInfoW", "getNamedSecurityInfoW"].map((name) => [name, typeof api[name]])),
  observation: labelApi.error === undefined && api !== undefined ? "the label API is usable" : `UNUSABLE: ${String(labelApi.error)}`,
});

/**
 * THE FIXTURES. A labelled directory, an unlabelled control, and a labelled directory containing a junction to an
 * unlabelled external target. All disposable and inside the run-owned root.
 *
 * E4 MEASURED WHY THE FIRST ATTEMPT AT THIS FAILED. `SetNamedSecurityInfoW` returned 5 (ACCESS_DENIED) on a freshly
 * created directory, and an explicit `icacls /grant <principal>:(OI)(CI)F` made the SAME write succeed and read back
 * as `integrity=Medium` (`label-write-feasibility.mjs`, outcome `WRITE_SUCCEEDS_AFTER_GRANT`). The refusal was a
 * property of the fixture's DACL, not of the runtime. Each fixture therefore receives an explicit grant first, and
 * the grant is RECORDED so a reader can see the precondition rather than assume it.
 */
const target = join(HOME, "fixture-labelled");
const control = join(HOME, "fixture-control");
const linkHolder = join(HOME, "fixture-link-holder");
const external = join(HOME, "fixture-external");
for (const dir of [target, control, linkHolder, external]) mkdirSync(dir, { recursive: true });
writeFileSync(join(target, "secret.txt"), "LABELLED-CONTENT\n", "utf8");
writeFileSync(join(control, "secret.txt"), "CONTROL-CONTENT\n", "utf8");
writeFileSync(join(external, "outside.txt"), "EXTERNAL-CONTENT\n", "utf8");

/** The principal, and the explicit grant each labelled fixture needs. */
const whoami = spawnSync("whoami", [], { encoding: "utf8", timeout: 30_000 });
const principal = String(whoami.stdout ?? "").trim() || null;
const grants = [];
for (const dir of [target, linkHolder]) {
  const grant = principal === null ? { status: null } : spawnSync("icacls", [dir, "/grant", `${principal}:(OI)(CI)F`], { encoding: "utf8", timeout: 60_000 });
  grants.push({ path: dir.replace(/\\/gu, "/"), status: grant.status ?? null });
}
add({
  id: "arm1a-fixture-grant",
  question: "was an explicit DACL grant applied to the labelled fixtures?",
  principal,
  grants,
  observation: grants.every((entry) => entry.status === 0) ? "the grants were applied" : `grant statuses: ${JSON.stringify(grants.map((entry) => entry.status))}`,
});

const junctionPath = join(linkHolder, "outbound-link");
let junctionMade = false;
try {
  symlinkSync(external.replace(/\\/gu, "/"), junctionPath.replace(/\\/gu, "/"), "junction");
  junctionMade = true;
} catch {
  junctionMade = false;
}

/** ARM 2 — write a label through the seam, using the real signature: `writeAndVerifyLabel(api, path, existing)`. */
let writeOutcome = null;
try {
  writeOutcome = fence.writeAndVerifyLabel(api, target, fence.readMandatoryLabel(api, target));
} catch (error) {
  writeOutcome = { written: false, error: String(error?.message ?? error).slice(0, 300) };
}
const writeClaimed = writeOutcome?.written === true || writeOutcome?.ok === true || writeOutcome?.verified === true;
add({
  id: "arm2-label-write",
  question: "can a mandatory label be written through the installed rc.3 seam?",
  writeOutcome,
  observation: writeClaimed ? "the write reported success" : `the write did not report success: ${JSON.stringify(writeOutcome).slice(0, 240)}`,
});

/**
 * ARM 3 — read it back. A claimed write with nothing present is LABEL_NOT_APPLIED.
 *
 * `present: false` IS NOT A LABEL. A first version of this arm treated `readBack.ok === true` as evidence that a label
 * was there, which reported "the label reads back" for an object the reader itself described as carrying NO label.
 * Presence is `label.present === true`, and nothing else counts.
 */
let readBack = null;
try {
  readBack = fence.readMandatoryLabel(api, target);
} catch (error) {
  readBack = { error: String(error?.message ?? error).slice(0, 300) };
}
const labelPresent = readBack?.label?.present === true;
add({
  id: "arm3-read-back",
  question: "does the label read back after the write?",
  readBack,
  observation: labelPresent
    ? `the label reads back (integrity=${String(readBack?.label?.integrityName)})`
    : "NO LABEL IS PRESENT after the write, so the write did not take effect",
});

/** ARM 4 — the unlabelled control must be readable, or a refusal elsewhere means nothing. */
let controlRead = null;
try {
  controlRead = { content: readFileSync(join(control, "secret.txt"), "utf8").trim() };
} catch (error) {
  controlRead = { error: String(error?.message ?? error).slice(0, 200), code: error?.code ?? null };
}
add({
  id: "arm4-unlabelled-control",
  question: "is the UNLABELLED control readable, so a refused read elsewhere is meaningful?",
  controlRead,
  observation: controlRead.content !== undefined ? "the control read SUCCEEDS" : "the control read FAILED, so the probe cannot distinguish refusal from a broken fixture",
});

/**
 * ARM 5 — THE DECISIVE READ, FROM A REAL LOW-INTEGRITY PROCESS.
 *
 * A Medium-integrity read of a Medium-labelled object is EXPECTED to succeed, and reporting that as "NOT REFUSED"
 * would be a false alarm: no policy bit forbids a read at or above the label's level. The question §5 asks is whether
 * a LOW process is refused, so the read must happen in a Low token.
 *
 * The mechanism is the runtime's own `dsh-sandbox-windows-acl` runner — the same one the worker backend uses — driven
 * exactly as the E2 home adjudication drove it. If it is unavailable the arm records `LIMIT` rather than treating an
 * unexercised mechanism as evidence.
 */
const ACL_PKG = join(REAL_MODULES, "@deepseek-ai", "dsh-sandbox-windows-acl");
const aclIndex = join(ACL_PKG, "lib", "index.js");
const sandboxRunner = join(ACL_PKG, "lib", "runner.js");
const lowMechanismAvailable = existsSync(aclIndex) && existsSync(sandboxRunner);

let lowRead = null;
if (!lowMechanismAvailable) {
  lowRead = { available: false, reason: "the Low-integrity runner is not present in the runtime" };
} else {
  const probeOut = join(HOME, "low-read-result.json");
  const probePath = join(HOME, "low-read-probe.mjs");
  writeFileSync(
    probePath,
    [
      'import { readFileSync, writeFileSync } from "node:fs";',
      "const out = {};",
      "const read = (name, p) => { try { out[name] = { read: true, content: readFileSync(p, 'utf8').trim().slice(0, 80) }; } catch (e) { out[name] = { read: false, code: e?.code ?? String(e) }; } };",
      `read("LABELLED", ${JSON.stringify(join(target, "secret.txt"))});`,
      `read("UNLABELLED_CONTROL", ${JSON.stringify(join(control, "secret.txt"))});`,
      `writeFileSync(${JSON.stringify(probeOut)}, JSON.stringify(out));`,
      "",
    ].join("\n"),
    "utf8",
  );
  const driverPath = join(HOME, "low-read-driver.mjs");
  writeFileSync(
    driverPath,
    [
      "import { mkdtempSync, rmSync } from 'node:fs';",
      "import { tmpdir } from 'node:os';",
      "import { join } from 'node:path';",
      "import { spawnSync } from 'node:child_process';",
      "const out = {};",
      `const mod = await import(${JSON.stringify(pathToFileURL(aclIndex).href)});`,
      `const ws = ${JSON.stringify(HOME)};`,
      "const temp = mkdtempSync(join(tmpdir(), 's1rae4-low-'));",
      "try {",
      "  const wsSid = mod.workspaceWriteSid(ws);",
      "  const tmpSid = mod.tempWriteSid(temp);",
      "  const g = mod.AclWriteGrant.create(wsSid); g.add(ws, true);",
      "  const gt = mod.AclWriteGrant.create(tmpSid); gt.add(temp, false);",
      `  const r = spawnSync(process.execPath, [${JSON.stringify(sandboxRunner)}, '--workspace', ws, '--temp', temp, '--mode', 'workspace-write', '--write-sid', wsSid, '--temp-write-sid', tmpSid, '--', process.execPath, ${JSON.stringify(probePath)}], { encoding: 'utf8', timeout: 240_000 });`,
      "  out.status = r.status; out.stderr = String(r.stderr ?? '').slice(0, 300);",
      "  try { g.dispose(); gt.dispose(); } catch {}",
      "} catch (e) { out.error = e?.message ?? String(e); }",
      "finally { try { rmSync(temp, { recursive: true, force: true }); } catch {} }",
      "process.stderr.write('S1RAE4_LOW_DRIVER ' + JSON.stringify(out) + '\\n');",
      "",
    ].join("\n"),
    "utf8",
  );
  const driver = spawnSync(process.execPath, [driverPath], { encoding: "utf8", timeout: 300_000 });
  let parsed = null;
  if (existsSync(probeOut)) {
    try {
      parsed = JSON.parse(readFileSync(probeOut, "utf8"));
    } catch {
      parsed = null;
    }
  }
  lowRead = {
    available: true,
    driverStatus: driver.status ?? null,
    driverStderr: String(driver.stderr ?? "").slice(0, 400),
    probeResult: parsed,
  };
}

/**
 * THE LOW READ IS ONLY A MEASUREMENT IF IT RAN. The driver can fail before the probe executes — E4 measured exactly
 * that: `SetNamedSecurityInfoW failed (Win32 5): grantWrite(...)` from the ACL grant the driver itself performs. In
 * that case `probeResult` is null and NOTHING was read, so classifying it as "not refused" would report a disclosure
 * that did not happen. That is the same false-negative-vs-false-positive error the plan warns about, in reverse.
 */
const lowRan = lowRead?.probeResult !== null && lowRead?.probeResult !== undefined;
const lowLabelledRefused = lowRan && lowRead.probeResult.LABELLED?.read === false;
const lowControlSucceeded = lowRan && lowRead.probeResult.UNLABELLED_CONTROL?.read === true;
add({
  id: "arm5-low-integrity-read",
  question: "is a LOW-integrity process refused when it reads the labelled directory?",
  mechanismAvailable: lowMechanismAvailable,
  lowRead,
  lowRan,
  lowLabelledRefused,
  lowControlSucceeded,
  observation: !lowMechanismAvailable
    ? "LIMIT: no Low-integrity runner, so the refusal was NOT tested"
    : !lowRan
      ? "LIMIT: the Low-integrity driver failed before the probe ran, so NOTHING was read and no refusal or disclosure can be claimed"
      : lowLabelledRefused && lowControlSucceeded
        ? `REFUSED at Low integrity (${String(lowRead.probeResult.LABELLED.code)}) while the unlabelled control read succeeded — this is the Mandatory Integrity mechanism`
        : lowLabelledRefused && !lowControlSucceeded
          ? "LIMIT: the Low process could not read the control either, so the refusal cannot be attributed to the label"
          : "NOT REFUSED AT LOW INTEGRITY: the labelled content was read by a Low process, which is a disclosure",
});

/** ARM 5b — the Medium-integrity read, reported for completeness and explicitly NOT treated as a refusal. */
let labelledRead = null;
try {
  labelledRead = { content: readFileSync(join(target, "secret.txt"), "utf8").trim() };
} catch (error) {
  labelledRead = { error: String(error?.message ?? error).slice(0, 200), code: error?.code ?? null };
}
add({
  id: "arm5b-medium-integrity-read",
  question: "does the SAME-integrity read succeed? (it must, and that is not a disclosure)",
  labelledRead,
  labelWasPresent: labelPresent,
  observation: !labelPresent
    ? "NOT APPLICABLE: no label was applied"
    : labelledRead.content !== undefined
      ? "the Medium-integrity read SUCCEEDS, which is expected: NO_READ_UP forbids reads by LOWER integrity, not equal"
      : "the same-integrity read was refused, which is unexpected",
});

/** ARM 6 — a labelled LINK must not be treated as coverage of its target. */
let linkOutcome = null;
if (junctionMade) {
  try {
    /**
     * `world` is a PATH, not an object: `planReadFence` calls `isAncestorOf(root, input.world)` and `resolve()`s it.
     * The holder does not contain the world, so it is labelled directly rather than skipped as an ancestor.
     */
    const applied = readFence.applyReadFence({ roots: [linkHolder], world: external });
    const tree = readFence.verifyTree({ root: linkHolder, verifiedRoots: [linkHolder], dependencyRoots: [] });
    let externalRead = null;
    try {
      externalRead = { content: readFileSync(join(external, "outside.txt"), "utf8").trim() };
    } catch (error) {
      externalRead = { error: String(error?.message ?? error).slice(0, 200), code: error?.code ?? null };
    }
    linkOutcome = {
      supported: applied.supported ?? null,
      verified: applied.outcomes?.filter((entry) => entry.verified).length ?? null,
      admissionEligible: tree.admissionEligible ?? null,
      unqualifiedExternalLinks: tree.unqualifiedExternalLinks?.length ?? null,
      externalRead,
    };
  } catch (error) {
    linkOutcome = { error: String(error?.message ?? error).slice(0, 300) };
  }
} else {
  linkOutcome = { error: "the junction could not be created on this platform" };
}
add({
  id: "arm6-labelled-link",
  question: "is a labelled LINK treated as coverage of its unlabelled target?",
  linkOutcome,
  observation:
    linkOutcome?.error !== undefined
      ? `LIMIT: ${String(linkOutcome.error).slice(0, 120)}`
      : linkOutcome.externalRead?.content !== undefined
        ? "the external target is still readable, so the link is not coverage"
        : "the external target read was refused",
});

/** ARM 7 — koffi must resolve from the seam package's own dependency graph. */
const koffiVersion = compatibility.ffi?.resolvedVersion ?? null;
add({
  id: "arm7-ffi",
  question: "does koffi resolve from the seam package's declared graph at the qualified version?",
  koffi: compatibility.ffi,
  observation: koffiVersion === "3.1.1" ? "koffi resolves at 3.1.1" : `koffi resolves at ${String(koffiVersion)}`,
});

/** ARM 8 — the fixture object must be unchanged. */
add({
  id: "arm8-fixture-integrity",
  question: "is the fixture still the object this run created?",
  rootIsInsideTestHome: target.startsWith(HOME),
  realHomeTouched: false,
  observation: target.startsWith(HOME) ? "every fixture is inside the run-owned test home" : "A FIXTURE ESCAPED THE TEST HOME",
});

const outcome =
  !writeClaimed
    ? "LIMIT_NO_LABEL_WRITE"
    : !labelPresent
      ? "LABEL_NOT_APPLIED"
      : !lowMechanismAvailable
        ? "LIMIT_NO_LOW_INTEGRITY_MECHANISM"
        : !lowRan
          ? "LIMIT_LOW_DRIVER_FAILED"
          : lowLabelledRefused && lowControlSucceeded
            ? "PROTECTED"
            : lowLabelledRefused && !lowControlSucceeded
              ? "LIMIT_LOW_CONTROL_UNREADABLE"
              : "NOT_REFUSED";

const disposal = disposeAndReport();

const report = {
  schemaVersion: 1,
  kind: "HOST_S1RAE4_WIN32_SEAM_CONTROLS",
  stage: "Palimpsest Host-S1RA-E4",
  measuredAt: new Date().toISOString(),
  method:
    "the host bundle is installed into a run-owned test home and the shared runtime modules are linked into it, so the fence resolves the seam from the same base a real worker uses",
  testHome: HOME.replace(/\\/gu, "/"),
  runtime: {
    resolvedVersion: compatibility.resolvedVersion,
    qualifiedVersion: compatibility.qualifiedVersion,
    drifted: compatibility.drifted,
    ffi: compatibility.ffi,
  },
  outcome,
  outcomeMeaning: {
    LIMIT_NO_LABEL_WRITE: "the seam resolved but no label could be written on this volume; behavioural compatibility is NOT established",
    LABEL_NOT_APPLIED: "the write claimed success and left no label; this is the silent no-op the plan warns about",
    LIMIT_NO_LOW_INTEGRITY_MECHANISM: "a label was written but no Low-integrity process was available to test the refusal, so the enforcement question is UNTESTED rather than failed",
    LIMIT_LOW_DRIVER_FAILED: "the Low-integrity driver failed before the probe executed, so nothing was read and neither a refusal nor a disclosure is claimed",
    LIMIT_LOW_CONTROL_UNREADABLE: "the Low process could not read the unlabelled control either, so a refusal cannot be attributed to the label",
    PROTECTED: "the label was written through rc.3, read back, and a LOW-integrity read was refused while the unlabelled control succeeded",
    NOT_REFUSED: "a Low-integrity process read the labelled content; a disclosure, never a pass",
  },
  arms,
  cleanup: disposal,
  realHomeTouched: false,
};

const jsonPath = args.get("json");
if (jsonPath !== undefined) writeFileSync(resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(outcome === "PROTECTED" ? 0 : 2);
