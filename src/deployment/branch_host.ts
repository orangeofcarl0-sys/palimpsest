/**
 * UX-C §16/§17/§18/SC-6/SC-7 — the MINIMAL packaged DSH branch environment.
 *
 * A branch is PURE COGNITION/RESULT ADAPTATION. This module composes EXACTLY:
 *
 *   in : one frozen `ReasoningBranchBrief` (optionally wrapped with the
 *        selector-only `evidenceContext` allowlist)
 *   out: one `palimpsest_branch_result` result `{statement, evidenceRefs?}`
 *
 * It composes NO deployment, NO federation, NO transport, NO pump, NO attention,
 * NO workspace/management, NO proof/publication/disclosure, NO external assets,
 * NO monitor, NO cross-project surface, NO `palimpsest_verification` — and NO
 * ReasoningCell service at all. `toolNames` is therefore exactly
 * `["palimpsest_branch_result"]`; a prompt line is NOT the boundary, the
 * capability set is.
 *
 * A branch creates no PeerRef/PersistentPoint/durable session, writes no store and
 * exposes no principal-only mutation tool. `RecipeExecution` remains the SOLE
 * candidate submit/evaluate owner (§15/SC-3).
 *
 * This module is host/deployment packaging (`src/deployment/**`), not a semantic
 * kernel module: it imports the kernel's READ-ONLY brief parser and nothing else.
 */

import type { ReasoningBranchBrief } from "../reasoning_cell/artifacts.js";
import { parseReasoningBranchBrief } from "../reasoning_cell/artifacts.js";
import { BRANCH_CAPABILITY_PROFILES, type BranchCapabilityProfile } from "../reasoning_cell/branch_execution.js";
import type { DshContentBlock, DshToolDefinition } from "../tools/dsh_types.js";

/** The ONE host-private tool name a packaged branch may call. */
export const BRANCH_RESULT_TOOL_NAME = "palimpsest_branch_result";

/** A typed failure of the strict branch-result parser or capability boundary. */
export class BranchHostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BranchHostError";
  }
}

export type BranchResultStatus = "pending" | "completed" | "failed";

/**
 * The single-result recorder. It exists so "exactly ONE successful result per
 * branch" is a STRUCTURAL property: the tool refuses a second result, refuses an
 * out-of-allowlist citation, and stays failed once it has failed.
 */
export interface BranchResultRecorder {
  readonly status: BranchResultStatus;
  readonly statement?: string | undefined;
  readonly evidenceRefs: readonly string[];
  readonly detail: string;
  readonly violations: readonly string[];
  /** Record the one successful result; throws `BranchHostError` on any violation. */
  record(input: { readonly statement: string; readonly evidenceRefs: readonly string[] }): {
    readonly accepted: boolean;
    readonly detail: string;
  };
}

function normalizeEvidenceRefs(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) throw new BranchHostError("evidenceRefs must be an array of strings");
  const out = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw new BranchHostError("evidenceRefs must contain non-empty strings");
    }
    out.add(entry);
  }
  return Object.freeze([...out].sort());
}

/** Strict branch-result arguments: EXACTLY `{statement, evidenceRefs?}`. */
function parseBranchResultArgs(args: unknown): { readonly statement: string; readonly evidenceRefs?: readonly string[] } {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    throw new BranchHostError("branch result arguments must be an object");
  }
  const object = args as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    if (key !== "statement" && key !== "evidenceRefs") {
      throw new BranchHostError(`branch result has unknown argument "${key}"`);
    }
  }
  const statement = object.statement;
  if (typeof statement !== "string" || statement.trim() === "") {
    throw new BranchHostError("branch result requires a non-empty string `statement`");
  }
  return {
    statement,
    ...(object.evidenceRefs === undefined ? {} : { evidenceRefs: normalizeEvidenceRefs(object.evidenceRefs) }),
  };
}

export interface BranchHostEvidenceContext {
  readonly allowedEvidenceRefs: readonly string[];
  readonly selections: readonly unknown[];
}

/**
 * PLMP-LEAN-1 §C.23 (D1-g): the host-native READ-ONLY tools a `PROJECT_READ_ONLY` branch may call.
 *
 * These are the DSH registry's own names, and the list is deliberately THREE tools: `read`, `glob`,
 * `grep`. Everything that could change bytes — `write`, `edit`, the shell/pwsh tools, the terminal —
 * is absent, so "the worker cannot modify the canonical project" is a property of its CAPABILITY SET
 * rather than of a prompt line or a path check.
 *
 * The frozen snapshot's `cwd` is what confines them: a branch is spawned with the delegation's
 * snapshot as its working directory, so these tools read the basis commit while the principal keeps
 * editing the live repository. This is NOT an OS-level sandbox and must never be described as one —
 * a host-native reader can still open an absolute path. The guarantee D1 makes is the one that
 * matters here: the worker has no way to WRITE, and its normal read basis is the frozen snapshot.
 */
