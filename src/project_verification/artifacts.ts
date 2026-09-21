/**
 * G10-AD — Project Verification artifacts.
 *
 * A durable, digest-bound, NON-AUTHORITATIVE record of "who checked the exact
 * current project head, under which verifier protocol, and what did the protocol
 * say". This plane is deliberately narrow:
 *
 *   VerificationResult ≠ Truth            VerificationPASS ≠ WorkGatePASS
 *   VerificationFAIL   ≠ TaskFAILED       VerificationResult ≠ WorkEvidence
 *   VerificationResult ≠ ProofEvidence    VerificationResult ≠ ProofPublication
 *   VerificationResult ≠ ReasoningAdmission
 *   VerificationResult ≠ PromotionAuthority ≠ EffectAuthority
 *
 *   ProjectVerificationStore ≠ ProjectIR        ≠ WorkEventStore
 *   ProjectVerificationStore ≠ ProofEvidenceStore ≠ OrganizationMemory
 *
 * v1 verifies exactly one subject kind: CURRENT_PROJECT_HEAD. There is no
 * generic artifact subject, no claim subject and no proof subject here.
 *
 * Every artifact is frozen, carries a canonical sha256 digest computed with
 * `canonicalDigest` over a domain-separated body, and has a strict parser that
 * REJECTS unknown fields, missing fields and malformed values instead of
 * coercing them. Ids are stable identifiers; timestamps are ISO-8601 with an
 * explicit offset and are normalized to the canonical micro form on write.
 */

import { canonicalDigest } from "../schema/canonical.js";
import { canonicalDatetime } from "../schema/datetime.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";
import { VALIDATOR_VERDICTS, type ValidatorVerdict } from "../organization_memory/artifacts.js";
import {
  VERIFIER_INDEPENDENCE_CLASSES,
  isSeparationBoundaryKind,
  type ExternalSeparationContract,
  type VerifierIndependenceClass,
} from "./independence.js";

export const PROJECT_HEAD_SUBJECT_DOMAIN = "palimpsest.project-verification.subject.v1";
export const VERIFIER_DEFINITION_DOMAIN = "palimpsest.project-verification.verifier-definition.v1";
export const PROJECT_VERIFICATION_REQUEST_DOMAIN = "palimpsest.project-verification.request.v1";
export const PROJECT_VERIFIER_RAW_RESULT_DOMAIN = "palimpsest.project-verification.raw-result.v1";
export const PROJECT_VERIFICATION_EVENT_DOMAIN = "palimpsest.project-verification.run-event.v1";
export const PROJECT_VERIFICATION_RUN_DOMAIN = "palimpsest.project-verification.run.v1";

export class ProjectVerificationError extends Error {
  constructor(
    readonly kind:
      | "malformed_artifact"
      | "unknown_field"
      | "invalid_value"
      | "unknown_schema_version"
      | "unknown_kind",
    message: string,
  ) {
    super(message);
    this.name = "ProjectVerificationError";
  }
}

function fail(kind: ProjectVerificationError["kind"], message: string): never {
  throw new ProjectVerificationError(kind, message);
}

/* -------------------------------------------------------------------------- *
 * Strict helpers (fail closed; never an unchecked cast)
 * -------------------------------------------------------------------------- */

function pvObject(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("malformed_artifact", `${what} must be an object`);
  }
  return raw as Record<string, unknown>;
}

function pvKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  what: string,
): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) fail("unknown_field", `${what}: unknown field "${key}"`);
  }
  for (const key of required) {
    if (!Object.hasOwn(object, key) || object[key] === undefined) {
      fail("malformed_artifact", `${what}: missing required field "${key}"`);
    }
  }
}

function pvString(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail("invalid_value", `${what} must be a non-empty string`);
  }
  return value;
}

function pvNullableString(value: unknown, what: string): string | null {
  if (value === null) return null;
  return pvString(value, what);
}

