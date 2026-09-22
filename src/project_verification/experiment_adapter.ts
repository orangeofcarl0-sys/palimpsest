/**
 * G10-AD §9 — reuse the EXISTING experiment validator primitives behind the new
 * Project Verification port.
 *
 *   Validator ≠ Truth                     ValidatorResult ≠ ProjectVerificationRun
 *   OrganizationMemory experiment ≠ Project Verification history
 *
 * The adapter reuses `commandValidator` / `artifactValidator` /
 * `humanImportValidator` / `llmJudgeValidator` as mechanical/opinion EXECUTION
 * primitives. It writes NOTHING: project verification history stays in the
 * Project Verification plane (`store.ts`), and no OrganizationMemory experiment
 * record is created, read or mutated here.
 *
 * Verdict semantics are preserved EXACTLY: a SCORE stays a SCORE (the existing
 * `validatorVerdictToOutcome` helper that maps SCORE to PASS is deliberately NOT
 * used anywhere in this plane), an ERROR stays an ERROR and never becomes a
 * FAIL, and an UNRESOLVED stays an UNRESOLVED.
 */

import {
  commandValidator,
  type ExperimentValidatorPort,
  type ValidatorInput,
} from "../experiment/validators.js";
import {
  ProjectVerificationError,
  materializeProjectVerifierRawResult,
  type ProjectVerifierRawResult,
  type VerifierDefinition,
} from "./artifacts.js";
import type { VerifierIndependenceClass } from "./independence.js";
import type { ProjectVerifierPort, ProjectVerifierVerifyInput } from "./provider.js";
import { commandVerifierDefinition, firstPartyMechanicalVerifierDefinition } from "./registry.js";

/** The first-party ref for the ATTEMPT-RESULT protocol. Deliberately NOT the head ref (B.11). */
export const FIRST_PARTY_ATTEMPT_RESULT_VERIFIER_REF = "project.attempt.git-diff-check.v1";
const FIRST_PARTY_ATTEMPT_RESULT_PROVIDER = "palimpsest-first-party";
const FIRST_PARTY_ATTEMPT_RESULT_PROVIDER_VERSION = "1";

export interface CommandAttemptResultVerifierOptions {
  readonly verifierRef?: string | undefined;
  readonly version?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly independenceClass?: VerifierIndependenceClass | undefined;
}

/**
 * PLMP-LEAN-1 §B.11: a SEPARATE verifier for an attempt's result, and the head verifier is left
 * exactly as it was.
 *
 * The reason is not tidiness. The head protocol is `git diff --check`, which inspects the
 * WORKING-TREE diff — run inside a clean checkout of R it finds nothing to check and PASSES
 * trivially, so extending the head verifier's `supportedSubjects` would manufacture a verification
 * that proves nothing. It would also change that verifier's definition digest and stale every
 * existing head verification.
 *
 * So this one is subject-aware: the commits come from the canonical subject, never from the caller,
 * and the protocol runs `git diff --check <baseCommit>..<resultCommit>` — a statement about THIS
 * patch rather than about a working tree. It runs in the materialized checkout it is given, and it
 * refuses any other subject kind rather than guessing.
 *
 * A PASS here means "the named mechanical protocol passed", never "the change is correct".
 */
