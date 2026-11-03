/**
 * R3-L0C §10 — THE MATRIX-LAYOUT CONTAINMENT TESTS.
 *
 * The R3-L0B canaries run against a CANARY layout. These run against the REAL matrix layout, because the two are
 * not the same shape and the difference is exactly where a containment defect hides: in the matrix, each unit's
 * durable state sits BESIDE its world and every sibling unit is one `..` away, whereas the canary layout has no
 * unit tree at all.
 *
 * THE FINDING THIS SUITE EXISTS FOR. Measured, not reasoned: with only R3-L0B's declared roots, a worker in
 * `units/<mine>/world` READS `units/<other>/world/ledger.mjs` successfully. The shipped fence derives
 * `<repository>/.palimpsest` from the worker's own position, so it labels the worker's OWN state and knows nothing
 * about the other units. Declaring each sibling world closes it.
 *
 * That is §10 preference 2 in its exact intended use: a root that position cannot hide is DECLARED. The unit root
 * cannot be declared instead, because `units/` is an ancestor of the worker's own world and labelling an ancestor
 * kills the worker — so each sibling is named individually.
 *
 * These tests drive the shipped ACL runner and the shipped kernel label, so the result is a measurement of the
 * real token rather than a reading of source.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildIsolatedLayout } from "../scripts/r3l0b/containment.mjs";
import { resolveSandbox, runConfined } from "../scripts/r3l0b/canaries.mjs";
import { runProtectedRoots } from "../scripts/r3l0c/trajectory.mjs";

const REPO_ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, "$1");
const RUN_ROOT = join(tmpdir(), "palimpsest-r3l0c-matrix-containment");
const UNIT_IDS = ["b0-C", "b0-H"];
const NONCE = "SIBLING-WORLD-NONCE-4F2A";
const sandbox = resolveSandbox();

/** The probe, written into the worker's own world so it runs from inside the confined token. */
function writeProbe(world: string): string {
  const probe = join(world, "sib-probe.mjs");
  writeFileSync(probe, `import { readFileSync } from "node:fs";
import { join } from "node:path";
const out = {};
const W = ${JSON.stringify(world)};
const targets = {
  SIBLING_WORLD_TRAVERSAL: join(W, "..", "..", "b0-H", "world", "ledger.mjs"),
  SIBLING_ABSOLUTE: ${JSON.stringify(join(RUN_ROOT, "units", "b0-H", "world", "ledger.mjs"))},
  SIBLING_STATE: join(W, "..", "..", "b0-H", "state", "orchestration.sqlite"),
  OWN_WORLD: join(W, "README.md"),
};
for (const [name, p] of Object.entries(targets)) {
  try { const c = readFileSync(p, "utf8"); out[name] = { read: true, nonce: c.includes(${JSON.stringify(NONCE)}) }; }
  catch (e) { out[name] = { read: false, code: e?.code ?? String(e) }; }
}
process.stdout.write("R3L0B_PROBE " + JSON.stringify(out) + String.fromCharCode(10));
`, "utf8");
  return probe;
}

/** Fence the given roots and run the probe inside the shipped runner. */
function probeWith(roots: readonly string[], world: string, probe: string) {
  const report = runConfined({ sandbox, world, probePath: probe, root: RUN_ROOT });
  return report.observations ?? {};
}

let undeclared: Record<string, { read: boolean; nonce?: boolean; code?: string }> = {};
let declared: Record<string, { read: boolean; nonce?: boolean; code?: string }> = {};
/**
 * What each fence application actually ACHIEVED.
 *
 * R3-WR3 §7: the fence module caches its binding-seam resolution — INCLUDING a failure — so the ORDER of the
 * environment setup against the first `ensureReadFence` call decides whether the fence works at all. This
 * harness previously set `PALIMPSEST_DSH_ROOT` only inside `probeWith`, i.e. AFTER the first fence call, so the
 * first call latched a resolution failure into the cache and the DECLARED fence then silently applied NOTHING.
 * The test failed not because confinement was broken but because the fence was never applied.
 *
 * The fix is the environment setup, moved before the first call — and these records are asserted so that a
 * fence which applies nothing can never again be mistaken for confinement working.
 */
let undeclaredFence: { supported: boolean; rootsVerified: boolean; treesVerified: boolean; unavailable?: string } | null = null;
let declaredFence: { supported: boolean; rootsVerified: boolean; treesVerified: boolean; unavailable?: string } | null = null;