function pvEnum<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    fail("unknown_kind", `${what} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function pvInt(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    fail("invalid_value", `${what} must be an integer`);
  }
  return value;
}

function pvNonNegInt(value: unknown, what: string): number {
  const parsed = pvInt(value, what);
  if (parsed < 0) fail("invalid_value", `${what} must be >= 0`);
  return parsed;
}

function pvFiniteNumber(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("invalid_value", `${what} must be a finite number`);
  }
  return value;
}

/**
 * A SCORE. Canonical JSON forbids floats, so a score that must survive a digest
 * has to be an integer: a judge that produces a fractional score MUST normalize
 * it (e.g. to basis points) before it is recorded. This plane never rounds
 * silently and never turns a score into a PASS.
 */
function pvScore(value: unknown, what: string): number {
  const parsed = pvFiniteNumber(value, what);
  if (!Number.isSafeInteger(parsed)) {
    fail(
      "invalid_value",
      `${what} must be a safe integer (canonical JSON forbids floats: normalize a fractional score before recording it)`,
    );
  }
  return parsed;
}

function pvId(value: unknown, what: string): string {
  if (typeof value !== "string") fail("invalid_value", `${what} must be a string`);
  const normalized = normalizeStableIdentifier(value);
  if (!isStableIdentifier(normalized)) fail("invalid_value", `${what} must be a stable identifier`);
  return normalized;
}

function pvDigest(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    fail("invalid_value", `${what} must be a canonical sha256 digest`);
  }
  return value;
}

function pvStringArray(value: unknown, what: string): readonly string[] {
  if (!Array.isArray(value)) fail("invalid_value", `${what} must be an array`);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = pvString(item, `${what}[]`);
    if (seen.has(text)) fail("invalid_value", `${what}: duplicate value "${text}"`);
    seen.add(text);
    out.push(text);
  }
  return Object.freeze(out);
}

/**
 * ISO-8601 with an explicit UTC offset, normalized to the canonical micro form
 * so a digest never depends on the textual form the caller happened to send.
 */
function pvTimestamp(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail("invalid_value", `${what} must be a non-empty ISO-8601 timestamp string`);
  }
  try {
    return canonicalDatetime(value);
  } catch (error) {
    fail(
      "invalid_value",
      `${what} must be an ISO-8601 timestamp with an explicit UTC offset (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

function pvCommit(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{7,64}$/u.test(value)) {
    fail("invalid_value", `${what} must be a lowercase hexadecimal commit id (7..64 chars)`);
  }
  return value;
}

function refDigest(domain: string, digest: string, prefix: string): string {
  return `${prefix}-${canonicalDigest({ domain, digest }).slice(0, 32)}`;
}

/* -------------------------------------------------------------------------- *
 * §1 ProjectHeadVerificationSubject — the ONLY v1 subject
 * -------------------------------------------------------------------------- */

export const PROJECT_VERIFICATION_SUBJECT_KINDS = ["CURRENT_PROJECT_HEAD", "ATTEMPT_RESULT"] as const;
export type ProjectVerificationSubjectKind = (typeof PROJECT_VERIFICATION_SUBJECT_KINDS)[number];

export function isProjectVerificationSubjectKind(
  value: unknown,
): value is ProjectVerificationSubjectKind {
  return (
    typeof value === "string" &&
    (PROJECT_VERIFICATION_SUBJECT_KINDS as readonly string[]).includes(value)
  );
}

export interface ProjectHeadVerificationSubject {
  readonly schemaVersion: 1;
  /** The LITERAL, not the kind union: this subject is only ever the current head. */
  readonly kind: "CURRENT_PROJECT_HEAD";
  readonly projectId: string;
  readonly projectRevision: number;
  readonly projectDigest: string;
  readonly headCommit: string;
  readonly digest: string;
}

export function projectHeadSubjectDigestOf(
  input: Omit<ProjectHeadVerificationSubject, "digest">,
): string {
  return canonicalDigest({ domain: PROJECT_HEAD_SUBJECT_DOMAIN, subject: input });
}

/**
 * Materialize the subject from the canonical ProjectIR head. The caller supplies
 * what the ProjectIR PROJECTION says, never a chosen commit: §4 forbids a caller
 * from naming an arbitrary verification target.
 */
export function materializeProjectHeadVerificationSubject(input: {
  readonly projectId: string;
  readonly projectRevision: number;
  readonly projectDigest: string;
  readonly headCommit: string;
}): ProjectHeadVerificationSubject {
  const body: Omit<ProjectHeadVerificationSubject, "digest"> = {
    schemaVersion: 1,
    kind: "CURRENT_PROJECT_HEAD",
    projectId: pvId(input.projectId, "subject.projectId"),
    projectRevision: pvNonNegInt(input.projectRevision, "subject.projectRevision"),
    projectDigest: pvDigest(input.projectDigest, "subject.projectDigest"),
    headCommit: pvCommit(input.headCommit, "subject.headCommit"),
  };
  return Object.freeze({ ...body, digest: projectHeadSubjectDigestOf(body) });
}

const SUBJECT_KEYS = [
  "schemaVersion",
  "kind",
  "projectId",
  "projectRevision",
  "projectDigest",
  "headCommit",
  "digest",
] as const;

export function parseProjectHeadVerificationSubject(
  raw: unknown,
  what = "ProjectHeadVerificationSubject",
): ProjectHeadVerificationSubject {
  const object = pvObject(raw, what);
  pvKeys(object, SUBJECT_KEYS, SUBJECT_KEYS, what);
  if (object.schemaVersion !== 1) fail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const body: Omit<ProjectHeadVerificationSubject, "digest"> = {
    schemaVersion: 1,
    // Explicit, not `pvEnum` over the kind union: the head parser must keep REJECTING ATTEMPT_RESULT
    // now that the union exists, or widening the kinds list would have silently changed a frozen
    // semantic.
    kind: object.kind === "CURRENT_PROJECT_HEAD" ? "CURRENT_PROJECT_HEAD" : pvEnum(object.kind, ["CURRENT_PROJECT_HEAD"] as const, `${what}.kind`),
    projectId: pvId(object.projectId, `${what}.projectId`),
    projectRevision: pvNonNegInt(object.projectRevision, `${what}.projectRevision`),
    projectDigest: pvDigest(object.projectDigest, `${what}.projectDigest`),
    headCommit: pvCommit(object.headCommit, `${what}.headCommit`),
  };
  const digest = pvDigest(object.digest, `${what}.digest`);
  if (projectHeadSubjectDigestOf(body) !== digest) {
    fail("invalid_value", `${what}.digest does not match its content`);
  }
  return Object.freeze({ ...body, digest });
}

/** The two subjects denote the same verified input. */
export function sameSubject(
  left: Pick<ProjectVerificationSubject, "digest">,
  right: Pick<ProjectVerificationSubject, "digest">,
): boolean {
  return left.digest === right.digest;
}

/* -------------------------------------------------------------------------- *
 * §1b AttemptResultVerificationSubject — the SECOND subject kind (PLMP-LEAN-1
 * appendix B / B-r1). A UNION MEMBER, not a second verification system.
 *
 * It describes a HISTORICAL, IMMUTABLE Work result, so it deliberately carries
 * no projectRevision / projectDigest / currentHead: those describe the moving
 * present, and this subject must not move with it. The commit and the report
 * digest are materialized from canonical Work state by the Work owner — a
 * caller never names a verification target (§4, unchanged).
 * -------------------------------------------------------------------------- */

export const ATTEMPT_RESULT_SUBJECT_DOMAIN = "palimpsest.project-verification.attempt-result-subject.v1";

export interface AttemptResultVerificationSubject {
  readonly schemaVersion: 1;
  readonly kind: "ATTEMPT_RESULT";
  readonly projectId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly envelopeId: string;
  readonly baseCommit: string;
  readonly resultCommit: string;
  readonly reportDigest: string;
  readonly digest: string;
}

export function attemptResultSubjectDigestOf(
  input: Omit<AttemptResultVerificationSubject, "digest">,
): string {
  return canonicalDigest({ domain: ATTEMPT_RESULT_SUBJECT_DOMAIN, subject: input });
}

/**
 * Materialize the subject from canonical Work state — the attempt row, its
 * AttemptReport and its TaskEnvelope. Every identity field is an ARGUMENT the
 * Work owner read, never a value a caller chose.
 */
export function materializeAttemptResultVerificationSubject(input: {
  readonly projectId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly envelopeId: string;
  readonly baseCommit: string;
  readonly resultCommit: string;
  readonly reportDigest: string;
}): AttemptResultVerificationSubject {
  const body: Omit<AttemptResultVerificationSubject, "digest"> = {
    schemaVersion: 1,
    kind: "ATTEMPT_RESULT",
    projectId: pvId(input.projectId, "subject.projectId"),
    taskId: pvId(input.taskId, "subject.taskId"),
    attemptId: pvId(input.attemptId, "subject.attemptId"),
    envelopeId: pvId(input.envelopeId, "subject.envelopeId"),
    baseCommit: pvCommit(input.baseCommit, "subject.baseCommit"),
    resultCommit: pvCommit(input.resultCommit, "subject.resultCommit"),
    reportDigest: pvDigest(input.reportDigest, "subject.reportDigest"),
  };
  return Object.freeze({ ...body, digest: attemptResultSubjectDigestOf(body) });
}

const ATTEMPT_RESULT_SUBJECT_KEYS = [
  "schemaVersion",
  "kind",
  "projectId",
  "taskId",
  "attemptId",
  "envelopeId",
  "baseCommit",
  "resultCommit",
  "reportDigest",
  "digest",
] as const;

export function parseAttemptResultVerificationSubject(
  raw: unknown,
  what = "AttemptResultVerificationSubject",
): AttemptResultVerificationSubject {
  const object = pvObject(raw, what);
  pvKeys(object, ATTEMPT_RESULT_SUBJECT_KEYS, ATTEMPT_RESULT_SUBJECT_KEYS, what);
  if (object.schemaVersion !== 1) fail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  if (object.kind !== "ATTEMPT_RESULT") fail("invalid_value", `${what}.kind must be ATTEMPT_RESULT`);
  const body: Omit<AttemptResultVerificationSubject, "digest"> = {
    schemaVersion: 1,
    kind: "ATTEMPT_RESULT",
    projectId: pvId(object.projectId, `${what}.projectId`),
    taskId: pvId(object.taskId, `${what}.taskId`),
    attemptId: pvId(object.attemptId, `${what}.attemptId`),
    envelopeId: pvId(object.envelopeId, `${what}.envelopeId`),
    baseCommit: pvCommit(object.baseCommit, `${what}.baseCommit`),
    resultCommit: pvCommit(object.resultCommit, `${what}.resultCommit`),
    reportDigest: pvDigest(object.reportDigest, `${what}.reportDigest`),
  };
  const digest = pvDigest(object.digest, `${what}.digest`);
  if (attemptResultSubjectDigestOf(body) !== digest) {
    fail("invalid_value", `${what}.digest does not match its content`);
  }
  return Object.freeze({ ...body, digest });
}

/**
 * The discriminated union every subject consumer takes. `kind` is what
 * dispatches, so a head subject can never be parsed as an attempt result (or
 * the reverse) — the two are told apart by identity, not by guessing.
 *
 * NOTE: `ProjectHeadVerificationSubject.kind` stays the LITERAL
 * "CURRENT_PROJECT_HEAD" (below), deliberately not widened to the kind union —
 * otherwise the head parser's `pvEnum` would start accepting ATTEMPT_RESULT and
 * a frozen semantic would have been changed by a type alias.
 */
export type ProjectVerificationSubject =
  | ProjectHeadVerificationSubject
  | AttemptResultVerificationSubject;

/** Parse either subject kind. Dispatch is on `kind`, so a mismatch fails loudly. */
export function parseProjectVerificationSubject(
  raw: unknown,
  what = "ProjectVerificationSubject",
): ProjectVerificationSubject {
  const object = pvObject(raw, what);
  if (object.kind === "ATTEMPT_RESULT") return parseAttemptResultVerificationSubject(raw, what);
  return parseProjectHeadVerificationSubject(raw, what);
}

/** Whether a subject is the immutable result of one attempt. */
export function isAttemptResultSubject(
  subject: ProjectVerificationSubject,
): subject is AttemptResultVerificationSubject {
  return subject.kind === "ATTEMPT_RESULT";
}

/* -------------------------------------------------------------------------- *
 * §6 VerifierDefinition — versioned deployment/product config (never truth)
 * -------------------------------------------------------------------------- */

export const VERIFIER_KINDS = ["command", "artifact", "model", "human", "external"] as const;
export type VerifierKind = (typeof VERIFIER_KINDS)[number];

export const VERIFIER_CONTEXT_ISOLATIONS = [
  /** The verifier runs in a separate OS process from the authoring context. */
  "PROCESS_SEPARATED",
  /** The verifier is held by a genuinely separate service/host. */
  "EXTERNAL_SERVICE",
  /** The verifier runs inside the same process/context as the work. */
  "SAME_PROCESS",
  /** The deployment cannot say. Never counted. */
  "UNKNOWN",
] as const;
export type VerifierContextIsolation = (typeof VERIFIER_CONTEXT_ISOLATIONS)[number];

export interface VerifierProvenance {
  readonly provider: string;
  readonly providerVersion: string;
  readonly implementation: string;
  readonly protocolNote: string;
  readonly contextIsolation: VerifierContextIsolation;
  /** Model identity, present iff kind === "model" (§10 versioned provenance). */
  readonly model: string | null;
  /** Prompt/role version, present iff kind === "model". */
  readonly promptVersion: string | null;
}

export interface VerifierDefinition {
  readonly schemaVersion: 1;
  readonly verifierRef: string;
  readonly version: number;
  readonly kind: VerifierKind;
  /** The protocol text (e.g. the exact bounded command) — config, not truth. */
  readonly protocol: string;
  readonly protocolDigest: string;
  readonly supportedSubjects: readonly ProjectVerificationSubjectKind[];
  readonly independenceClass: VerifierIndependenceClass;
  /** §10: an EXTERNALLY_SEPARATED definition without this does NOT count. */
  readonly separationContract: ExternalSeparationContract | null;
  readonly provenance: VerifierProvenance;
  readonly digest: string;
}

export function verifierProtocolDigestOf(input: {
  readonly verifierRef: string;
  readonly version: number;
  readonly kind: VerifierKind;
  readonly protocol: string;
}): string {
  return canonicalDigest({
    domain: `${VERIFIER_DEFINITION_DOMAIN}.protocol`,
    verifierRef: input.verifierRef,
    version: input.version,
    kind: input.kind,
    protocol: input.protocol,
  });
}

export function verifierDefinitionDigestOf(
  input: Omit<VerifierDefinition, "digest">,
): string {
  return canonicalDigest({ domain: VERIFIER_DEFINITION_DOMAIN, definition: input });
}

function materializeSeparationContract(
  raw: unknown,
  what: string,
): ExternalSeparationContract | null {
  if (raw === null || raw === undefined) return null;
  const object = pvObject(raw, what);
  pvKeys(object, ["boundary", "boundaryRef", "statement"], ["boundary", "boundaryRef", "statement"], what);
  if (!isSeparationBoundaryKind(object.boundary)) {
    fail("invalid_value", `${what}.boundary must be a known separation boundary`);
  }
  return Object.freeze({
    boundary: object.boundary,
    boundaryRef: pvString(object.boundaryRef, `${what}.boundaryRef`),
    statement: pvString(object.statement, `${what}.statement`),
  });
}

function materializeProvenance(raw: unknown, what: string): VerifierProvenance {
  const object = pvObject(raw, what);
  pvKeys(
    object,
    ["provider", "providerVersion", "implementation", "protocolNote", "contextIsolation", "model", "promptVersion"],
    ["provider", "providerVersion", "implementation", "protocolNote", "contextIsolation", "model", "promptVersion"],
    what,
  );
  return Object.freeze({
    provider: pvString(object.provider, `${what}.provider`),
    providerVersion: pvString(object.providerVersion, `${what}.providerVersion`),
    implementation: pvString(object.implementation, `${what}.implementation`),
    protocolNote: pvString(object.protocolNote, `${what}.protocolNote`),
    contextIsolation: pvEnum(object.contextIsolation, VERIFIER_CONTEXT_ISOLATIONS, `${what}.contextIsolation`),
    model: pvNullableString(object.model, `${what}.model`),
    promptVersion: pvNullableString(object.promptVersion, `${what}.promptVersion`),
  });
}

/**
 * Materialize a verifier definition. A model verifier MUST carry a versioned
 * model + prompt provenance (§10) — the host may not invent a model identity, so
 * `kind: "model"` without one is rejected outright.
 */
export function materializeVerifierDefinition(input: {
  readonly verifierRef: string;
  readonly version?: number | undefined;
  readonly kind: VerifierKind;
  readonly protocol: string;
  readonly supportedSubjects?: readonly ProjectVerificationSubjectKind[] | undefined;
  readonly independenceClass: VerifierIndependenceClass;
  readonly separationContract?: ExternalSeparationContract | null | undefined;
  readonly provenance: VerifierProvenance;
}): VerifierDefinition {
  const kind = pvEnum(input.kind, VERIFIER_KINDS, "kind");
  const verifierRef = pvId(input.verifierRef, "verifierRef");
  const version = pvNonNegInt(input.version ?? 1, "version");
  const protocol = pvString(input.protocol, "protocol");
  const independenceClass = pvEnum(
    input.independenceClass,
    VERIFIER_INDEPENDENCE_CLASSES,
    "independenceClass",
  );
  const provenance = materializeProvenance(input.provenance, "provenance");
  if (kind === "model" && (provenance.model === null || provenance.promptVersion === null)) {
    fail(
      "invalid_value",
      "a model verifier must carry a versioned model + promptVersion provenance (the host may not invent a model identity)",
    );
  }
  if (kind !== "model" && (provenance.model !== null || provenance.promptVersion !== null)) {
    fail("invalid_value", `a ${kind} verifier must not carry model provenance`);
  }
  const subjects =
    input.supportedSubjects === undefined
      ? Object.freeze(["CURRENT_PROJECT_HEAD"] as ProjectVerificationSubjectKind[])
      : Object.freeze(
          (() => {
            const seen = new Set<ProjectVerificationSubjectKind>();
            for (const subject of input.supportedSubjects) {
              if (!isProjectVerificationSubjectKind(subject)) {
                fail("unknown_kind", `supportedSubjects[] must be one of ${PROJECT_VERIFICATION_SUBJECT_KINDS.join(", ")}`);
              }
              seen.add(subject);
            }
            return PROJECT_VERIFICATION_SUBJECT_KINDS.filter((subject) => seen.has(subject));
          })(),
        );
  if (subjects.length === 0) fail("invalid_value", "supportedSubjects must not be empty");
  const separationContract = materializeSeparationContract(
    input.separationContract ?? null,
    "separationContract",
  );
  if (independenceClass !== "EXTERNALLY_SEPARATED" && separationContract !== null) {
    fail(
      "invalid_value",
      "a separationContract is only meaningful for independenceClass EXTERNALLY_SEPARATED",
    );
  }
  const body: Omit<VerifierDefinition, "digest"> = {
    schemaVersion: 1,
    verifierRef,
    version,
    kind,
    protocol,
    protocolDigest: verifierProtocolDigestOf({ verifierRef, version, kind, protocol }),
    supportedSubjects: subjects,
    independenceClass,
    separationContract,
    provenance,
  };
  return Object.freeze({ ...body, digest: verifierDefinitionDigestOf(body) });
}

const DEFINITION_KEYS = [
  "schemaVersion",
  "verifierRef",
  "version",
  "kind",
  "protocol",
  "protocolDigest",
  "supportedSubjects",
  "independenceClass",
  "separationContract",
  "provenance",
  "digest",
] as const;

export function parseVerifierDefinition(raw: unknown, what = "VerifierDefinition"): VerifierDefinition {
  const object = pvObject(raw, what);
  pvKeys(object, DEFINITION_KEYS, DEFINITION_KEYS, what);
  if (object.schemaVersion !== 1) fail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  if (!Array.isArray(object.supportedSubjects)) {
    fail("malformed_artifact", `${what}.supportedSubjects must be an array`);
  }
  const parsed = materializeVerifierDefinition({
    verifierRef: pvId(object.verifierRef, `${what}.verifierRef`),
    version: pvNonNegInt(object.version, `${what}.version`),
    kind: pvEnum(object.kind, VERIFIER_KINDS, `${what}.kind`),
    protocol: pvString(object.protocol, `${what}.protocol`),
    supportedSubjects: (object.supportedSubjects as unknown[]).map((subject) =>
      pvEnum(subject, PROJECT_VERIFICATION_SUBJECT_KINDS, `${what}.supportedSubjects[]`),
    ),
    independenceClass: pvEnum(object.independenceClass, VERIFIER_INDEPENDENCE_CLASSES, `${what}.independenceClass`),
    separationContract: materializeSeparationContract(object.separationContract, `${what}.separationContract`),
    provenance: materializeProvenance(object.provenance, `${what}.provenance`),
  });
  const protocolDigest = pvDigest(object.protocolDigest, `${what}.protocolDigest`);
  if (protocolDigest !== parsed.protocolDigest) {
    fail("invalid_value", `${what}.protocolDigest must be derived from the stated protocol`);
  }
  const digest = pvDigest(object.digest, `${what}.digest`);
  if (digest !== parsed.digest) fail("invalid_value", `${what}.digest does not match its content`);
  return parsed;
}

/* -------------------------------------------------------------------------- *
 * §11 ProjectVerificationRequest — no authority
 * -------------------------------------------------------------------------- */

export interface ProjectVerificationRequest {
  readonly schemaVersion: 1;
  readonly verificationRequestId: string;
  readonly projectId: string;
  readonly subject: ProjectHeadVerificationSubject;
  readonly verifierRef: string;
  readonly verifierDefinitionDigest: string;
  readonly requestedBy: string;
  readonly reason: string;
  readonly digest: string;
}

export function projectVerificationRequestDigestOf(
  input: Omit<ProjectVerificationRequest, "digest" | "verificationRequestId">,
): string {
  return canonicalDigest({ domain: PROJECT_VERIFICATION_REQUEST_DOMAIN, request: input });
}

export function projectVerificationRequestIdOf(contentDigest: string): string {
  return refDigest(PROJECT_VERIFICATION_REQUEST_DOMAIN, contentDigest, "pvreq");
}

export function materializeProjectVerificationRequest(input: {
  readonly subject: ProjectHeadVerificationSubject;
  readonly verifierRef: string;
  readonly verifierDefinitionDigest: string;
  readonly requestedBy: string;
  readonly reason: string;
}): ProjectVerificationRequest {
  const body: Omit<ProjectVerificationRequest, "digest" | "verificationRequestId"> = {
    schemaVersion: 1,
    projectId: input.subject.projectId,
    subject: input.subject,
    verifierRef: pvId(input.verifierRef, "verifierRef"),
    verifierDefinitionDigest: pvDigest(input.verifierDefinitionDigest, "verifierDefinitionDigest"),
    requestedBy: pvId(input.requestedBy, "requestedBy"),
    reason: pvString(input.reason, "reason"),
  };
  const digest = projectVerificationRequestDigestOf(body);
  return Object.freeze({
    ...body,
    verificationRequestId: projectVerificationRequestIdOf(digest),
    digest,
  });
}

const REQUEST_KEYS = [
  "schemaVersion",
  "verificationRequestId",
  "projectId",
  "subject",
  "verifierRef",
  "verifierDefinitionDigest",
  "requestedBy",
  "reason",
  "digest",
] as const;

export function parseProjectVerificationRequest(
  raw: unknown,
  what = "ProjectVerificationRequest",
): ProjectVerificationRequest {
  const object = pvObject(raw, what);
  pvKeys(object, REQUEST_KEYS, REQUEST_KEYS, what);
  if (object.schemaVersion !== 1) fail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const body = {
    schemaVersion: 1 as const,
    verificationRequestId: pvString(object.verificationRequestId, `${what}.verificationRequestId`),
    projectId: pvId(object.projectId, `${what}.projectId`),
    subject: parseProjectHeadVerificationSubject(object.subject, `${what}.subject`),
    verifierRef: pvId(object.verifierRef, `${what}.verifierRef`),
    verifierDefinitionDigest: pvDigest(object.verifierDefinitionDigest, `${what}.verifierDefinitionDigest`),
    requestedBy: pvId(object.requestedBy, `${what}.requestedBy`),
    reason: pvString(object.reason, `${what}.reason`),
  };
  if (body.projectId !== body.subject.projectId) {
    fail("invalid_value", `${what}.projectId must equal subject.projectId`);
  }
  const digest = pvDigest(object.digest, `${what}.digest`);
  const { verificationRequestId: _id, ...content } = body;
  if (projectVerificationRequestDigestOf(content) !== digest) {
    fail("invalid_value", `${what}.digest does not match its content`);
  }
  if (body.verificationRequestId !== projectVerificationRequestIdOf(digest)) {
    fail("invalid_value", `${what}.verificationRequestId must be derived from the request digest`);
  }
  return Object.freeze({ ...body, digest });
}

/* -------------------------------------------------------------------------- *
 * §8 Verdict vocabulary — the EXISTING validator vocabulary, preserved
 * -------------------------------------------------------------------------- */

/**
 * §8: "Prefer preserving the existing validator vocabulary". The values are
 * taken from the canonical validator vocabulary by reference so the two can
 * never drift; NO OrganizationMemory store is imported here.
 *
 *   ERROR != FAIL      SCORE != PASS      UNRESOLVED != FAIL
 */
export const PROJECT_VERIFICATION_VERDICTS: readonly ProjectVerificationVerdict[] = VALIDATOR_VERDICTS;
export type ProjectVerificationVerdict = ValidatorVerdict;

export function isProjectVerificationVerdict(value: unknown): value is ProjectVerificationVerdict {
  return typeof value === "string" && (VALIDATOR_VERDICTS as readonly string[]).includes(value);
}

export interface ProjectVerifierRawResult {
  readonly schemaVersion: 1;
  readonly verifierRef: string;
  readonly verdict: ProjectVerificationVerdict;
  /** Present iff verdict === "SCORE"; a score is never a PASS. */
  readonly score: number | null;
  readonly detail: string | null;
  readonly artifactRefs: readonly string[];
  readonly providerProvenance: string | null;
  readonly digest: string;
}

export function projectVerifierRawResultDigestOf(
  input: Omit<ProjectVerifierRawResult, "digest">,
): string {
  return canonicalDigest({ domain: PROJECT_VERIFIER_RAW_RESULT_DOMAIN, result: input });
}

/**
 * Build a raw result. SCORE requires a finite score and every other verdict must
 * NOT carry one; ERROR requires a detail, because an infrastructure fault that
 * cannot say what failed is not reportable.
 */
export function materializeProjectVerifierRawResult(input: {
  readonly verifierRef: string;
  readonly verdict: ProjectVerificationVerdict;
  readonly score?: number | null | undefined;
  readonly detail?: string | null | undefined;
  readonly artifactRefs?: readonly string[] | undefined;
  readonly providerProvenance?: string | null | undefined;
}): ProjectVerifierRawResult {
  const verdict = pvEnum(input.verdict, VALIDATOR_VERDICTS, "verdict");
  const rawScore = input.score ?? null;
  if (verdict === "SCORE") {
    if (rawScore === null) fail("invalid_value", "a SCORE result must carry a finite score");
  } else if (rawScore !== null) {
    fail("invalid_value", `a ${verdict} result must not carry a score (SCORE != PASS, and a score is not a verdict)`);
  }
  const score = rawScore === null ? null : pvScore(rawScore, "score");
  const detail = input.detail === undefined || input.detail === null ? null : pvString(input.detail, "detail");
  if (verdict === "ERROR" && detail === null) {
    fail("invalid_value", "an ERROR result must say what failed (detail)");
  }
  const body: Omit<ProjectVerifierRawResult, "digest"> = {
    schemaVersion: 1,
    verifierRef: pvId(input.verifierRef, "verifierRef"),
    verdict,
    score,
    detail,
    artifactRefs:
      input.artifactRefs === undefined
        ? Object.freeze([] as string[])
        : pvStringArray(input.artifactRefs, "artifactRefs"),
    providerProvenance:
      input.providerProvenance === undefined || input.providerProvenance === null
        ? null
        : pvString(input.providerProvenance, "providerProvenance"),
  };
  return Object.freeze({ ...body, digest: projectVerifierRawResultDigestOf(body) });
}

const RAW_RESULT_KEYS = [
  "schemaVersion",
  "verifierRef",
  "verdict",
  "score",
  "detail",
  "artifactRefs",
  "providerProvenance",
  "digest",
] as const;

export function parseProjectVerifierRawResult(
  raw: unknown,
  what = "ProjectVerifierRawResult",
): ProjectVerifierRawResult {
  const object = pvObject(raw, what);
  pvKeys(object, RAW_RESULT_KEYS, RAW_RESULT_KEYS, what);
  if (object.schemaVersion !== 1) fail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const parsed = materializeProjectVerifierRawResult({
    verifierRef: pvId(object.verifierRef, `${what}.verifierRef`),
    verdict: pvEnum(object.verdict, VALIDATOR_VERDICTS, `${what}.verdict`),
    score: object.score === null ? null : pvFiniteNumber(object.score, `${what}.score`),
    detail: object.detail === null ? null : pvString(object.detail, `${what}.detail`),
    artifactRefs: pvStringArray(object.artifactRefs, `${what}.artifactRefs`),
    providerProvenance: object.providerProvenance === null ? null : pvString(object.providerProvenance, `${what}.providerProvenance`),
  });
  const digest = pvDigest(object.digest, `${what}.digest`);
  if (digest !== parsed.digest) fail("invalid_value", `${what}.digest does not match its content`);
  return parsed;
}

/* -------------------------------------------------------------------------- *
 * §12 Durable verification history — the append-only chain unit
 * -------------------------------------------------------------------------- */

export const PROJECT_VERIFICATION_RUN_STATUSES = ["STARTED", "COMPLETED", "INTERRUPTED"] as const;
export type ProjectVerificationRunStatus = (typeof PROJECT_VERIFICATION_RUN_STATUSES)[number];

export const PROJECT_VERIFICATION_FRESHNESS = ["CURRENT", "STALE_INPUT"] as const;
export type ProjectVerificationFreshness = (typeof PROJECT_VERIFICATION_FRESHNESS)[number];

/** The lifecycle events actually written to the store. Append-only. */
export type ProjectVerificationEventKind = ProjectVerificationRunStatus;

export const PROJECT_VERIFICATION_EVENT_KINDS = ["STARTED", "COMPLETED", "INTERRUPTED"] as const;

export interface ProjectVerificationRunEvent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly projectId: string;
  /** Per-project, monotonic, gapless (the append-only chain position). */
  readonly sequence: number;
  /** Stable across the whole lifecycle of one run. */
  readonly runId: string;
  readonly kind: ProjectVerificationEventKind;
  readonly requestRef: string;
  readonly requestDigest: string;
  readonly subject: ProjectHeadVerificationSubject;
  readonly verifierRef: string;
  readonly verifierDefinitionDigest: string;
  readonly independence: VerifierIndependenceClass;
  /** When THIS event happened (canonical micro UTC). */
  readonly at: string;
  readonly verdict: ProjectVerificationVerdict | null;
  readonly score: number | null;
  readonly detail: string | null;
  readonly freshness: ProjectVerificationFreshness | null;
  readonly resultDigest: string | null;
  readonly previousRecordDigest: string;
  readonly recordDigest: string;
}

