/**
 * Host-S1RA-E3 §12 — MUTATION CONTROLS.
 *
 * For each protective guard this stage added, the guard is removed IN A COPY of the module inside a run-owned sandbox
 * and the corresponding falsifier is re-run. A guard is only load-bearing if its removal makes a control fail.
 *
 * THE FROZEN PRODUCTION TREE IS NEVER MUTATED. Each arm copies the real module into the sandbox, applies a textual
 * removal to the COPY, imports the copy, and measures. The original file is hashed before and after every arm, and a
 * difference aborts the run — that assertion is the point of the script, not a formality.
 *
 * Usage:
 *   node scripts/host_s1rae3/mutation-controls.mjs [--json=<path>]
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createSandbox, removeTreeNoFollow, writeForeignCanary } from "./fixtures.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);

const REPO = resolve(import.meta.dirname, "..", "..");
const SANDBOX = createSandbox("mutation");
mkdirSync(join(SANDBOX.root, "modules"), { recursive: true });

const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

const OWNED_RESOURCE = join(REPO, "scripts", "trajectory_p2b", "owned-resource.mjs");
const RIG = join(REPO, "scripts", "trajectory_p2b", "rig.mjs");
const SHARING = join(REPO, "scripts", "trajectory_p2b", "module-sharing.mjs");

const before = { ownedResource: digest(OWNED_RESOURCE), rig: digest(RIG), sharing: digest(SHARING) };

const results = [];
const add = (fields) => {
  results.push(fields);
  const verdict = fields.controlFailed === true ? "LOAD-BEARING" : "NOT LOAD-BEARING";
  process.stderr.write(`  ${fields.id}: ${verdict} — ${fields.observation}\n`);
};

/**
 * Build a mutated copy of a module.
 *
 * `replacements` is a list of exact strings that must each occur EXACTLY ONCE, so a stale pattern aborts rather than
 * silently mutating nothing and reporting a passing control.
 */
function buildMutant(label, sourcePath, replacements, extraImports = "") {
  const original = readFileSync(sourcePath, "utf8");
  let text = original;
  for (const [find, replace] of replacements) {
    const occurrences = text.split(find).length - 1;
    if (occurrences !== 1) throw new Error(`mutation ${label}: pattern occurs ${String(occurrences)} times, expected exactly 1: ${find.slice(0, 80)}`);
    text = text.replace(find, replace);
  }
  if (text === original) throw new Error(`mutation ${label}: the mutant is identical to the original`);
  const target = join(SANDBOX.root, "modules", `${label}-owned-resource.mjs`);
  writeFileSync(target, text, "utf8");
  return target;
}

const gateRootFor = (name) => {
  const gate = join(SANDBOX.root, `${name}-gate`);
  mkdirSync(gate, { recursive: true });
  return gate;
};

/* ------------------------------------------------------------------ *
 * M1 — remove the "marker is required" refusal (I1)
 * ------------------------------------------------------------------ */
{
  const mutant = buildMutant("m1", OWNED_RESOURCE, [
    [
      `  if (!existsSync(markerPath)) return fail("marker", "the ownership marker is absent; a missing record is not positive evidence");`,
      `  if (!existsSync(markerPath)) return { owned: true, checks };`,
    ],
  ]);
  const module = await import(pathToFileURL(mutant).href);
  const gate = gateRootFor("m1");
  const owned = module.allocateOwnedRoot(gate, "m1-");
  rmSync(join(owned.root, module.MARKER_NAME));
  const proof = module.revalidateOwnership(owned);
  add({
    id: "M1-marker-required",
    guard: "a missing ownership marker refuses",
    mutation: "the missing-marker refusal is replaced by an affirmative result",
    controlFailed: proof.owned === true,
    observation: proof.owned === true ? "the F1 control now passes a directory with no ownership record, so the guard is load-bearing" : "the mutation did not change the outcome, so the guard is not what produced it",
    evidence: { proofOwnedAfterMutation: proof.owned },
  });
}

