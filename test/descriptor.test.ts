import { describe, expect, it } from "vitest";

import { sessionPanelFromGraph } from "../src/descriptor.js";
import type { OrchestrationGraph } from "../src/tools/index.js";

const GRAPH: OrchestrationGraph = {
  project: { projectId: "p", revision: 3, goal: "ship it", paused: true, cursor: 12 },
  tasks: [
    {
      taskId: "task-1",
      objective: "实现",
      state: "VERIFYING",
      role: "implementer",
      dependsOn: [],
      writePaths: ["src/x.py"],
      requiredArtifacts: ["src/x.py"],
      attempts: [
        {
          attemptId: "attempt-1111",
          state: "COMPLETED",
          attribution: { model: "demo-a", cost: 0.002 },
          evidence: ["evidence-1"],
          timeline: [{ at: "2026-09-07T02:00:00Z", label: "已晋升" }],
        },
      ],
    },
  ],
  promotions: [{ promotionId: "promotion-2222", attemptId: "attempt-1111", state: "COMMITTED" }],
};

describe("session.panel descriptor generator (PLMP-WINUI-1)", () => {
  it("WINUI-A01: the descriptor is pure data with command references", () => {
    const panel = sessionPanelFromGraph(GRAPH);
    // Pure data: JSON round-trip is identity.
    expect(JSON.parse(JSON.stringify(panel))).toEqual(panel);

    // Schema: every item is a list (string values) or an action (command string).
    for (const item of panel.items) {
      expect(["list", "action"]).toContain(item.kind);
      expect(typeof item.label).toBe("string");
      if (item.kind === "list") {
        expect(Array.isArray(item.values)).toBe(true);
        for (const value of item.values!) expect(typeof value).toBe("string");
      } else {
        expect(typeof item.command).toBe("string");
      }
    }
    // Human-language state surfaces, no hashes/event ids.
    const json = JSON.stringify(panel);
    expect(json).toContain("task-1 实现 [VERIFYING]");
    expect(json).toContain("[COMMITTED]");
    expect(json).toContain("恢复调度"); // paused -> offers resume
    expect(json).not.toContain("event_id");
    expect(json).not.toContain("digest");

    // Command prefix and panel id are configurable.
    const custom = sessionPanelFromGraph(GRAPH, { commandPrefix: "pal", panelId: "x.y" });
    expect(custom.id).toBe("x.y");
    expect(JSON.stringify(custom)).toContain("pal resume");
    // Unpaused graph offers pause instead.
    const live = sessionPanelFromGraph({ ...GRAPH, project: { ...GRAPH.project, paused: false } });
    expect(JSON.stringify(live)).toContain("palimpsest pause");
  });
});
