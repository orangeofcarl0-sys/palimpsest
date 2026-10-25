/**
 * Host-S1RA-E3 §10 — MODULE-SHARING ADMISSION AUDIT.
 *
 * The E2 stage modified `linkModuleGraph` so caller-declared host bundles are accepted when the corresponding
 * package entries already exist in the source tree. This script audits that exact branch against the eight cases
 * the ruling names, and separates three concepts that the branch deliberately conflates:
 *
 *   · the caller INTENDS to install a package;
 *   · the caller HAS installed a package with verified provenance;
 *   · the existing destination is ELIGIBLE for admission.
 *
 * Every fixture is synthetic, inside a run-owned sandbox. Nothing here reads or writes the real runtime install.
 *
 * Usage:
 *   node scripts/host_s1rae3/audit-module-sharing.mjs [--json=<path>]
 */
import { lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { assertSandboxContainment, createSandbox, removeTreeNoFollow } from "./fixtures.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);

const sandbox = createSandbox("sharing");
const containment = assertSandboxContainment(sandbox);
if (containment.proven !== true) {
  process.stdout.write(`${JSON.stringify({ kind: "HOST_S1RAE3_MODULE_SHARING_AUDIT", stopped: true, containment }, null, 2)}\n`);
  process.exit(2);
}

const sharing = await import("../trajectory_p2b/module-sharing.mjs");

const cases = [];
const add = (fields) => {
  cases.push(fields);
  const verdict = fields.safe === true ? "SAFE" : fields.safe === false ? "UNSAFE" : "OBSERVED";
  process.stderr.write(`  ${fields.id}: ${verdict} — ${fields.observation}\n`);
};

/**
 * Build a synthetic source module tree and a synthetic test home.
 *
 * `entries` is the set of package names the SOURCE tree contains. The home starts empty; the caller may pre-place
 * occupants before sharing runs.
 */
function fixture(label, entries) {
  const base = join(sandbox.root, label);
  const source = join(base, "source-modules");
  const home = join(base, "home");
  mkdirSync(source, { recursive: true });
  mkdirSync(join(home, "profiles", "node_modules"), { recursive: true });
  for (const entry of entries) {
    mkdirSync(join(source, entry), { recursive: true });
    writeFileSync(join(source, entry, "package.json"), `${JSON.stringify({ name: entry, version: "1.0.0" })}\n`, "utf8");
  }
  return { base, source, home, modules: join(home, "profiles", "node_modules") };
}

/* ------------------------------------------------------------------ *
 * 1 — caller-declared package, destination ABSENT
 * ------------------------------------------------------------------ */
{
  const f = fixture("c1", ["shared-a", "shared-b"]);
  const result = sharing.linkModuleGraph(f.home, { sourceModules: f.source, providedByCaller: ["host-pkg"] });
  add({
    id: "1-caller-declared-destination-absent",
    question: "a declared name that does not exist falls through to ordinary linking",
    expectedSafe: "established: the shared entries are linked and nothing is refused",
    result: { established: result.established, linked: result.linked, refused: result.refused },
    observation: result.established === true ? "ESTABLISHED: ordinary linking ran for every source entry" : `NOT ESTABLISHED: ${String(result.detail)}`,
    safe: result.established === true,
  });
}

/* ------------------------------------------------------------------ *
 * 2 — correctly installed package with verifiable provenance
 * ------------------------------------------------------------------ */
{
  const f = fixture("c2", ["shared-a"]);
  /** The caller's own installer wrote this, as a real directory, exactly as `installHostBundle` does. */
  mkdirSync(join(f.modules, "host-pkg"), { recursive: true });
  writeFileSync(join(f.modules, "host-pkg", "package.json"), `${JSON.stringify({ name: "host-pkg", version: "1.0.0" })}\n`, "utf8");
  const result = sharing.linkModuleGraph(f.home, { sourceModules: f.source, providedByCaller: ["host-pkg"] });
  add({
    id: "2-correctly-installed-package",
    question: "a declared name occupied by a plain directory the caller installed is admitted",
    expectedSafe: "established, with the entry recorded as providedByCaller",
    result: { established: result.established, providedByCaller: result.providedByCaller, refused: result.refused },
    observation:
      result.established === true && (result.providedByCaller ?? []).includes("host-pkg")
        ? "ADMITTED: recorded as providedByCaller"
        : `NOT ESTABLISHED: ${String(result.detail)}`,
    safe: result.established === true && (result.providedByCaller ?? []).includes("host-pkg"),
  });
}

/* ------------------------------------------------------------------ *
 * 3 — foreign pre-existing directory with the same package name
 * ------------------------------------------------------------------ */
{
  const f = fixture("c3", ["shared-a", "host-pkg"]);
  /**
   * THE SHADOWING CASE. `host-pkg` is in the SOURCE tree, so a directory at that name in the home would shadow a
   * shared dependency. It is occupied by a directory the caller did NOT create, though it IS declared, and the
   * caller supplies the fingerprint of what its installer WOULD have produced.
   */
  mkdirSync(join(f.modules, "host-pkg"), { recursive: true });
  writeFileSync(join(f.modules, "host-pkg", "FOREIGN"), "not the caller's package\n", "utf8");
  const expected = sharing.directoryFingerprint(join(f.source, "host-pkg"));
  const result = sharing.linkModuleGraph(f.home, {
    sourceModules: f.source,
    providedByCaller: ["host-pkg"],
    expectedFingerprints: { "host-pkg": expected ?? "" },
  });
  const admitted = (result.providedByCaller ?? []).includes("host-pkg");
  const refused = (result.refused ?? []).some((entry) => entry.entry === "host-pkg");
  add({
    id: "3-foreign-directory-at-a-source-name",
    question: "is a pre-existing directory at a declared name admitted when its content does not match the expected install?",
    expectedSafe: "REFUSED: the declaration is an intention, the fingerprint is the provenance",
    result: { established: result.established, providedByCaller: result.providedByCaller, provenance: result.provenance, refused: result.refused },
    observation: admitted
      ? "ADMITTED: content that does not match the expected install was accepted at a declared name"
      : refused
        ? "REFUSED: the content did not match the expected install, so the declaration was not sufficient"
        : "NEITHER admitted nor refused",
    safe: admitted === false && refused,
  });
}

/* ------------------------------------------------------------------ *
 * 3B — a directory that DOES match the expected install is admitted
 * ------------------------------------------------------------------ */
{
  const f = fixture("c3b", ["shared-a", "host-pkg"]);
  /** Write exactly the tree the installer would produce, then verify the admission accepts it. */
  mkdirSync(join(f.modules, "host-pkg"), { recursive: true });
  writeFileSync(join(f.modules, "host-pkg", "package.json"), `${JSON.stringify({ name: "host-pkg", version: "1.0.0" })}\n`, "utf8");
  const expected = sharing.directoryFingerprint(join(f.source, "host-pkg"));
  const result = sharing.linkModuleGraph(f.home, {
    sourceModules: f.source,
    providedByCaller: ["host-pkg"],
    expectedFingerprints: { "host-pkg": expected ?? "" },
  });
  const verified = (result.provenance ?? []).some((entry) => entry.entry === "host-pkg" && entry.provenance === "VERIFIED_AGAINST_EXPECTED_FINGERPRINT");
  add({
    id: "3b-matching-install-is-verified",
    question: "is a directory that matches the expected install admitted WITH verified provenance?",
    expectedSafe: "established, recorded as VERIFIED_AGAINST_EXPECTED_FINGERPRINT — the liveness control for case 3",
    result: { established: result.established, providedByCaller: result.providedByCaller, provenance: result.provenance, refused: result.refused },
    observation: result.established === true && verified ? "ADMITTED WITH VERIFIED PROVENANCE" : `NOT VERIFIED: established=${String(result.established)} provenance=${JSON.stringify(result.provenance)}`,
    safe: result.established === true && verified,
  });
}

/* ------------------------------------------------------------------ *
 * 4 — dangling junction at a declared name
 * ------------------------------------------------------------------ */
{
  const f = fixture("c4", ["shared-a"]);
  symlinkSync(join(f.base, "no-such-target"), join(f.modules, "host-pkg"), "junction");
  const result = sharing.linkModuleGraph(f.home, { sourceModules: f.source, providedByCaller: ["host-pkg"] });
  const refused = (result.refused ?? []).some((entry) => entry.entry === "host-pkg");
  add({
    id: "4-dangling-junction-at-declared-name",
    question: "is a dangling junction at a declared name refused?",
    expectedSafe: "REFUSED: a link at a declared name is not what the caller's installer produces",
    result: { established: result.established, refused: result.refused },
    observation: refused ? "REFUSED: the dangling junction was not admitted" : "NOT REFUSED",
    safe: refused,
  });
}

/* ------------------------------------------------------------------ *
 * 5 — junction resolving OUTSIDE the trusted dependency boundary
 * ------------------------------------------------------------------ */
{
  const f = fixture("c5", ["shared-a"]);
  const outside = join(sandbox.root, "c5-outside-target");
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, "package.json"), `${JSON.stringify({ name: "host-pkg" })}\n`, "utf8");
  symlinkSync(outside, join(f.modules, "host-pkg"), "junction");
  const result = sharing.linkModuleGraph(f.home, { sourceModules: f.source, providedByCaller: ["host-pkg"] });
  const refused = (result.refused ?? []).some((entry) => entry.entry === "host-pkg");
  add({
    id: "5-junction-outside-boundary",
    question: "is a junction resolving outside the test home refused at a declared name?",
    expectedSafe: "REFUSED: a link at a declared name is refused regardless of where it resolves",
    result: { established: result.established, refused: result.refused },
    observation: refused ? "REFUSED: the outbound junction was not admitted" : "NOT REFUSED",
    safe: refused,
  });
}

