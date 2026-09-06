/**
 * PLMP-TUI-1: the terminal dual view over the same VIS-1/2 contracts -
 * hand-written ANSI, zero TUI-framework dependency. The frame renderer is a
 * pure function (machine-checked by TUI-A01); the loop wires keys to the
 * control mapping face (pause/resume/next), q quits.
 */

import { definePalimpsestControl, type PalimpsestControlSurface, type ProjectController } from "./tools/index.js";
import type { OrchestrationGraph } from "./tools/index.js";

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
  cyan: "\x1b[36m",
} as const;

const STATE_COLOR: Record<string, string> = {
  READY: ANSI.gray,
  ACTIVE: ANSI.blue,
  VERIFYING: ANSI.yellow,
  SATISFIED: ANSI.green,
  FAILED: ANSI.red,
  STALE: ANSI.magenta,
};

const HINT = "j/k 选择 · p 暂停 · r 恢复 · n 单步 · q 退出";

export function renderTuiFrame(graph: OrchestrationGraph, selectedTaskId: string | null): string {
  const lines: string[] = [];
  const head = `${ANSI.bold}palimpsest tui${ANSI.reset} — ${graph.project.goal} · revision ${graph.project.revision}${
    graph.project.paused ? ` ${ANSI.yellow}[已暂停]${ANSI.reset}` : ""
  }`;
  lines.push(head, `${ANSI.gray}${"─".repeat(64)}${ANSI.reset}`, `${ANSI.gray}${HINT}${ANSI.reset}`, "");

  for (const task of graph.tasks) {
    const selected = task.taskId === selectedTaskId;
    const color = STATE_COLOR[task.state] ?? ANSI.gray;
    const marker = selected ? `${ANSI.cyan}▸${ANSI.reset}` : " ";
    const attemptNote =
      task.attempts.length > 0 ? `${ANSI.gray} · ${task.attempts.length} attempt${ANSI.reset}` : "";
    lines.push(`${marker} ${color}${task.taskId}${ANSI.reset} ${task.objective} ${color}[${task.state}]${ANSI.reset}${attemptNote}`);
    if (!selected) continue;
    for (const attempt of task.attempts) {
      const attemptColor = STATE_COLOR[attempt.state] ?? ANSI.gray;
      lines.push(
        `${ANSI.gray}    └${ANSI.reset} ${attemptColor}${attempt.state}${ANSI.reset} ${ANSI.gray}${attempt.attemptId.slice(0, 20)}${ANSI.reset}`,
      );
      const timeline = attempt.timeline.slice(-6);
      for (let index = 0; index < timeline.length; index += 1) {
        const entry = timeline[index]!;
        const branch = index === timeline.length - 1 ? "└" : "├";
        lines.push(`${ANSI.gray}      ${branch} ${entry.label}${ANSI.reset} ${ANSI.gray}${entry.at.slice(11, 19)}${ANSI.reset}`);
      }
    }
  }

  const promotions = graph.promotions.map(
    (promotion) => `${ANSI.gray}·${ANSI.reset} 晋升 ${ANSI.gray}${promotion.promotionId.slice(0, 20)}${ANSI.reset} ${promotion.state}`,
  );
  if (promotions.length > 0) {
    lines.push("", `${ANSI.bold}晋升${ANSI.reset}`, ...promotions);
  }
  return `${lines.join("\n")}\n`;
}

export type TuiVerdict = "continue" | "quit";

/** Key handling against the control mapping face (VIS-2). */
export function applyTuiKey(
  key: string,
  surface: PalimpsestControlSurface,
  hooks: { refresh(): void },
): TuiVerdict {
  switch (key) {
    case "q":
    case "\x03":
      return "quit";
    case "p":
      surface.pause("tui 暂停");
      hooks.refresh();
      return "continue";
    case "r":
      surface.resume("tui 恢复");
      hooks.refresh();
      return "continue";
    case "n":
      surface.next();
      hooks.refresh();
      return "continue";
    default:
      return "continue";
  }
}

export async function runTui(controller: ProjectController): Promise<void> {
  if (process.stdout.isTTY !== true || process.stdin.isTTY !== true) {
    throw new Error("palimpsest tui 需要交互终端（TTY）");
  }
  const surface = definePalimpsestControl(controller);
  let selected: string | null = null;
  process.stdin.setRawMode(true);
  process.stdout.write("\x1b[?25l");
  const render = (): void => {
    const graph = controller.orchestrationGraph();
    if (selected === null && graph.tasks.length > 0) selected = graph.tasks[0]!.taskId;
    process.stdout.write(`\x1b[H\x1b[2J${renderTuiFrame(graph, selected)}`);
  };
  const timer = setInterval(render, 2000);
  const restore = (): void => {
    clearInterval(timer);
    process.stdin.setRawMode(false);
    process.stdout.write("\x1b[?25h\x1b[2J\x1b[H");
  };
  await new Promise<void>((resolve) => {
    const onData = (data: Buffer): void => {
      const key = data.toString();
      if (key === "j" || key === "k") {
        const graph = controller.orchestrationGraph();
        const index = graph.tasks.findIndex((task) => task.taskId === selected);
        const next = key === "j" ? index + 1 : index - 1;
        if (graph.tasks[next] !== undefined) selected = graph.tasks[next]!.taskId;
      } else if (applyTuiKey(key, surface, { refresh: render }) === "quit") {
        process.stdin.removeListener("data", onData);
        restore();
        resolve();
        return;
      }
      render();
    };
    process.stdin.on("data", onData);
    render();
  });
}