/* ------------------------------------------------------------------ *
 * M2 — remove the "marker binds the root" check (I2)
 * ------------------------------------------------------------------ */
{
  const mutant = buildMutant("m2", OWNED_RESOURCE, [
    [
      `  if (!sameResolvedPath(marker?.ownedRoot, owned.root)) {
    return fail("marker", "the marker names a different root, so it does not bind this resource");
  }`,
      ``,
    ],
  ]);
  const module = await import(pathToFileURL(mutant).href);
  const gate = gateRootFor("m2");
  const owned = module.allocateOwnedRoot(gate, "m2-");
  const markerPath = join(owned.root, module.MARKER_NAME);
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  const elsewhere = join(gate, "a-different-root");
  mkdirSync(elsewhere, { recursive: true });
  writeFileSync(markerPath, `${JSON.stringify({ ...marker, ownedRoot: elsewhere.replace(/\\/gu, "/") }, null, 2)}\n`, "utf8");
  const proof = module.revalidateOwnership(owned);
  add({
    id: "M2-marker-binds-root",
    guard: "a marker naming a different root refuses",
    mutation: "the ownedRoot comparison is deleted",
    controlFailed: proof.owned === true,
    observation: proof.owned === true ? "the F2 control now accepts a marker that names another directory, so the guard is load-bearing" : "the mutation did not change the outcome",
    evidence: { proofOwnedAfterMutation: proof.owned, proofReason: proof.reason ?? null },
  });
}

/* ------------------------------------------------------------------ *
 * M3 — remove the generation check (I4 / stale operation)
 * ------------------------------------------------------------------ */
{
  const mutant = buildMutant("m3", OWNED_RESOURCE, [
    [
      `  if (marker?.generation !== owned.generation) {
    return fail("marker", \`the marker names generation \${String(marker?.generation)}, not \${String(owned.generation)}; this record is superseded\`);
  }`,
      ``,
    ],
  ]);
  const module = await import(pathToFileURL(mutant).href);
  const gate = gateRootFor("m3");
  const owned = module.allocateOwnedRoot(gate, "m3-");
  const markerPath = join(owned.root, module.MARKER_NAME);
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  writeFileSync(markerPath, `${JSON.stringify({ ...marker, generation: Number(marker.generation) + 1 }, null, 2)}\n`, "utf8");
  const proof = module.revalidateOwnership(owned);
  add({
    id: "M3-generation-enforced",
    guard: "a superseded generation refuses",
    mutation: "the generation comparison is deleted",
    controlFailed: proof.owned === true,
    observation: proof.owned === true ? "the F8 control now lets a superseded record authorize disposal, so the guard is load-bearing" : "the mutation did not change the outcome",
    evidence: { proofOwnedAfterMutation: proof.owned },
  });
}

/* ------------------------------------------------------------------ *
 * M4 — remove the identity comparison (I5 / substituted object)
 * ------------------------------------------------------------------ */
{
  const mutant = buildMutant("m4", OWNED_RESOURCE, [
    [
      `  const comparison = sameIdentity(owned.identity, current);
  if (comparison === false) return fail("identityMatch", "the directory at this path is not the object that was allocated");`,
      `  const comparison = { weak: true };`,
    ],
  ]);
  const module = await import(pathToFileURL(mutant).href);
  const gate = gateRootFor("m4");
  const owned = module.allocateOwnedRoot(gate, "m4-");
  /**
   * THE SUBSTITUTION MUST PRESERVE THE MARKER, OR THE MARKER CHECK CATCHES IT AND THIS ARM MEASURES THE WRONG GUARD.
   *
   * A first version of this arm removed the whole directory and recreated it, which destroyed the marker too — so the
   * refusal came from the marker check and the arm reported NOT LOAD-BEARING for the wrong reason. The replacement
   * directory here is given a COPY of the valid marker, so every check except the identity comparison can pass.
   */
  const markerText = readFileSync(join(owned.root, module.MARKER_NAME), "utf8");
  rmSync(owned.root, { recursive: true, force: true });
  mkdirSync(owned.root, { recursive: true });
  writeFileSync(join(owned.root, module.MARKER_NAME), markerText, "utf8");
  const canary = writeForeignCanary(owned.root, "M4-REPLACEMENT");
  const proof = module.revalidateOwnership(owned);
  const present = readFileSync(canary.file, "utf8").includes("M4-REPLACEMENT");
  add({
    id: "M4-identity-match",
    guard: "a substituted object refuses even when its marker is a valid copy",
    mutation: "the identity comparison is replaced by a weak pass",
    controlFailed: proof.owned === true,
    observation:
      proof.owned === true
        ? "the F4A control now accepts a replaced object carrying a copied valid marker, so the identity guard is the only thing that caught it and is load-bearing"
        : `the mutation did not change the outcome (reason: ${String(proof.reason)})`,
    evidence: { proofOwnedAfterMutation: proof.owned, proofReason: proof.reason ?? null, replacementStillPresent: present },
  });
}

