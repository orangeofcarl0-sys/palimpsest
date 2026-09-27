/**
 * E0-E — the E1-K KNOWLEDGE BOUNDARY, as machine proofs.
 *
 * E0 froze the E1-K design without implementing it. Two of its guarantees are not expressible as
 * import firewalls, because they are about what a module DOES with what it may read:
 *
 *   1. `Context exposes no Proof/Reasoning MUTATION port.`
 *      The context owner compiles a manifest from owners it consumes. A mutation-shaped dependency
 *      on a knowledge owner would make it a second writer of that owner's truth.
 *
 *   2. `No Context knowledge binding reaches Work authority.`
 *      Admission knowledge informs COGNITION and authorizes nothing. The failure this guards is
 *      subtle and would not look like a bug: a standing flowing into promotion eligibility, Work
 *      admission, verification admission or effect authority.
 *
 * Both are pinned against SOURCE with comments stripped, so the proof reads code rather than the
 * prose that explains it (the same discipline SR-2a uses — a doc comment mentioning a forbidden
 * name must not trip its own pin).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { analyseModuleArchitecture } from "../../tools/architecture/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8");

/** Comments stripped, so a pin reads CODE rather than prose that mentions a forbidden name. */
function stripComments(source: string): string {
  const blockStripped = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  return blockStripped
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      if (at === -1 || (at > 0 && line[at - 1] === ":")) return line;
      return line.slice(0, at);
    })
    .join("\n");
}

const KNOWLEDGE_OWNERS = ["src/proof_asset/", "src/reasoning_cell/"];

describe("E0-E the knowledge boundary is enforced, not declared", () => {
  const architecture = analyseModuleArchitecture(REPO);
  const contextFiles = architecture.modules.filter((module) => module.file.startsWith("src/context/"));
  const kernelFiles = architecture.modules.filter((module) =>
    ["src/work/", "src/domain/", "src/state/", "src/scheduler/"].some((prefix) =>
      module.file.startsWith(prefix),
    ),
  );

  it("the context owner imports no Proof or Reasoning module", () => {
    expect(contextFiles.length).toBeGreaterThan(0);
    for (const module of contextFiles) {
      for (const target of module.imports) {
        expect(
          KNOWLEDGE_OWNERS.some((owner) => target.startsWith(owner)),
          `${module.file} imports ${target} — context must consume knowledge through its own ports`,
        ).toBe(false);
      }
    }
  });

  it("the Work kernel imports no Proof or Reasoning module", () => {
    expect(kernelFiles.length).toBeGreaterThan(0);
    for (const module of kernelFiles) {
      for (const target of module.imports) {
        expect(
          KNOWLEDGE_OWNERS.some((owner) => target.startsWith(owner)),
          `${module.file} imports ${target} — admitted knowledge must not reach Work authority`,
        ).toBe(false);
      }
    }
  });

  it("the recorded firewalls name both knowledge boundaries, with reasons", () => {
    const baseline = JSON.parse(
      readFileSync(join(REPO, "architecture", "module-architecture.json"), "utf8"),
    ).baseline;
    const ids = (baseline.dependencyFirewalls ?? []).map((firewall: { id: string }) => firewall.id);
    expect(ids).toContain("context-not-knowledge-owner-internals");
    expect(ids).toContain("kernel-not-knowledge-owners");
    for (const firewall of baseline.dependencyFirewalls ?? []) {
      // An unexplained rule is an unexplained refusal (SR-2e's own standard).
      expect(firewall.reason.length, firewall.id).toBeGreaterThan(80);
      expect(firewall.exclusions, firewall.id).toEqual([]);
    }
  });

  it("the context owner declares no mutation port onto a knowledge owner", () => {
    // The context owner's ONLY durable write is its own manifest event. A method named like a
    // knowledge mutation (record/append/import/publish/store-write) on a knowledge-shaped port
    // would mean context had become a second writer of that owner's truth.
    const source = stripComments(read("src/context/service.ts"));
    for (const forbidden of [
      "recordEvidence",
      "prepareCandidate",
      "decidePublication",
      "reassess",
      "importSource",
      "submitCandidate",
      "evaluateCandidate",
      "requestInvalidation",
    ]) {
      expect(source.includes(forbidden), `context must not name ${forbidden}`).toBe(false);
    }
  });

  it("no context knowledge binding reaches promotion, Work admission, verification or effect authority", () => {
    // The knowledge binding is a CONTEXT representation. Nothing below the context layer may read
    // it: promotion eligibility, the Work aggregate, the verification plane and the effect runtime
    // must all be free of any knowledge-binding vocabulary.
    const forbiddenVocabulary = ["knowledgeBinding", "KnowledgeBinding", "knowledgeAtCompile"];
    for (const file of [
      "src/domain/promotion_eligibility.ts",
      "src/domain/aggregate.ts",
      "src/effects/promotion.ts",
      "src/project_verification/service.ts",
    ]) {
      const source = stripComments(read(file));
      for (const token of forbiddenVocabulary) {
        expect(source.includes(token), `${file} must not name ${token}`).toBe(false);
      }
    }
  });

  it("the context owner keeps exactly one durable write (the manifest append)", () => {
    const source = stripComments(read("src/context/service.ts"));
    const appends = source.match(/\bappend[A-Z][A-Za-z]*\(/g) ?? [];
    const distinct = [...new Set(appends)];
    // `appendManifest` is the manifest append; nothing else may look like a durable write.
    for (const call of distinct) {
      expect(call, `context has an unexpected durable write: ${call}`).toContain("appendManifest");
    }
  });
});

/**
 * The E0/E1 STAGE BOUNDARY. E0 closed the design; E1-K implements it. If implementation files
 * appear before the E1-K stage is authorized, this proof fails rather than letting the two stages
 * blur — the failure is the point.
 */
describe("E0-E the E1-K implementation has not started", () => {
  const architecture = analyseModuleArchitecture(REPO);

  it("no E1-K implementation module exists yet", () => {
    const paths = architecture.modules.map((module) => module.file);
    expect(paths).not.toContain("src/context/knowledge.ts");
    expect(paths).not.toContain("src/composition/context_knowledge.ts");
  });

  it("the frozen design ruling exists and states the frozen decisions", () => {
    const ruling = read("docs/engineering/E1-K-KNOWLEDGE-CONTEXT-RULING.md");
    for (const decision of [
      "new canonical owner",
      "KNOWLEDGE_OBSERVATION_RACED",
      "KNOWLEDGE_SELECTION_BUDGET_EXCEEDED",
      "ContextManifest.knowledge?",
      "Basis ≠ DerivedViewDigest",
    ]) {
      expect(ruling, `the ruling must freeze: ${decision}`).toContain(decision);
    }
  });
});
