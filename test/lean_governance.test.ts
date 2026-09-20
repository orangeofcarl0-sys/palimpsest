/**
 * PLMP-LEAN-1 §1/§4 — the acceptance battery for Phase 1.
 *
 * Each case is tied to a MEASURED defect from the six live DSH sessions, not to an ambition:
 *   A01  a Node repository could record no evidence at all, because the only authorized command was
 *        the packaged `python -m pytest` and no caller could declare the project's own
 *   A02  a candidate that cannot execute was discovered at the END of the work, as a dead end
 *   A03  the envelope's authorized set must equal "detected ∩ policy" — a derivation may narrow the
 *        operator's bound, never widen it
 *   A04  an unconfirmed standard must not authorize anything: no gate, therefore no promotion
 *   A12  the operator's controls must not speak predicate/attempt/exit-code vocabulary
 *   A13  "accept" must be usable on a fresh project (the gate is declared from the standard)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { deriveProjectStandard, detectVerificationCommands } from "../src/deployment/standard.js";
import { authorizedCommandsOf, standardGateChain } from "../src/domain/standard.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function repoOf(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-lean-"));
  const repo = join(root, "repo");
  mkdirSync(repo, { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    const target = join(repo, relative);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, content);
  }
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // A still-open sqlite handle keeps the directory busy on Windows; the OS temp cleaner reaps
      // it. Failing the FILE over teardown hygiene is noise, not signal.
    }
  });
  return repo;
}

const NODE_PACKAGE = JSON.stringify({ name: "x", scripts: { test: "node --test" } }, null, 2);

describe("LEAN-A01/A02/A03: done-ness is derived from the repository", () => {
  it("A01 a Node repository's own toolchain becomes the authorized command", () => {
    const repo = repoOf({ "package.json": NODE_PACKAGE, "src/index.js": "export const x = 1;\n" });
    const bound = [{ executable: "node", argv_prefix: ["--test"] }, { executable: "python", argv_prefix: ["-m", "pytest"] }];
    const standard = deriveProjectStandard({ repository: repo, policyCommands: bound, confirmed: true, probe: () => true });

    // The candidate comes from the manifest, with its provenance recorded. The script's BODY is
    // preferred over the npm wrapper (measured: a probe that could not see the npm .cmd shim lost
    // the clause entirely while the body ran fine), so the bound here authorizes the body.
    expect(standard.derivedFrom).toContain("package.json:scripts.test");
    const clause = standard.clauses.find((entry) => entry.kind === "command_succeeds");
    expect(clause).toMatchObject({ command: ["node", "--test"], predicate: "tests_pass" });
    // And it survives into the authorized set — which is what the envelope is cut from.
    expect(authorizedCommandsOf(standard, bound)).toEqual([{ executable: "node", argv_prefix: ["--test"] }]);
    // The gate the standard declares requires exactly that predicate — and carries NO `where`,
    // because the engine's `where` matches the evidence atom's `value` map while a command lives at
    // its top level: measured live, a `where: {command}` clause could never match and left a
    // declared gate INCOMPLETE forever. The command is constrained by the envelope's authorized
    // set instead.
    const chain = standardGateChain(standard);
    expect(chain).toEqual([{ exists: { predicate: "tests_pass" } }, { exists: { predicate: "write_scope_valid" } }]);
  });

  it("A02 a candidate that cannot execute is reported as a note, not discovered later", () => {
    const repo = repoOf({ "Cargo.toml": "[package]\nname='x'\n", "src/lib.rs": "\n" });
    const standard = deriveProjectStandard({
      repository: repo,
      policyCommands: [{ executable: "cargo", argv_prefix: ["test"] }],
      confirmed: true,
      probe: () => false, // as if cargo were not installed here
    });
    expect(standard.clauses.some((entry) => entry.kind === "command_succeeds")).toBe(false);
    const note = standard.notes.join(" ");
    expect(note).toContain("cargo test");
    expect(note).toContain("not executable");
    // The remedy is named, which is the point: no dead end without a next step.
    expect(note).toContain("declare the form that works");
  });

  it("A03 the authorized set is the derivation intersected with the operator's bound", () => {
    const repo = repoOf({ "package.json": NODE_PACKAGE });
    const narrow = [{ executable: "python", argv_prefix: ["-m", "pytest"] }]; // does NOT include node
    const standard = deriveProjectStandard({ repository: repo, policyCommands: narrow, confirmed: true, probe: () => true });
    // The derivation may not widen the bound: the detected command is unauthorized, and the note
    // says exactly which policy line to add.
    expect(authorizedCommandsOf(standard, narrow)).toEqual([]);
    expect(standard.notes.join(" ")).toContain("outside this deployment's policy");
  });

  it("A03b a repository that says nothing gets no invented command", () => {
    const repo = repoOf({ "src/main.ts": "export const x = 1;\n" });
    const detected = detectVerificationCommands(repo);
    expect(detected).toEqual([]);
    const standard = deriveProjectStandard({
      repository: repo,
      policyCommands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
      confirmed: true,
      probe: () => true,
    });
    expect(standard.clauses.some((entry) => entry.kind === "command_succeeds")).toBe(false);
    expect(standard.clauses.map((entry) => entry.kind)).toContain("scope_respected");
  });
});

describe("LEAN-A04/A13: only a CONFIRMED standard authorizes anything", () => {
  const drive = (standard: ReturnType<typeof deriveProjectStandard>, repo: string) => {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
    const definitions = new Map<string, unknown>();
    const host = { tools: { register: (definition: { name: string }) => { definitions.set(definition.name, definition); return () => definitions.delete(definition.name); } } };
    const installed = installPalimpsest(host as never, {
      projectId: "lean",
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      execution: "in-place",
      standard,
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "npm", argv_prefix: ["test"] }] }),
    });
    cleanups.push(() => void installed.dispose());
    const call = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const tool = installed.tools.find((entry) => entry.name === name);
      if (tool === undefined) throw new Error(`no tool ${name}`);
      return (await tool.execute(args, {
        callId: `c-${name}`,
        rootCallId: `r-${name}`,
        name,
        arguments: args,
        signal: new AbortController().signal,
      })) as Record<string, unknown>;
    };
    return { installed, call, head };
  };

  it("A04 an unconfirmed standard declares no gate, so nothing can be promoted on it", async () => {
    const repo = repoOf({ "package.json": NODE_PACKAGE });
    const standard = deriveProjectStandard({
      repository: repo,
      policyCommands: [{ executable: "npm", argv_prefix: ["test"] }],
      confirmed: false,
      probe: () => true,
    });
    const { installed, call, head } = drive(standard, repo);
    await call("palimpsest_start", {
      projectId: "lean",
      goal: "g",
      headCommit: head,
      tasks: [{ task_id: "t1", objective: "o", depends_on: [], write_paths: ["src"], required_artifacts: ["package.json"] }],
    });
    // No gate was declared: the standard was never stated by a person.
    expect(installed.controller.declaredGateIds()).toEqual([]);
  });

  it("A13 a confirmed standard declares the release gate at genesis, so accept is usable immediately", async () => {
    const repo = repoOf({ "package.json": NODE_PACKAGE });
    const standard = deriveProjectStandard({
      repository: repo,
      policyCommands: [{ executable: "npm", argv_prefix: ["test"] }],
      statement: "测试通过，且不越界改文件",
      confirmed: true,
      probe: () => true,
    });
    const { installed, call, head } = drive(standard, repo);
    await call("palimpsest_start", {
      projectId: "lean",
      goal: "g",
      headCommit: head,
      tasks: [{ task_id: "t1", objective: "o", depends_on: [], write_paths: ["src"], required_artifacts: ["package.json"] }],
    });
    // The gate exists from the first moment of the project — no CLI declaration, no vocabulary.
    expect(installed.controller.declaredGateIds()).toContain("gate-release");
    // And the operator's one-stop governance view reports the standard they wrote, verbatim.
    const governance = installed.application.work.standard();
    expect(governance?.statement).toBe("测试通过，且不越界改文件");
    expect(governance?.confirmed).toBe(true);
  });
});

describe("LEAN-A12: the operator's controls do not speak machine vocabulary", () => {
  it("the gate form has no exit-code field, and no free-text command", () => {
    const panels = readFileSync(join(import.meta.dirname, "..", "web", "src", "Panels.tsx"), "utf8");
    // The measured defect: a form collecting an exit code the server stopped honouring, plus a
    // hardcoded packaged command — a control that lies about what it does.
    expect(panels).not.toMatch(/exitCode/);
    expect(panels).not.toMatch(/useState\("python -m pytest"\)/);
    // The command is chosen among what the deployment authorizes, and the gate among real ids.
    expect(panels).toMatch(/governance\?\.authorizedCommands/);
    expect(panels).toMatch(/governance\?\.declaredGateIds/);
  });

  it("no product surface ships a packaged gate-command default", () => {
    for (const file of ["src/cli.ts", "src/serve.ts"]) {
      const source = readFileSync(join(import.meta.dirname, "..", file), "utf8");
      expect(source, `${file} still ships a default gate command`).not.toMatch(/command:\s*\["python", "-m", "pytest"\]/);
      expect(source, `${file} must ask the envelope`).toMatch(/authorizedGateCommand/);
    }
  });
});
