/**
 * Host-S1RA-E4 §C1.3 — LABEL-WRITE FEASIBILITY ON A TEST HOME, WITH EXPLICIT DESCRIPTOR CONTROL.
 *
 * The §5 controls returned `LIMIT_NO_LABEL_WRITE`: `SetNamedSecurityInfoW` returned 5 (ACCESS_DENIED) and no label
 * was applied. Before reporting that as a limitation, this script asks the obvious follow-up question:
 *
 *   is the failure a PRIVILEGE limitation of this principal, or a defect in how the label is being written?
 *
 * It distinguishes them by attempting the write on a directory whose DACL explicitly grants this principal full
 * control, and by recording the principal's elevation state. Three outcomes are possible and they mean different
 * things:
 *
 *   WRITE_SUCCEEDS_AFTER_GRANT   the failure was DACL-related; the seam works and the earlier LIMIT was environmental
 *   WRITE_FAILS_EVEN_WITH_GRANT  the failure is not a DACL issue on this object; likely privilege or volume
 *   CANNOT_TEST                  the fixture could not be prepared, so nothing is concluded
 *
 * The second outcome does NOT prove rc.3 is incompatible. `SeSecurityPrivilege` is commonly required to write a SACL
 * entry, and a mandatory label lives in the SACL. A non-elevated principal without that privilege cannot write one
 * regardless of runtime version — which means the §5 controls cannot distinguish rc.2 from rc.3 on this machine, and
 * that is the honest finding.
 *
 * SAFETY. Everything is inside a run-owned test home disposed through the E3 quarantine path. No label is written on
 * `~/.dsh`, `D:/dsh`, or any protected path.
 *
 * Usage:
 *   node scripts/host_s1rae4/label-write-feasibility.mjs [--json=<path>]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const GATE_ROOT = join(REPO, ".e4-seam-gate");
mkdirSync(GATE_ROOT, { recursive: true });

const arms = [];
const add = (fields) => {
  arms.push(fields);
  process.stderr.write(`  ${fields.id}: ${fields.observation}\n`);
};

/** The principal, recorded so a reader can tell whose privileges are being described. */
const whoami = spawnSync("whoami", [], { encoding: "utf8", timeout: 30_000 });
const principal = String(whoami.stdout ?? "").trim() || null;

/** Elevation state, from `whoami /groups` filtered for the High mandatory level. */
const groups = spawnSync("whoami", ["/groups"], { encoding: "utf8", timeout: 30_000 });
const groupText = String(groups.stdout ?? "");
const integrityLevel = /Mandatory Label\\High Mandatory Level/u.test(groupText)
  ? "High"
  : /Mandatory Label\\System Mandatory Level/u.test(groupText)
    ? "System"
    : /Mandatory Label\\Medium Mandatory Level/u.test(groupText)
      ? "Medium"
      : "unknown";
/** `SeSecurityPrivilege` is the one that governs SACL writes, which is where a mandatory label lives. */
const privilegeList = spawnSync("whoami", ["/priv"], { encoding: "utf8", timeout: 30_000 });
const privilegeText = String(privilegeList.stdout ?? "");
const securityPrivilegePresent = /SeSecurityPrivilege/u.test(privilegeText);
const securityPrivilegeEnabled = /SeSecurityPrivilege[\s\S]{0,120}?Enabled/u.test(privilegeText);

add({
  id: "arm0-principal",
  question: "which principal is running, and does it hold the privilege that governs SACL writes?",
  principal,
  integrityLevel,
  securityPrivilegePresent,
  securityPrivilegeEnabled,
  observation: `principal=${String(principal)} integrity=${integrityLevel} SeSecurityPrivilege present=${String(securityPrivilegePresent)} enabled=${String(securityPrivilegeEnabled)}`,
});

const allocated = owned.allocateOwnedRoot(GATE_ROOT, "e4-lblfeas-");
const HOME = allocated.root;
const lifetime = owned.ownedRootLifetime(allocated);

