import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { canonicalDigest } from "../schema/canonical.js";
import type { ProjectJournalEntry, ProjectJournalViewEntry } from "../project_workspace/journal.js";
import { evaluateHardConstraint, type HardConstraintKind, type HardConstraintResult } from "../domain/hard_constraints.js";
import { BUILT_IN_DOMAIN_CONTRACTS } from "./contracts.js";
import type {
  DomainContract,
  DomainEvaluation,
  EvaluatedTaskOutcome,
  OutcomeStatus,
} from "./types.js";

const MARKER = "<!-- pc1-domain-outcome:v1 -->";
const HARD_CONSTRAINT_MARKER = "<!-- pc1-hard-constraint:v1 -->";

export interface DomainOutcomeWorkspace {
  journal(projectId?: string): Promise<readonly ProjectJournalViewEntry[]>;
  recordJournalEntry(input: {
    readonly kind: "REFERENCE_NOTE";
    readonly title: string;
    readonly body: string;
    readonly provenance: string;
  }): Promise<ProjectJournalEntry>;
}

export interface DomainOutcomeServiceDeps {
  readonly workspace: DomainOutcomeWorkspace;
  readonly repository?: string | undefined;
  readonly contracts?: readonly DomainContract[] | undefined;
  readonly clock?: (() => string) | undefined;
  /** Host/test seam; defaults to `readFileSync`. */
  readonly readBytes?: ((path: string) => Buffer) | undefined;
}

export interface EvaluateDomainOutcomeInput {
  readonly taskId: string;
  readonly contractId: string;
  readonly artifactPath?: string | null | undefined;
  readonly parameters?: Readonly<Record<string, unknown>> | undefined;
}