export type ProjectVerificationRunEventInput = Omit<
  ProjectVerificationRunEvent,
  "schemaVersion" | "eventId" | "recordDigest"
>;

export function projectVerificationEventDigestOf(input: ProjectVerificationRunEventInput): string {
  return canonicalDigest({
    domain: PROJECT_VERIFICATION_EVENT_DOMAIN,
    projectId: input.projectId,
    sequence: input.sequence,
    runId: input.runId,
    kind: input.kind,
    requestRef: input.requestRef,
    requestDigest: input.requestDigest,
    subject: input.subject,
    verifierRef: input.verifierRef,
    verifierDefinitionDigest: input.verifierDefinitionDigest,
    independence: input.independence,
    at: input.at,
    verdict: input.verdict,
    score: input.score,
    detail: input.detail,
    freshness: input.freshness,
    resultDigest: input.resultDigest,
    previousRecordDigest: input.previousRecordDigest,
  });
}

export function projectVerificationEventIdOf(input: {
  readonly projectId: string;
  readonly sequence: number;
  readonly recordDigest: string;
}): string {
  return refDigest(
    `${PROJECT_VERIFICATION_EVENT_DOMAIN}.id`,
    canonicalDigest({
      domain: `${PROJECT_VERIFICATION_EVENT_DOMAIN}.id`,
      projectId: input.projectId,
      sequence: input.sequence,
      recordDigest: input.recordDigest,
    }),
    "pvev",
  );
}