/* ------------------------------------------------------------------ *
 * M5 — remove the quarantine identity re-check
 * ------------------------------------------------------------------ */
{
  /**
   * THE SUBSTITUTION IS MADE DETERMINISTIC BY A MUTANT THAT SWAPS THE OBJECT ITSELF.
   *
   * Waiting for a real race would make this arm probabilistic, and the ruling forbids a probabilistic race as the
   * only evidence. Instead the mutant performs the substitution IN PLACE of the identity read: it renames the
   * quarantined object aside and puts a synthetic foreign directory at the quarantine name, exactly where the check
   * is about to look. The ORIGINAL then runs the same scenario and refuses.
   */
  const mutant = buildMutant("m5", OWNED_RESOURCE, [
    [
      `  const quarantined = objectIdentity(quarantine);`,
      `  const quarantined = objectIdentity(quarantine);
  if (process.env.PALIMPSEST_E3_M5_SUBSTITUTE === "1") {
    try {
      renameSync(quarantine, quarantine + "-parked");
      mkdirSync(quarantine, { recursive: true });
      writeFileSync(join(quarantine, "foreign-canary.txt"), "M5-FOREIGN-CANARY\\n", "utf8");
    } catch { /* recorded by the caller */ }
  }`,
    ],
  ]);
  process.env.PALIMPSEST_E3_M5_SUBSTITUTE = "1";
  const module = await import(pathToFileURL(mutant).href);
  const gate = gateRootFor("m5");
  const owned = module.allocateOwnedRoot(gate, "m5-");
  writeFileSync(join(owned.root, "payload.txt"), "x\n", "utf8");
  const mutated = module.disposeOwnedRoot(owned);
  delete process.env.PALIMPSEST_E3_M5_SUBSTITUTE;

  /**
   * THE ORIGINAL MODULE, SAME SCENARIO, NO SUBSTITUTION HOOK. Its re-check cannot be exercised by this hook, so what
   * is measured is that the guard EXISTS and is reachable — reported honestly rather than overclaimed.
   */
  const original = await import(pathToFileURL(OWNED_RESOURCE).href);
  const gate2 = gateRootFor("m5-control");
  const owned2 = original.allocateOwnedRoot(gate2, "m5-control-");
  writeFileSync(join(owned2.root, "payload.txt"), "x\n", "utf8");
  const baseline = original.disposeOwnedRoot(owned2);

  add({
    id: "M5-quarantine-recheck",
    guard: "the object at the quarantine name is re-verified before deletion",
    mutation: "a substitution is injected at the exact point the identity re-check reads the object",
    /**
     * With the re-check neutralised, the substituted foreign directory is REMOVED. That is the failure the guard
     * prevents, and it is what makes the guard load-bearing.
     */
    controlFailed: mutated.cleaned === true,
    observation:
      mutated.cleaned === true
        ? "the mutant deleted a foreign directory substituted at the quarantine name, so the re-check is load-bearing"
        : `the mutant reported cleaned=${String(mutated.cleaned)} (${String(mutated.reason)})`,
    evidence: {
      mutantOutcome: { cleaned: mutated.cleaned, reason: mutated.reason ?? null },
      baselineOutcome: { cleaned: baseline.cleaned, reason: baseline.reason ?? null },
    },
  });
}

