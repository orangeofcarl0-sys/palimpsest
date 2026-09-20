/**
 * PLMP-LEAN-1 §1 — the SHAPE of a project's done-ness.
 *
 * The type lives here, at the bottom layer, because two layers above it must name it: the
 * controller (L2) declares the release gate from a standard, and the application surface (L4)
 * reports it to a client. The DERIVATION — reading a repository's toolchain — stays deployment-side
 * (L5, `deployment/standard.ts`), which is where filesystem knowledge belongs.
 *
 * Deliberately not re-exported from the domain barrel: the product's public surface is sealed (an
 * added export fails parity), and this is an internal contract between the layers above.
 */

/** The closed clause vocabulary (mirrors the gate grammar's predicates; no new evidence kinds). */
export type StandardClause =
  | {
      readonly kind: "command_succeeds";
      readonly command: readonly string[];
      readonly predicate: "process_exit_zero" | "tests_pass" | "lint_pass";
    }
  | { readonly kind: "files_exist"; readonly paths: readonly string[] }
  | { readonly kind: "scope_respected" };

export interface ProjectStandard {
  /** The operator's own sentence, verbatim. Empty until they say it. */
  readonly statement: string;
  readonly clauses: readonly StandardClause[];
  /** What the derivation read, so a person can audit the proposal. */
  readonly derivedFrom: readonly string[];
  /** True only when the operator confirmed it (the profile's `standard` block). */
  readonly confirmed: boolean;
  /** Honest notes: what could not be verified, and why. */
  readonly notes: readonly string[];
}

/** The commands one deployment authorizes, as the policy vocabulary the envelope is cut from. */
export interface AuthorizedCommand {
  readonly executable: string;
  readonly argv_prefix: readonly string[];
}

/** Whether one command is inside a bound (prefix match, exactly like the gate's own rule). */
export function commandWithinBound(
  command: readonly string[],
  bound: readonly AuthorizedCommand[],
): boolean {
  return bound.some(
    (entry) =>
      entry.executable === command[0] &&
      entry.argv_prefix.every((prefix, index) => command[index + 1] === prefix),
  );
}

/**
 * The clauses as gate grammar, for the release gate a confirmed standard declares. Pure: the
 * controller (L2) needs this to declare the gate, so it lives at the bottom layer with the shape it
 * translates — the repository reading that PRODUCES a standard stays deployment-side.
 */
export function standardGateChain(standard: ProjectStandard): readonly Record<string, unknown>[] {
  const chain: Record<string, unknown>[] = [];
  for (const clause of standard.clauses) {
    if (clause.kind === "command_succeeds") {
      /* NO `where` here, deliberately. The engine's `where` matches keys inside the evidence atom's
         `value` map (`view.value[key] === expected`), while a command lives at the atom's top level
         — so `where: {command}` can never match and the clause would be unsatisfiable: measured
         live, a gate the product declared from a standard reported INCOMPLETE forever while a
         passing evidence atom sat in the ledger. What constrains WHICH command may run is the
         envelope's authorized set (derived ∩ policy), not the clause. */
      chain.push({ exists: { predicate: clause.predicate } });
    } else if (clause.kind === "files_exist" && clause.paths.length > 0) {
      chain.push({ exists: { predicate: "expected_files_exist" } });
    } else if (clause.kind === "scope_respected") {
      chain.push({ exists: { predicate: "write_scope_valid" } });
    }
  }
  return chain;
}

/** The commands a standard authorizes, intersected with the operator's bound (never widened). */
export function authorizedCommandsOf(
  standard: ProjectStandard,
  bound: readonly AuthorizedCommand[],
): AuthorizedCommand[] {
  const out: AuthorizedCommand[] = [];
  for (const clause of standard.clauses) {
    if (clause.kind !== "command_succeeds") continue;
    if (!commandWithinBound(clause.command, bound)) continue;
    const [executable, ...rest] = clause.command;
    if (executable === undefined) continue;
    out.push({ executable, argv_prefix: rest });
  }
  return out;
}