/**
 * The run identity: bound to the project, the STARTED sequence, the request and
 * the verifier, so it is stable across the lifecycle and unique per attempt
 * without a mutable counter.
 */
export function projectVerificationRunIdOf(input: {
  readonly projectId: string;
  readonly sequence: number;
  readonly requestRef: string;
  readonly requestDigest: string;
  readonly verifierRef: string;
}): string {
  return refDigest(
    `${PROJECT_VERIFICATION_RUN_DOMAIN}.id`,
    canonicalDigest({
      domain: `${PROJECT_VERIFICATION_RUN_DOMAIN}.id`,
      projectId: input.projectId,
      sequence: input.sequence,
      requestRef: input.requestRef,
      requestDigest: input.requestDigest,
      verifierRef: input.verifierRef,
    }),
    "pvrun",
  );
}

function freezeSubject(subject: ProjectHeadVerificationSubject): ProjectHeadVerificationSubject {
  return Object.freeze({ ...subject });
}

export function buildProjectVerificationRunEvent(
  input: ProjectVerificationRunEventInput,
): ProjectVerificationRunEvent {
  // §12/G10-AD core-suite finding: canonicalize the timestamp BEFORE digesting.
  // The reader normalizes `at` with `canonicalDatetime`, so digesting the raw
  // caller string made a legally-formed ISO timestamp (e.g. `...T00:00:00Z`)
  // produce a row whose stored digest could not verify its own content - durable
  // but unreadable. Canonicalizing here keeps write and read in one form.
  const canonical: ProjectVerificationRunEventInput = {
    ...input,
    at: canonicalDatetime(input.at),
  };
  const recordDigest = projectVerificationEventDigestOf(canonical);
  return Object.freeze({
    schemaVersion: 1 as const,
    ...canonical,
    subject: freezeSubject(canonical.subject),
    eventId: projectVerificationEventIdOf({
      projectId: canonical.projectId,
      sequence: canonical.sequence,
      recordDigest,
    }),
    recordDigest,
  });
}

