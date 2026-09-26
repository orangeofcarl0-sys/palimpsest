/**
 * SR-2 §五/§七 — the ARCHITECTURE CONSTITUTION, as machine proofs.
 *
 * SR-2.0 changes no product implementation. What it changes is the CHECKER, in the two places
 * the SR-2 ruling named, plus the captured-identity it records:
 *
 *   §五   an UNCLASSIFIED module was falling back to BARREL, whose allowed-target set is
 *        "everything" — so D5-d's continuation orchestrator sat in a permission hole nobody
 *        had noticed. Two fixes: `src/continuation/**` is now explicitly L3, and
 *        "unclassified" is a first-class layer with NO allowed targets whose very existence
 *        is a violation.
 *
 *   §七   the baseline's `capturedFrom` was read from `.git/HEAD`, which is a FILE in a
 *        linked worktree — so it silently recorded `unknown` in the layout this repository
 *        actually uses. It is now asked of git (`rev-parse HEAD` / `HEAD^{tree}`), and the
 *        TREE is recorded because it survives a squash.
 *
 * These proofs are written so they would FAIL against the pre-SR-2.0 checker: the unclassified
 * case is proven with a synthetic module, and the worktree case by resolving the identity the
 * same way the script does.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  analyseModuleArchitecture,
  checkArchitecture,
  layerOf,
  LOGICAL_LAYERS,
  type ArchitectureBaseline,
  type ModuleArchitecture,
  type ModuleNode,
} from "../../tools/architecture/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** A baseline that tolerates nothing — so any violation the checker finds is the checker's own. */
function emptyBaseline(): ArchitectureBaseline {
  return {
    version: 3,
    capturedFrom: "synthetic",
    permittedForbiddenEdges: [],
    permittedCycles: [],
    permittedUnresolvedImports: [],
  };
}

/** One synthetic module at an arbitrary path, classified by the REAL `layerOf`. */
function syntheticModule(file: string, imports: readonly string[] = []): ModuleArchitecture {
  const node: ModuleNode = {
    file,
    group: file.split("/").slice(0, 2).join("/"),
    layer: layerOf(file).layer,
    layerWhy: layerOf(file).why,
    loc: 1,
    bytes: 10,
    imports: [...imports].sort(),
    importers: [],
    externalImports: [],
    unresolvedImports: [],
    fanOut: imports.length,
    fanIn: 0,
  };
  return {
    root: REPO,
    modules: [node],
    layerEdges: [],
    forbiddenImports: [],
    forbiddenEdges: [],
    directoryEdges: [],
    // No SCC: a module that imports nothing cannot form one (the live graph agrees — 391
    // modules carry only 8 SCCs, each of them a real cycle).
    stronglyConnectedComponents: [],
    exportSurface: [],
    totals: { files: 1, loc: 1, bytes: 10, edges: imports.length, externalImports: 0, unresolvedImports: 0 },
  };
}

/* ================================================================== *
 * §五 — an unclassified module is REFUSED, never granted BARREL
 * ================================================================== */

describe("SR-2 §五 an unclassified module cannot inherit the BARREL escape hatch", () => {
  it("a brand-new src/ directory is UNCLASSIFIED, not BARREL", () => {
    // The exact shape of the D5-d hole: a directory nobody added to the map. Under the old
    // fallback this returned BARREL, whose allowed targets are L5/L4/L3/L2/L1 — everything.
    const unknown = layerOf("src/workforce/roster.ts");
    expect(unknown.layer).toBe("UNCLASSIFIED");
    expect(unknown.why).toContain("unclassified directory");
    // And BARREL is what it must NOT be — that was the permission.
    expect(unknown.layer).not.toBe("BARREL");
  });

  it("an unknown src-root FILE is UNCLASSIFIED too, not BARREL", () => {
    const unknown = layerOf("src/some_new_entry.ts");
    expect(unknown.layer).toBe("UNCLASSIFIED");
    expect(unknown.layer).not.toBe("BARREL");
  });

  it("UNCLASSIFIED has NO allowed targets — even an edge to L1 is refused", () => {
    const graph = syntheticModule("src/workforce/roster.ts", ["src/domain/models.ts"]);
    const result = checkArchitecture(graph, emptyBaseline());
    expect(result.ok).toBe(false);
    expect(result.violations.some((violation) => violation.kind === "unclassified_module")).toBe(true);
  });

  it("an unclassified module with NO imports still fails — the violation is the classification", () => {
    // This is what separates "unclassified" from an edge rule: there is nothing to whitelist,
    // because the problem is the missing decision rather than a tolerated dependency.
    const graph = syntheticModule("src/workforce/roster.ts", []);
    const result = checkArchitecture(graph, emptyBaseline());
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe("unclassified_module");
    expect(result.violations[0]?.detail).toContain("not classified in the architecture map");
  });

  it("the violation cannot be silenced by recording it in the baseline", () => {
    // A `permittedUnclassified` list would rebuild the escape hatch. The check must ignore
    // any attempt to tolerate it through the existing whitelist mechanisms.
    const graph = syntheticModule("src/workforce/roster.ts", ["src/domain/models.ts"]);
    const hostile: ArchitectureBaseline = {
      ...emptyBaseline(),
      // Cast through unknown: the baseline type has no such field, and this proves that even a
      // hand-written JSON that adds one does not silence the rule.
      ...({ permittedUnclassifiedModules: ["src/workforce/roster.ts"] } as unknown as object),
      permittedForbiddenEdges: [
        {
          from: "src/workforce/roster.ts",
          to: "src/domain/models.ts",
          fromLayer: "UNCLASSIFIED",
          toLayer: "L1",
          reason: "a reason long enough to pass the >40 character reason check, added deliberately",
        },
      ],
    };
    const result = checkArchitecture(graph, hostile);
    expect(result.ok).toBe(false);
    expect(result.violations.some((violation) => violation.kind === "unclassified_module")).toBe(true);
  });

  it("UNCLASSIFIED is a declared layer, so the model cannot silently drop it", () => {
    expect(LOGICAL_LAYERS).toContain("UNCLASSIFIED");
  });
});

