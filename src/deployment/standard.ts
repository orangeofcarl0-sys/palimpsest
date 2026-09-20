/**
 * PLMP-LEAN-1 §1 — the project's DONE-NESS, derived from the repository and confirmed once by the
 * operator.
 *
 * The measured problem this answers: the product asked the operator for platform vocabulary —
 * which commands may run (`policy.allowed_commands`), which predicate a release gate requires, and
 * a gate declaration through the CLI — before any of it could be judged. A wrong answer was not a
 * refusal, it was a dead end: a project whose toolchain was not Python could never record a single
 * piece of evidence, and the agent could not fix it from inside (correctly: the policy is the
 * operator's bound).
 *
 * So the derivation runs HERE, at the deployment boundary, from what the repository actually says
 * about how it is verified. It produces a CANDIDATE; the operator's confirmation is the profile's
 * `standard` block. Nothing about it is authoritative on its own: the derived clauses become the
 * release gate only once confirmed, and the authorized commands are always intersected with the
 * operator's policy — a derivation may narrow the bound, never widen it.
 *
 * This module is deliberately NOT re-exported from the deployment barrel: the product's public
 * surface is sealed (an added export fails parity), and this is deployment-side derivation.
 */

import { authorizedCommandsOf, commandWithinBound } from "../domain/standard.js";
import type { AuthorizedCommand, ProjectStandard, StandardClause } from "../domain/standard.js";

export type { ProjectStandard, StandardClause };
export { authorizedCommandsOf as authorizedCommands };
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface DeriveStandardInput {
  readonly repository?: string | undefined;
  /** The operator's policy bound; the derivation intersects with it and never widens it. */
  readonly policyCommands: readonly { readonly executable: string; readonly argv_prefix: readonly string[] }[];
  /** The operator's sentence, when they wrote one. */
  readonly statement?: string | undefined;
  readonly confirmed: boolean;
  /** Injectable for tests: whether an executable can actually run here. */
  readonly probe?: ((executable: string) => boolean) | undefined;
}

/**
 * Whether one executable can be spawned at all (a missing toolchain must be reported, not fatal).
 *
 * Measured on Windows: `npm`, `npx` and most Node tooling are `.cmd` shims, and `execFile("npm")`
 * fails with ENOENT while the same command works in a shell — so a naive probe silently reported a
 * perfectly usable toolchain as unusable. The `.cmd` form is tried as a fallback, and only a spawn
 * failure counts as "not runnable" (a non-zero exit still proves the executable exists).
 */
export function executableIsRunnable(executable: string): boolean {
  const attempt = (candidate: string): "ok" | "missing" | "exists" => {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore", timeout: 5_000 });
      return "ok";
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (typeof code === "number") return "exists";
      return "missing";
    }
  };
  const direct = attempt(executable);
  if (direct !== "missing") return true;
  if (process.platform === "win32") {
    return attempt(`${executable}.cmd`) !== "missing" || attempt(`${executable}.bat`) !== "missing";
  }
  return false;
}

interface Candidate {
  readonly command: readonly string[];
  readonly predicate: "process_exit_zero" | "tests_pass" | "lint_pass";
  readonly derivedFrom: string;
}

/**
 * What this repository says about how it is verified. Only signals that are IN the tree: a
 * `package.json` script, a Python test configuration, a Cargo/Go manifest. No inference from file
 * extensions and no defaults — a repository that says nothing gets no command clause, which is the
 * honest outcome (its done-ness is then about files and scope, not a command we invented).
 */