const EVENT_KEYS = [
  "schemaVersion",
  "eventId",
  "projectId",
  "sequence",
  "runId",
  "kind",
  "requestRef",
  "requestDigest",
  "subject",
  "verifierRef",
  "verifierDefinitionDigest",
  "independence",
  "at",
  "verdict",
  "score",
  "detail",
  "freshness",
  "resultDigest",
  "previousRecordDigest",
  "recordDigest",
] as const;

/** Validate the lifecycle/verdict coupling of one event (shared by parse + store). */
export function assertEventLifecycle(event: {
  readonly kind: ProjectVerificationEventKind;
  readonly verdict: ProjectVerificationVerdict | null;
  readonly score: number | null;
  readonly detail: string | null;
  readonly freshness: ProjectVerificationFreshness | null;
  readonly resultDigest: string | null;
}, what: string): void {
  if (event.kind === "STARTED") {
    if (event.verdict !== null || event.score !== null || event.resultDigest !== null || event.freshness !== null) {
      fail("invalid_value", `${what}: a STARTED event carries no verdict/score/freshness/resultDigest (lifecycle != verdict)`);
    }
    return;
  }
  if (event.freshness === null) {
    fail("invalid_value", `${what}: a ${event.kind} event must record the input freshness it observed`);
  }
  if (event.kind === "INTERRUPTED") {
    if (event.verdict !== null || event.score !== null || event.resultDigest !== null) {
      fail("invalid_value", `${what}: an INTERRUPTED event fabricates no verdict/score/resultDigest`);
    }
    if (event.detail === null) fail("invalid_value", `${what}: an INTERRUPTED event must say what happened`);
    return;
  }
  // COMPLETED
  if (event.verdict === null) fail("invalid_value", `${what}: a COMPLETED event must carry a verdict`);
  if (event.verdict === "SCORE" && event.score === null) {
    fail("invalid_value", `${what}: a SCORE verdict must carry its score`);
  }
  if (event.verdict !== "SCORE" && event.score !== null) {
    fail("invalid_value", `${what}: only a SCORE verdict may carry a score`);
  }
  if (event.verdict === "ERROR" && event.detail === null) {
    fail("invalid_value", `${what}: an ERROR verdict must say what failed`);
  }
  if (event.resultDigest === null) {
    fail("invalid_value", `${what}: a COMPLETED event must reference the raw result it recorded`);
  }
}

