/**
 * PLMP-GRAPH-5 §B2-B (31 号修订): the ProjectProposal input contract.
 * parseProjectProposal owns shape/types/unknown fields; validateProjectProposal
 * owns semantic invariants. First-party boundaries (REST validate/declare,
 * canvas insert, CLI architect) all parse through the same gate.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseProjectProposal,
  presetDraft,
  presetMeta,
  validateProjectProposal,
  type ProjectProposal,
} from "../src/architecture/index.js";
import { serveOrchestration } from "../src/serve.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import { parseTaskSpec } from "../src/schema/index.js";
import { proposalTaskSpecs } from "../src/architecture/index.js";
import { FakeClock, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

const validProposal: ProjectProposal = {
  goal: "g",
  changeClass: "behavior_change",
  tasks: [
    { title: "调研", dependsOn: [], role: "scout", definitionId: "n17" },
    { title: "综合", dependsOn: ["调研"], writePaths: ["out/x.md"] },
  ],
};

describe("ProjectProposal input contract (PLMP-GRAPH-5 §B2-B)", () => {
  it("PROP-PARSE-A01: unknown root fields are rejected - typo'd names never hit defaults", () => {
    expect(() => parseProjectProposal({ ...validProposal, changeClas: "behavior_change" })).toThrow(
      /unknown proposal field "changeClas"/,
    );
    expect(() => parseProjectProposal({ ...validProposal, extra: true })).toThrow(
      /unknown proposal field "extra"/,
    );
  });

  it("PROP-PARSE-A02: unknown TaskProposal fields such as 'rol' are rejected", () => {
    expect(() =>
      parseProjectProposal({
        ...validProposal,
        tasks: [{ title: "Research", dependsOn: [], rol: "scout" }],
      }),
    ).toThrow(/unknown task field "rol"/);
    // The nine official fields parse; semantic checks stay in the validator.
    const parsed = parseProjectProposal(validProposal);
    expect(parsed.tasks[0]).toEqual({ title: "调研", dependsOn: [], role: "scout", definitionId: "n17" });
  });

  it("PROP-PARSE-A03: malformed shapes and types are rejected before semantic validation", () => {
    expect(() => parseProjectProposal([validProposal])).toThrow(/proposal must be an object/);
    expect(() => parseProjectProposal({ ...validProposal, changeClass: "whatever" })).toThrow(
      /changeClass must be one of/,
    );
    expect(() => parseProjectProposal({ ...validProposal, tasks: "two" })).toThrow(/tasks must be an array/);
    expect(() =>
      parseProjectProposal({ ...validProposal, tasks: [{ title: 1, dependsOn: [] }] }),
    ).toThrow(/title must be a string/);
    expect(() =>
      parseProjectProposal({ ...validProposal, tasks: [{ title: "A", dependsOn: "B" }] }),
    ).toThrow(/dependsOn must be an array/);
    // Parse failure is a THROW, not a diagnostic list - the semantic validator
    // never sees malformed input.
    expect(() => validateProjectProposal(parseProjectProposal(validProposal))).not.toThrow();
  });

  it("PROP-PARSE-A04: the REST proposal faces parse through the same contract", async () => {
    const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
    const effects = createPalimpsestEffects({
      databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-propparse-")), "ops.sqlite"),
      git: new FakeGitPort(HEAD),
    });
    const controller = new ProjectController({
      store,
      effects,
      projectId: "scheduler-project",
      policy: new TaskPolicy({
        policy_id: "trusted-default",
        read_paths: ["src"],
        allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
        network_policy: "deny",
        network_allowlist: [],
        timeout_s: 60,
        lease_s: 10,
        attempt_limit: 3,
        candidate_limit: 1,
      }),
      clock: () => "2026-09-07T00:00:00Z",
    });
    const handle = await serveOrchestration(controller, { port: 0 });
    const post = async (path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> => {
      const response = await fetch(`${handle.url}${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${handle.token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, json: (await response.json()) as Record<string, unknown> };
    };
    try {
      // Malformed proposal -> strict-parse 400, never a silent diagnostic pass.
      const validate = await post("/api/proposal/validate", {
        ...validProposal,
        tasks: [{ title: "A", dependsOn: [], rol: "scout" }],
      });
      expect(validate.status).toBe(400);
      expect(String(validate.json.error)).toMatch(/unknown task field "rol"/);
      const declare = await post("/api/proposal/declare", {
        proposal: { ...validProposal, typoField: 1 },
      });
      expect(declare.status).toBe(400);
      expect(String(declare.json.error)).toMatch(/unknown proposal field "typoField"/);
      const insert = await post("/api/canvas/insert", {
        doc: {
          version: 2,
          goal: "g",
          nodes: [{ key: "a", type: "task", title: "已有", x: 0, y: 0, z: "root", task: { dependsOn: [] } }],
          groups: [],
        },
        proposal: { goal: "g", changeClas: "behavior_change", tasks: [] },
      });
      expect(insert.status).toBe(400);
      expect(String(insert.json.error)).toMatch(/unknown proposal field "changeClas"/);
      // A well-formed proposal still validates cleanly end to end.
      const ok = await post("/api/proposal/validate", validProposal);
      expect(ok.status).toBe(200);
      expect(ok.json.diagnostics).toEqual([]);
    } finally {
      await handle.close();
      await effects.close();
      store.close();
    }
  });

  it("PROP-PARSE-A05: every kernel preset satisfies the input contract (producer/consumer conformance)", () => {
    for (const meta of presetMeta()) {
      const proposal = presetDraft(meta.id, {});
      expect(parseProjectProposal(proposal)).toEqual(proposal);
      expect(Array.isArray(proposal.tasks)).toBe(true);
    }
  });
});

describe("proposal compilability closure (PLMP-GRAPH-5 §B3-D)", () => {
  const proposalWith = (tasks: ProjectProposal["tasks"]): ProjectProposal =>
    parseProjectProposal({ goal: "g", changeClass: "behavior_change", tasks });

  it("PROP-COMPILE-A01: duplicate titles are refused as DUPLICATE_TITLE", () => {
    const diagnostics = validateProjectProposal(
      proposalWith([
        { title: "Research", dependsOn: [] },
        { title: "Research", dependsOn: [] },
        { title: "C", dependsOn: ["Research"] },
      ]),
    );
    expect(diagnostics.map((diagnostic) => diagnostic.type)).toEqual(["DUPLICATE_TITLE"]);
  });

  it("PROP-COMPILE-A02: duplicate dependsOn entries never validate clean", () => {
    const diagnostics = validateProjectProposal(
      proposalWith([
        { title: "A", dependsOn: [] },
        { title: "B", dependsOn: ["A", "A"] },
      ]),
    );
    expect(diagnostics.map((diagnostic) => diagnostic.type)).toEqual(["TASK_SPEC_CONTRACT"]);
    expect(diagnostics[0]!.task).toBe("B");
  });

  it("PROP-COMPILE-A03: escaping paths are refused by the canonical contract", () => {
    const diagnostics = validateProjectProposal(
      proposalWith([{ title: "A", dependsOn: [], writePaths: ["../escape"] }]),
    );
    expect(diagnostics.map((diagnostic) => diagnostic.type)).toEqual(["TASK_SPEC_CONTRACT"]);
    expect(diagnostics[0]!.detail).toMatch(/parent path|forbidden|POSIX/);
  });

  it("PROP-COMPILE-A04: duplicate writePaths never validate clean", () => {
    const diagnostics = validateProjectProposal(
      proposalWith([{ title: "A", dependsOn: [], writePaths: ["out/x.md", "out/x.md"] }]),
    );
    expect(diagnostics.map((diagnostic) => diagnostic.type)).toEqual(["TASK_SPEC_CONTRACT"]);
  });

  it("PROP-COMPILE-A05: empty definitionId is refused", () => {
    const diagnostics = validateProjectProposal(
      proposalWith([{ title: "A", dependsOn: [], definitionId: "" }]),
    );
    expect(diagnostics.map((diagnostic) => diagnostic.type)).toEqual(["TASK_SPEC_CONTRACT"]);
    expect(diagnostics[0]!.detail).toMatch(/definition_id/);
  });

  it("PROP-COMPILE-A06: empty scopeId is refused", () => {
    const diagnostics = validateProjectProposal(
      proposalWith([{ title: "A", dependsOn: [], scopeId: "" }]),
    );
    expect(diagnostics.map((diagnostic) => diagnostic.type)).toEqual(["TASK_SPEC_CONTRACT"]);
    expect(diagnostics[0]!.detail).toMatch(/scope_id/);
  });

  it("PROP-COMPILE-A07: validate clean implies every compiled TaskSpec parses (property belt)", () => {
    const cleanProposals: ProjectProposal[] = [
      proposalWith([
        { title: "调研", dependsOn: [], role: "scout", definitionId: "n17", scopeId: "s1" },
        { title: "综合", dependsOn: ["调研"], writePaths: ["out/x.md"], requiredArtifacts: ["out/x.md"], suggestedSkills: ["web"] },
      ]),
      { goal: "g", changeClass: "metadata_only", tasks: [{ title: "Only", dependsOn: [] }] },
    ];
    for (const meta of presetMeta()) {
      cleanProposals.push(presetDraft(meta.id, {}));
    }
    for (const proposal of cleanProposals) {
      expect(validateProjectProposal(proposal)).toEqual([]);
      for (const spec of proposalTaskSpecs(proposal)) {
        expect(() => parseTaskSpec(JSON.parse(JSON.stringify(spec)))).not.toThrow();
      }
    }
  });
});