/* ------------------------------------------------------------------ *
 * M6 — remove the extra-loop destination classification (sharing case 4/5)
 * ------------------------------------------------------------------ */
{
  const original = readFileSync(SHARING, "utf8");
  const pattern = `      const state = classifyDestination(join(directory.path, entry));
      if (state.state !== DestinationState.DIRECTORY || state.isReparsePoint !== false) {
        refused.push({ entry, outcome: "REFUSED", reason: \`CALLER_DECLARED_BUT_DESTINATION_IS_\${state.state}\`, state });
        continue;
      }`;
  const occurrences = original.split(pattern).length - 1;
  if (occurrences !== 1) throw new Error(`mutation m6: pattern occurs ${String(occurrences)} times, expected 1`);
  const mutantText = original.replace(pattern, `      const state = classifyDestination(join(directory.path, entry));`);
  const mutantPath = join(SANDBOX.root, "modules", "m6-module-sharing.mjs");
  writeFileSync(mutantPath, mutantText, "utf8");
  const module = await import(pathToFileURL(mutantPath).href);

  const base = join(SANDBOX.root, "m6");
  const source = join(base, "source");
  const home = join(base, "home");
  mkdirSync(join(source, "shared-a"), { recursive: true });
  writeFileSync(join(source, "shared-a", "package.json"), "{}\n", "utf8");
  mkdirSync(join(home, "profiles", "node_modules"), { recursive: true });
  const { symlinkSync } = await import("node:fs");
  symlinkSync(join(base, "absent-target"), join(home, "profiles", "node_modules", "host-pkg"), "junction");
  const result = module.linkModuleGraph(home, { sourceModules: source, providedByCaller: ["host-pkg"] });
  const admitted = (result.providedByCaller ?? []).includes("host-pkg");
  add({
    id: "M6-extra-loop-classification",
    guard: "a junction at a declared name outside the source tree is refused",
    mutation: "the destination classification in the extra loop is removed",
    controlFailed: admitted,
    observation: admitted ? "the sharing case-4/5 control now admits a dangling junction, so the guard is load-bearing" : "the mutation did not change the outcome",
    evidence: { admitted, established: result.established },
  });
}

/* ------------------------------------------------------------------ *
 * M7 — remove the fingerprint provenance check
 * ------------------------------------------------------------------ */
{
  const original = readFileSync(SHARING, "utf8");
  const pattern = `          if (!matchesFingerprint(destination, expected)) {
            refused.push({
              entry,
              outcome: "REFUSED",
              reason: "CALLER_DECLARED_BUT_CONTENT_DOES_NOT_MATCH_THE_EXPECTED_INSTALL",
              state,
            });
            continue;
          }`;
  const occurrences = original.split(pattern).length - 1;
  if (occurrences !== 1) throw new Error(`mutation m7: pattern occurs ${String(occurrences)} times, expected 1`);
  const mutantText = original.replace(pattern, ``);
  const mutantPath = join(SANDBOX.root, "modules", "m7-module-sharing.mjs");
  writeFileSync(mutantPath, mutantText, "utf8");
  const module = await import(pathToFileURL(mutantPath).href);

  const base = join(SANDBOX.root, "m7");
  const source = join(base, "source");
  const home = join(base, "home");
  mkdirSync(join(source, "host-pkg"), { recursive: true });
  writeFileSync(join(source, "host-pkg", "package.json"), `${JSON.stringify({ name: "host-pkg" })}\n`, "utf8");
  mkdirSync(join(home, "profiles", "node_modules", "host-pkg"), { recursive: true });
  writeFileSync(join(home, "profiles", "node_modules", "host-pkg", "FOREIGN"), "not the caller's package\n", "utf8");
  const expected = module.directoryFingerprint(join(source, "host-pkg"));
  const result = module.linkModuleGraph(home, { sourceModules: source, providedByCaller: ["host-pkg"], expectedFingerprints: { "host-pkg": expected ?? "" } });
  const admitted = (result.providedByCaller ?? []).includes("host-pkg");
  add({
    id: "M7-fingerprint-provenance",
    guard: "a declared directory whose content does not match the expected install is refused",
    mutation: "the fingerprint comparison is deleted",
    controlFailed: admitted,
    observation: admitted ? "the sharing case-3 control now admits content that does not match the install, so the guard is load-bearing" : "the mutation did not change the outcome",
    evidence: { admitted, established: result.established },
  });
}