export function parseProjectVerificationRunEvent(
  raw: unknown,
  what = "ProjectVerificationRunEvent",
): ProjectVerificationRunEvent {
  const object = pvObject(raw, what);
  pvKeys(object, EVENT_KEYS, EVENT_KEYS, what);
  if (object.schemaVersion !== 1) fail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const rawVerdict = object.verdict === null ? null : pvEnum(object.verdict, VALIDATOR_VERDICTS, `${what}.verdict`);
  const rawScore = object.score === null ? null : pvScore(object.score, `${what}.score`);
  const body: ProjectVerificationRunEventInput = {
    projectId: pvId(object.projectId, `${what}.projectId`),
    sequence: pvNonNegInt(object.sequence, `${what}.sequence`),
    runId: pvString(object.runId, `${what}.runId`),
    kind: pvEnum(object.kind, PROJECT_VERIFICATION_EVENT_KINDS, `${what}.kind`),
    requestRef: pvString(object.requestRef, `${what}.requestRef`),
    requestDigest: pvDigest(object.requestDigest, `${what}.requestDigest`),
    subject: parseProjectHeadVerificationSubject(object.subject, `${what}.subject`),
    verifierRef: pvId(object.verifierRef, `${what}.verifierRef`),
    verifierDefinitionDigest: pvDigest(object.verifierDefinitionDigest, `${what}.verifierDefinitionDigest`),
    independence: pvEnum(object.independence, VERIFIER_INDEPENDENCE_CLASSES, `${what}.independence`),
    at: pvTimestamp(object.at, `${what}.at`),
    verdict: rawVerdict,
    score: rawScore,
    detail: object.detail === null ? null : pvString(object.detail, `${what}.detail`),
    freshness:
      object.freshness === null
        ? null
        : pvEnum(object.freshness, PROJECT_VERIFICATION_FRESHNESS, `${what}.freshness`),
    resultDigest: object.resultDigest === null ? null : pvDigest(object.resultDigest, `${what}.resultDigest`),
    previousRecordDigest: pvDigest(object.previousRecordDigest, `${what}.previousRecordDigest`),
  };
  if (body.projectId !== body.subject.projectId) {
    fail("invalid_value", `${what}.projectId must equal subject.projectId`);
  }
  assertEventLifecycle(
    {
      kind: body.kind,
      verdict: body.verdict,
      score: body.score,
      detail: body.detail,
      freshness: body.freshness,
      resultDigest: body.resultDigest,
    },
    what,
  );
  const recordDigest = pvDigest(object.recordDigest, `${what}.recordDigest`);
  if (projectVerificationEventDigestOf(body) !== recordDigest) {
    fail("invalid_value", `${what}.recordDigest does not match its content`);
  }
  const eventId = pvString(object.eventId, `${what}.eventId`);
  if (
    eventId !==
    projectVerificationEventIdOf({ projectId: body.projectId, sequence: body.sequence, recordDigest })
  ) {
    fail("invalid_value", `${what}.eventId must be derived from the record digest`);
  }
  return Object.freeze({ schemaVersion: 1 as const, ...body, eventId, recordDigest });
}

