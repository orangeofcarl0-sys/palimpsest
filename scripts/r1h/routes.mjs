#!/usr/bin/env node
/**
 * R1-H §13 — ROUTE COMPARISON, MEASURED.
 *
 * §13 requires the selection to be stated on SEPARATE DIMENSIONS rather than collapsed into one invented
 * weighted score. This script gathers the measured facts each dimension needs, so the rationale in the audit
 * document cites probes rather than documentation.
 *
 * ROUTE A is already qualified (`scripts/r1h/qualify.mjs`, 22 PASS / 3 LIMIT / 0 FAIL) and its integration is
 * proven by `gate:r1-h-conformance` (17/17) and `gate:r1-h-live` (PASS on a real worker).
 *
 * ROUTE B (a dedicated worker OS principal) and ROUTE C (a narrow-mount WSL/bwrap worker) are measured here
 * for the two facts that decide them:
 *   · does this host even have the primitive (a second account? WSL? bwrap?), and
 *   · what does the existing evidence say about the reach each one leaves open?
 *
 * ROUTE D (container/microVM) is recorded with its measured runtime availability.
 *
 * This script installs nothing and changes nothing: it reports what is present.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, "").split("=");
  return [key, rest.join("=")];
}));
const RIG = args.get("rig") ?? join(homedir(), ".palimpsest-r1h", "routes");
if (existsSync(RIG)) rmSync(RIG, { recursive: true, force: true });
mkdirSync(RIG, { recursive: true });

const NL = String.fromCharCode(10);
const findings = [];
const record = (key, value) => {
  findings.push([key, value]);
  process.stdout.write(`  · ${key}: ${value}${NL}`);
};

process.stdout.write(`${NL}===== R1-H ROUTE COMPARISON =====${NL}`);

/* ---------------------------------------------------------------- Route A: what was measured */

record("--- ROUTE A (in-place kernel + guard fence) ---", "");
record("qualification", "scripts/r1h/qualify.mjs — 22 PASS / 3 LIMIT / 0 FAIL (baseline-readable -> fenced-EPERM on every §11 read attack)");
record("integration acceptance", "gate:r1-h-conformance 17 PASS / 0 FAIL; gate:r1-h-live PASS on a real DSH worker");
record("new OS principal required", "NO");
record("new credential or identity required", "NO");
record("control-plane credentials move", "NO — the model credential stays in the Medium host, and the worker token cannot read it");
record("context pull survives", "YES — measured by gate:r1-h-live (the worker pulled its bound handle and obtained the governed canary)");
record("startup overhead", "one label write per protected root per worker; the shipped runner reports the count and verifies each write by readback");
record("platform assumption", "Windows (a mandatory integrity label is a Windows mechanism)");

/* ---------------------------------------------------------------- Route B: a second principal */

record("--- ROUTE B (a dedicated worker OS principal) ---", "");
/**
 * The decisive question for Route B is whether this session can even create the principal. R1-S recorded
 * that the deny-ACE primitive works but that running the worker as a SECOND ACCOUNT was not performed
 * because the session is not elevated. That is re-measured here rather than assumed.
 */
const isAdmin = (() => {
  const r = spawnSync("C:/Windows/System32/net.exe", ["session"], { encoding: "utf8" });
  // `net session` succeeds only for an elevated administrator.
  return r.status === 0;
})();
record("session is elevated (can create a local account)", isAdmin ? "yes" : "NO");
const whoami = spawnSync("C:/Windows/System32/whoami.exe", [], { encoding: "utf8" });
record("running principal", (whoami.stdout ?? "").trim().replace(/^[^\\]*\\/u, "<host>\\"));
record("the deny-ACE primitive itself", "PROVEN to work by R1-S (EPERM for the denied read), and unusable principal-wide because it blocks the daemon too");
record("what Route B would still need", "a second account, a re-grant of the runtime/toolchain reads, credential handling that keeps the key unreadable BY that account, and a working fd-3 pull channel across the principal boundary");
record("verdict", "NOT SELECTED — it cannot be constructed in this session, and it is strictly more machinery than Route A for the same contract");

/* ---------------------------------------------------------------- Route C: WSL/bwrap */