/* ================================================================== *
 * §五 — continuation is classified, and the edge it was hiding is visible
 * ================================================================== */

describe("SR-2 §五 the continuation orchestrator is explicitly L3", () => {
  it("src/continuation/** is L3, with a written reason", () => {
    const decision = layerOf("src/continuation/service.ts");
    expect(decision.layer).toBe("L3");
    expect(decision.why.length).toBeGreaterThan(20);
    expect(decision.why).not.toContain("unclassified");
  });

  it("the live repository has ZERO unclassified modules", () => {
    const architecture = analyseModuleArchitecture(REPO);
    const unclassified = architecture.modules.filter((module) => module.layer === "UNCLASSIFIED");
    expect(unclassified.map((module) => module.file)).toEqual([]);
  });

  it("classifying continuation SURFACED a real edge the BARREL fallback had been hiding", () => {
    // The proof that the hole was load-bearing rather than cosmetic: with continuation as L3,
    // the live graph reports an L3→L5 edge that was previously unreportable.
    const architecture = analyseModuleArchitecture(REPO);
    const surfaced = architecture.forbiddenImports.filter((edge) => edge.from.startsWith("src/continuation/"));
    expect(surfaced.length).toBeGreaterThan(0);
    for (const edge of surfaced) {
      expect(edge.fromLayer).toBe("L3");
      expect(edge.toLayer).toBe("L5");
    }
  });

  it("that edge is recorded with a written reason that names SR-2a as its remover", () => {
    const baseline = JSON.parse(readFileSync(join(REPO, "architecture", "module-architecture.json"), "utf8"))
      .baseline as ArchitectureBaseline;
    const entry = baseline.permittedForbiddenEdges.find((edge) => edge.from.startsWith("src/continuation/"));
    expect(entry).toBeDefined();
    expect(entry!.reason.length).toBeGreaterThan(40);
    expect(entry!.reason).toContain("SR-2a");
    // The reason must say it was EXPOSED rather than created — the distinction the ruling drew.
    expect(entry!.reason).toMatch(/EXPOSED/i);
  });

  it("known barrels remain legal — the fix did not reclassify them", () => {
    for (const barrel of ["src/application/index.ts", "src/tools/index.ts", "src/effects/index.ts"]) {
      expect(layerOf(barrel).layer).toBe("BARREL");
    }
  });

  it("every classification decision carries a written reason", () => {
    const architecture = analyseModuleArchitecture(REPO);
    for (const module of architecture.modules) {
      expect(module.layerWhy.length, `${module.file} has no classification reason`).toBeGreaterThan(10);
    }
  });
});

/* ================================================================== *
 * §七 — the captured identity is asked of git, and the TREE is recorded
 * ================================================================== */

