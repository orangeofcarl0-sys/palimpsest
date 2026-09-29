#!/usr/bin/env node
/**
 * R1-S §4/§5/§6 — THE CAPABILITY AUDIT, RUN AS PROBES.
 *
 * The ruling is explicit: "Do not infer from names such as 'sandbox'. Produce actual probes."
 *
 * This script does two things:
 *
 *   (1) CAPABILITY PROBE — asks the INSTALLED host what confinement primitives it actually offers,
 *       by loading the shipped modules and inspecting their real exported contracts (the runner chain
 *       per platform, the enforced mode vocabulary, whether any read-side root list exists), and by
 *       running the backend's OWN functional probe when one exists.
 *
 *   (2) CONFINEMENT PROBE — creates synthetic canaries at controlled paths and runs a subprocess under
 *       the same backend the host uses for a worker, then records MECHANICALLY whether each canary was
 *       readable. This is the deterministic half: it does not depend on a model choosing to look.
 *
 * All canaries are fake random values created under a rig directory. No real secret is used, and no
 * real environment value is printed (§13).
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";

const require_ = createRequire(import.meta.url);

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, "").split("=");
  return [key, rest.join("=")];
}));
const RIG = args.get("rig") ?? join(homedir(), ".palimpsest-r1s", "audit");
const OUT = join(RIG, "audit");
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const findings = [];
const record = (key, value) => {
  findings.push([key, value]);
  process.stdout.write(`  · ${key}: ${value}\n`);
};
const canonical = (value) => JSON.stringify(value);

/** A fake, unpredictable value. Never a real secret. */
const canary = (label) => `${label}_${randomBytes(12).toString("hex")}`;

const dshRoot = (() => {
  const explicit = process.env.PALIMPSEST_DSH_ROOT?.trim();
  if (explicit !== undefined && explicit !== "") return explicit;
  try {
    const bin = process.env.PALIMPSEST_DSH_BIN?.trim() || join(execFileSync("npm", ["root", "-g"], { encoding: "utf8", shell: true }).trim(), "@deepseek-ai", "dsh", "lib", "bin.js");
    return join(bin, "..", "..");
  } catch {
    return null;
  }
})();

process.stdout.write(`\n===== R1-S CAPABILITY AUDIT =====\nrig      ${RIG}\ndsh root ${dshRoot ?? "(unresolved)"}\nplatform ${process.platform}\n`);

/* ============================================================ 1. capability probe */

process.stdout.write("\n--- 1. what the installed host actually offers ---\n");

/**
 * The platform runner chain, read from the SHIPPED selector rather than from prose. This is the list a
 * deployment composes; if the running platform's entry is a write-only runner, no read confinement is
 * available there no matter what any README implies.
 */
const SANDBOX_LOCAL = dshRoot === null ? null : join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox-local", "lib", "index.js");
let runnerChains = null;
let enforcementByRunner = null;
if (SANDBOX_LOCAL !== null && existsSync(SANDBOX_LOCAL)) {
  const source = readFileSync(SANDBOX_LOCAL, "utf8");
  // The selector literal is read out of the source as data, not executed: the module expects a full
  // Cordis context, and importing it here would test nothing this script needs.
  runnerChains = {};
  for (const platform of ["linux", "darwin", "win32"]) {
    const match = new RegExp(`${platform}:\\s*\\[([^\\]]*)\\]`, "u").exec(source);
    runnerChains[platform] = match === null ? null : match[1].split(",").map((entry) => entry.trim().replaceAll('"', ""));
  }
  const enforcement = /bwrap:\s*"(\w+)",\s*landlock:\s*"(\w+)",\s*seatbelt:\s*"(\w+)",\s*"windows-acl":\s*"(\w+)"/u.exec(source.replace(/\s+/gu, " "));
  enforcementByRunner = enforcement === null ? null : { bwrap: enforcement[1], landlock: enforcement[2], seatbelt: enforcement[3], "windows-acl": enforcement[4] };
  record("runner chain (this platform)", `[${(runnerChains[process.platform] ?? []).join(", ")}]`);
  for (const platform of ["linux", "darwin", "win32"]) {
    record(`runner chain (${platform})`, `[${(runnerChains[platform] ?? []).join(", ")}]`);
  }
  record("reported enforcement per runner", enforcementByRunner === null ? "UNREADABLE" : canonical(enforcementByRunner));
  // The selector's own comment states what the windows rung reports partial enforcement FOR.
  const partialReason = /reports partial enforcement because([^*]*)/u.exec(source.replace(/\s+/gu, " "));
  record("why windows-acl reports partial", partialReason === null ? "(not stated in source)" : partialReason[1].trim().slice(0, 220));
} else {
  record("runner chain", `UNRESOLVED (no ${String(SANDBOX_LOCAL)})`);
}

