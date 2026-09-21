/**
 * PLMP-LEAN-1 §2.1 / phase 2A-Q — the DERIVED completion contract.
 *
 *   derived contract, NOT a new truth owner
 *
 * What a task must show before it may be called done is a PURE FUNCTION of things that already
 * exist: the operator's confirmed `ProjectStandard`, the task's own declaration (TaskSpec), the
 * attempt's envelope, and what this deployment can actually do. Nothing here is stored, no event is
 * appended and no store is read — the same inputs always produce the same contract, byte for byte
 * (`basisDigest`), which is what makes "the bar did not move after the result was seen" a machine
 * check rather than a promise.
 *
 * Three deliberate shapes:
 *
 *  1. The mechanical part is expressed as CHECK KINDS, not as a list of predicates. The product layer
 *     says WHAT to check (`RUN_STANDARD_COMMAND` / `ASSERT_WRITE_SCOPE` / `ASSERT_REQUIRED_ARTIFACTS`);
 *     the evidence owner says how canonical evidence forms. Naming predicates here is what produced
 *     the phase-1 mistake of inventing a `where.command` interpretation for a gate clause.
 *
 *  2. `expected_files_exist` may only be required from paths declared BEFORE execution — the
 *     standard's `files_exist` clauses and the envelope's `required_artifacts`. Never from the set of
 *     files that happen to have changed, which would be `INV-7`'s moving goalposts.
 *
 *  3. The verification requirement is DERIVED here but EXECUTED in phase 2B. Deriving it now is what
 *     lets readiness say honestly "this task needs independent verification and this deployment has
 *     (no) suitable verifier" before the work starts, instead of discovering it at promotion.
 */
import { canonicalDigest } from "../schema/canonical.js";
import type { EvidencePredicate } from "../schema/models.js";
import type { ProjectStandard } from "./standard.js";

/** What the product must check, in product vocabulary. The evidence owner maps these. */
export type MechanicalCheck =
  | {
      readonly kind: "run_standard_command";
      readonly command: readonly string[];
      readonly predicate: Extract<EvidencePredicate, "process_exit_zero" | "tests_pass" | "lint_pass">;
    }
  | { readonly kind: "assert_write_scope" }
  | { readonly kind: "assert_required_artifacts"; readonly paths: readonly string[] };

export interface VerificationRequirement {
  /**
   * True when this task must be independently verified before promotion. Deliberately NARROW: only
   * risks that are strong AND knowable before the work runs belong here.
   */
  readonly required: boolean;
  readonly requiredReasons: readonly string[];
  /**
   * True when independent verification would be worth having but must NOT block promotion. A thin
   * mechanical bar is a reason to offer a second look, not a reason to manufacture an executor —
   * "one command" is a poor proxy for "one evidence fact", since one `npm test` may run five tests
   * or five hundred.
   */
  readonly recommended: boolean;
  readonly recommendationReasons: readonly string[];
}

export interface AttemptCompletionContract {
  /** `H(standard, task declaration, envelope, capabilities)` — identical inputs ⇒ identical digest. */
  readonly basisDigest: string;
  readonly mechanical: readonly MechanicalCheck[];
  readonly verification: VerificationRequirement;
  /**
   * Honest notes: what was narrowed, what cannot be checked, and what would dead-end later. Readiness
   * surfaces these BEFORE the work starts (a configuration problem must never be discovered at
   * finish time).
   */
  readonly diagnostics: readonly string[];
}

/** The task's own declaration, as it reaches the envelope. */
export interface CompletionTaskBasis {
  readonly write_paths: readonly string[];
  readonly required_artifacts: readonly string[];
}

/** The attempt's envelope — the AUTHORIZATION the work runs under, and a basis input. */
export interface CompletionEnvelopeBasis {
  readonly write_paths: readonly string[];
  readonly required_artifacts: readonly string[];
  readonly allowed_commands: readonly { readonly executable: string; readonly argv_prefix: readonly string[] }[];
}

/** What this deployment can actually do. Capabilities gate READINESS, never the requirement itself. */
export interface CompletionCapabilities {
  readonly independentVerifierAvailable: boolean;
  readonly sandboxSpawnVerified: boolean;
}

export interface DeriveAttemptCompletionContractInput {
  readonly standard: ProjectStandard;
  readonly task: CompletionTaskBasis;
  readonly envelope: CompletionEnvelopeBasis;
}

/**
 * Extensions that mark a write path as documentation/data rather than code. Used by the DECLARED
 * applicability rule below — deliberately a short, auditable list rather than a heuristic.
 */
