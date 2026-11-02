/**
 * PC1 S03 — the derived continuity service. Read-only; no store, no cache, no authority.
 */
import { canonicalDigest } from "../schema/canonical.js";
import type { ProjectIr } from "../schema/models.js";
import type { ProjectJournalViewEntry } from "../project_workspace/journal.js";
import type { OpenLoop } from "../project_workspace/view.js";
import type {
  ContextCapsule,
  ContinuityBasis,
  ContinuityInput,
  ContinuityItem,
  ContinuityTask,
  FactStanding,
  ProjectExplanation,
  ProjectSummary,
} from "./types.js";

export interface ProjectContinuityService {
  summary(): Promise<ProjectSummary>;
  explain(subject: string): Promise<ProjectExplanation>;
  contextCapsule(input?: { readonly maxBytes?: number | undefined }): Promise<ContextCapsule>;
}

const DEFAULT_CAPSULE_BYTES = 8_192;
const MIN_CAPSULE_BYTES = 1_024;

function item(input: {
  id: string;
  standing: FactStanding;
  title: string;
  detail: string;
  sourceRefs: readonly string[];
  basis: ContinuityBasis;
  applicability?: string | undefined;
  adoptionBasis?: string | undefined;
  reopenConditions?: readonly string[] | undefined;
  historicalAcceptance?: "ACCEPTED" | undefined;
  currentApplicability?: "APPLICABLE" | "CONTRADICTED" | "SUPERSEDED" | "UNKNOWN" | undefined;
  applicabilityBasis?: string | undefined;
}): ContinuityItem {
  return Object.freeze({
    id: input.id,
    standing: input.standing,
    title: input.title,
    detail: input.detail,
    sourceRefs: Object.freeze([...input.sourceRefs]),
    basis: input.basis,
    applicability: input.applicability ?? "this project, at the recorded basis",
    ...(input.adoptionBasis === undefined ? {} : { adoptionBasis: input.adoptionBasis }),
    reopenConditions: Object.freeze([...(input.reopenConditions ?? [])]),
    ...(input.historicalAcceptance === undefined ? {} : { historicalAcceptance: input.historicalAcceptance }),
    ...(input.currentApplicability === undefined ? {} : { currentApplicability: input.currentApplicability }),
    ...(input.applicabilityBasis === undefined ? {} : { applicabilityBasis: input.applicabilityBasis }),
  });
}

function taskStateMap(status: ReturnType<ContinuityInput["work"]["status"]>): Map<string, string> {
  return new Map(status.tasks.map((task) => [task.task_id, task.state]));
}

function journalOpen(entry: ProjectJournalViewEntry): boolean {
  const resolution = entry.resolution;
  return resolution === undefined || (resolution.status !== "RESOLVED" && resolution.status !== "DISMISSED");
}

function stableBasis(ir: ProjectIr, status: ReturnType<ContinuityInput["work"]["status"]>, now: string): ContinuityBasis {
  return Object.freeze({
    projectRevision: ir.revision,
    projectDigest: ir.digest,
    headCommit: status.headCommit,
    observedAt: now,
  });
}