export function commandAttemptResultVerifier(
  options: CommandAttemptResultVerifierOptions = {},
): ProjectVerifierPort {
  const definition = commandVerifierDefinition({
    verifierRef: options.verifierRef ?? FIRST_PARTY_ATTEMPT_RESULT_VERIFIER_REF,
    ...(options.version === undefined ? {} : { version: options.version }),
    command: "git",
    // A TEMPLATE: the real commits are substituted from the subject at run time.
    args: ["diff", "--check", "<baseCommit>..<resultCommit>"],
    supportedSubjects: ["ATTEMPT_RESULT"],
    protocolNote:
      "bounded subprocess over the attempt's own commit range: a non-zero exit is a protocol FAIL and a spawn/timeout fault is ERROR (never FAIL); the range comes from the canonical subject and never from the caller",
    ...(options.independenceClass === undefined
      ? {}
      : { independenceClass: options.independenceClass }),
    provider: FIRST_PARTY_ATTEMPT_RESULT_PROVIDER,
    providerVersion: FIRST_PARTY_ATTEMPT_RESULT_PROVIDER_VERSION,
    implementation: "git diff --check <baseCommit>..<resultCommit>",
  });
  return experimentValidatorProjectHeadAdapter({
    definition,
    validator: (input: ProjectVerifierVerifyInput) => {
      const subject = input.subject;
      if (subject.kind !== "ATTEMPT_RESULT") {
        throw new Error(
          `verifier "${definition.verifierRef}" verifies ATTEMPT_RESULT subjects only, not ${subject.kind}`,
        );
      }
      if (input.repository === undefined) {
        throw new Error(
          `verifier "${definition.verifierRef}" needs the materialized checkout of ${subject.resultCommit.slice(0, 12)}`,
        );
      }
      return commandValidator({
        validatorRef: definition.verifierRef,
        command: "git",
        args: ["diff", "--check", `${subject.baseCommit}..${subject.resultCommit}`],
        cwd: input.repository,
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      });
    },
  });
}

/** The default mapping from a verification subject to the validator's input. */
export function validatorInputForSubject(
  input: ProjectVerifierVerifyInput,
): ValidatorInput {
  return Object.freeze({
    // The subject digest IS the verification input identity the validator sees.
    runRef: input.subject.digest,
    ...(input.repository === undefined ? {} : { workspacePath: input.repository }),
  });
}

function provenanceSummary(definition: VerifierDefinition): string {
  const provenance = definition.provenance;
  return `${provenance.provider}@${provenance.providerVersion} implementation=${provenance.implementation} context=${provenance.contextIsolation} independence=${definition.independenceClass}`;
}

export interface ExperimentValidatorAdapterOptions {
  readonly definition: VerifierDefinition;
  /**
   * The validator, or a FACTORY that builds one per call (needed when the
   * validator must run in the repository the request names).
   */
  readonly validator:
    | ExperimentValidatorPort
    | ((input: ProjectVerifierVerifyInput) => ExperimentValidatorPort);
  /** Maps the subject to the validator's input. Defaults to `validatorInputForSubject`. */
  readonly validatorInput?: ((input: ProjectVerifierVerifyInput) => ValidatorInput) | undefined;
  /**
   * An EXPLICIT, deployment-owned score normalization. Absent ⇒ the score is
   * recorded as-is, and a fractional score (canonical JSON forbids floats) is an
   * ERROR rather than a silently rounded number.
   */
  readonly normalizeScore?: ((score: number) => number) | undefined;
  readonly artifactRefs?: readonly string[] | undefined;
}

/** Map a validator result onto the verification verdict vocabulary, unchanged. */
export function rawResultFromValidatorResult(input: {
  readonly definition: VerifierDefinition;
  readonly result: { readonly verdict: string; readonly score?: number | undefined; readonly detail?: string | undefined };
  readonly normalizeScore?: ((score: number) => number) | undefined;
  readonly artifactRefs?: readonly string[] | undefined;
}): ProjectVerifierRawResult {
  const definition = input.definition;
  const verdict = input.result.verdict;
  const rawScore =
    input.result.score === undefined
      ? null
      : input.normalizeScore === undefined
        ? input.result.score
        : input.normalizeScore(input.result.score);
  try {
    return materializeProjectVerifierRawResult({
      verifierRef: definition.verifierRef,
      // The verdict is COPIED, never re-mapped: SCORE stays SCORE.
      verdict: verdict as ProjectVerifierRawResult["verdict"],
      score: rawScore,
      detail: input.result.detail ?? null,
      ...(input.artifactRefs === undefined ? {} : { artifactRefs: input.artifactRefs }),
      providerProvenance: provenanceSummary(definition),
    });
  } catch (error) {
    // A validator that violates the verdict contract (a SCORE with no score, an
    // ERROR with no detail, a score that canonical JSON cannot hold) is an
    // INFRASTRUCTURE fault: ERROR, never FAIL, and never a silent coercion.
    const detail = error instanceof ProjectVerificationError ? error.message : String(error);
    return materializeProjectVerifierRawResult({
      verifierRef: definition.verifierRef,
      verdict: "ERROR",
      detail: `the validator produced a result this plane cannot record: ${detail}`,
      ...(input.artifactRefs === undefined ? {} : { artifactRefs: input.artifactRefs }),
      providerProvenance: provenanceSummary(definition),
    });
  }
}