beforeAll(async () => {
  buildIsolatedLayout(RUN_ROOT, UNIT_IDS);
  const mine = join(RUN_ROOT, "units", "b0-C", "world");
  const sibling = join(RUN_ROOT, "units", "b0-H", "world");
  mkdirSync(mine, { recursive: true });
  mkdirSync(sibling, { recursive: true });
  mkdirSync(join(RUN_ROOT, "units", "b0-H", "state"), { recursive: true });
  writeFileSync(join(sibling, "ledger.mjs"), `// ${NONCE}\nexport const x = 1;\n`, "utf8");
  writeFileSync(join(mine, "README.md"), "# mine\n", "utf8");
  const probe = writeProbe(mine);

  const { ensureReadFence } = await import(pathToFileURL(join(REPO_ROOT, "host", "deployment", "runtime", "read_fence.js")).href);
  /**
   * THE ENVIRONMENT MUST BE SET BEFORE THE FIRST FENCE CALL. The shipped fence resolves its binding seam from
   * `PALIMPSEST_DSH_ROOT` and caches the result for the process, so setting it later is not merely late — it is
   * ineffective, because the cached value wins. This is what `scripts/r3l0b/canaries.mjs` already does.
   */
  process.env.PALIMPSEST_DSH_ROOT = sandbox.root;

  /** The R3-L0B-only declaration: the private sibling root, which does not cover the real unit tree. */
  const undeclaredApplied = ensureReadFence({ roots: [join(RUN_ROOT, "private", "units")], world: mine });
  undeclaredFence = { supported: undeclaredApplied.result?.supported === true, rootsVerified: undeclaredApplied.rootsVerified === true, treesVerified: undeclaredApplied.treesVerified === true, unavailable: undeclaredApplied.result?.unavailable };
  undeclared = probeWith([], mine, probe);

  /** The corrected declaration: every sibling world named individually. */
  const declaredApplied = ensureReadFence({ roots: runProtectedRoots(RUN_ROOT, UNIT_IDS, "b0-C"), world: mine });
  declaredFence = { supported: declaredApplied.result?.supported === true, rootsVerified: declaredApplied.rootsVerified === true, treesVerified: declaredApplied.treesVerified === true, unavailable: declaredApplied.result?.unavailable };
  declared = probeWith([], mine, probe);
}, 900_000);

afterAll(async () => {
  const { rmSync } = await import("node:fs");
  rmSync(RUN_ROOT, { recursive: true, force: true });
});

describe("R3-L0C §10 — the real matrix layout containment", () => {
  it("§10 the probe ran and can read its own world, so an EPERM result is meaningful", () => {
    expect(undeclared.OWN_WORLD?.read, "the probe could not read the world it runs in").toBe(true);
    expect(declared.OWN_WORLD?.read).toBe(true);
  });

  it("§7 the fence actually APPLIED, so a silent no-op cannot pass as confinement", () => {
    /**
     * THE GUARD AGAINST THE DEFECT THIS SUITE HAD. The fence module caches its binding-seam resolution,
     * including a FAILURE, so a fence call made before `PALIMPSEST_DSH_ROOT` is set applies nothing at all and
     * reports no error. Without this assertion the DECLARED test would "fail" with `read: true` and look like
     * broken confinement, when in fact no fence had been applied. Asserting the fence's own outcome first is
     * what makes the containment result below a statement about the boundary rather than about setup order.
     */
    expect(undeclaredFence, "the undeclared fence result must be recorded").not.toBeNull();
    expect(declaredFence, "the declared fence result must be recorded").not.toBeNull();
    expect(declaredFence!.supported, `the fence is unsupported on this host: ${String(declaredFence!.unavailable)}`).toBe(true);
    expect(declaredFence!.rootsVerified, "the declared fence did not verify its roots").toBe(true);
    expect(declaredFence!.treesVerified, "the declared fence did not verify its trees").toBe(true);
  });

  it("§10 the DEFECT is real: without the sibling declaration a worker READS a sibling world", () => {
    /**
     * This is the measured finding. It is asserted rather than described because the repair is only justified if
     * the defect existed, and because a future layout change that reintroduced it would otherwise go unnoticed.
     */
    expect(undeclared.SIBLING_WORLD_TRAVERSAL?.read, "the undeclared layout did not expose a sibling world, so this suite is not measuring what it claims").toBe(true);
    expect(undeclared.SIBLING_WORLD_TRAVERSAL?.nonce).toBe(true);
  });

  it("§10 the DECLARED layout blocks the sibling world, by traversal and by absolute path", () => {
    expect(declared.SIBLING_WORLD_TRAVERSAL?.read).toBe(false);
    expect(declared.SIBLING_WORLD_TRAVERSAL?.code).toBe("EPERM");
    expect(declared.SIBLING_ABSOLUTE?.read).toBe(false);
    expect(declared.SIBLING_ABSOLUTE?.code).toBe("EPERM");
  });

  it("§10 the declaration names every sibling world and never the units root", () => {
    const roots = runProtectedRoots(RUN_ROOT, UNIT_IDS, "b0-C");
    /** The worker's OWN world must not be declared: labelling an ancestor of the world kills the worker. */
    expect(roots).not.toContain(join(RUN_ROOT, "units"));
    expect(roots).not.toContain(join(RUN_ROOT, "units", "b0-C"));
    expect(roots).not.toContain(join(RUN_ROOT, "units", "b0-C", "world"));
    /** Every OTHER unit's world and every unit's state is declared. */
    expect(roots).toContain(join(RUN_ROOT, "units", "b0-H", "world"));
    expect(roots).toContain(join(RUN_ROOT, "units", "b0-C", "state"));
    expect(roots).toContain(join(RUN_ROOT, "units", "b0-H", "state"));
  });

  it("§10 the host-private experiment roots are declared too, so a layout mistake fails closed", () => {
    const roots = runProtectedRoots(RUN_ROOT, UNIT_IDS, "b0-C");
    for (const leaf of ["oracle", "reference", "control", "evidence"]) {
      expect(roots, `${leaf} must be declared`).toContain(join(RUN_ROOT, "private", leaf));
    }
  });
});