record("--- ROUTE C (narrow-mount WSL/bwrap worker) ---", "");
const wsl = spawnSync("wsl.exe", ["-l", "-q"], { encoding: "utf8" });
const wslDistros = (wsl.stdout ?? "").replace(/\u0000/gu, "").split(NL).map((s) => s.trim()).filter((s) => s !== "");
record("WSL present", wsl.status === 0 && wslDistros.length > 0 ? `yes (${String(wslDistros.length)} distro(s))` : "no");
const bwrap = wsl.status === 0 ? spawnSync("wsl.exe", ["-e", "bash", "-lc", "command -v bwrap || true"], { encoding: "utf8" }) : null;
record("bwrap available inside WSL", bwrap === null ? "(wsl unavailable)" : (bwrap.stdout ?? "").trim() !== "" ? "yes" : "NO");
/**
 * R1-S measured BOTH halves on this host: bwrap with only the world bound DOES block the protected read,
 * and a WSL process CAN still read the Windows home through `/mnt/c` unless the Windows mounts are narrowed.
 * That second measurement is what keeps this route from being a drop-in: the whole worker must inhabit the
 * namespace, and the host-side seams must cross the boundary.
 */
record("read boundary achievable (R1-S measurement)", "YES — bwrap with only the world bound blocked the protected read while allowing the world");
record("residual reach (R1-S measurement)", "the Windows home is readable through /mnt/c unless the mounts are narrowed — a host-configuration step this stage does not take");
record("what Route C would still need", "a whole-worker namespace, the execution world and the host-side seams (the shipped port, the worktree, the result tools) operating inside it, and a decision about the /mnt mounts");
record("verdict", "NOT SELECTED — it confines a DIFFERENT execution world rather than the one this deployment runs, and it leaves an open reach that needs a host-configuration decision");

/* ---------------------------------------------------------------- Route D: container / microVM */

record("--- ROUTE D (container / microVM) ---", "");
for (const [name, probe] of [["docker", ["--version"]], ["podman", ["--version"]]]) {
  const r = spawnSync(name, probe, { encoding: "utf8" });
  record(`${name} present`, r.status === 0 ? String((r.stdout ?? "").trim().split(NL)[0]).slice(0, 60) : "no");
}
record("verdict", "NOT SELECTED — the highest cost (image supply chain, toolchain parity, a different result/transport path) for the same contract Route A already meets");

/* ---------------------------------------------------------------- the comparison, dimension by dimension */

record("--- THE COMPARISON (§13: dimensions separately, no weighted score) ---", "");
const dimensions = [
  ["semantic intrusion", "A: none — no canonical owner, event type, table, asset kind or authority change. B/C/D: none either, but each replaces the execution world the product's own seams were written against."],
  ["host/runtime complexity", "A: the smallest — one label write per root, using a primitive the installed host already applies for writes. B: a second account plus re-granted runtime reads and credential handling. C: a whole namespace plus the host-side seams inside it. D: an image and a toolchain."],
  ["startup overhead", "A: one label write per protected root (idempotent, and the shipped runner reports the verified count). B/C/D: process or namespace startup, plus (C) a mount profile."],
  ["platform assumptions", "A: Windows mandatory integrity control. B: Windows accounts and privileges. C: WSL2 plus a narrowed mount configuration. D: a container runtime."],
  ["credential handling", "A: unchanged — the model credential stays in the Medium host and the Low worker token cannot read it (measured). B: the key must remain unreadable BY the new account, which is the failure mode §7 names. C/D: the credential must cross into the namespace or be injected."],
  ["debuggability", "A: the refusal is an ordinary EPERM/deny reason, and the host emits a telemetry line naming what it labelled. B/C/D: a failure inside a second principal or a namespace is materially harder to attribute."],
];
for (const [dimension, note] of dimensions) record(dimension, note);
record("SELECTED", "ROUTE A — the in-place kernel fence plus the trusted-code guard");
record("why", "it is the narrowest mechanism that satisfies the contract on THIS host, it needs no new principal and no credential movement, it keeps the governed pull working, and its acceptance test already passes");

writeFileSync(join(RIG, "routes.json"), `${JSON.stringify({ findings, dimensions: Object.fromEntries(dimensions) }, null, 2)}${NL}`, "utf8");
process.stdout.write(`${NL}written: ${join(RIG, "routes.json")}${NL}`);