export function makeProjectContinuityService(input: ContinuityInput): ProjectContinuityService {
  const now = (): string => (input.clock ?? (() => new Date().toISOString()))();

  const build = async (): Promise<ProjectSummary> => {
    const ir = input.work.project();
    const status = input.work.status();
    const basis = stableBasis(ir, status, now());
    const entries = input.workspace === undefined ? [] : await input.workspace.journal(ir.project_id);
    const openLoops = input.workspace === undefined ? [] : await input.workspace.openLoops();
    const states = taskStateMap(status);
    const unavailable: string[] = [];
    if (input.workspace === undefined) unavailable.push("project journal / open loops (not composed)");
    if (input.authority === undefined) unavailable.push("authority composition facts");

    const requirements = ir.requirements.map((requirement) =>
      item({
        id: `requirement:${requirement.requirement_id}`,
        standing: "ACCEPTED_FOR_PURPOSE",
        title: `${requirement.requirement_id} (${requirement.priority})`,
        detail: requirement.statement,
        sourceRefs: [`requirement:${requirement.requirement_id}`, `revision:${ir.revision}`],
        basis,
        adoptionBasis: "the project's current ProjectIR revision",
        reopenConditions: ["an operator intent revision that changes or removes this requirement"],
      }),
    );

    const decisions = ir.decisions.map((decision) =>
      item({
        id: `decision:${decision.decision_id}`,
        standing: "AGENT_INTERPRETATION",
        title: decision.statement,
        detail: decision.rationale,
        sourceRefs: [
          `decision:${decision.decision_id}`,
          ...decision.evidence_ids.map((evidenceId) => `evidence:${evidenceId}`),
          ...(decision.supersedes === null ? [] : [`decision:${decision.supersedes}`]),
        ],
        basis,
        adoptionBasis: "appended to ProjectIR through the decision owner (not an authority grant)",
        reopenConditions: ["new evidence, a superseding decision, or a changed requirement"],
      }),
    );

    const taskObjective = new Map(ir.tasks.map((task) => [task.task_id, task.objective]));
    const taskByAttempt = new Map(status.attempts.map((attempt) => [attempt.attempt_id, attempt.task_id]));
    const acceptedTaskIds = new Set(
      input.work
        .promotionFacts()
        .map((fact) => taskByAttempt.get(fact.attemptId))
        .filter((taskId): taskId is string => typeof taskId === "string"),
    );
    const promotionFacts = input.work.promotionFacts();
    const lastPromotionByTask = new Map<string, string>();
    for (const fact of promotionFacts) {
      const taskId = taskByAttempt.get(fact.attemptId);
      if (taskId !== undefined && taskId !== null) lastPromotionByTask.set(taskId, fact.promotionId);
    }
    const acceptedResults = promotionFacts.map((fact) => {
      const taskId = taskByAttempt.get(fact.attemptId) ?? null;
      const superseded = taskId !== null && lastPromotionByTask.get(taskId) !== fact.promotionId;
      return item({
        id: `promotion:${fact.promotionId}`,
        standing: "ACCEPTED_FOR_PURPOSE",
        title: `Accepted result for ${taskId ?? "a completed task"}`,
        detail: `source commit ${fact.sourceCommit} was promoted onto ${fact.expectedHeadCommit}; resulting head ${fact.resultingHeadCommit}`,
        sourceRefs: [`promotion:${fact.promotionId}`, `commit:${fact.sourceCommit}`, `commit:${fact.resultingHeadCommit}`],
        basis,
        adoptionBasis: "the promotion effect recorded by the canonical Promotion path",
        reopenConditions: ["a later accepted source revision or a re-evaluation of the result's subject"],
        historicalAcceptance: "ACCEPTED",
        currentApplicability: superseded ? "SUPERSEDED" : "UNKNOWN",
        applicabilityBasis: superseded
          ? "a later accepted result for the same task exists; the earlier result remains historical"
          : "no current-world compatibility assessment is composed for this result; historical acceptance is not proof that it still applies",
      });
    });

    const candidates: ContinuityItem[] = [];
    for (const task of status.tasks) {
      if (task.state !== "VERIFYING") continue;
      candidates.push(
        item({
          id: `candidate:${task.task_id}`,
          standing: "CANDIDATE",
          title: `Delivered result awaiting acceptance: ${task.task_id}`,
          detail: taskObjective.get(task.task_id) ?? "a task is waiting for an operator decision",
          sourceRefs: [`task:${task.task_id}`],
          basis,
          applicability: "delivered, not yet part of canonical project state",
          reopenConditions: ["operator acceptance, rejection, or a changed project basis before acceptance"],
        }),
      );
    }
    for (const loop of openLoops) {
      const isDecision = loop.kind === "PENDING_BOUNDARY_DECISION";
      const isWork = loop.kind === "READY_WORK" || loop.kind === "BLOCKED_WORK" || loop.kind === "REASONING_UNRESOLVED";
      if (!isDecision && !isWork) continue;
      candidates.push(
        item({
          id: `loop:${loop.id}`,
          standing: "CANDIDATE",
          title: isDecision ? "Decision awaiting an operator" : "Work awaiting a legal next step",
          detail: loop.detail,
          sourceRefs: [loop.subjectRef === undefined ? `loop:${loop.id}` : `${loop.subjectRef.kind}:${loop.subjectRef.id}`],
          basis,
          applicability: "open loop in the derived workspace",
          reopenConditions: ["the subject is resolved, rejected or superseded"],
        }),
      );
    }

    const negativeFindings = entries
      .filter((entry) => entry.entry.kind === "NEGATIVE_RESULT")
      .map((entry) =>
        item({
          id: `journal:${entry.entry.entryId}`,
          standing: "NEGATIVE_FINDING",
          title: entry.entry.title,
          detail: entry.entry.body,
          sourceRefs: [`journal:${entry.entry.entryId}`, ...(entry.entry.provenance === "" ? [] : [entry.entry.provenance])],
          basis,
          applicability: "a concluded finding; it may still be reopened by a genuinely new accepted source",
          adoptionBasis: "recorded in the project journal",
          reopenConditions: ["a new accepted source revision that supersedes its evidence", "an operator decision that reopens the question"],
        }),
      );

    const openQuestions = entries
      .filter((entry) => journalOpen(entry) && (entry.entry.kind === "OPEN_QUESTION" || entry.entry.kind === "OPPORTUNITY" || entry.entry.kind === "IDEA" || entry.entry.kind === "REFERENCE_NOTE"))
      .map((entry) =>
        item({
          id: `journal:${entry.entry.entryId}`,
          standing: entry.entry.kind === "OPEN_QUESTION" ? "UNCERTAIN" : "AGENT_INTERPRETATION",
          title: entry.entry.title,
          detail: entry.entry.body,
          sourceRefs: [`journal:${entry.entry.entryId}`, ...(entry.entry.provenance === "" ? [] : [entry.entry.provenance])],
          basis,
          applicability: "not accepted project truth; an input to the next decision",
          reopenConditions: ["new evidence or an operator decision"],
        }),
      );

    const tasks: ContinuityTask[] = status.tasks.map((task) => ({
      taskId: task.task_id,
      state: task.state,
      objective: taskObjective.get(task.task_id) ?? "",
      workAcceptance: acceptedTaskIds.has(task.task_id)
        ? "ACCEPTED"
        : task.state === "VERIFYING"
          ? "CANDIDATE"
          : task.state === "SATISFIED"
            ? "NOT_ACCEPTED"
            : "UNKNOWN",
    }));
    if (input.outcomes !== undefined) {
      const outcomes = await input.outcomes();
      const byTask = new Map(outcomes.map((outcome) => [outcome.taskId, outcome]));
      for (let index = 0; index < tasks.length; index += 1) {
        const outcome = byTask.get(tasks[index]!.taskId);
        if (outcome === undefined) continue;
        tasks[index] = {
          ...tasks[index]!,
          businessOutcome: outcome.businessOutcome,
          investigationComplete: outcome.investigationComplete,
          unmetRequirements: outcome.unmetRequirements,
          outcomeDetail: outcome.detail,
        };
      }
    }
    const pendingWork = tasks.filter((task) => task.state !== "SATISFIED" && task.state !== "FAILED" && task.state !== "STALE");

    const blocked: ContinuityItem[] = [];
    for (const fence of status.promotionFence) {
      blocked.push(
        item({
          id: `promotion-fence:${fence.promotion_id}`,
          standing: "UNCERTAIN",
          title: `Promotion pending for ${fence.task_id}`,
          detail: `promotion ${fence.promotion_id} is ${fence.state}; its effect is not proven terminal, so the project head may not move`,
          sourceRefs: [`promotion:${fence.promotion_id}`, `task:${fence.task_id}`],
          basis,
          applicability: "canonical effect recovery, not an ordinary work item",
          reopenConditions: ["the Ordarium operation is proven succeeded or failed and reconciled"],
        }),
      );
    }

    const authority = input.authority;
    const authorizationBoundaries = [
      "The agent may investigate, propose and write only within its Work scope. It may not accept a source, approve its own proposal, promote a result, or change the goal or a binding requirement.",
      "Accepting a result is an operator action through the existing promotion path.",
      `Source intake: ${authority?.sourceIntake === "operator_only" ? "only an independent operator can accept external source bytes." : "no source-intake authority is composed; only read/prepare is available."}`,
      `Operator intent admission: ${authority?.operatorIntentAdmission === true ? "composed; a matching operator decision can apply an intent revision." : "not composed; an intent apply will refuse rather than self-authorize."}`,
    ];

    const nextActions: string[] = [];
    const verifying = pendingWork.filter((task) => task.state === "VERIFYING");
    const ready = pendingWork.filter((task) => task.state === "READY");
    const active = pendingWork.filter((task) => task.state === "ACTIVE");
    const running = status.attempts.filter((attempt) => attempt.state === "RUNNING");
    /**
     * R2: the Work owner's pure explanation is the ONE source of the formal next action. The old
     * broad-state inference remains only for a compatibility projection that does not carry it.
     */
    if (status.nextAction !== undefined) {
      if (status.nextAction.executable && status.nextAction.action !== null) {
        nextActions.push(`agent: ${status.nextAction.action}`);
      } else {
        nextActions.push(
          `${status.nextAction.kind.startsWith("WAIT_OPERATOR") ? "operator" : "agent"}: ${status.nextAction.detail}`,
        );
      }
    } else {
      if (blocked.length > 0) nextActions.push("operator: recover the pending canonical effect before starting dependent work");
      if (verifying.length > 0) nextActions.push("operator: review the delivered result and accept or reject it");
      if (ready.length > 0) nextActions.push("agent: palimpsest_work action=next (mechanical step is legal)");
      if (active.length > 0 && running.length > 0) nextActions.push("agent: palimpsest_work action=complete when the work is done");
    }
    if (openQuestions.length > 0) nextActions.push("agent: address an open question by investigation or a proposal; do not treat it as accepted");
    if (pendingWork.length === 0 && verifying.length === 0) nextActions.push("agent: propose the next bounded step in the project journal");
    if (nextActions.length === 0) nextActions.push("status is quiescent; read the recent journal before proposing a change");

    const base = {
      schema: "pc1-project-summary/v1" as const,
      projectId: ir.project_id,
      goal: ir.goal,
      basis,
      coverage: {
        complete: unavailable.length === 0,
        omitted: [] as string[],
        unavailable,
      },
      requirements,
      decisions,
      acceptedResults,
      candidates,
      negativeFindings,
      openQuestions,
      recentChanges: entries.slice(-6).map((entry) => ({
        id: `journal:${entry.entry.entryId}`,
        kind: entry.entry.kind,
        title: entry.entry.title,
      })),
      tasks,
      pendingWork,
      blocked,
      authorizationBoundaries,
      nextActions,
    };
    return Object.freeze({ ...base, digest: canonicalDigest(base) });
  };

  const allItems = (summary: ProjectSummary): readonly ContinuityItem[] =>
    Object.freeze([
      ...summary.requirements,
      ...summary.decisions,
      ...summary.acceptedResults,
      ...summary.candidates,
      ...summary.negativeFindings,
      ...summary.openQuestions,
      ...summary.blocked,
    ]);

  return Object.freeze({
    summary: build,
    async explain(subject: string): Promise<ProjectExplanation> {
      const summary = await build();
      const items = allItems(summary);
      const found = items.find(
        (candidate) =>
          candidate.id === subject ||
          candidate.sourceRefs.includes(subject) ||
          candidate.sourceRefs.some((ref) => ref.split(":").slice(-1)[0] === subject),
      );
      const availableRefs = items.map((candidate) => candidate.id);
      if (found === undefined) {
        return {
          schema: "pc1-project-explain/v1",
          subject,
          found: false,
          standing: "UNKNOWN",
          basis: summary.basis,
          availableRefs,
          detail: `no current projection item matches "${subject}". This is a real gap, not an empty result: the subject may be an owner reference this deployment cannot resolve.`,
        };
      }
      return {
        schema: "pc1-project-explain/v1",
        subject,
        found: true,
        standing: found.standing,
        item: found,
        basis: summary.basis,
        availableRefs,
        detail: `${found.standing}: ${found.title}`,
      };
    },
    async contextCapsule(options?: { readonly maxBytes?: number | undefined }): Promise<ContextCapsule> {
      const summary = await build();
      const requested = options?.maxBytes ?? DEFAULT_CAPSULE_BYTES;
      const budgetBytes = Math.max(MIN_CAPSULE_BYTES, Math.trunc(requested));
      const omitted: string[] = [];
      const usedRefs = new Set<string>();
      /**
       * Decision-oriented order: binding constraints and the current blocker come before history;
       * negative findings and unresolved assumptions come before candidate optimism; the legal next
       * action comes before the long accepted-result list. The explicit omission/byte budget is
       * unchanged, so a section that does not fit is still NAMED rather than silently dropped.
       */
      const sections: Array<{ readonly name: string; readonly text: string; readonly refs: readonly string[] }> = [
        { name: "goal", text: `# Project ${summary.projectId}\n\nGoal: ${summary.goal}\nBasis: revision ${summary.basis.projectRevision}, head ${summary.basis.headCommit.slice(0, 12)}, observed ${summary.basis.observedAt}\n`, refs: [] },
        {
          name: "requirements",
          text: `## Binding requirements / hard constraints\n\n${summary.requirements.map((entry) => `- ${entry.title}: ${entry.detail}`).join("\n")}\n`,
          refs: summary.requirements.flatMap((entry) => entry.sourceRefs),
        },
        {
          name: "recentChanges",
          text: `## Recent material changes\n\n${(summary.recentChanges ?? []).length === 0 ? "(none)" : (summary.recentChanges ?? []).map((entry) => `- ${entry.kind}: ${entry.title} (${entry.id})`).join("\n")}\n`,
          refs: (summary.recentChanges ?? []).map((entry) => entry.id),
        },
        {
          name: "blocked",
          text: `## Current blocking / uncertain effects\n\n${summary.blocked.length === 0 ? "(none)" : summary.blocked.map((entry) => `- ${entry.title}: ${entry.detail}`).join("\n")}\n`,
          refs: summary.blocked.flatMap((entry) => entry.sourceRefs),
        },
        {
          name: "negativeFindings",
          text: `## Important negative findings\n\n${summary.negativeFindings.length === 0 ? "(none)" : summary.negativeFindings.map((entry) => `- ${entry.title}: ${entry.detail}`).join("\n")}\n`,
          refs: summary.negativeFindings.flatMap((entry) => entry.sourceRefs),
        },
        {
          name: "openQuestions",
          text: `## Unresolved assumptions / interpretations\n\n${summary.openQuestions.length === 0 ? "(none)" : summary.openQuestions.map((entry) => `- ${entry.title}: ${entry.detail}`).join("\n")}\n`,
          refs: summary.openQuestions.flatMap((entry) => entry.sourceRefs),
        },
        {
          name: "nextActions",
          text: `## Permissible next actions\n\n${summary.nextActions.map((line) => `- ${line}`).join("\n")}\n`,
          refs: [],
        },
        {
          name: "candidates",
          text: `## Candidates / delivered but not accepted\n\n${summary.candidates.length === 0 ? "(none)" : summary.candidates.map((entry) => `- ${entry.title}: ${entry.detail}`).join("\n")}\n`,
          refs: summary.candidates.flatMap((entry) => entry.sourceRefs),
        },
        {
          name: "acceptedResults",
          text: `## Historical acceptance and current applicability\n\n${summary.acceptedResults.length === 0 ? "(none)" : summary.acceptedResults.map((entry) => `- ${entry.title}: ${entry.detail}${entry.currentApplicability === undefined ? "" : ` [historical=${entry.historicalAcceptance ?? "ACCEPTED"}; current=${entry.currentApplicability}]`}`).join("\n")}\n`,
          refs: summary.acceptedResults.flatMap((entry) => entry.sourceRefs),
        },
        {
          name: "pendingWork",
          text: `## Work\n\n${summary.tasks.length === 0 ? "(no tasks)" : summary.tasks.map((task) => `- ${task.taskId}: ${task.state} — ${task.objective}`).join("\n")}\n`,
          refs: summary.tasks.map((task) => `task:${task.taskId}`),
        },
        {
          name: "authority",
          text: `## Authority boundaries\n\n${summary.authorizationBoundaries.map((line) => `- ${line}`).join("\n")}\n`,
          refs: [],
        },
      ];
      const header = sections[0]!;
      const parts: string[] = [header.text];
      for (const ref of header.refs) usedRefs.add(ref);
      let usedBytes = Buffer.byteLength(header.text, "utf8");
      for (const section of sections.slice(1)) {
        const size = Buffer.byteLength(section.text, "utf8");
        if (usedBytes + size > budgetBytes) {
          omitted.push(section.name);
          continue;
        }
        parts.push(section.text);
        usedBytes += size;
        for (const ref of section.refs) usedRefs.add(ref);
      }
      if (summary.coverage.unavailable.length > 0) {
        const note = `\nIncomplete: ${summary.coverage.unavailable.join("; ")}\n`;
        const size = Buffer.byteLength(note, "utf8");
        if (usedBytes + size <= budgetBytes) {
          parts.push(note);
          usedBytes += size;
        } else {
          omitted.push("coverageNote");
        }
      }
      const sourceIndex = [...usedRefs].sort().map((ref) => {
        const isCommit = ref.startsWith("commit:");
        return { ref, digest: isCommit ? ref.slice("commit:".length) : null };
      });
      const text = parts.join("\n");
      return Object.freeze({
        schema: "pc1-context-capsule/v1",
        projectId: summary.projectId,
        basis: summary.basis,
        budgetBytes,
        usedBytes,
        complete: omitted.length === 0 && summary.coverage.unavailable.length === 0,
        omitted: Object.freeze(omitted),
        sourceIndex: Object.freeze(sourceIndex),
        text,
        digest: canonicalDigest({ text, sourceIndex, basis: summary.basis }),
      });
    },
  });
}