/**
 * The §9 adapter: an `ExperimentValidatorPort` (or a factory of one) presented as
 * a `ProjectVerifierPort`. It performs no store write of any kind.
 */
export function experimentValidatorProjectHeadAdapter(
  options: ExperimentValidatorAdapterOptions,
): ProjectVerifierPort {
  const definition = options.definition;
  const fixed = typeof options.validator === "function" ? undefined : options.validator;
  if (fixed !== undefined && fixed.validatorRef !== definition.verifierRef) {
    // Fail closed: a mis-wired validator would record a result under the wrong ref.
    throw new Error(
      `the validator "${fixed.validatorRef}" does not belong to the verifier definition "${definition.verifierRef}"`,
    );
  }
  const mapInput = options.validatorInput ?? validatorInputForSubject;
  return Object.freeze({
    definition,
    async verify(input: ProjectVerifierVerifyInput): Promise<ProjectVerifierRawResult> {
      const validator = fixed ?? (options.validator as (inner: ProjectVerifierVerifyInput) => ExperimentValidatorPort)(input);
      const result = await validator.validate(mapInput(input));
      return rawResultFromValidatorResult({
        definition,
        result,
        ...(options.normalizeScore === undefined ? {} : { normalizeScore: options.normalizeScore }),
        ...(options.artifactRefs === undefined ? {} : { artifactRefs: options.artifactRefs }),
      });
    },
  });
}

/* -------------------------------------------------------------------------- *
 * The first-party MECHANICAL verifier (§14)
 * -------------------------------------------------------------------------- */

export interface CommandProjectHeadVerifierOptions {
  /**
   * The registered ref. The DEFINITION (and therefore the command) is deployment
   * config: a caller can only select the ref, never supply a command.
   */
  readonly verifierRef?: string | undefined;
  readonly command?: string | undefined;
  readonly args?: readonly string[] | undefined;
  readonly timeoutMs?: number | undefined;
  readonly independenceClass?: VerifierIndependenceClass | undefined;
  readonly version?: number | undefined;
  /** An explicit definition (must describe exactly this command). */
  readonly definition?: VerifierDefinition | undefined;
}

/**
 * A REAL independent mechanical path: the protocol is executed as a bounded
 * subprocess (`node:child_process.execFile` via the existing `commandValidator`)
 * in the repository the request names. Exit 0 → PASS; a non-zero exit → FAIL;
 * a spawn fault or timeout → ERROR (never FAIL).
 */
export function commandProjectHeadVerifier(
  options: CommandProjectHeadVerifierOptions = {},
): ProjectVerifierPort {
  const command = options.command ?? "git";
  const args = options.args ?? ["diff", "--check"];
  const definition =
    options.definition ??
    firstPartyMechanicalVerifierDefinition({
      ...(options.verifierRef === undefined ? {} : { verifierRef: options.verifierRef }),
      ...(options.version === undefined ? {} : { version: options.version }),
      ...(options.independenceClass === undefined
        ? {}
        : { independenceClass: options.independenceClass }),
      command,
      args,
    });
  const timeoutMs = options.timeoutMs;
  return experimentValidatorProjectHeadAdapter({
    definition,
    validator: (input) =>
      commandValidator({
        validatorRef: definition.verifierRef,
        command,
        args,
        ...(input.repository === undefined ? {} : { cwd: input.repository }),
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      }),
  });
}