export function detectVerificationCommands(repository: string): Candidate[] {
  const found: Candidate[] = [];
  const packageJson = join(repository, "package.json");
  if (existsSync(packageJson)) {
    try {
      const manifest = JSON.parse(readFileSync(packageJson, "utf8")) as { scripts?: Record<string, string> };
      const scripts = manifest.scripts ?? {};
      /* A script's BODY is the command; `npm test` is only the wrapper. Measured: a deployment
         whose probe could not see the npm shim lost the command clause entirely, while the body
         (`node --test ...`) ran fine — so the body is offered first and the wrapper second, and the
         policy intersection decides which one a deployment authorizes. */
      const scriptCandidate = (
        name: string,
        predicate: Candidate["predicate"],
      ): Candidate[] => {
        const body = scripts[name];
        if (typeof body !== "string" || body.trim() === "") return [];
        const tokens = body.trim().split(/\s+/);
        const [executable, ...rest] = tokens;
        if (executable === undefined) return [];
        // Only a simple invocation is offered as a command; a shell pipeline is not a command line
        // this product may run (no shell, no pipes — the same rule the gate enforces).
        if (/[|&;<>$`]/.test(body)) return [];
        return [
          { command: tokens, predicate, derivedFrom: `package.json:scripts.${name}` },
          { command: ["npm", name === "test" ? "test" : "run"], predicate, derivedFrom: `package.json:scripts.${name} (npm wrapper)` },
        ];
      };
      found.push(...scriptCandidate("test", "tests_pass"));
      found.push(...scriptCandidate("lint", "lint_pass"));
    } catch {
      /* a malformed manifest is the repository's problem, not a reason to invent a command */
    }
  }
  if (existsSync(join(repository, "pytest.ini")) || existsSync(join(repository, "pyproject.toml")) || existsSync(join(repository, "tests"))) {
    found.push({
      command: ["python", "-m", "pytest"],
      predicate: "tests_pass",
      derivedFrom: existsSync(join(repository, "pyproject.toml")) ? "pyproject.toml" : "tests/",
    });
  }
  if (existsSync(join(repository, "Cargo.toml"))) {
    found.push({ command: ["cargo", "test"], predicate: "tests_pass", derivedFrom: "Cargo.toml" });
  }
  if (existsSync(join(repository, "go.mod"))) {
    found.push({ command: ["go", "test", "./..."], predicate: "tests_pass", derivedFrom: "go.mod" });
  }
  return found;
}

/**
 * The candidate standard: detected commands (each proven runnable and inside the policy), plus the
 * two clauses that need no command at all. Notes carry every refusal so the operator sees WHY a
 * candidate is missing — the measured failure mode was discovering that at the end of the work.
 */
export function deriveProjectStandard(input: DeriveStandardInput): ProjectStandard {
  const probe = input.probe ?? executableIsRunnable;
  const clauses: StandardClause[] = [];
  const derivedFrom: string[] = [];
  const notes: string[] = [];

  if (input.repository === undefined) {
    notes.push("no repository is configured for this deployment: done-ness cannot be derived from a toolchain");
  } else {
    for (const candidate of detectVerificationCommands(input.repository)) {
      if (!commandWithinBound(candidate.command, input.policyCommands)) {
        notes.push(
          `${candidate.command.join(" ")} (from ${candidate.derivedFrom}) is outside this deployment's policy — add it to policy.allowed_commands to make it usable`,
        );
        continue;
      }
      if (!probe(candidate.command[0] ?? "")) {
        notes.push(
          `${candidate.command.join(" ")} (from ${candidate.derivedFrom}) is not executable in this environment — install it, or declare the form that works (a sandboxed test runner may need different flags)`,
        );
        continue;
      }
      clauses.push({ kind: "command_succeeds", command: [...candidate.command], predicate: candidate.predicate });
      derivedFrom.push(candidate.derivedFrom);
    }
  }

  // The two clauses every project can honour, and the ones that need no toolchain.
  clauses.push({ kind: "scope_respected" });
  if (input.repository !== undefined) {
    clauses.push({ kind: "files_exist", paths: [] });
  }

  return Object.freeze({
    statement: input.statement ?? "",
    clauses: Object.freeze(clauses),
    derivedFrom: Object.freeze(derivedFrom),
    confirmed: input.confirmed,
    notes: Object.freeze(notes),
  });
}
