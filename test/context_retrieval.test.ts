import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { compileContextRequirement } from "../src/context/index.js";
import { FakeGitPort, GitCliPort } from "../src/effects/index.js";

describe("context requirement compiler (PLMP-CTX-2 P1)", () => {
  const input = {
    projectId: "p1",
    taskId: "task-1",
    requiredArtifacts: ["report.md", "report.md", "schema.json"],
    writePaths: ["src/router.ts"],
    upstreamWritePaths: ["src/router_state.ts", "src/router.ts"],
    priorFailureEvidence: ["EVD-9", "EVD-7"],
    staleRefs: ["ARCH-ROUTING@6", "EVD-42"],
  };

  it("CTX2-A01: the five requirement classes derive from their declared sources", () => {
    const requirement = compileContextRequirement(input);
    expect(requirement.exact).toEqual(["report.md", "schema.json"]); // dedup + sorted
    expect(requirement.codePaths).toEqual(["src/router.ts", "src/router_state.ts"]);
    expect(requirement.evidenceSubjects).toEqual(["EVD-7", "EVD-9"]);
    expect(requirement.historical).toEqual([]); // V0 placeholder
    expect(requirement.taskId).toBe("task-1");
  });

  it("CTX2-A02: the forbidden set is the stale set verbatim", () => {
    const requirement = compileContextRequirement(input);
    expect(requirement.forbiddenStale).toEqual(["ARCH-ROUTING@6", "EVD-42"]);
  });

  it("CTX2-A08: the compiler is a pure function of its inputs", () => {
    expect(JSON.stringify(compileContextRequirement(input))).toBe(
      JSON.stringify(compileContextRequirement(input)),
    );
  });
});

describe("lexical worktree scan (PLMP-CTX-2 P2)", () => {
  it("CTX2-A03 (fake): seeded files match terms with deterministic order and cap", async () => {
    const git = new FakeGitPort();
    git.seedWorktreeFiles("wt-1", {
      "src/router.ts": "const modulation = 1;\nexport function forward() {}\n",
      "docs/notes.md": "modulation failed before\nunrelated line\nMODULATION again\n",
    });
    const matches = await git.scanLexical({
      worktreeId: "wt-1",
      terms: ["Modulation"],
      maxMatches: 2,
    });
    expect(matches).toHaveLength(2); // capped mid-scan, in path/line order
    expect(matches[0]).toMatchObject({ path: "docs/notes.md", line: 1, term: "modulation" });
    expect(matches[1]).toMatchObject({ path: "docs/notes.md", line: 3 });

    // Without the cap all four hits surface, docs before src (path order).
    const all = await git.scanLexical({ worktreeId: "wt-1", terms: ["modulation"] });
    expect(all.map((match) => `${match.path}:${match.line}`)).toEqual([
      "docs/notes.md:1",
      "docs/notes.md:3",
      "src/router.ts:1",
    ]);

    // Glob filter and empty result set.
    expect(
      await git.scanLexical({ worktreeId: "wt-1", terms: ["modulation"], glob: "src/" }),
    ).toHaveLength(1);
    expect(await git.scanLexical({ worktreeId: "wt-1", terms: ["nonexistent"] })).toEqual([]);
    expect(await git.scanLexical({ worktreeId: "wt-1", terms: [] })).toEqual([]);
  });

  it("CTX2-A03 (cli): the real port scans a real directory tree", async () => {
    const root = mkdtempSync(join(tmpdir(), "palimpsest-scan-"));
    const worktreeRoot = join(root, "worktrees");
    const worktree = join(worktreeRoot, "wt-1");
    const nested = join(worktree, "src");
    mkdirSync(nested, { recursive: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(worktree, "README.md"), "population modulation notes\n");
    writeFileSync(join(nested, "router.py"), "def forward():\n    return MODULATION\n");

    const port = new GitCliPort(root, worktreeRoot);
    const matches = await port.scanLexical({ worktreeId: "wt-1", terms: ["modulation"] });
    expect(matches.map((match) => match.path).sort()).toEqual([
      "README.md",
      "src/router.py",
    ]);
    const nestedMatch = matches.find((match) => match.path === "src/router.py")!;
    expect(nestedMatch.line).toBe(2);
    expect(nestedMatch.term).toBe("modulation");

    // .git directories are skipped.
    mkdirSync(join(worktree, ".git"), { recursive: true });
    const { writeFileSync: wf2 } = await import("node:fs");
    wf2(join(worktree, ".git", "config"), "modulation inside git dir\n");
    const filtered = await port.scanLexical({ worktreeId: "wt-1", terms: ["modulation"] });
    expect(filtered.map((match) => match.path)).not.toContain(".git/config");
  });
});
