/**
 * PLMP-VIS-2 §1.2: the control mapping face. Named operations a graph
 * renderer can call, each delegating to exactly one existing controller
 * method (or, for promote, the exact CLI promote composition) - zero new
 * semantics, so what a button does on screen is what the tool face and the
 * CLI already do. Permission and approval stay with the host surface.
 *
 * G10-X: the promote composition is now the PRODUCT-SAFE one. It derives the
 * candidate attempt and asks the controller to promote it canonically
 * (`promoteAttempt`) - the surface never supplies a source commit or an
 * expected head, so there is no ambient-head input left on this path.
 */

import type { GateResult } from "../evidence/gate_dsl.js";
import type { SchedulerEvent } from "../schema/index.js";

import {
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
  | "authorizedGateCommand"
  | "evaluateAttemptGate"
  | "report"
  | "plan"
  | "promoteAttempt"
  | "promoteWhenGatePasses"
  | "status"
  | "orchestrationGraph"
  | "setHold"
  | "clearHold"
  | "projectId"
  | "store"
  | "effects"
>;

/** The structured promote outcome (a non-PASS gate is a reported verdict, never a throw). */
export type PromoteOutcome =
  | { readonly promoted: true; readonly result: Awaited<ReturnType<ProjectController["promoteAttempt"]>> }
  | {
      readonly promoted: false;
      readonly gateId: string;
      readonly verdict: GateResult["verdict"];
      readonly nextEvidenceNeeded: readonly string[];
    };

/**
 * The CLI promote path, verbatim: completed candidate → registered gate verdict
 * → canonical promotion. The caller supplies the gate id only; the source
 * commit and the expected head are derived by the promotion manager.
 */
async function promoteCompletedCandidate(
  target: OrchestrationControlTarget,
  gateId: string,
): Promise<PromoteOutcome> {
  const winner = target.status().attempts.find((attempt) => attempt.state === "COMPLETED");
  if (winner === undefined) throw new Error("no completed candidate to promote");
  const verdict = target.evaluateAttemptGate(gateId, winner.attempt_id);
  if (verdict.verdict !== "PASS") {
    return {
      promoted: false,
      gateId,
      verdict: verdict.verdict,
      nextEvidenceNeeded: verdict.next_evidence_needed,
    };
  }
  return { promoted: true, result: await target.promoteAttempt({ attemptId: winner.attempt_id, gateId }) };
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
    /** PLMP-LEAN-1 §1: the attempt's authorized command, so a surface never invents a default. */
    authorizedGateCommand: (attemptId: string): string[] => target.authorizedGateCommand(attemptId),
    /** 提交执行报告。 */
    report: (attemptId: string, input: ReportInput): SchedulerEvent =>
      target.report(attemptId, input),
    /** 计划修订（三模式声明面共用，见 18 号规格）。 */
    plan: (input: PlanInput): SchedulerEvent => target.plan(input),
    /** 晋升通过门禁的完成候选（CLI promote 等价组合）。 */
    promote: (gateId: string) => promoteCompletedCandidate(target, gateId),
    /** 只读图投影（PLMP-VIS-1）。 */
    graph: (): OrchestrationGraph => target.orchestrationGraph(),
    /** 任务级断点挂起 / 放行（PLMP-DEBUG-1）。 */
    holdSet: (taskId: string, reason: string, declaredBy = "panel"): SchedulerEvent =>
      target.setHold(taskId, { reason, declaredBy }),
    holdClear: (taskId: string, reason: string): SchedulerEvent =>
      target.clearHold(taskId, { reason }),
  };
}

export type PalimpsestControlSurface = ReturnType<typeof definePalimpsestControl>;
