/**
 * PLMP-WINUI-1 §1.4: the session.panel descriptor generator (route B). The
 * descriptor is pure data - state described as data, behavior referenced as
 * command names (functions never cross the process boundary). The dsh-winui
 * side renders it with native controls; the full graph interaction goes
 * through the route-C fallback (opening the shared panel served by
 * `palimpsest serve`).
 */

import type { OrchestrationGraph } from "./tools/index.js";

export interface SessionPanelItem {
  readonly kind: "list" | "action";
  readonly label: string;
  readonly values?: readonly string[];
  readonly command?: string;
}

export interface SessionPanel {
  readonly surface: "session.panel";
  readonly id: string;
  readonly title: string;
  readonly items: readonly SessionPanelItem[];
}

export function sessionPanelFromGraph(
  graph: OrchestrationGraph,
  options?: { readonly commandPrefix?: string; readonly panelId?: string },
): SessionPanel {
  const prefix = options?.commandPrefix ?? "palimpsest";
  const running: string[] = [];
  for (const task of graph.tasks) {
    for (const attempt of task.attempts) {
      running.push(
        `${task.taskId} · ${attempt.attemptId.slice(0, 16)}… [${attempt.state}]` +
          (attempt.attribution === undefined ? "" : ` · ${attempt.attribution.model}`),
      );
    }
  }
  const paused = graph.project.paused;
  return {
    surface: "session.panel",
    id: options?.panelId ?? "palimpsest.orchestration",
    title: `palimpsest · ${graph.project.goal}（rev ${graph.project.revision}${paused ? "，已暂停" : ""}）`,
    items: [
      {
        kind: "list",
        label: "任务",
        values: graph.tasks.map(
          (task) => `${task.taskId} ${task.objective} [${task.state}] · ${task.attempts.length} attempt`,
        ),
      },
      { kind: "list", label: "在途尝试", values: running.length > 0 ? running : ["（无）"] },
      {
        kind: "list",
        label: "晋升",
        values:
          graph.promotions.length > 0
            ? graph.promotions.map((promotion) => `${promotion.promotionId.slice(0, 20)}… [${promotion.state}]`)
            : ["（无）"],
      },
      paused
        ? { kind: "action", label: "恢复调度", command: `${prefix} resume` }
        : { kind: "action", label: "暂停调度", command: `${prefix} pause` },
      { kind: "action", label: "单步", command: `${prefix} next` },
      { kind: "action", label: "机械推进", command: `${prefix} run 20` },
      { kind: "action", label: "打开完整图面", command: `${prefix} serve` },
    ],
  };
}