/**
 * The policy vocabulary. If the mode type carries no read-side field, then no call can ask for read
 * confinement — the absence is the finding, and it is read from the shipped `.d.ts`.
 *
 * The check is confined to the TWO interface bodies. An earlier version tested the whole file for
 * `/readOnly|readRoots|.../` and reported YES, because the same file documents bwrap's `--ro` read-only
 * mounts for a DIFFERENT platform. That is precisely the "inferring from names" mistake the ruling
 * forbids, so the search is now structural: only fields DECLARED inside the policy interfaces count.
 */
const POLICY_DTS = dshRoot === null ? null : join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox", "lib", "types", "index.d.ts");
let declaredPolicyFields = [];
if (POLICY_DTS !== null && existsSync(POLICY_DTS)) {
  const text = readFileSync(POLICY_DTS, "utf8");
  const body = (name) => {
    const match = new RegExp(`export interface ${name}(?: extends \\w+)? \\{([\\s\\S]*?)\\n\\}`, "u").exec(text);
    return match === null ? null : match[1];
  };
  const fields = (source) => (source === null ? [] : [...source.matchAll(/^\s*(?:readonly\s+)?(\w+)\??:/gmu)].map((match) => match[1]));
  const policyFields = fields(body("SandboxPolicy"));
  const executionFields = fields(body("SandboxExecutionPolicy"));
  declaredPolicyFields = [...new Set([...policyFields, ...executionFields])];
  record("SandboxPolicy fields", canonical(policyFields));
  record("SandboxExecutionPolicy fields", canonical(executionFields));
  const readFields = declaredPolicyFields.filter((field) => /read|deny|allow|root/iu.test(field) && !/workspaceRoot/u.test(field));
  record("READ-side fields declared in the policy", readFields.length === 0 ? "NONE — the policy vocabulary is file-effect (write) only" : canonical(readFields));
} else {
  record("SandboxPolicy surface", `UNRESOLVED (no ${String(POLICY_DTS)})`);
}
// Read from the shipped selector: the enforcement each runner claims, for the same reason as above.
let policyHasReadField = declaredPolicyFields.some((field) => /^(readOnly|readRoots|readDeny|denyRead|allowedReads|readAllow)/iu.test(field)) ? "YES" : "NO";

/**
 * The Windows backend's OWN functional probe, run for real. It asks the runner to confine a trivial
 * child in read-only mode; a zero exit means the restricted token actually spawned, which is what makes
 * the WRITE confinement real. It says nothing about reads, and this script records that distinction
 * rather than glossing it.
 *
 * The module is IMPORTED through `--input-type=module`, not executed as a CLI: `runner.js` is a module
 * whose exports include the probe, and running it as a program merely printed its usage error (measured
 * — the first version of this script reported `missing --workspace`, which was the script's mistake, not
 * a finding).
 */