const NON_CODE_EXTENSIONS = [".md", ".txt", ".rst", ".json", ".yaml", ".yml", ".csv", ".toml", ".ini", ".cfg"] as const;

/** Path fragments that make a write path a contract/boundary surface worth independent review. */
const BOUNDARY_FRAGMENTS = ["schema", "contract", "security", "auth", "proto", "public-api", "public_api"] as const;

function isDocumentationOnly(writePaths: readonly string[]): boolean {
  return (
    writePaths.length > 0 &&
    writePaths.every((path) => NON_CODE_EXTENSIONS.some((extension) => path.toLowerCase().endsWith(extension)))
  );
}

function touchesBoundary(writePaths: readonly string[]): string[] {
  return writePaths.filter((path) => {
    const lower = path.toLowerCase();
    return BOUNDARY_FRAGMENTS.some((fragment) => lower.includes(fragment));
  });
}

function commandAllowed(
  command: readonly string[],
  allowed: readonly { readonly executable: string; readonly argv_prefix: readonly string[] }[],
): boolean {
  const executable = command[0];
  if (executable === undefined) return false;
  const argv = command.slice(1);
  return allowed.some(
    (entry) =>
      entry.executable === executable &&
      entry.argv_prefix.length <= argv.length &&
      entry.argv_prefix.every((part, index) => argv[index] === part),
  );
}

/**
 * Derive what this task must show. Pure: no store, no clock, no I/O.
 *
 * The composition rule is `Q_task = Q_project ⊕ Q_task-shape`, where `⊕` may ADD applicable checks
 * or NARROW applicability, and may never remove a confirmed project requirement nor weaken operator
 * policy. Every narrowing is recorded in `diagnostics` with the rule that performed it, so a reader
 * can audit the bar rather than trust it.
 */
export function deriveAttemptCompletionContract(
  input: DeriveAttemptCompletionContractInput,
): AttemptCompletionContract {
  const { standard, task, envelope } = input;
  const diagnostics: string[] = [];

  // The mechanical checks are emitted in the order they should be REPORTED — materialization (held by
  // the caller, which alone can observe the tree), then scope, then the standard's commands, then the
  // declared artifacts. A refusal should name the most actionable problem first: an out-of-scope
  // change is fixed before a failing test is worth reading.
  //
  // Write scope is required UNCONDITIONALLY: `write_paths` is part of the envelope, so the assertion
  // is always available and is vacuously true for a task that declares no write path.
  const mechanical: MechanicalCheck[] = [{ kind: "assert_write_scope" }];

  // A narrowing may only come from a DECLARED rule, never from the agent deciding it is unnecessary.
  const documentationOnly = isDocumentationOnly(envelope.write_paths);

  for (const clause of standard.clauses) {
    if (clause.kind !== "command_succeeds") continue;
    if (documentationOnly) {
      diagnostics.push(
        `the standard's command ${clause.command.join(" ")} does not apply here: every declared write path is documentation or data (${envelope.write_paths.join(", ")}). Narrowed by the declared applicability rule, not by the agent`,
      );
      continue;
    }
    mechanical.push({ kind: "run_standard_command", command: [...clause.command], predicate: clause.predicate });
    if (!commandAllowed(clause.command, envelope.allowed_commands)) {
      diagnostics.push(
        `the standard requires ${clause.command.join(" ")} but this task's envelope does not authorize it (authorized: ${envelope.allowed_commands.map((entry) => `${entry.executable} ${entry.argv_prefix.join(" ")}`.trim()).join("; ") || "none"}) — the operator must widen policy.allowed_commands; the agent cannot`,
      );
    }
  }

  // Expected artifacts may only come from paths declared BEFORE execution.
  const declaredArtifacts = [
    ...new Set([
      ...envelope.required_artifacts,
      ...standard.clauses.flatMap((clause) => (clause.kind === "files_exist" ? [...clause.paths] : [])),
    ]),
  ].sort();
  if (declaredArtifacts.length > 0) {
    mechanical.push({ kind: "assert_required_artifacts", paths: declaredArtifacts });
  }
  if (task.required_artifacts.length !== envelope.required_artifacts.length) {
    diagnostics.push(
      `the task declares ${task.required_artifacts.length} required artifact(s) and its envelope carries ${envelope.required_artifacts.length}; the envelope is what the work runs under, so the contract uses the envelope's list`,
    );
  }

  // Verification: DERIVED now, EXECUTED in phase 2B. Two strengths, because conflating them made the
  // product manufacture executors for ordinary work — which contradicts `INV-6`
  // ("exploit useful independence; never manufacture agents") and the measured G10-R finding that an
  // artificial planner/reviewer split can be pure overhead.
  //
  // REQUIRED is reserved for risks that are both STRONG and knowable BEFORE the work runs. A "large
  // change" threshold cannot be known yet and is deliberately not guessed at; if one is ever wanted,
  // the condition must be declared in advance and merely OBSERVED afterwards, so `INV-7` still holds.
  const requiredReasons: string[] = [];
  const boundary = touchesBoundary(envelope.write_paths);
  if (boundary.length > 0) {
    requiredReasons.push(`contract_boundary (${boundary.join(", ")})`);
  }
  // `operator_requires_independent_verification` will live here once `ProjectStandard` can express it;
  // there is no clause kind for it yet, and inventing one would change the operator's confirmed shape.

  // RECOMMENDED: worth offering, never promotion-blocking.
  const recommendationReasons: string[] = [];
  const commandChecks = mechanical.filter((check) => check.kind === "run_standard_command");
  if (commandChecks.length === 1) {
    recommendationReasons.push(
      "single_command_bar (one standard command is the whole mechanical oracle — a weak signal about evidence STRENGTH, since one command may run five checks or five hundred)",
    );
  }

  const verification: VerificationRequirement = Object.freeze({
    required: requiredReasons.length > 0,
    requiredReasons: Object.freeze(requiredReasons),
    recommended: recommendationReasons.length > 0,
    recommendationReasons: Object.freeze(recommendationReasons),
  });

  // NOTE: no capability appears in `diagnostics` and none reaches `basisDigest`. Whether this
  // deployment can MEET a requirement is an operational assessment (readiness), not part of what the
  // task requires — see `deriveCompletionReadiness`.

  return Object.freeze({
    // NORMATIVE basis only. Capabilities are excluded on purpose: a verifier being configured
    // mid-task does not change what the task must show, and folding it in would make `basisDigest`
    // differ while the bar stood still — weakening `INV-7` for no gain. Phase 2B will cite this
    // digest as the identity of the requirement, so it must mean "the bar", nothing else.
    basisDigest: canonicalDigest({
      standard,
      task: { write_paths: [...task.write_paths].sort(), required_artifacts: [...task.required_artifacts].sort() },
      envelope: {
        write_paths: [...envelope.write_paths].sort(),
        required_artifacts: [...envelope.required_artifacts].sort(),
        allowed_commands: [...envelope.allowed_commands],
      },
    }),
    mechanical: Object.freeze(mechanical),
    verification,
    diagnostics: Object.freeze(diagnostics),
  });
}

