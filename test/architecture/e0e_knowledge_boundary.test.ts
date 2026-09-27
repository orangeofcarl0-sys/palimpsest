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

import { analyseModuleArchitecture, checkArchitecture } from "../../tools/architecture/index.js";
import type { ArchitectureBaseline, ModuleArchitecture } from "../../tools/architecture/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8");

/**
 * A deep clone of the LIVE graph, so a probe can commit a deliberate breach without touching the
 * shared analysis. This mirrors `sr2e_architecture_ratchets.test.ts`: a rule is only proven when a
 * synthetic violation of it FAILS, not merely when the live repository passes.
 */
interface MutableGraph {
  modules: Array<{ file: string; imports: string[]; layer: string; loc: number; fanOut: number; fanIn: number }>;
}
const clone = (): MutableGraph => JSON.parse(JSON.stringify(analyseModuleArchitecture(REPO))) as MutableGraph;
const asGraph = (graph: MutableGraph): ModuleArchitecture => graph as unknown as ModuleArchitecture;
const firewallBreaches = (graph: MutableGraph): readonly string[] =>
  checkArchitecture(asGraph(graph), baselineOf())
    .violations.filter((violation) => violation.kind === "firewall_breach")
    .map((violation) => violation.detail);

let cachedBaseline: ArchitectureBaseline | undefined;
function baselineOf(): ArchitectureBaseline {
  if (cachedBaseline === undefined) {
    cachedBaseline = JSON.parse(readFileSync(join(REPO, "architecture", "module-architecture.json"), "utf8"))
      .baseline as ArchitectureBaseline;
  }
  return cachedBaseline;
}

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

  it("both E1-K firewalls BITE: a synthetic breach of each is reported", () => {
    // §33: the rules must be enforced, not merely present in JSON. Each probe adds the ONE forbidden
    // import to a clone of the live graph and expects exactly that breach to be reported.
    const contextBreach = clone();
    contextBreach.modules.find((module) => module.file === "src/context/knowledge.ts")!.imports.push("src/proof_asset/index.js");
    const contextFindings = firewallBreaches(contextBreach);
    expect(contextFindings.some((detail) => detail.includes("context-not-knowledge-owner-internals"))).toBe(true);

    const kernelBreach = clone();
    kernelBreach.modules.find((module) => module.file === "src/domain/aggregate.ts")!.imports.push("src/reasoning_cell/index.js");
    const kernelFindings = firewallBreaches(kernelBreach);
    expect(kernelFindings.some((detail) => detail.includes("kernel-not-knowledge-owners"))).toBe(true);

    // And the unmodified live graph reports neither.
    const clean = firewallBreaches(clone());
    expect(clean.some((detail) => detail.includes("context-not-knowledge-owner-internals"))).toBe(false);
    expect(clean.some((detail) => detail.includes("kernel-not-knowledge-owners"))).toBe(false);
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
 * The E0/E1 STAGE BOUNDARY. E0 closed the design; E1-K implements it. This block now asserts the
 * IMPLEMENTED boundary rather than the pre-implementation absence: the two modules exist, the
 * consumer-owned port wall holds, and no knowledge mutation path has appeared.
 */
describe("E0-E the E1-K implementation keeps the frozen boundary", () => {
  const architecture = analyseModuleArchitecture(REPO);

  it("the E1-K implementation modules exist", () => {
    const paths = architecture.modules.map((module) => module.file);
    expect(paths).toContain("src/context/knowledge.ts");
    expect(paths).toContain("src/composition/context_knowledge.ts");
  });

  it("the context knowledge module declares only reads, and only the union's own names", () => {
    // The context owner consumes admitted knowledge through declared READ ports. A method named like a
    // knowledge MUTATION (record/append/publish/admit/decide/reassess/invalidate) would make context a
    // second writer of an owner's truth, which is exactly what the E1-K port wall forbids.
    const source = stripComments(read("src/context/knowledge.ts"));
    for (const forbidden of [
      "recordEvidence",
      "prepareCandidate",
      "decidePublication",
      "reassess",
      "importSource",
      "submitCandidate",
      "evaluateCandidate",
      "requestInvalidation",
      "append(",
    ]) {
      expect(source.includes(forbidden), `context knowledge must not name ${forbidden}`).toBe(false);
    }
  });

  it("the knowledge ports expose no universal reference", () => {
    // §7.2: a `KnowledgeRef {kind,id}` / `UniversalCanonicalRef` envelope would let a writer attach any
    // standing to any asset. The union must stay domain-specific and discriminated. (The pins are
    // exact type names, not substrings — `KnowledgeRefusalReason` is a different, legitimate name.)
    const source = stripComments(read("src/context/knowledge.ts"));
    expect(source).not.toContain("UniversalCanonicalRef");
    expect(/\bKnowledgeRef\b/u.test(source)).toBe(false);
    expect(source).toContain("ProofKnowledgeBinding");
    expect(source).toContain("ReasoningKnowledgeBinding");
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