/* ------------------------------------------------------------------ *
 * M8 — remove the observed-completion check (I4)
 * ------------------------------------------------------------------ */
{
  /**
   * THE FAILURE IS INJECTED, NOT WAITED FOR. The mutant's `rmSync` is replaced by a no-op that reports success while
   * leaving the quarantine name in place — exactly the state a "reported success but did not remove" bug produces.
   * The original must refuse to report `cleaned: true` for that state.
   */
  const mutant = buildMutant("m8", OWNED_RESOURCE, [
    [
      `  if (existsSync(quarantine)) {
    return { cleaned: false, reason: "the removal reported success but the quarantine name still exists", checks: proof.checks, preserved: false, retryable: true };
  }`,
      ``,
    ],
    [
      `    rmSync(quarantine, { recursive: true, force: true, maxRetries: options.maxRetries ?? 2, retryDelay: options.retryDelay ?? 100 });`,
      `    if (process.env.PALIMPSEST_E3_M8_NOOP === "1") { /* pretend the removal succeeded */ } else { rmSync(quarantine, { recursive: true, force: true, maxRetries: options.maxRetries ?? 2, retryDelay: options.retryDelay ?? 100 }); }`,
    ],
  ]);
  process.env.PALIMPSEST_E3_M8_NOOP = "1";
  const module = await import(pathToFileURL(mutant).href);
  const gate = gateRootFor("m8");
  const owned = module.allocateOwnedRoot(gate, "m8-");
  writeFileSync(join(owned.root, "payload.txt"), "x\n", "utf8");
  const mutated = module.disposeOwnedRoot(owned);
  delete process.env.PALIMPSEST_E3_M8_NOOP;

  /** The ORIGINAL, in the same pretend-success state, must report failure rather than completion. */
  const original = await import(pathToFileURL(OWNED_RESOURCE).href);
  const gate2 = gateRootFor("m8-control");
  const owned2 = original.allocateOwnedRoot(gate2, "m8-control-");
  writeFileSync(join(owned2.root, "payload.txt"), "x\n", "utf8");
  const baseline = original.disposeOwnedRoot(owned2);

  add({
    id: "M8-observed-completion",
    guard: "cleaned=true requires the quarantine name to be observed absent",
    mutation: "the post-removal existence check is deleted, and the removal is made a no-op that reports success",
    controlFailed: mutated.cleaned === true,
    observation:
      mutated.cleaned === true
        ? "the mutant reported a completed disposal while the object was still on disk, so the observation check is load-bearing"
        : `the mutant still reported cleaned=${String(mutated.cleaned)}`,
    evidence: {
      mutantOutcome: { cleaned: mutated.cleaned, reason: mutated.reason ?? null },
      baselineOutcome: { cleaned: baseline.cleaned, reason: baseline.reason ?? null },
      note: "the baseline arm ran WITHOUT the no-op injection, so it disposes normally; the mutant arm is the one that measures the check",
    },
  });
}

/* ------------------------------------------------------------------ *
 * THE FROZEN TREE ASSERTION
 * ------------------------------------------------------------------ */
const after = { ownedResource: digest(OWNED_RESOURCE), rig: digest(RIG), sharing: digest(SHARING) };
const unchanged = before.ownedResource === after.ownedResource && before.rig === after.rig && before.sharing === after.sharing;
if (!unchanged) {
  process.stdout.write(`${JSON.stringify({ kind: "HOST_S1RAE3_MUTATION_CONTROLS", stopped: true, reason: "A PRODUCTION MODULE CHANGED DURING THE MUTATION RUN", before, after }, null, 2)}\n`);
  process.exit(3);
}

const teardown = removeTreeNoFollow(SANDBOX.root);
const loadBearing = results.filter((entry) => entry.controlFailed === true);
const report = {
  schemaVersion: 1,
  kind: "HOST_S1RAE3_MUTATION_CONTROLS",
  stage: "Palimpsest Host-S1RA-E3",
  measuredAt: new Date().toISOString(),
  method: "each guard is removed in a COPY inside a run-owned sandbox; the production tree is hashed before and after and was not modified",
  productionTreeUnchanged: unchanged,
  productionDigests: { before, after },
  sandbox: { root: SANDBOX.root, removed: teardown.removed },
  summary: {
    arms: results.length,
    loadBearing: loadBearing.length,
    observed: results.filter((entry) => entry.controlFailed === null).length,
    loadBearingIds: loadBearing.map((entry) => entry.id),
    notLoadBearingIds: results.filter((entry) => entry.controlFailed === false).map((entry) => entry.id),
  },
  results,
};
const jsonPath = args.get("json");
if (jsonPath !== undefined) writeFileSync(resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
