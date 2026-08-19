import { describe, expect, it } from "vitest";

import { installForTests, taskSpec } from "./helpers.js";

describe("E4 mode-aware tool surface", () => {
  it("every tool declares an explicit mode; the read-only set is exactly status + preview", async () => {
    const { host, installed } = await installForTests();
    try {
      const names = [...host.definitions.keys()];
      expect(names.length).toBe(9);
      for (const name of names) {
        const def = host.definitions.get(name);
        expect(def.mode, name).toMatch(/^(read-only|mutating)$/);
        // The mode is both structural and visible in plain-language description.
        expect(def.description, name).toContain(`[${def.mode}]`);
      }
      const readOnly = names
        .filter((name) => host.definitions.get(name).mode === "read-only")
        .sort();
      expect(readOnly).toEqual(["palimpsest_preview", "palimpsest_status"]);
    } finally {
      await installed.dispose();
    }
  });

  it("the read-only surface observes an existing project without writing (plan-mode equivalent)", async () => {
    const { host, installed } = await installForTests();
    try {
      // The project is created through the normal (mutating) face first.
      await host.call("palimpsest_start", {
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      const countEvents = (): number => {
        const row = installed.controller.store.connection
          .prepare("SELECT COUNT(*) AS total FROM events")
          .get() as { total: number };
        return Number(row.total);
      };
      const before = countEvents();
      // A plan-mode session is allowed ONLY the read-only tools.
      for (let index = 0; index < 3; index += 1) {
        await host.call("palimpsest_preview", {});
        await host.call("palimpsest_status", {});
      }
      expect(countEvents()).toBe(before);

      // The mutating face is declared mutating so a host permission layer
      // can reject it in plan mode on the marker alone.
      expect(host.definitions.get("palimpsest_start").mode).toBe("mutating");
      expect(host.definitions.get("palimpsest_next").mode).toBe("mutating");
      expect(host.definitions.get("palimpsest_run").mode).toBe("mutating");
      expect(host.definitions.get("palimpsest_gate").mode).toBe("mutating");
    } finally {
      await installed.dispose();
    }
  });
});
