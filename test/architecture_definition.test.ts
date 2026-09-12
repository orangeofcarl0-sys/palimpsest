/**
 * G10-C0 minimal Architecture identity machine proofs.
 *
 *   C0-M01  ArchitectureDefinition strict parsing (§25/§69)
 *   C0-M02  canonical AgentDefinition membership (§23)
 *   C0-M03  architecture digest determinism + identity-vs-content (§21/§22/§44/§45)
 *   C0-M04  identity namespace firewall: no Work relation (§16-§18)
 *   C0-M05  AgentDefinition ≠ TaskDefinition / no Work semantics import (§53)
 *   C0-M13  runtime immutability (§28/§70)
 *   plus: reverse firewall (§54), purity (§84), dependency direction (§85)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  ARCHITECTURE_DIGEST_DOMAIN,
  ArchitectureDefinitionParseError,
  architectureDefinitionDigestContent,
  computeArchitectureDefinitionDigest,
  materializeArchitectureDefinition,
  parseArchitectureDefinition,
} from "../src/architecture/index.js";
import { parseProjectProposal, proposalTaskSpecs } from "../src/architecture/index.js";

const DEFINITION_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/architecture/definition.ts", import.meta.url)),
  "utf-8",
);

/** Comment-free source: the firewalls bind the code, not the prose that documents them. */
const DEFINITION_CODE = DEFINITION_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

function materialized() {
  return materializeArchitectureDefinition({
    architectureDefinitionId: "arch-1",
    revision: 2,
    agentDefinitionIds: ["agent-B", "agent-A"],
  });
}

describe("C0-M01: ArchitectureDefinition strict parsing (§25/§69)", () => {
  it("parses a valid identity-only definition and canonicalizes membership", () => {
    const parsed = parseArchitectureDefinition(JSON.parse(JSON.stringify(materialized())));
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.architectureDefinitionId).toBe("arch-1");
    expect(parsed.revision).toBe(2);
    expect(parsed.agentDefinitions.map((agent) => agent.agentDefinitionId)).toEqual([
      "agent-A",
      "agent-B",
    ]);
  });

  it("rejects unknown top-level and per-agent fields", () => {
    const base = JSON.parse(JSON.stringify(materialized())) as Record<string, unknown>;
    expect(() => parseArchitectureDefinition({ ...base, extra: true })).toThrow(
      ArchitectureDefinitionParseError,
    );
    const badAgent = JSON.parse(JSON.stringify(materialized())) as {
      agentDefinitions: Array<Record<string, unknown>>;
    };
    badAgent.agentDefinitions[0]!.label = "nope";
    expect(() => parseArchitectureDefinition(badAgent)).toThrow(
      /unknown agentDefinitions entry field/,
    );
  });

  it("rejects duplicate AgentDefinitionIds, bad schema version, bad revision, and bad digest", () => {
    const base = JSON.parse(JSON.stringify(materialized())) as Record<string, unknown>;
    expect(() =>
      parseArchitectureDefinition({ ...base, schemaVersion: 2 }),
    ).toThrow(ArchitectureDefinitionParseError);
    expect(() => parseArchitectureDefinition({ ...base, revision: -1 })).toThrow(
      ArchitectureDefinitionParseError,
    );
    expect(() => parseArchitectureDefinition({ ...base, revision: 1.5 })).toThrow(
      ArchitectureDefinitionParseError,
    );
    expect(() => parseArchitectureDefinition({ ...base, digest: "deadbeef" })).toThrow(
      /digest mismatch/,
    );
    const dupRaw = JSON.parse(JSON.stringify(materialized())) as { agentDefinitions: unknown[] };
    dupRaw.agentDefinitions = [{ agentDefinitionId: "A" }, { agentDefinitionId: "A" }];
    expect(() => parseArchitectureDefinition(dupRaw)).toThrow(/duplicate AgentDefinitionId/);
  });

  it("the authoring helper rejects duplicates at creation time", () => {
    expect(() =>
      materializeArchitectureDefinition({
        architectureDefinitionId: "arch-1",
        revision: 0,
        agentDefinitionIds: ["A", "A"],
      }),
    ).toThrow(/duplicate AgentDefinitionId/);
  });

  it("an empty membership is honestly representable", () => {
    const empty = materializeArchitectureDefinition({
      architectureDefinitionId: "arch-empty",
      revision: 0,
      agentDefinitionIds: [],
    });
    expect(empty.agentDefinitions).toEqual([]);
    expect(() => parseArchitectureDefinition(JSON.parse(JSON.stringify(empty)))).not.toThrow();
  });
});