/* ------------------------------------------------------------------ *
 * 6 — unexpected regular-file occupant
 * ------------------------------------------------------------------ */
{
  const f = fixture("c6", ["shared-a", "koffi"]);
  writeFileSync(join(f.modules, "koffi"), "OCCUPANT\n", "utf8");
  const result = sharing.linkModuleGraph(f.home, { sourceModules: f.source });
  const refused = (result.refused ?? []).some((entry) => entry.entry === "koffi");
  add({
    id: "6-regular-file-occupant",
    question: "is a regular file at a shared module name refused?",
    expectedSafe: "REFUSED, and the file is left untouched",
    result: { established: result.established, refused: result.refused },
    fileSurvived: readFileSync(join(f.modules, "koffi"), "utf8") === "OCCUPANT\n",
    observation: refused ? "REFUSED: the file occupant was not overwritten" : "NOT REFUSED",
    safe: refused && readFileSync(join(f.modules, "koffi"), "utf8") === "OCCUPANT\n",
  });
}

/* ------------------------------------------------------------------ *
 * 7 — the same package name present in source AND destination
 * ------------------------------------------------------------------ */
{
  const f = fixture("c7", ["shared-a"]);
  /** An undeclared pre-existing directory at a source name: neither the caller's nor linkable. */
  mkdirSync(join(f.modules, "shared-a"), { recursive: true });
  writeFileSync(join(f.modules, "shared-a", "FOREIGN"), "already here\n", "utf8");
  const result = sharing.linkModuleGraph(f.home, { sourceModules: f.source });
  const refused = (result.refused ?? []).some((entry) => entry.entry === "shared-a");
  add({
    id: "7-same-name-in-source-and-destination",
    question: "is an undeclared pre-existing directory at a source name refused?",
    expectedSafe: "REFUSED: it would shadow the shared module",
    result: { established: result.established, refused: result.refused },
    observation: refused ? "REFUSED: the shadowing directory was not accepted" : "NOT REFUSED",
    safe: refused,
  });
}

