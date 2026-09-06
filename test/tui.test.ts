import { describe, expect, it, vi } from "vitest";

import { applyTuiKey, renderTuiFrame } from "../src/tui.js";
import type { PalimpsestControlSurface } from "../src/tools/index.js";
import type { OrchestrationGraph } from "../src/tools/index.js";

const GRAPH: OrchestrationGraph = {
  project: { projectId: "p", revision: 2, goal: "ship the calculator", paused: false, cursor: 9 },
  tasks: [
    {
      taskId: "task-1",
      objective: "实现计算器",
      state: "ACTIVE",
      role: "implementer",
      dependsOn: [],
      writePaths: ["src/calc.py"],
      requiredArtifacts: ["src/calc.py"],
      attempts: [
        {
          attemptId: "attempt-abc123",
          state: "RUNNING",
          evidence: [],
          timeline: [
            { at: "2026-09-07T01:00:00Z", label: "尝试已创建" },
            { at: "2026-09-07T01:01:00Z", label: "已认领" },
          ],
        },
      ],
    },
    {
      taskId: "task-2",
      objective: "验证",
      state: "READY",
      role: "implementer",
      dependsOn: ["task-1"],
      writePaths: [],
      requiredArtifacts: [],
      attempts: [],
    },
  ],
  promotions: [{ promotionId: "promotion-x", attemptId: "attempt-abc123", state: "PREPARED" }],
};

describe("terminal dual view (PLMP-TUI-1)", () => {
  it("TUI-A01 (render): the frame is same-source with the graph projection", () => {
    const frame = renderTuiFrame(GRAPH, "task-1");
    // Head: goal + revision, hints.
    expect(frame).toContain("ship the calculator");
    expect(frame).toContain("revision 2");
    expect(frame).toContain("j/k 选择");
    // Tasks with state colors (ANSI) and the selected marker.
    expect(frame).toContain("task-1");
    expect(frame).toContain("实现计算器");
    expect(frame).toContain("\x1b[34m[ACTIVE]\x1b[0m");
    expect(frame).toContain("task-2");
    expect(frame).toContain("[READY]");
    // The selected task's attempt timeline renders its human labels.
    expect(frame).toContain("尝试已创建");
    expect(frame).toContain("已认领");
    expect(frame).toContain("attempt-abc123".slice(0, 20));
    // Promotions fold.
    expect(frame).toContain("晋升");
    expect(frame).toContain("PREPARED");
    // Terminology isolation: no event ids or digests in the frame.
    expect(frame.toLowerCase()).not.toContain("event_id");
    expect(frame.toLowerCase()).not.toContain("digest");

    // Paused head annotation.
    expect(renderTuiFrame({ ...GRAPH, project: { ...GRAPH.project, paused: true } }, null)).toContain(
      "[已暂停]",
    );
  });

  it("TUI-A01 (keys): pause/resume/next dispatch over the VIS-2 face; q quits", () => {
    const pause = vi.fn();
    const resume = vi.fn();
    const next = vi.fn(() => null);
    const surface = { pause, resume, next } as unknown as PalimpsestControlSurface;
    const hooks = { refresh: vi.fn() };

    expect(applyTuiKey("p", surface, hooks)).toBe("continue");
    expect(pause).toHaveBeenCalledTimes(1);
    expect(hooks.refresh).toHaveBeenCalledTimes(1);
    applyTuiKey("r", surface, hooks);
    expect(resume).toHaveBeenCalledTimes(1);
    applyTuiKey("n", surface, hooks);
    expect(next).toHaveBeenCalledTimes(1);
    expect(applyTuiKey("x", surface, hooks)).toBe("continue");
    expect(pause).toHaveBeenCalledTimes(1); // unknown keys do nothing
    expect(applyTuiKey("q", surface, hooks)).toBe("quit");
  });
});