/* -------------------------------------------------------------------------- *
 * §12 The folded run (what a reader/UI sees)
 * -------------------------------------------------------------------------- */

export interface ProjectVerificationRun {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly projectId: string;
  /** The STARTED sequence of this run. */
  readonly sequence: number;
  readonly requestRef: string;
  readonly requestDigest: string;
  readonly subject: ProjectHeadVerificationSubject;
  readonly verifierRef: string;
  readonly verifierDefinitionDigest: string;
  readonly independence: VerifierIndependenceClass;
  readonly status: ProjectVerificationRunStatus;
  readonly verdict: ProjectVerificationVerdict | null;
  readonly score: number | null;
  readonly detail: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  /** §5: the freshness of the INPUT at completion (STARTED ⇒ CURRENT). */
  readonly freshness: ProjectVerificationFreshness;
  readonly resultDigest: string | null;
  readonly startedEventId: string;
  readonly terminalEventId: string | null;
  /** The digest of the folded run content (tamper-evidence for the view). */
  readonly runDigest: string;
}

export function projectVerificationRunDigestOf(
  input: Omit<ProjectVerificationRun, "runDigest">,
): string {
  return canonicalDigest({ domain: PROJECT_VERIFICATION_RUN_DOMAIN, run: input });
}

/** §21: the canonical/product ref a management activity or recipe outcome cites. */
export function projectVerificationRunRef(runId: string): string {
  return `project_verification:${runId}`;
}