/* -------------------------------------------------------------------------- *
 * Readiness — two layers, because they answer different questions
 * -------------------------------------------------------------------------- */

/** DESCRIPTIVE: what this deployment can do. Never a verdict on whether work may proceed. */
export type DeploymentCompletionState = "CONFIGURED" | "DEGRADED" | "INCOMPLETE";

/** ACTIONABLE: whether THIS task can meet its own completion requirement here. */
export type TaskReadinessState = "READY" | "BLOCKED";

export interface DeploymentCompletionReadiness {
  readonly standardConfirmed: boolean;
  readonly commandsAuthorized: boolean;
  readonly sandboxSpawnVerified: boolean;
  readonly independentVerifierAvailable: boolean;
  readonly state: DeploymentCompletionState;
  /**
   * Capability gaps in plain language. Descriptive, and deliberately NOT called "blockers": a gap is
   * a blocker only where a specific task needs that capability. Reporting a global BLOCKED because a
   * verifier is absent would contradict the task layer saying READY for a task that needs none.
   */
  readonly gaps: readonly string[];
}

export interface TaskCompletionReadiness {
  readonly state: TaskReadinessState;
  readonly blockers: readonly string[];
  readonly verificationRequired: boolean;
  readonly verificationRequiredReasons: readonly string[];
  readonly verificationRecommended: boolean;
  readonly verificationRecommendedReasons: readonly string[];
  readonly verificationSatisfiable: boolean;
  /** Recommended-but-unavailable: worth telling the agent, never a reason to refuse. */
  readonly advisories: readonly string[];
}

export interface CompletionReadiness {
  /** `Task readiness is actionable; deployment readiness is descriptive.` */
  readonly deployment: DeploymentCompletionReadiness;
  /** Absent until a task exists — task readiness is not answerable without one. */
  readonly task: TaskCompletionReadiness | null;
}