/* ------------------------------------------------------------------ *
 * 8 — conflicting source and destination identities
 * ------------------------------------------------------------------ */
{
  const f = fixture("c8", ["shared-a"]);
  /** A correct-looking junction that points at the WRONG source. */
  const wrongSource = join(f.base, "wrong-source");
  mkdirSync(wrongSource, { recursive: true });
  symlinkSync(wrongSource, join(f.modules, "shared-a"), "junction");
  const result = sharing.linkModuleGraph(f.home, { sourceModules: f.source });
  const refused = (result.refused ?? []).some((entry) => entry.entry === "shared-a" && String(entry.reason).includes("ELSEWHERE"));
  add({
    id: "8-conflicting-link-identity",
    question: "is an existing junction that resolves to a DIFFERENT source refused?",
    expectedSafe: "REFUSED as EXISTING_LINK_POINTS_ELSEWHERE",
    result: { established: result.established, refused: result.refused },
    observation: refused ? "REFUSED: the wrong-target link was detected by resolved-target comparison" : "NOT REFUSED",
    safe: refused,
  });
}

/* ------------------------------------------------------------------ *
 * ADDITIONAL — a correct existing junction is the idempotent case
 * ------------------------------------------------------------------ */
{
  const f = fixture("c9", ["shared-a"]);
  const result = sharing.linkModuleGraph(f.home, { sourceModules: f.source });
  const second = sharing.linkModuleGraph(f.home, { sourceModules: f.source });
  add({
    id: "9-correct-link-is-idempotent",
    question: "is a second run over a correctly linked graph accepted without rewriting it?",
    expectedSafe: "ALREADY_LINKED, established true — a liveness control, so 'refuse everything' does not pass",
    first: { established: result.established, linked: result.linked },
    second: { established: second.established, alreadyLinked: second.alreadyLinked },
    observation:
      second.established === true && (second.alreadyLinked ?? []).includes("shared-a")
        ? "ALREADY_LINKED: the idempotent case works"
        : "NOT IDEMPOTENT",
    safe: second.established === true && (second.alreadyLinked ?? []).includes("shared-a"),
  });
}

const teardown = removeTreeNoFollow(sandbox.root);
const summary = {
  total: cases.length,
  safe: cases.filter((entry) => entry.safe === true).length,
  unsafe: cases.filter((entry) => entry.safe === false).length,
  unsafeCases: cases.filter((entry) => entry.safe === false).map((entry) => entry.id),
};

const report = {
  schemaVersion: 1,
  kind: "HOST_S1RAE3_MODULE_SHARING_AUDIT",
  stage: "Palimpsest Host-S1RA-E3",
  measuredAt: new Date().toISOString(),
  implementation: "scripts/trajectory_p2b/module-sharing.mjs",
  implementationDigest: (await import("./fixtures.mjs")).digestOfFile("scripts/trajectory_p2b/module-sharing.mjs"),
  sandbox: { root: sandbox.root, containment, removed: teardown.removed },
  summary,
  cases,
};
const jsonPath = args.get("json");
if (jsonPath !== undefined) writeFileSync(resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

void lstatSync;
void rmSync;