/**
 * Fold the append-only event chain into runs, oldest first. The chain is the
 * truth; a run is only ever a VIEW of one STARTED event and its successor — so a
 * crash that leaves an unresolved STARTED can never render a verdict.
 */
export function foldProjectVerificationRuns(
  events: readonly ProjectVerificationRunEvent[],
): readonly ProjectVerificationRun[] {
  const byRun = new Map<string, ProjectVerificationRunEvent[]>();
  const order: string[] = [];
  for (const event of events) {
    const bucket = byRun.get(event.runId);
    if (bucket === undefined) {
      byRun.set(event.runId, [event]);
      order.push(event.runId);
    } else {
      bucket.push(event);
    }
  }
  const runs: ProjectVerificationRun[] = [];
  for (const runId of order) {
    const bucket = [...(byRun.get(runId) ?? [])].sort((left, right) => left.sequence - right.sequence);
    const started = bucket[0]!;
    if (started.kind !== "STARTED") {
      fail("malformed_artifact", `run ${runId} does not begin with a STARTED event`);
    }
    const terminals = bucket.filter((event) => event.kind !== "STARTED");
    if (terminals.length > 1) {
      fail("malformed_artifact", `run ${runId} has ${terminals.length} terminal events; a run closes once`);
    }
    const terminal = terminals[0];
    const body: Omit<ProjectVerificationRun, "runDigest"> = {
      schemaVersion: 1,
      runId,
      projectId: started.projectId,
      sequence: started.sequence,
      requestRef: started.requestRef,
      requestDigest: started.requestDigest,
      subject: started.subject,
      verifierRef: started.verifierRef,
      verifierDefinitionDigest: started.verifierDefinitionDigest,
      independence: started.independence,
      status: terminal === undefined ? "STARTED" : terminal.kind,
      verdict: terminal?.verdict ?? null,
      score: terminal?.score ?? null,
      detail: terminal?.detail ?? null,
      startedAt: started.at,
      finishedAt: terminal?.at ?? null,
      // A STARTED run recorded no completion freshness: the input WAS the current
      // head when it started, and there is no verdict.
      freshness: terminal?.freshness ?? "CURRENT",
      resultDigest: terminal?.resultDigest ?? null,
      startedEventId: started.eventId,
      terminalEventId: terminal?.eventId ?? null,
    };
    runs.push(Object.freeze({ ...body, runDigest: projectVerificationRunDigestOf(body) }));
  }
  return Object.freeze(
    runs.sort((left, right) => (left.sequence === right.sequence ? 0 : left.sequence < right.sequence ? -1 : 1)),
  );
}

const RUN_KEYS = [
  "schemaVersion",
  "runId",
  "projectId",
  "sequence",
  "requestRef",
  "requestDigest",
  "subject",
  "verifierRef",
  "verifierDefinitionDigest",
  "independence",
  "status",
  "verdict",
  "score",
  "detail",
  "startedAt",
  "finishedAt",
  "freshness",
  "resultDigest",
  "startedEventId",
  "terminalEventId",
  "runDigest",
] as const;

export function parseProjectVerificationRun(
  raw: unknown,
  what = "ProjectVerificationRun",
): ProjectVerificationRun {
  const object = pvObject(raw, what);
  pvKeys(object, RUN_KEYS, RUN_KEYS, what);
  if (object.schemaVersion !== 1) fail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const status = pvEnum(object.status, PROJECT_VERIFICATION_RUN_STATUSES, `${what}.status`);
  const verdict = object.verdict === null ? null : pvEnum(object.verdict, VALIDATOR_VERDICTS, `${what}.verdict`);
  const score = object.score === null ? null : pvScore(object.score, `${what}.score`);
  const finishedAt = object.finishedAt === null ? null : pvTimestamp(object.finishedAt, `${what}.finishedAt`);
  const terminalEventId = object.terminalEventId === null ? null : pvString(object.terminalEventId, `${what}.terminalEventId`);
  const detail = object.detail === null ? null : pvString(object.detail, `${what}.detail`);
  const freshness = pvEnum(object.freshness, PROJECT_VERIFICATION_FRESHNESS, `${what}.freshness`);
  const resultDigest = object.resultDigest === null ? null : pvDigest(object.resultDigest, `${what}.resultDigest`);
  if (status === "STARTED") {
    if (verdict !== null || score !== null || detail !== null || finishedAt !== null || terminalEventId !== null || resultDigest !== null) {
      fail("invalid_value", `${what}: a STARTED run carries no verdict/score/detail/finishedAt/resultDigest (lifecycle != verdict)`);
    }
    if (freshness !== "CURRENT") {
      fail("invalid_value", `${what}: a STARTED run has no completion freshness (the input was the current head when it started)`);
    }
  } else {
    if (finishedAt === null || terminalEventId === null) {
      fail("invalid_value", `${what}: a ${status} run must carry finishedAt and terminalEventId`);
    }
    assertEventLifecycle(
      { kind: status, verdict, score, detail, freshness, resultDigest },
      what,
    );
  }
  const body: Omit<ProjectVerificationRun, "runDigest"> = {
    schemaVersion: 1,
    runId: pvString(object.runId, `${what}.runId`),
    projectId: pvId(object.projectId, `${what}.projectId`),
    sequence: pvNonNegInt(object.sequence, `${what}.sequence`),
    requestRef: pvString(object.requestRef, `${what}.requestRef`),
    requestDigest: pvDigest(object.requestDigest, `${what}.requestDigest`),
    subject: parseProjectHeadVerificationSubject(object.subject, `${what}.subject`),
    verifierRef: pvId(object.verifierRef, `${what}.verifierRef`),
    verifierDefinitionDigest: pvDigest(object.verifierDefinitionDigest, `${what}.verifierDefinitionDigest`),
    independence: pvEnum(object.independence, VERIFIER_INDEPENDENCE_CLASSES, `${what}.independence`),
    status,
    verdict,
    score,
    detail,
    startedAt: pvTimestamp(object.startedAt, `${what}.startedAt`),
    finishedAt,
    freshness,
    resultDigest,
    startedEventId: pvString(object.startedEventId, `${what}.startedEventId`),
    terminalEventId,
  };
  if (body.projectId !== body.subject.projectId) {
    fail("invalid_value", `${what}.projectId must equal subject.projectId`);
  }
  const runDigest = pvDigest(object.runDigest, `${what}.runDigest`);
  if (runDigest !== projectVerificationRunDigestOf(body)) {
    fail("invalid_value", `${what}.runDigest does not match its content`);
  }
  return Object.freeze({ ...body, runDigest });
}

export { refDigest };