/**
 * Derive readiness. `contract` is optional because the deployment layer is answerable at startup,
 * before any task exists; passing a contract adds the task layer and the actionable verdict.
 *
 * The rule for turning a capability gap into an early blocker is exact:
 *
 *     known requirement ∧ missing capability ⇒ early blocker
 *
 * and nothing weaker. A gap the current task does not need is reported as a gap, not as a refusal —
 * requiring every capability some future task might want would make startup a false alarm, which is
 * the mirror image of the late failure this exists to prevent.
 */
export function deriveCompletionReadiness(input: {
  readonly standard: ProjectStandard | undefined;
  readonly authorizedCommands: readonly { readonly executable: string; readonly argv_prefix: readonly string[] }[];
  readonly capabilities: CompletionCapabilities;
  readonly contract?: AttemptCompletionContract | undefined;
}): CompletionReadiness {
  const { standard, authorizedCommands, capabilities, contract } = input;
  const gaps: string[] = [];
  const standardConfirmed = standard !== undefined && standard.confirmed;
  if (!standardConfirmed) {
    gaps.push(
      "no confirmed completion standard: the operator states one sentence, the product proposes it from the repository, and nothing can be derived as done until they confirm it",
    );
  }
  const commandsAuthorized = authorizedCommands.length > 0;
  if (!commandsAuthorized) {
    gaps.push(
      "policy.allowed_commands authorizes nothing, so no command can produce evidence — the operator must declare at least one",
    );
  }
  if (!capabilities.sandboxSpawnVerified) {
    gaps.push("the sandbox has not been shown to spawn the authorized commands, so a run may produce no observation");
  }
  if (!capabilities.independentVerifierAvailable) {
    gaps.push(
      "no verifier satisfying the independence contract is composed — tasks whose risk policy REQUIRES independent verification cannot be completed here",
    );
  }
  // INCOMPLETE when nothing can be derived or no evidence can exist at all; DEGRADED when the
  // deployment works but some capability is absent; CONFIGURED when everything is present.
  const deploymentState: DeploymentCompletionState =
    !standardConfirmed || !commandsAuthorized
      ? "INCOMPLETE"
      : gaps.length > 0
        ? "DEGRADED"
        : "CONFIGURED";

  const task: TaskCompletionReadiness | null =
    contract === undefined
      ? null
      : (() => {
          const blockers: string[] = [];
          const advisories: string[] = [];

          // Known requirement: a required command the envelope does not authorize. A dead end at
          // finish time, surfaced here instead.
          blockers.push(...contract.diagnostics.filter((note) => note.includes("does not authorize it")));

          // Known requirement: the task must RUN something, and the sandbox cannot.
          const runsCommands = contract.mechanical.some((check) => check.kind === "run_standard_command");
          if (runsCommands && !capabilities.sandboxSpawnVerified) {
            blockers.push(
              "this task's completion requires running the standard's command, and this deployment has not shown the sandbox can spawn it",
            );
          }

          // Known requirement: independent verification, and none is available.
          const needsVerifier = contract.verification.required;
          const satisfiable = !needsVerifier || capabilities.independentVerifierAvailable;
          if (!satisfiable) {
            blockers.push(
              `this task REQUIRES independent verification (${contract.verification.requiredReasons.join("; ")}) and this deployment has none`,
            );
          } else if (contract.verification.recommended && !capabilities.independentVerifierAvailable) {
            // Recommended, not required: said out loud, never a refusal. This is what lets ASSIST
            // mention a second look without MANAGE/DIRECT being forced to manufacture an executor.
            advisories.push(
              `independent verification is recommended for this task (${contract.verification.recommendationReasons.join("; ")}) and this deployment has no verifier — worth knowing, not a reason to refuse`,
            );
          }

          return Object.freeze({
            state: (blockers.length === 0 ? "READY" : "BLOCKED") as TaskReadinessState,
            blockers: Object.freeze(blockers),
            verificationRequired: needsVerifier,
            verificationRequiredReasons: contract.verification.requiredReasons,
            verificationRecommended: contract.verification.recommended,
            verificationRecommendedReasons: contract.verification.recommendationReasons,
            verificationSatisfiable: satisfiable,
            advisories: Object.freeze(advisories),
          });
        })();

  return Object.freeze({
    deployment: Object.freeze({
      standardConfirmed,
      commandsAuthorized,
      sandboxSpawnVerified: capabilities.sandboxSpawnVerified,
      independentVerifierAvailable: capabilities.independentVerifierAvailable,
      state: deploymentState,
      gaps: Object.freeze(gaps),
    }),
    task,
  });
}
