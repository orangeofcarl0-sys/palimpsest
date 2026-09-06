/**
 * PLMP-VIS-2 §1.2: the control mapping face. Named operations a graph
 * renderer can call, each delegating to exactly one existing controller
 * method (or, for promote, the exact CLI promote composition) - zero new
 * semantics, so what a button does on screen is what the tool face and the
 * CLI already do. Permission and approval stay with the host surface.
 */

import { TextDecoder } from "node:util";

import type { SchedulerEvent } from "../schema/index.js";

import {
  DEFAULT_HEAD_COMMIT,
  type AttemptAttribution,
  type GateInput,
  type PlanInput,
  type ProjectController,
  type ReportInput,
} from "./controller.js";
import type { OrchestrationGraph } from "./graph.js";

export type OrchestrationControlTarget = Pick<
  ProjectController,
  | "pause"
  | "resume"
  | "step"
  | "runTurn"
  | "claim"
  | "selectCandidate"
  | "gate"
  | "report"
  | "plan"
  | "promoteWhenGatePasses"
  | "status"
  | "orchestrationGraph"
  | "projectId"
  | "store"
  | "effects"
>;

type PromoteOutcome = Awaited<ReturnType<ProjectController["promoteWhenGatePasses"]>>;

/** The CLI promote path, verbatim: completed candidate → report commit → real head → gated promotion. */
async function promoteCompletedCandidate(
  target: OrchestrationControlTarget,
  gateId: string,
): Promise<PromoteOutcome> {
  const winner = target.status().attempts.find((attempt) => attempt.state === "COMPLETED");
  if (winner === undefined) throw new Error("no completed candidate to promote");
  const row = target.store.connection
    .prepare("SELECT report_json FROM attempts WHERE project_id=? AND attempt_id=?")
    .get(target.projectId, winner.attempt_id) as { report_json: Uint8Array };
  const report = JSON.parse(new TextDecoder().decode(row.report_json)) as { result_commit?: string };
  const expectedHead = await target.effects.git.head();
  return target.promoteWhenGatePasses(
    winner.attempt_id,
    report.result_commit ?? DEFAULT_HEAD_COMMIT,
    expectedHead,
    gateId,
  );
}

export function definePalimpsestControl(target: OrchestrationControlTarget) {
  return {
    /** 暂停 / 恢复调度。 */
    pause: (reason: string): SchedulerEvent => target.pause(reason),
    resume: (reason: string): SchedulerEvent => target.resume(reason),
    /** 单步调度决策。 */
    next: (): SchedulerEvent | null => target.step(),
    /** 机械推进一个回合（runTurn）。 */
    run: (maxSteps?: number) => target.runTurn(maxSteps === undefined ? {} : { maxSteps }),
    /** 认领（缺省 tournament 选优，同 CLI）；归因可选。 */
    claim: async (attemptId?: string, attribution?: AttemptAttribution) => {
      const id = attemptId ?? (await target.selectCandidate()).winner;
      if (id === undefined) throw new Error("no attempt to claim");
      return target.claim(id, attribution);
    },
    /** 记录门禁证据。 */
    gate: (input: GateInput): Promise<SchedulerEvent> => target.gate(input),
    /** 提交执行报告。 */
    report: (attemptId: string, input: ReportInput): SchedulerEvent =>
      target.report(attemptId, input),
    /** 计划修订（三模式声明面共用，见 18 号规格）。 */
    plan: (input: PlanInput): SchedulerEvent => target.plan(input),
    /** 晋升通过门禁的完成候选（CLI promote 等价组合）。 */
    promote: (gateId: string) => promoteCompletedCandidate(target, gateId),
    /** 只读图投影（PLMP-VIS-1）。 */
    graph: (): OrchestrationGraph => target.orchestrationGraph(),
  };
}

export type PalimpsestControlSurface = ReturnType<typeof definePalimpsestControl>;