describe("C0 Stage 0 §10: identity grammar review", () => {
  it("ids follow the shared stable-identifier grammar: whitespace, control characters, newlines, and path separators are rejected", () => {
    for (const bad of [
      " arch",
      "arch ",
      "arch\t",
      "arch\n",
      "arch/x",
      "arch\\x",
      "arch x",
      "arch\u0000",
      "".padEnd(129, "a"),
      "",
    ]) {
      expect(() =>
        materializeArchitectureDefinition({
          architectureDefinitionId: bad,
          revision: 0,
          agentDefinitionIds: [],
        }),
      ).toThrow(ArchitectureDefinitionParseError);
      expect(() =>
        materializeArchitectureDefinition({
          architectureDefinitionId: "arch-1",
          revision: 0,
          agentDefinitionIds: [bad],
        }),
      ).toThrow(ArchitectureDefinitionParseError);
    }
  });

  it("typical identifiers are accepted and NFC-normalized", () => {
    const architecture = materializeArchitectureDefinition({
      architectureDefinitionId: "arch_1:main",
      revision: 0,
      agentDefinitionIds: ["Agent-A.1"],
    });
    expect(architecture.architectureDefinitionId).toBe("arch_1:main");
    expect(architecture.agentDefinitions[0]?.agentDefinitionId).toBe("Agent-A.1");
  });
});

describe("C0-M02: canonical AgentDefinition membership (§23)", () => {
  it("membership order does not change canonical content or digest", () => {
    const first = materializeArchitectureDefinition({
      architectureDefinitionId: "arch-1",
      revision: 0,
      agentDefinitionIds: ["B", "A"],
    });
    const second = materializeArchitectureDefinition({
      architectureDefinitionId: "arch-1",
      revision: 0,
      agentDefinitionIds: ["A", "B"],
    });
    expect(first.digest).toBe(second.digest);
    expect(JSON.parse(JSON.stringify(first.agentDefinitions))).toEqual(
      JSON.parse(JSON.stringify(second.agentDefinitions)),
    );
    expect(first.agentDefinitions.map((agent) => agent.agentDefinitionId)).toEqual(["A", "B"]);
  });
});

describe("C0-M03: digest determinism and identity-vs-content (§21/§22/§44/§45)", () => {
  it("different membership produces a different digest", () => {
    const first = computeArchitectureDefinitionDigest(["A", "B"]);
    const second = computeArchitectureDefinitionDigest(["A", "C"]);
    expect(first).not.toBe(second);
  });

  it("digest excludes architectureDefinitionId and revision (content identity)", () => {
    const sameContentDifferentIdentity = materializeArchitectureDefinition({
      architectureDefinitionId: "arch-other",
      revision: 9,
      agentDefinitionIds: ["A", "B"],
    });
    expect(sameContentDifferentIdentity.digest).toBe(computeArchitectureDefinitionDigest(["A", "B"]));
  });

  it("digest content is domain-separated", () => {
    expect(architectureDefinitionDigestContent(["A"])).toEqual({
      domain: ARCHITECTURE_DIGEST_DOMAIN,
      agentDefinitionIds: ["A"],
    });
    expect(ARCHITECTURE_DIGEST_DOMAIN).toBe("palimpsest.architecture-definition.v1");
  });
});