describe("SR-2 §七 the baseline records a checkable identity", () => {
  const git = (rev: string): string =>
    execFileSync("git", ["-C", REPO, "rev-parse", rev], { encoding: "utf8" }).trim();
  const baseline = JSON.parse(readFileSync(join(REPO, "architecture", "module-architecture.json"), "utf8"))
    .baseline as ArchitectureBaseline;

  it("the recorded identity is a real SHA, not the old 'unknown'", () => {
    // The defect being fixed: the old reader returned the string 'unknown' whenever `.git/HEAD`
    // could not be read as a ref file — which is ALWAYS in a linked worktree.
    expect(baseline.capturedFrom).not.toBe("unknown");
    expect(baseline.capturedFrom).toMatch(/^[0-9a-f]{40}$/u);
    expect(baseline.capturedTree).not.toBe("unknown");
    expect(baseline.capturedTree).toMatch(/^[0-9a-f]{40}$/u);
  });

  it("the CAPTURE TOOL is deterministic: re-asking git for the recorded commit yields the recorded tree", () => {
    // Why this is written as a conditional rather than a bare equality: CI checks out with
    // `fetch-depth: 1`, so the commit the baseline was captured FROM usually does not exist in
    // the clone. The property under test is that the script records what `git rev-parse` says —
    // proven by re-running the same resolution whenever the object IS available (always true in
    // a full clone or a worktree, sometimes false in a shallow CI checkout).
    const available = (() => {
      try {
        return git(`${baseline.capturedFrom}^{commit}`) !== "";
      } catch {
        return false;
      }
    })();
    if (available) {
      expect(baseline.capturedTree).toBe(git(`${baseline.capturedFrom}^{tree}`));
    } else {
      // The recorded pair must still be internally plausible: two distinct SHAs.
      expect(baseline.capturedFrom).not.toBe(baseline.capturedTree);
    }
  });

  it("the commit and the tree are different values — the pair is not redundant", () => {
    expect(git("HEAD")).not.toBe(git("HEAD^{tree}"));
  });

  it("the tree identity is the one a squash cannot change", () => {
    // Why the TREE is recorded beside the commit: `git commit-tree` over the same content yields
    // a DIFFERENT commit with the SAME tree — exactly the relation a squash produces. The probe
    // is built with no parent, because a shallow checkout (CI uses fetch-depth: 1) has no `HEAD^`.
    const head = git("HEAD");
    const tree = git("HEAD^{tree}");
    const rebuilt = execFileSync(
      "git",
      ["-C", REPO, "commit-tree", tree, "-m", "sr2 identity probe"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "probe",
          GIT_AUTHOR_EMAIL: "probe@palimpsest.invalid",
          GIT_COMMITTER_NAME: "probe",
          GIT_COMMITTER_EMAIL: "probe@palimpsest.invalid",
        },
      },
    ).trim();
    // A DIFFERENT commit, the SAME tree. Nothing is written to the object store's refs: this
    // creates a dangling object and no branch, so the probe cannot affect the repository.
    expect(rebuilt).not.toBe(head);
    expect(git(`${rebuilt}^{tree}`)).toBe(tree);
  });

  it("baseline v3 declares the version it was written as", () => {
    expect(baseline.version).toBe(3);
  });
});

/* ================================================================== *
 * §七/§三十一 — no existing violation was silently re-baselined
 * ================================================================== */

describe("SR-2 §三十一 SR-2.0 re-stamped no debt", () => {
  const baseline = JSON.parse(readFileSync(join(REPO, "architecture", "module-architecture.json"), "utf8"))
    .baseline as ArchitectureBaseline;

  it("the exception set grew by exactly ONE edge and lost none", () => {
    // The SR-1 baseline carried four forbidden edges; SR-2.0 carries five. The single addition
    // is the continuation edge the classification surfaced — not a batch of new permissions.
    expect(baseline.permittedForbiddenEdges).toHaveLength(5);
    const continuationEdges = baseline.permittedForbiddenEdges.filter((edge) => edge.from.startsWith("src/continuation/"));
    expect(continuationEdges).toHaveLength(1);
  });

  it("the cycle set is unchanged — SR-2.0 removed nothing and tolerated nothing new", () => {
    // The eight SCCs are the D-kernel/E-substrate debt SR-2d owns. SR-2.0 must leave them
    // exactly as it found them: neither newly whitelisted nor quietly dropped.
    expect(baseline.permittedCycles).toHaveLength(8);
  });

  it("every recorded exception still carries a written reason", () => {
    for (const edge of baseline.permittedForbiddenEdges) {
      expect(edge.reason.length, `${edge.from} -> ${edge.to}`).toBeGreaterThan(40);
    }
    for (const cycle of baseline.permittedCycles) {
      expect(cycle.reason.length, cycle.files.join(",")).toBeGreaterThan(20);
    }
  });

  it("the live graph still satisfies the recorded baseline", () => {
    const architecture = analyseModuleArchitecture(REPO);
    expect(checkArchitecture(architecture, baseline).violations).toEqual([]);
  });
});