const finish = (outcome, extra = {}) => {
  const cleanup = lifetime.dispose();
  const report = {
    schemaVersion: 1,
    kind: "HOST_S1RAE4_LABEL_WRITE_FEASIBILITY",
    stage: "Palimpsest Host-S1RA-E4",
    measuredAt: new Date().toISOString(),
    outcome,
    principal,
    integrityLevel,
    securityPrivilege: { present: securityPrivilegePresent, enabled: securityPrivilegeEnabled },
    ...extra,
    arms,
    cleanup,
    realHomeTouched: false,
  };
  const jsonPath = args.get("json");
  if (jsonPath !== undefined) writeFileSync(resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(0);
};

/** Install the host bundle and link the modules, exactly as the gate does, so the fence resolves. */
try {
  const nodeModules = join(HOME, "profiles", "node_modules");
  mkdirSync(nodeModules, { recursive: true });
  const { cpSync } = await import("node:fs");
  for (const [source, name] of [
    [join(REPO, "host", "dsh"), "palimpsest-dsh-host"],
    [join(REPO, "host", "deployment"), "palimpsest-host-deployment"],
  ]) {
    cpSync(source, join(nodeModules, name), { recursive: true });
  }
} catch (error) {
  finish("CANNOT_TEST", { reason: `the host bundle could not be installed: ${String(error?.message ?? error).slice(0, 200)}` });
}

const linked = sharing.linkModuleGraph(HOME, {
  sourceModules: REAL_MODULES,
  providedByCaller: ["palimpsest-dsh-host", "palimpsest-host-deployment"],
  expectedFingerprints: {
    "palimpsest-dsh-host": sharing.directoryFingerprint(join(REPO, "host", "dsh")) ?? "",
    "palimpsest-host-deployment": sharing.directoryFingerprint(join(REPO, "host", "deployment")) ?? "",
  },
});
if (linked.established !== true) finish("CANNOT_TEST", { reason: "module sharing was not established", sharing: linked });

const fence = await import(pathToFileURL(join(HOME, "profiles", "node_modules", "palimpsest-host-deployment", "runtime", "win32_label.js")).href);
const wrapped = fence.win32LabelApi();
if (wrapped.error !== undefined) finish("CANNOT_TEST", { reason: "the label API is unusable", apiError: wrapped.error });
const api = wrapped.api;

const target = join(HOME, "labelled");
mkdirSync(target, { recursive: true });
writeFileSync(join(target, "secret.txt"), "CONTENT\n", "utf8");

/* ARM 1 — the write BEFORE any DACL manipulation, which is the condition the §5 controls measured. */
const beforeLabel = fence.readMandatoryLabel(api, target);
const firstWrite = fence.writeAndVerifyLabel(api, target, beforeLabel);
add({
  id: "arm1-write-before-grant",
  question: "does the label write succeed on a freshly created directory in a test home?",
  writeOutcome: firstWrite,
  observation: firstWrite.applied === true ? "the write was applied" : `NOT APPLIED: ${String(firstWrite.detail).slice(0, 160)}`,
});

/* ARM 2 — grant this principal explicit full control, then retry. */
const grant = spawnSync("icacls", [target, "/grant", `${principal}:(OI)(CI)F`], { encoding: "utf8", timeout: 60_000 });
add({
  id: "arm2-dacl-grant",
  question: "can an explicit DACL grant be applied to the fixture?",
  status: grant.status,
  stdout: String(grant.stdout ?? "").trim().slice(0, 200),
  stderr: String(grant.stderr ?? "").trim().slice(0, 200),
  observation: grant.status === 0 ? "the grant was applied" : `the grant failed with status ${String(grant.status)}`,
});

const beforeSecond = fence.readMandatoryLabel(api, target);
const secondWrite = fence.writeAndVerifyLabel(api, target, beforeSecond);
add({
  id: "arm3-write-after-grant",
  question: "does the label write succeed once the principal holds explicit full control on the object?",
  writeOutcome: secondWrite,
  observation: secondWrite.applied === true ? "the write was applied after the grant" : `NOT APPLIED EVEN WITH THE GRANT: ${String(secondWrite.detail).slice(0, 160)}`,
});

/* ARM 4 — the read-back, so a claimed write is checked rather than trusted. */
const afterRead = fence.readMandatoryLabel(api, target);
add({
  id: "arm4-read-back",
  question: "is a label present after the attempts?",
  readBack: afterRead,
  observation: afterRead?.label?.present === true ? `present: integrity=${String(afterRead.label.integrityName)}` : "no label is present",
});

const outcome = firstWrite.applied === true
  ? "WRITE_SUCCEEDS_WITHOUT_GRANT"
  : secondWrite.applied === true
    ? "WRITE_SUCCEEDS_AFTER_GRANT"
    : "WRITE_FAILS_EVEN_WITH_GRANT";

finish(outcome, {
  interpretation: {
    WRITE_SUCCEEDS_WITHOUT_GRANT: "the seam can write a label on this volume without any DACL help; the earlier LIMIT was a fixture property",
    WRITE_SUCCEEDS_AFTER_GRANT: "the failure was DACL-related, and the seam works when the principal holds full control",
    WRITE_FAILS_EVEN_WITH_GRANT:
      "an explicit DACL grant did not help, so the refusal is a PRIVILEGE or VOLUME property (a mandatory label lives in the SACL, which commonly needs SeSecurityPrivilege), not a defect this stage can attribute to rc.3. The §5 controls therefore CANNOT distinguish rc.2 from rc.3 on this machine, and rc.3 behavioural compatibility remains UNPROVEN.",
  }[outcome],
});