const WINDOWS_RUNNER = dshRoot === null ? null : join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "runner.js");
if (process.platform === "win32" && WINDOWS_RUNNER !== null && existsSync(WINDOWS_RUNNER)) {
  const probe = spawnSync(process.execPath, ["--input-type=module", "-e", `
    const url = ${JSON.stringify(new URL(`file://${String(WINDOWS_RUNNER).replace(/\\/gu, "/")}`).href)};
    const mod = await import(url);
    process.stdout.write(JSON.stringify(Object.keys(mod)));
  `], { encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
  const keys = probe.status === 0 ? probe.stdout.trim() : "";
  record("windows-acl runner exports", probe.status === 0 ? keys : `probe failed (status ${probe.status}) ${(probe.stderr ?? "").trim().slice(0, 200)}`);
  // And the module's own source says what access mask it restricts to.
  const source = readFileSync(WINDOWS_RUNNER, "utf8");
  record("windows-acl restricts to", /WRITE_RESTRICTED/u.test(source) ? "WRITE_RESTRICTED (write accesses only)" : "UNKNOWN");
} else {
  record("windows-acl runner probe", "skipped (not win32, or runner absent)");
}

/* ============================================================ 2. canary layout */

process.stdout.write("\n--- 2. synthetic canaries (§4) ---\n");

/**
 * The world is one project's execution world; `protected` stands outside it and holds the canaries that
 * represent durable state, a sibling world, another project, and host-session material. The layout
 * mirrors the real one closely enough for the escape path to be the same shape.
 */
const PROJECT = join(OUT, "project");
const WORLD = join(PROJECT, "repo", ".palimpsest", "worlds", "attempt-audit");
const STATE = join(PROJECT, "state");
const SIBLING = join(PROJECT, "repo", ".palimpsest", "worlds", "attempt-sibling");
const OTHER_PROJECT = join(OUT, "other-project", "state");
const SESSION = join(OUT, "host-session");
for (const dir of [WORLD, STATE, SIBLING, OTHER_PROJECT, SESSION]) mkdirSync(dir, { recursive: true });

const canaries = {
  WORLD_CANARY: { value: canary("world"), path: join(WORLD, "in-world.txt") },
  PALIMPSEST_STATE_CANARY: { value: canary("state"), path: join(STATE, "proof-blob.txt") },
  SIBLING_WORLD_CANARY: { value: canary("sibling"), path: join(SIBLING, "values.js") },
  OTHER_PROJECT_CANARY: { value: canary("other"), path: join(OTHER_PROJECT, "proof-blob.txt") },
  HOST_SESSION_CANARY: { value: canary("session"), path: join(SESSION, "session.jsonl") },
};
for (const [name, entry] of Object.entries(canaries)) {
  writeFileSync(entry.path, `canary=${entry.value}\n`, "utf8");
  record(name, `${entry.path.replace(OUT, "<audit>")} = ${entry.value.slice(0, 12)}…`);
}
const envCanary = canary("env");
process.env.PALIMPSEST_R1S_SECRET_CANARY = envCanary;
record("HOST_ENV_CANARY", `PALIMPSEST_R1S_SECRET_CANARY = ${envCanary.slice(0, 12)}…`);

/* ============================================================ 3. the read probe program */

/**
 * The probe program is run as a SUBPROCESS from the world's cwd. It reports, for each canary, whether it
 * could read the file and whether the value it read matches — a read that succeeds on the wrong content
 * is not a leak, so the match is what counts.
 */
const PROBE = `
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
const results = {};
const tryRead = (name, path) => {
  try { results[name] = { read: true, content: readFileSync(path, "utf8").trim() }; }
  catch (error) { results[name] = { read: false, code: error?.code ?? error?.name ?? "Error" }; }
};
const tryList = (name, path) => {
  try { results[name] = { listed: true, entries: readdirSync(path).slice(0, 8) }; }
  catch (error) { results[name] = { listed: false, code: error?.code ?? error?.name ?? "Error" }; }
};
${Object.entries(canaries).map(([name, entry]) => `tryRead(${JSON.stringify(name)}, ${JSON.stringify(entry.path)});`).join("\n")}
// Relative traversal from the world, the route R1-R measured.
tryRead("TRAVERSAL_STATE", resolve(${JSON.stringify(WORLD)}, "..", "..", "..", "..", "state", "proof-blob.txt"));
tryRead("TRAVERSAL_SIBLING", resolve(${JSON.stringify(WORLD)}, "..", "attempt-sibling", "values.js"));
tryList("ENUMERATE_PARENT", resolve(${JSON.stringify(WORLD)}, "..", "..", "..", ".."));
tryList("ENUMERATE_STATE_DIR", ${JSON.stringify(STATE)});
results.ENV_CANARY = { read: process.env.PALIMPSEST_R1S_SECRET_CANARY !== undefined, present: process.env.PALIMPSEST_R1S_SECRET_CANARY !== undefined };
process.stdout.write(JSON.stringify(results));
`;
const probePath = join(WORLD, "probe.mjs");
writeFileSync(probePath, PROBE, "utf8");

/**
 * Run the probe under a chosen confinement. `runUnconfined` is the baseline the host currently gives a
 * worker: a plain child process inheriting this process's authority.
 */
function runProbeUnconfined() {
  const result = spawnSync(process.execPath, [probePath], { cwd: WORLD, encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) return { error: `exit ${result.status}: ${(result.stderr ?? "").slice(0, 300)}` };
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { error: `unparseable output: ${result.stdout.slice(0, 200)}` };
  }
}

/* ============================================================ 4. measure */

process.stdout.write("\n--- 3. measured read capability (§5) ---\n");
const unconfined = runProbeUnconfined();
writeFileSync(join(OUT, "probe-unconfined.json"), `${canonical(unconfined)}\n`, "utf8");

const leaked = [];
for (const [name, entry] of Object.entries(canaries)) {
  const observation = unconfined[name];
  const matched = observation?.read === true && observation.content === `canary=${entry.value}`;
  if (name !== "WORLD_CANARY" && matched) leaked.push(name);
  record(`${name} readable from the world`, observation?.read === true ? (matched ? "YES — value matches" : "read succeeded, content differed") : `no (${observation?.code ?? observation?.error ?? "?"})`);
}
record("TRAVERSAL_STATE (../../../../state)", unconfined.TRAVERSAL_STATE?.read === true ? "YES" : `no (${unconfined.TRAVERSAL_STATE?.code ?? "?"})`);
record("TRAVERSAL_SIBLING (../attempt-sibling)", unconfined.TRAVERSAL_SIBLING?.read === true ? "YES" : `no (${unconfined.TRAVERSAL_SIBLING?.code ?? "?"})`);
record("ENUMERATE_PARENT", unconfined.ENUMERATE_PARENT?.listed === true ? `YES (${unconfined.ENUMERATE_PARENT.entries.join(", ")})` : `no (${unconfined.ENUMERATE_PARENT?.code ?? "?"})`);
record("ENUMERATE_STATE_DIR", unconfined.ENUMERATE_STATE_DIR?.listed === true ? `YES (${unconfined.ENUMERATE_STATE_DIR.entries.join(", ")})` : `no (${unconfined.ENUMERATE_STATE_DIR?.code ?? "?"})`);
record("HOST_ENV_CANARY visible to the child", unconfined.ENV_CANARY?.present === true ? "YES — the child inherits the host environment" : "no");
record("PROTECTED CANARIES LEAKED (unconfined)", leaked.length === 0 ? "none" : `${leaked.length}: ${leaked.join(", ")}`);

/* ============================================================ 5. the host's own confinement */

process.stdout.write("\n--- 4. the same probe under the host's own confinement ---\n");

/**
 * THE DECISIVE PROBE. Confine the read probe with the backend the host actually uses on this platform
 * (`AclSandbox` in `workspace-write`, which is the mode a worker runs under) and re-run it. If reads
 * still succeed, the host's confinement does not bound reads — and that is the finding.
 *
 * The confined child is spawned with `stdio: "inherit"` (the same shape the backend's own runner uses)
 * and writes its report to a file INSIDE the world, which the harness reads afterwards. Capturing a
 * piped child's output through this API is a different code path from the one the host uses, and a probe
 * that measures a path the host does not take would not answer the question.
 */
let confinedLeaksSeen = [];
const ACLAUNCH = dshRoot === null ? null : join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "index.js");
if (process.platform === "win32" && ACLAUNCH !== null && existsSync(ACLAUNCH)) {
  const reportPath = join(WORLD, "confined-report.json");
  const confinedProbePath = join(WORLD, "confined-probe.mjs");
  writeFileSync(
    confinedProbePath,
    PROBE.replace(
      'process.stdout.write(JSON.stringify(results));',
      `writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify(results));`,
    ).replace('import { readFileSync, readdirSync } from "node:fs";', 'import { readFileSync, readdirSync, writeFileSync } from "node:fs";'),
    "utf8",
  );

  /**
   * The backend's module URL is computed HERE, in the outer script, and interpolated as a plain string.
   * Building it inside the generated harness would nest a template literal and a backslash-mangling
   * regex inside another template literal — measured twice as a syntax error, which is why the
   * computation lives outside.
   */
  const aclUrl = new URL(`file:///${String(ACLAUNCH).split(String.fromCharCode(92)).join("/")}`).href;
  const harness = `
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const mod = await import(${JSON.stringify(aclUrl)});
const { AclSandbox, tempWriteSid, workspaceWriteSid } = mod;
const workspaceRoot = ${JSON.stringify(WORLD)};
const tempDir = mkdtempSync(join(tmpdir(), "r1s-"));
const out = { workspaceRoot, tempDir, exports: Object.keys(mod) };
let sandbox;
try {
  sandbox = new AclSandbox({
    writableDirs: [workspaceRoot],
    tempDir,
    writeSid: workspaceWriteSid(workspaceRoot),
    tempWriteSid: tempWriteSid(tempDir),
    mode: "workspace-write",
  });
  await sandbox.init();
  const child = sandbox.spawn({ command: process.execPath, args: [${JSON.stringify(confinedProbePath)}], cwd: workspaceRoot, stdio: "inherit" });
  out.exitCode = (await child.wait()).exitCode;
} catch (error) {
  out.error = error?.message ?? String(error);
} finally {
  try { sandbox?.dispose(); } catch {}
  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
}
process.stderr.write("HARNESS_RESULT " + JSON.stringify(out) + String.fromCharCode(10));
`;
  const harnessPath = join(OUT, "acl-harness.mjs");
  writeFileSync(harnessPath, harness, "utf8");
  rmSync(reportPath, { force: true });
  const run = spawnSync(process.execPath, [harnessPath], { encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] });
  const harnessLine = (run.stderr ?? "").split(String.fromCharCode(10)).map((line) => line.trim()).find((line) => line.startsWith("HARNESS_RESULT")) ?? "";
  const harnessOut = harnessLine === "" ? null : JSON.parse(harnessLine.slice("HARNESS_RESULT ".length));
  if (harnessOut === null) {
    record("under AclSandbox confinement", `harness failed: exit ${run.status} ${(run.stderr ?? "").trim().slice(0, 300)}`);
  } else if (harnessOut.error !== undefined) {
    record("under AclSandbox confinement", `AclSandbox refused: ${harnessOut.error}`);
  } else {
    record("under AclSandbox confinement", `spawned under a restricted token (workspace-write), child exit ${harnessOut.exitCode}`);
    const inner = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : null;
    if (inner === null) {
      record("confined child produced a report", "no — the confined child wrote nothing");
    } else {
      const confinedLeaks = [];
      for (const [name, entry] of Object.entries(canaries)) {
        const observation = inner[name];
        const matched = observation?.read === true && observation.content === `canary=${entry.value}`;
        if (name !== "WORLD_CANARY" && matched) confinedLeaks.push(name);
      }
      record("WORLD_CANARY readable under confinement", inner.WORLD_CANARY?.read === true ? "YES (ordinary world reads still work)" : `no (${inner.WORLD_CANARY?.code ?? "?"})`);
      for (const name of ["PALIMPSEST_STATE_CANARY", "SIBLING_WORLD_CANARY", "OTHER_PROJECT_CANARY", "HOST_SESSION_CANARY"]) {
        record(`${name} readable under confinement`, inner[name]?.read === true ? (confinedLeaks.includes(name) ? "YES — STILL READABLE" : "read succeeded, content differed") : `NO (${inner[name]?.code ?? "?"})`);
      }
      record("TRAVERSAL_STATE under confinement", inner.TRAVERSAL_STATE?.read === true ? "YES — STILL READABLE" : `no (${inner.TRAVERSAL_STATE?.code ?? "?"})`);
      record("TRAVERSAL_SIBLING under confinement", inner.TRAVERSAL_SIBLING?.read === true ? "YES — STILL READABLE" : `no (${inner.TRAVERSAL_SIBLING?.code ?? "?"})`);
      record("ENUMERATE_PARENT under confinement", inner.ENUMERATE_PARENT?.listed === true ? `YES — STILL LISTABLE (${(inner.ENUMERATE_PARENT.entries ?? []).join(", ")})` : `no (${inner.ENUMERATE_PARENT?.code ?? "?"})`);
      record("HOST_ENV_CANARY under confinement", inner.ENV_CANARY?.present === true ? "YES — inherited" : "no");
      record("PROTECTED CANARIES LEAKED (confined)", confinedLeaks.length === 0 ? "none" : `${confinedLeaks.length}: ${confinedLeaks.join(", ")}`);
      confinedLeaksSeen = confinedLeaks;
      writeFileSync(join(OUT, "acl-confined-probe.json"), `${JSON.stringify(inner, null, 2)}
`, "utf8");
    }
  }
} else {
  record("under AclSandbox confinement", "skipped (not win32, or backend absent)");
}

