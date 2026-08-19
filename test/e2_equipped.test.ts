import { describe, expect, it } from "vitest";

import { parseTaskSpec, parseTaskEnvelope } from "../src/schema/index.js";

import { trustedDefaultPolicy, makeProject, installForTests } from "./helpers.js";

describe("E2 equipped workers: suggested_skills (option A, omitted-when-absent)", () => {
  it("parseTaskSpec carries optional suggested_skills only when present", () => {
    const spec = parseTaskSpec({
      task_id: "task-1",
      objective: "o",
      depends_on: [],
      write_paths: ["src/x.py"],
      required_artifacts: ["src/x.py"],
      suggested_skills: ["document-skills:pptx"],
    });
    expect(spec.suggested_skills).toEqual(["document-skills:pptx"]);

    const plain = parseTaskSpec({
      task_id: "task-1",
      objective: "o",
      depends_on: [],
      write_paths: [],
      required_artifacts: [],
    });
    // Option A: the key is absent, so the canonical digest of existing
    // projects (which never carry hints) is byte-identical to before.
    expect(Object.prototype.hasOwnProperty.call(plain, "suggested_skills")).toBe(false);
  });

  it("rejects malformed hints but accepts unknown skill names (hints are not fatal)", () => {
    expect(() =>
      parseTaskSpec({
        task_id: "t",
        objective: "o",
        depends_on: [],
        write_paths: [],
        required_artifacts: [],
        suggested_skills: [""],
      }),
    ).toThrow(/suggested_skills/);
    expect(() =>
      parseTaskSpec({
        task_id: "t",
        objective: "o",
        depends_on: [],
        write_paths: [],
        required_artifacts: [],
        suggested_skills: "x",
      }),
    ).toThrow();
    expect(() =>
      parseTaskSpec({
        task_id: "t",
        objective: "o",
        depends_on: [],
        write_paths: [],
        required_artifacts: [],
        suggested_skills: ["totally:unknown-future-skill"],
      }),
    ).not.toThrow();
  });

  it("the trusted policy authorizes a task envelope carrying the skill hints", () => {
    const project = makeProject([
      {
        task_id: "task-1",
        objective: "convert docs",
        depends_on: [],
        write_paths: ["out"],
        required_artifacts: ["out/report.pptx"],
        suggested_skills: ["document-skills:pptx"],
      },
    ]);
    const policy = trustedDefaultPolicy();
    const { envelope } = policy.authorize(project, "task-1");
    expect(envelope.suggested_skills).toEqual(["document-skills:pptx"]);

    // Round-trip through the schema parse keeps the hint.
    const reparsed = parseTaskEnvelope({ ...envelope });
    expect(reparsed.suggested_skills).toEqual(["document-skills:pptx"]);

    // Projects without hints produce envelopes without the key (no digest churn).
    const plainProject = makeProject([
      { task_id: "task-1", objective: "o", depends_on: [], write_paths: [], required_artifacts: [] },
    ]);
    const plain = policy.authorize(plainProject, "task-1");
    expect(Object.prototype.hasOwnProperty.call(plain.envelope, "suggested_skills")).toBe(false);
  });

  it("palimpsest_start carries skill hints into the durable project and the stored envelope", async () => {
    const { host, installed } = await installForTests();
    try {
      await host.call("palimpsest_start", {
        projectId: "scheduler-project",
        goal: "produce a pptx deck",
        tasks: [
          {
            task_id: "task-1",
            objective: "convert",
            depends_on: [],
            write_paths: ["out"],
            required_artifacts: ["out/report.pptx"],
            suggested_skills: ["document-skills:pptx"],
          },
        ],
      });
      const irRow = installed.controller.store.connection
        .prepare("SELECT state_json FROM projects")
        .get() as { state_json: Uint8Array };
      const ir = JSON.parse(new TextDecoder().decode(irRow.state_json)) as {
        tasks: Array<{ task_id: string; suggested_skills?: string[] }>;
      };
      expect(ir.tasks[0]!.suggested_skills).toEqual(["document-skills:pptx"]);

      const envRow = installed.controller.store.connection
        .prepare("SELECT envelope_json FROM tasks")
        .get() as { envelope_json: Uint8Array };
      const envelope = JSON.parse(new TextDecoder().decode(envRow.envelope_json)) as {
        suggested_skills?: string[];
      };
      expect(envelope.suggested_skills).toEqual(["document-skills:pptx"]);
    } finally {
      await installed.dispose();
    }
  });

  it("a wholly unknown skill hint is never fatal end to end", async () => {
    const { host, installed } = await installForTests();
    try {
      await host.call("palimpsest_start", {
        projectId: "scheduler-project",
        goal: "g",
        tasks: [
          {
            task_id: "task-1",
            objective: "o",
            depends_on: [],
            write_paths: [],
            required_artifacts: [],
            suggested_skills: ["an:imaginary:skill"],
          },
        ],
      });
      const status = (await host.call("palimpsest_status", {})) as { revision: number };
      expect(status.revision).toBe(0);
    } finally {
      await installed.dispose();
    }
  });
});