const PROJECT_READ_TOOL_NAMES: readonly string[] = Object.freeze(["read", "glob", "grep"]);

export interface BranchHostPayload {
  readonly brief: ReasoningBranchBrief;
  readonly cellId: string;
  readonly branchId: string;
  /** The opaque, selector-only evidence material (present only for evidence branches). */
  readonly evidenceContext?: BranchHostEvidenceContext | undefined;
  /** The frozen allowlist; empty unless an evidence context was supplied. */
  readonly allowlist: readonly string[];
  /** TRUE iff an evidenceContext with an explicit `allowedEvidenceRefs` array was supplied. */
  readonly enforceAllowlist: boolean;
  /** §C.23: what this branch may DO. Defaults to `RESULT_ONLY` — today's behaviour, byte for byte. */
  readonly capabilityProfile: BranchCapabilityProfile;
}

export type BranchHostPayloadParse =
  | { readonly ok: true; readonly payload: BranchHostPayload }
  | { readonly ok: false; readonly detail: string };

function parseEvidenceContext(raw: unknown): { readonly context?: BranchHostEvidenceContext; readonly detail?: string } {
  if (raw === undefined) return {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { detail: "evidenceContext must be an object when present" };
  }
  const object = raw as Record<string, unknown>;
  const rawAllowed = object.allowedEvidenceRefs;
  const allowed: string[] = [];
  if (rawAllowed !== undefined) {
    if (!Array.isArray(rawAllowed)) return { detail: "evidenceContext.allowedEvidenceRefs must be an array" };
    for (const entry of rawAllowed) {
      const id = typeof entry === "string" ? entry : (entry as { readonly evidenceId?: unknown } | null)?.evidenceId;
      if (typeof id !== "string" || id === "") return { detail: "evidenceContext.allowedEvidenceRefs must contain evidence ids" };
      allowed.push(id);
    }
  }
  return {
    context: Object.freeze({
      allowedEvidenceRefs: Object.freeze([...new Set(allowed)].sort()),
      selections: Object.freeze(Array.isArray(object.selections) ? [...object.selections] : []),
    }),
  };
}

/**
 * Parse the frozen branch payload. The file may contain EITHER a bare
 * `ReasoningBranchBrief` OR `{ brief, evidenceContext }` (the evidence-grounded
 * CF-T-02 payload). Anything else fails closed: a branch host that cannot prove
 * its input must not think.
 */
export function parseBranchHostPayload(raw: unknown): BranchHostPayloadParse {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, detail: "the branch payload must be an object" };
  }
  const object = raw as Record<string, unknown>;
  const isEnvelope = object.brief !== undefined;
  const briefRaw = isEnvelope ? object.brief : raw;
  const evidenceContextRaw = isEnvelope ? object.evidenceContext : undefined;

  let brief: ReasoningBranchBrief;
  try {
    brief = parseReasoningBranchBrief(briefRaw);
  } catch (error) {
    return { ok: false, detail: `the frozen branch brief is malformed: ${error instanceof Error ? error.message : String(error)}` };
  }

  const parsedContext = parseEvidenceContext(evidenceContextRaw);
  if (parsedContext.detail !== undefined) return { ok: false, detail: parsedContext.detail };

  // §C.23: what the branch may DO. Strict, and defaulted rather than guessed: an absent profile is
  // `RESULT_ONLY`, which is exactly what this environment composed before the profile existed — so
  // every existing blocking caller keeps its capability set byte for byte, and a widened one has to
  // be asked for explicitly.
  const rawProfile = isEnvelope ? object.capabilityProfile : undefined;
  if (rawProfile !== undefined && !(BRANCH_CAPABILITY_PROFILES as readonly unknown[]).includes(rawProfile)) {
    return {
      ok: false,
      detail: `branch payload capabilityProfile must be one of ${BRANCH_CAPABILITY_PROFILES.join(", ")}`,
    };
  }
  const capabilityProfile: BranchCapabilityProfile =
    rawProfile === undefined ? "RESULT_ONLY" : (rawProfile as BranchCapabilityProfile);

  const allowlist = parsedContext.context?.allowedEvidenceRefs ?? Object.freeze([] as string[]);
  return {
    ok: true,
    payload: Object.freeze({
      brief,
      cellId: brief.cell.cellId,
      branchId: brief.branch.branchId,
      ...(parsedContext.context === undefined ? {} : { evidenceContext: parsedContext.context }),
      allowlist,
      enforceAllowlist: isEnvelope && Array.isArray((evidenceContextRaw as Record<string, unknown> | undefined)?.allowedEvidenceRefs),
      capabilityProfile,
    }),
  };
}