describe("C0-M04: identity namespaces are independent of Work identity (§16-§18)", () => {
  it("string equality with a Work definition_id implies no relation", () => {
    const architecture = materializeArchitectureDefinition({
      architectureDefinitionId: "alpha",
      revision: 0,
      agentDefinitionIds: ["agent-A"],
    });
    // A Work-side TaskSpec may coincidentally carry definition_id "agent-A";
    // the Architecture artifact's identity comes from its own field namespace
    // and owning artifact, so no equivalence arises.
    const proposal = parseProjectProposal({
      goal: "g",
      changeClass: "behavior_change",
      tasks: [
        { title: "T", dependsOn: [], writePaths: ["src/t.ts"], requiredArtifacts: [], definitionId: "agent-A" },
      ],
    });
    const specs = proposalTaskSpecs(proposal);
    expect(specs[0]?.definition_id).toBe("agent-A");
    expect(architecture.agentDefinitions[0]?.agentDefinitionId).toBe("agent-A");
    // Same string, different identities: distinct fields, distinct artifacts.
    expect(architecture.agentDefinitions[0]).not.toHaveProperty("definition_id");
    expect(architecture.agentDefinitions[0]).not.toHaveProperty("taskId");
  });

  it("agentDefinitionId/architectureDefinitionId are distinct field names (§16/§17)", () => {
    const architecture = materialized();
    expect(Object.keys(architecture).sort()).toEqual([
      "agentDefinitions",
      "architectureDefinitionId",
      "digest",
      "revision",
      "schemaVersion",
    ]);
    expect(Object.keys(architecture.agentDefinitions[0]!)).toEqual(["agentDefinitionId"]);
  });
});

describe("C0-M05: firewalls and purity (§53/§54/§84/§85)", () => {
  it("architecture-definition code imports no Work semantics", () => {
    expect(DEFINITION_CODE).not.toMatch(
      /\bTaskSpec\b|\bTaskProposal\b|\bAgentGraph\b|\bProjectProposal\b|\bProjectIr\b/,
    );
    expect(DEFINITION_CODE).not.toMatch(/proposal\.js|presets\.js|graph\/|models\.js/);
    expect(DEFINITION_CODE).not.toMatch(/from "\.\.\/binding/);
  });

  it("architecture-definition code depends only on generic canonical/grammar utilities (§85, Stage 0 §10)", () => {
    const imports = [...DEFINITION_CODE.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
    expect(imports.sort()).toEqual(["../schema/canonical.js", "../schema/identifier.js"]);
  });

  it("Work compilation does not import ArchitectureDefinition (reverse firewall, §54)", () => {
    const proposalSource = readFileSync(
      fileURLToPath(new URL("../src/architecture/proposal.ts", import.meta.url)),
      "utf-8",
    );
    const graphSource = readFileSync(
      fileURLToPath(new URL("../src/graph/ir.ts", import.meta.url)),
      "utf-8",
    );
    const schemaSource = readFileSync(
      fileURLToPath(new URL("../src/schema/models.ts", import.meta.url)),
      "utf-8",
    );
    for (const source of [proposalSource, graphSource, schemaSource]) {
      expect(source).not.toMatch(/ArchitectureDefinition|definition\.js/);
    }
  });

  it("purity: no clock, randomness, io, or database access (§84)", () => {
    expect(DEFINITION_CODE).not.toMatch(/Date\.now|Math\.random|randomUUID|performance\.now/);
    expect(DEFINITION_CODE).not.toMatch(/node:(fs|path|net|http)|readFile/);
    expect(DEFINITION_CODE).not.toMatch(/\bDatabaseSync\b|\.prepare\(|localStorage|fetch\(/);
  });
});

describe("C0-M13: runtime immutability (§28/§70)", () => {
  it("parsed and materialized artifacts are deep-frozen", () => {
    for (const architecture of [materialized(), parseArchitectureDefinition(JSON.parse(JSON.stringify(materialized())))]) {
      expect(Object.isFrozen(architecture)).toBe(true);
      expect(Object.isFrozen(architecture.agentDefinitions)).toBe(true);
      for (const agent of architecture.agentDefinitions) {
        expect(Object.isFrozen(agent)).toBe(true);
      }
      expect(() => {
        (architecture as { revision: number }).revision = 99;
      }).toThrow(TypeError);
      expect(() => {
        (architecture.agentDefinitions as unknown as { length: number }).length = 0;
      }).toThrow(TypeError);
    }
  });

  it("caller-input mutation does not reach the artifact", () => {
    const agentIds = ["agent-A", "agent-B"];
    const architecture = materializeArchitectureDefinition({
      architectureDefinitionId: "arch-1",
      revision: 1,
      agentDefinitionIds: agentIds,
    });
    agentIds.reverse();
    agentIds.push("agent-C");
    expect(architecture.agentDefinitions.map((agent) => agent.agentDefinitionId)).toEqual([
      "agent-A",
      "agent-B",
    ]);
    expect(architecture.agentDefinitions).toHaveLength(2);
  });
});