/* ============================================================ 6. verdict on capability */

process.stdout.write("\n--- 5. capability verdict ---\n");
const windowsRunner = (runnerChains?.win32 ?? []).includes("windows-acl");
const windowsEnforcement = enforcementByRunner?.["windows-acl"] ?? "UNKNOWN";
const readConfinementAvailable =
  policyHasReadField.startsWith("YES") ||
  (runnerChains !== null && JSON.stringify(runnerChains).includes("bwrap") && process.platform === "linux");
record("read confinement primitive available on THIS host", readConfinementAvailable ? "YES" : `NO — ${process.platform === "win32" ? `the win32 chain is [${(runnerChains?.win32 ?? []).join(", ")}] with enforcement "${windowsEnforcement}"` : "no read-side primitive found"}`);
record("protected canaries readable unconfined", leaked.length === 0 ? "none" : `${leaked.length} of ${Object.keys(canaries).length - 1}`);

writeFileSync(join(OUT, "capability-audit.json"), `${JSON.stringify({
  schemaVersion: 1,
  stage: "R1-S",
  rig: OUT,
  platform: process.platform,
  dshRoot,
  runnerChains,
  enforcementByRunner,
  policyHasReadField,
  readConfinementAvailable,
  unconfinedProbe: unconfined,
  leaked,
  envCanaryVisible: unconfined.ENV_CANARY?.present === true,
  findings,
}, null, 2)}\n`, "utf8");
process.stdout.write(`\naudit written: ${join(OUT, "capability-audit.json")}\n`);