export interface DomainOutcomeService {
  contracts(): readonly { readonly contractId: string; readonly version: string; readonly question: string; readonly requiredInputs: readonly string[] }[];
  evaluate(input: EvaluateDomainOutcomeInput): Promise<DomainEvaluation>;
  /**
   * R7: evaluate a mechanical business constraint over explicit inputs and record the result as a
   * non-canonical note. It is a calculator, not a truth owner; the caller cannot choose the status.
   */
  checkHardConstraint(input: {
    readonly kind: HardConstraintKind;
    readonly parameters: Readonly<Record<string, unknown>>;
    readonly taskId?: string | null | undefined;
  }): Promise<HardConstraintResult>;
  project(): Promise<readonly DomainEvaluation[]>;
  projectTasks(input: {
    readonly tasks: readonly { readonly taskId: string; readonly state: string }[];
    readonly acceptedTaskIds: readonly string[];
  }): Promise<readonly EvaluatedTaskOutcome[]>;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseEvaluation(entry: ProjectJournalViewEntry): DomainEvaluation | null {
  if (entry.entry.kind !== "REFERENCE_NOTE") return null;
  const at = entry.entry.body.indexOf(MARKER);
  if (at < 0) return null;
  try {
    return JSON.parse(entry.entry.body.slice(at + MARKER.length).trim()) as DomainEvaluation;
  } catch {
    return null;
  }
}

export function makeDomainOutcomeService(deps: DomainOutcomeServiceDeps): DomainOutcomeService {
  const now = (): string => (deps.clock ?? (() => new Date().toISOString()))();
  const contracts = new Map((deps.contracts ?? BUILT_IN_DOMAIN_CONTRACTS).map((contract) => [contract.contractId, contract]));
  const read = deps.readBytes ?? readFileSync;

  const service: DomainOutcomeService = {
    contracts() {
      return [...contracts.values()].map((contract) => ({
        contractId: contract.contractId,
        version: contract.version,
        question: contract.question,
        requiredInputs: contract.requiredInputs,
      }));
    },
    async evaluate(input) {
      const contract = contracts.get(input.contractId);
      if (contract === undefined) {
        throw new Error(`unknown domain contract "${input.contractId}"; registered: ${[...contracts.keys()].join(", ")}`);
      }
      const artifactPath = input.artifactPath ?? null;
      let artifactDigest: string | null = null;
      if (artifactPath !== null) {
        try {
          const path = isAbsolute(artifactPath) ? artifactPath : resolve(deps.repository ?? ".", artifactPath);
          artifactDigest = sha256(read(path));
        } catch {
          artifactDigest = null;
        }
      }
      const result = await contract.evaluate(
        { taskId: input.taskId, artifactPath, parameters: input.parameters ?? {} },
        {
          repository: deps.repository,
          readBytes: read,
          journalEntry: async (entryId) => {
            const entries = await deps.workspace.journal();
            const found = entries.find((entry) => entry.entry.entryId === entryId);
            return found === undefined
              ? undefined
              : { kind: found.entry.kind, title: found.entry.title, body: found.entry.body, digest: found.entry.digest };
          },
        },
      );
      const content = {
        schema: "pc1-domain-outcome/v1" as const,
        taskId: input.taskId,
        contractId: contract.contractId,
        contractVersion: contract.version,
        status: result.status,
        question: contract.question,
        detail: result.detail,
        evidenceRefs: result.evidenceRefs,
        unmetRequirements: result.unmetRequirements,
        investigationComplete: result.investigationComplete,
        artifactPath,
        artifactDigest,
        evaluatedAt: now(),
      };
      const evaluation: DomainEvaluation = {
        ...content,
        evaluationId: `outcome-${canonicalDigest(content).slice(0, 24)}`,
      };
      await deps.workspace.recordJournalEntry({
        kind: "REFERENCE_NOTE",
        title: `Domain outcome: ${contract.contractId} for ${input.taskId} (${result.status})`,
        body: [
          "## Domain evaluation",
          "",
          `Question: ${contract.question}`,
          `Contract: ${contract.contractId}@${contract.version}`,
          `Status: ${result.status}`,
          `Detail: ${result.detail}`,
          `Investigation complete: ${String(result.investigationComplete)}`,
          result.unmetRequirements.length === 0 ? "Unmet requirements: none" : `Unmet requirements: ${result.unmetRequirements.join(", ")}`,
          "",
          MARKER,
          JSON.stringify(evaluation),
        ].join("\n"),
        provenance: `contract:${contract.contractId}@${contract.version}${artifactDigest === null ? "" : `; artifact:sha256:${artifactDigest}`}`,
      });
      return evaluation;
    },
    async checkHardConstraint(input) {
      const checked = evaluateHardConstraint({ kind: input.kind, parameters: input.parameters });
      const scope = input.taskId === undefined || input.taskId === null ? "project" : input.taskId;
      await deps.workspace.recordJournalEntry({
        kind: "REFERENCE_NOTE",
        title: `Hard constraint ${input.kind} (${checked.status}) for ${scope}`,
        body: [
          "## Mechanical hard-constraint check",
          "",
          `Kind: ${input.kind}`,
          `Status: ${checked.status}`,
          `Detail: ${checked.detail}`,
          "",
          `Assumptions:\n${checked.assumptions.map((entry) => `- ${entry}`).join("\n")}`,
          "",
          HARD_CONSTRAINT_MARKER,
          JSON.stringify(checked),
        ].join("\n"),
        provenance: `hard-constraint:${input.kind}; subject:${scope}`,
      });
      return checked;
    },
    async project() {
      const entries = await deps.workspace.journal();
      const latest = new Map<string, DomainEvaluation>();
      for (const entry of entries) {
        const evaluation = parseEvaluation(entry);
        if (evaluation === null) continue;
        const existing = latest.get(evaluation.taskId);
        if (existing === undefined || evaluation.evaluatedAt >= existing.evaluatedAt) latest.set(evaluation.taskId, evaluation);
      }
      return [...latest.values()];
    },
    async projectTasks(input) {
      const evaluations = await this.project();
      const byTask = new Map(evaluations.map((evaluation) => [evaluation.taskId, evaluation]));
      const accepted = new Set(input.acceptedTaskIds);
      return input.tasks.map((task) => {
        const evaluation = byTask.get(task.taskId) ?? null;
        const workAcceptance: EvaluatedTaskOutcome["workAcceptance"] =
          accepted.has(task.taskId)
            ? "ACCEPTED"
            : task.state === "VERIFYING"
              ? "CANDIDATE"
              : task.state === "SATISFIED"
                ? "NOT_ACCEPTED"
                : "UNKNOWN";
        const businessOutcome: OutcomeStatus = evaluation === null ? "unknown" : evaluation.status;
        return {
          taskId: task.taskId,
          execution: task.state,
          workAcceptance,
          businessOutcome,
          investigationComplete: evaluation?.investigationComplete ?? false,
          unmetRequirements: evaluation?.unmetRequirements ?? [],
          evaluation,
          detail:
            evaluation === null
              ? "no domain contract has been evaluated for this task; the business outcome is unknown, not successful"
              : evaluation.detail,
        };
      });
    },
  };
  return Object.freeze(service);
}