function makeRecorder(allowlist: readonly string[], enforceAllowlist: boolean): BranchResultRecorder {
  const allowed = new Set(allowlist);
  const violations: string[] = [];
  let status: BranchResultStatus = "pending";
  let statement: string | undefined;
  let evidenceRefs: readonly string[] = Object.freeze([] as string[]);
  let detail = "the branch has not produced a result yet";

  return {
    get status(): BranchResultStatus {
      return status;
    },
    get statement(): string | undefined {
      return statement;
    },
    get evidenceRefs(): readonly string[] {
      return evidenceRefs;
    },
    get detail(): string {
      return detail;
    },
    get violations(): readonly string[] {
      return Object.freeze([...violations]);
    },
    record(input) {
      if (status === "completed") {
        const violation = "the branch already produced its ONE successful result";
        violations.push(violation);
        status = "failed";
        detail = violation;
        throw new BranchHostError(`EPHEMERAL_BRANCH_RESULT_ALREADY_RECORDED: ${violation}`);
      }
      if (status === "failed") {
        throw new BranchHostError(`EPHEMERAL_BRANCH_RESULT_REFUSED: ${detail}`);
      }
      if (enforceAllowlist) {
        const disallowed = input.evidenceRefs.filter((ref) => !allowed.has(ref)).sort();
        if (disallowed.length > 0) {
          const violation = `the branch cited evidence outside the frozen allowlist: ${disallowed.join(", ")}`;
          violations.push(violation);
          status = "failed";
          detail = violation;
          throw new BranchHostError(violation);
        }
      }
      statement = input.statement;
      evidenceRefs = Object.freeze([...input.evidenceRefs].sort());
      status = "completed";
      detail = "the branch produced its one structured result";
      return { accepted: true, detail };
    },
  };
}

function textBlock(value: unknown): DshContentBlock[] {
  return [{ type: "text", text: JSON.stringify(value, null, 2) }];
}

/**
 * The ONE host-private strict result tool. It writes NO store and holds NO
 * authority: it records a structured `{statement, evidenceRefs?}` and nothing
 * else. `RecipeExecution` turns that result into the candidate.
 */
export function defineBranchResultTool(recorder: BranchResultRecorder): DshToolDefinition {
  return {
    name: BRANCH_RESULT_TOOL_NAME,
    description:
      "EPHEMERAL BRANCH RESULT: submit your ONE structured result for this branch. This tool has no authority and writes no store; it only records the statement (and the evidence refs you actually used) for the calling harness.",
    parameters: {
      type: "object",
      properties: {
        statement: { type: "string", description: "one concise, falsifiable statement that directly answers the frozen branch question" },
        evidenceRefs: {
          type: "array",
          items: { type: "string" },
          description: "evidence ids you actually used; required to stay inside the frozen allowlist when one was supplied",
        },
      },
      required: ["statement"],
      additionalProperties: false,
    },
    output: { schema: { type: "object" }, render: (_args, value) => textBlock(value) },
    mode: "mutating",
    async execute(args: unknown): Promise<unknown> {
      const parsed = parseBranchResultArgs(args);
      return recorder.record({
        statement: parsed.statement,
        evidenceRefs: parsed.evidenceRefs ?? Object.freeze([] as string[]),
      });
    },
  };
}

/** The packaged branch environment: ONE tool and nothing else. */
export interface BranchHostEnvironment {
  readonly payload: BranchHostPayload;
  readonly recorder: BranchResultRecorder;
  readonly tool: DshToolDefinition;
  /** Exactly `[BRANCH_RESULT_TOOL_NAME]`: the tools PALIMPSEST composes for a branch. */
  readonly toolNames: readonly string[];
  /**
   * §C.23: every tool the branch agent may call — the composed result tool PLUS, for a
   * `PROJECT_READ_ONLY` branch, the host's own read-only project tools. The runner restricts to THIS
   * list, so the capability set is structural: a tool outside it is not merely discouraged.
   */
  readonly allowedTools: readonly string[];
  /** Always empty: a branch composes no principal surface. */
  readonly principalTools: readonly string[];
}

export type BranchHostEnvironmentResult =
  | { readonly ok: true; readonly environment: BranchHostEnvironment }
  | { readonly ok: false; readonly detail: string };

/**
 * Compose the minimal branch environment from a raw payload. There is deliberately
 * no `installed`/`deployment` field: a branch CANNOT compose the principal stack.
 */
export function composeBranchHostEnvironment(raw: unknown): BranchHostEnvironmentResult {
  const parsed = parseBranchHostPayload(raw);
  if (!parsed.ok) return parsed;
  const recorder = makeRecorder(parsed.payload.allowlist, parsed.payload.enforceAllowlist);
  const tool = defineBranchResultTool(recorder);
  return {
    ok: true,
    environment: Object.freeze({
      payload: parsed.payload,
      recorder,
      tool,
      toolNames: Object.freeze([BRANCH_RESULT_TOOL_NAME]),
      allowedTools: Object.freeze(
        parsed.payload.capabilityProfile === "PROJECT_READ_ONLY"
          ? [...PROJECT_READ_TOOL_NAMES, BRANCH_RESULT_TOOL_NAME]
          : [BRANCH_RESULT_TOOL_NAME],
      ),
      principalTools: Object.freeze([] as string[]),
    }),
  };
}
