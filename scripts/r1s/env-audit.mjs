#!/usr/bin/env node
/**
 * R1-S §13 — ENVIRONMENT AND CREDENTIAL-REACHABILITY AUDIT.
 *
 * §13 asks whether worker code can read host environment material, and whether real credentials are
 * unnecessarily visible. Two things are measured, and NEITHER prints a secret value:
 *
 *   1. ENVIRONMENT: whether a child inherits the host environment, probed with a synthetic canary.
 *   2. CREDENTIAL REACHABILITY: whether the DSH home (which holds `.credentials.yaml` in the shipped
 *      layout) is reachable from a worker world by the same relative traversal R1-R measured. The probe
 *      reports EXISTENCE and READABILITY only — never content, and never a key name.
 *
 * This is an audit, not a change. Widening scope to fix the environment follows only if the synthetic
 * probe proves a real exposure, which is the rule §13 sets.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, "").split("=");
  return [key, rest.join("=")];
}));
const RIG = args.get("rig") ?? join(homedir(), ".palimpsest-r1s", "env-audit");
if (existsSync(RIG)) rmSync(RIG, { recursive: true, force: true });
const findings = [];
const record = (key, value) => {
  findings.push([key, value]);
  process.stdout.write(`  · ${key}: ${value}\n`);
};

process.stdout.write(`\n===== R1-S ENVIRONMENT / CREDENTIAL AUDIT =====\nrig ${RIG}\n`);

/* ---------------------------------------------------------------- environment canary */

const envCanary = `env_${randomBytes(12).toString("hex")}`;
process.env.PALIMPSEST_R1S_SECRET_CANARY = envCanary;
const WORLD = join(RIG, "project", "repo", ".palimpsest", "worlds", "attempt-env");
mkdirSync(WORLD, { recursive: true });

/**
 * The child reports whether the canary is present — a boolean, never the value. It also reports how many
 * environment variables it can see and whether any name suggests a credential, WITHOUT printing names of
 * secret-bearing variables (it prints only a count and a boolean).
 */
const probePath = join(WORLD, "env-probe.mjs");
writeFileSync(probePath, `
import { writeFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
const out = {};
out.canaryPresent = process.env.PALIMPSEST_R1S_SECRET_CANARY !== undefined;
out.envVarCount = Object.keys(process.env).length;
// A count and a boolean only: never a name, never a value.
out.credentialShapedNames = Object.keys(process.env).filter((name) => /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(name)).length;
out.dshHomePresent = process.env.DSH_HOME !== undefined;
// Reachability of the shipped credential file by relative traversal from the world.
const credentials = resolve(${JSON.stringify(WORLD)}, "..", "..", "..", "..", "home", ".credentials.yaml");
out.credentialsPathShape = credentials.replace(/[A-Za-z]:.{0,60}/u, "<home>");
try {
  out.credentialsExists = existsSync(credentials);
  if (out.credentialsExists) {
    out.credentialsBytes = statSync(credentials).size;
    // READABILITY is what matters; the content is read and immediately discarded.
    readFileSync(credentials);
    out.credentialsReadable = true;
  } else out.credentialsReadable = false;
} catch (error) { out.credentialsReadable = false; out.credentialsError = error?.code ?? String(error); }
writeFileSync(${JSON.stringify(join(WORLD, "env-report.json"))}, JSON.stringify(out));
`, "utf8");

const run = spawnSync(process.execPath, [probePath], { cwd: WORLD, encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
const report = existsSync(join(WORLD, "env-report.json")) ? JSON.parse(readFileSync(join(WORLD, "env-report.json"), "utf8")) : null;
record("child inherits the host environment", report?.canaryPresent === true ? "YES" : "no");
record("environment variables visible to the child", String(report?.envVarCount ?? "?"));
record("credential-shaped environment NAMES visible", String(report?.credentialShapedNames ?? "?"));
record("DSH_HOME visible in the child environment", report?.dshHomePresent === true ? "YES" : "no");

/* ---------------------------------------------------------------- real credential reachability */

/**
 * The REAL DSH home is probed for reachability from a world-shaped directory, without copying or
 * printing anything. A worker world sits at `<rig>/repo/.palimpsest/worlds/attempt-*`, and a deployment
 * that keeps its DSH home beside the project (as the R1-R rig did) puts the credentials four levels up.
 *
 * This measures the RELATIVE-TRAVERSAL exposure of the real file, reporting only existence and
 * readability.
 */
const REAL_DSH = process.env.DSH_HOME?.trim() || join(homedir(), ".dsh");
const realCredentials = join(REAL_DSH, ".credentials.yaml");
record("real DSH home", REAL_DSH.replace(homedir(), "<home>"));
record("real .credentials.yaml exists", existsSync(realCredentials) ? "YES" : "no");
if (existsSync(realCredentials)) {
  try {
    const size = readFileSync(realCredentials).length;
    record("real .credentials.yaml readable by this process", `YES (${size} bytes; content NOT read into the report)`);
  } catch (error) {
    record("real .credentials.yaml readable by this process", `no (${error?.code})`);
  }
}

/**
 * Also: how is the DSH home itself protected? If it lives under the user profile, a worker running as the
 * same principal can read it by ABSOLUTE path regardless of where the world is — traversal is not even
 * needed. That is the more important fact, and it is reported as such.
 */
record("the DSH home is under the user profile", REAL_DSH.toLowerCase().startsWith(homedir().toLowerCase()) ? "YES — reachable by absolute path from any worker world" : "no");

writeFileSync(join(RIG, "env-audit.json"), `${JSON.stringify({ findings, report, realDshHome: REAL_DSH.replace(homedir(), "<home>") }, null, 2)}\n`, "utf8");
process.stdout.write(`\naudit written: ${join(RIG, "env-audit.json")}\n`);
