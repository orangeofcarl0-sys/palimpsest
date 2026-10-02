/**
 * R2-M §24 — DETERMINISTIC HARNESS TESTS.
 *
 * These test the EXPERIMENT, not the product, and NO stochastic success threshold is encoded: nothing here
 * asserts that metadata will improve uptake, because that is the measurement rather than a precondition of
 * it.
 *
 * The load-bearing tests are the ones that would silently invalidate the stage if they regressed:
 *
 *   · the default production path is untouched, and an unrecognized mode cannot enable an arm;
 *   · M0 is BYTE-IDENTICAL to the production index, so the control is the real control;
 *   · the M1 projection is deterministic, bounded and truncating, and never reproduces the full body;
 *   · the Procedure ruling (P-A) holds: applicability + limitations only, no method-body preview;
 *   · the two provenances stay distinct — owner-declared Procedure metadata vs host-projected previews;
 *   · the isolation check flags a block whose invariants differ, or whose arms did NOT differ;
 *   · the verdict is computed from the frozen criteria and needs a real M1 pull, not just a rate.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { analyseDecisionRelevance, armSummary, blockOrder, CONDITIONS, DECISION_RELEVANCE_VERDICTS, EXPECTED_TRIALS, PROTOCOL_SEED, previewLeakage, trialPlan } from "../scripts/r2m/design.mjs";
import { isolationCheck, normalizeTrial } from "../scripts/r2m/analyse.mjs";
import { deriveCapital } from "../scripts/r2u/capital.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The host bundle's index seam: JavaScript outside the TS program, so loaded through a URL. */
const metadataPath = pathToFileURL(join(REPO_ROOT, "host", "dsh", "lib", "index-metadata.js")).href;
const {
  INDEX_METADATA_MODES,
  MATERIALIZATION_PROVENANCE,
  PREVIEW_BUDGET,
  PREVIEW_MECHANISM,
  PROCEDURE_RULING,
  SEMANTIC_PROVENANCE,
  TRUNCATION_MARKER,
  boundedText,
  deriveIndexEntry,
  manifestEntry,
  renderIndexMetadata,
  resolveIndexMetadataMode,
  textDigest,
} = (await import(metadataPath)) as {
  readonly INDEX_METADATA_MODES: Readonly<{ OFF: string; M0: string; M1: string }>;
  readonly MATERIALIZATION_PROVENANCE: string;
  readonly PREVIEW_BUDGET: Readonly<{ proof: number; reasoning: number; procedureApplicability: number; procedureLimitations: number }>;
  readonly PREVIEW_MECHANISM: string;
  readonly PROCEDURE_RULING: string;
  readonly SEMANTIC_PROVENANCE: Readonly<Record<string, string>>;
  readonly TRUNCATION_MARKER: string;
  readonly boundedText: (value: unknown, max: number) => { readonly text: string; readonly truncated: boolean; readonly contentCodePoints: number; readonly renderedCodePoints: number; readonly sourceDigest: string };
  readonly deriveIndexEntry: (selected: { handle: string; kind: string }, value: unknown) => any;
  readonly manifestEntry: (entry: any) => readonly any[];
  readonly renderIndexMetadata: (production: string, entries: readonly any[]) => string;
  readonly resolveIndexMetadataMode: (value: string | undefined) => string;
  readonly textDigest: (text: string) => string;
};

/** The real production index shape, so the M0 identity test runs against the actual layout. */
const PRODUCTION_INDEX = [
  "",
  "Project context available to this attempt (READ-ONLY; never authority):",
  "  [proof] @ctx/proof/pc-1",
  "  [reasoning] @ctx/reasoning/cell-d/cl-1",
  "  [procedure] @ctx/procedure/prc-1/0",
  "",
  "Use `palimpsest_worker_context_pull` with exactly one listed handle when the body would help.",
  "Do not invent handles: a handle that is not listed above will be refused.",
].join("\n");

/* ================================================================ §6 the default path */

describe("R2-M §6 — the experimental mode is absent by default", () => {
  it("the DEFAULT mode resolves to OFF, and only the two frozen tokens enable an arm", () => {
    expect(resolveIndexMetadataMode(undefined)).toBe(INDEX_METADATA_MODES.OFF);
    expect(resolveIndexMetadataMode("")).toBe(INDEX_METADATA_MODES.OFF);
    expect(resolveIndexMetadataMode("m0")).toBe(INDEX_METADATA_MODES.M0);
    expect(resolveIndexMetadataMode("m1")).toBe(INDEX_METADATA_MODES.M1);
  });

  it("an UNSET or unrecognized value cannot enable an arm", () => {
    for (const value of [undefined, "", "M1 ", "m1x", "M0x", "on", "true", "1", "explicit-review", "preview"]) {
      expect(resolveIndexMetadataMode(value)).toBe(INDEX_METADATA_MODES.OFF);
    }
  });

  it("the seam names no relevance, priority or salience scoring surface", () => {
    const source = readFileSync(join(REPO_ROOT, "host", "dsh", "lib", "index-metadata.js"), "utf8");
    // The module's own prohibition comment mentions the words; no exported identifier may.
    const exported = [...source.matchAll(/export (?:const|function) ([A-Za-z_$][\w$]*)/gu)].map((match) => match[1]);
    expect(exported.length).toBeGreaterThan(5);
    for (const name of exported) expect(name).not.toMatch(/relevance|priority|salience|score/iu);
  });
});

/* ================================================================ §6/§19 M0 is production */

describe("R2-M §6/§19 — M0 is byte-identical to the production index", () => {
  it("an empty entry list leaves the section UNCHANGED (the identity case)", () => {
    expect(renderIndexMetadata(PRODUCTION_INDEX, [])).toBe(PRODUCTION_INDEX);
  });

  it("the empty-case section (no selected capital) is left unchanged", () => {
    const empty = "Project context available to this attempt (READ-ONLY; never authority):\n  (no project context was selected for this attempt)";
    expect(renderIndexMetadata(empty, [])).toBe(empty);
  });

  it("M1 preserves the heading, the trailing instructions and the handle lines", () => {
    const entries = [
      deriveIndexEntry({ handle: "@ctx/proof/pc-1", kind: "proof" }, { body: { statement: "a fact" }, binding: { standing_at_compile: "SUPPORTED", freshness_at_compile: "fresh" } }),
    ];
    const rendered = renderIndexMetadata(PRODUCTION_INDEX, entries);
    expect(rendered).toContain("Project context available to this attempt (READ-ONLY; never authority):");
    expect(rendered).toContain("Do not invent handles: a handle that is not listed above will be refused.");
    expect(rendered).toContain("  [proof] @ctx/proof/pc-1");
    // Only the proof entry was supplied, so the other two production entries are replaced away.
    expect(rendered).not.toContain("@ctx/reasoning/");
  });
});

/* ================================================================ §12/§13 the projection */

describe("R2-M §12/§13 — the projection algorithm is frozen", () => {
  it("truncates at the budget and appends exactly ONE fixed marker", () => {
    const result = boundedText("x".repeat(400), 160);
    expect(result.truncated).toBe(true);
    expect([...result.text].length).toBe(161);
    expect(result.text.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(result.contentCodePoints).toBe(400);
  });

  it("is deterministic — the same input yields the same bytes and digest", () => {
    const first = boundedText("some owner content", 160);
    const second = boundedText("some owner content", 160);
    expect(first.text).toBe(second.text);
    expect(textDigest(first.text)).toBe(textDigest(second.text));
    expect(first.sourceDigest).toBe(second.sourceDigest);
  });

  it("normalizes CRLF and trims outer whitespace only", () => {
    expect(boundedText("  a\r\nb  ", 160).text).toBe("a\nb");
    expect(boundedText("  a\r\nb  ", 160).truncated).toBe(false);
  });

  it("does NOT mark a short field as truncated", () => {
    const result = boundedText("short", 160);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe("short");
  });

  it("keeps the frozen per-field budget", () => {
    expect(PREVIEW_BUDGET.proof).toBe(160);
    expect(PREVIEW_BUDGET.reasoning).toBe(160);
    expect(PREVIEW_BUDGET.procedureApplicability).toBe(120);
    expect(PREVIEW_BUDGET.procedureLimitations).toBe(120);
  });

  it("the mechanism label marks the seam experimental, not product semantics", () => {
    expect(PREVIEW_MECHANISM).toBe("EXPERIMENTAL_HOST_DERIVED_PREVIEW");
  });
});

/* ================================================================ §8 provenance by kind */

describe("R2-M §8 — the two provenances stay distinct", () => {
  it("Procedure metadata is OWNER_DECLARED; Proof and Reasoning previews are HOST_PROJECTED", () => {
    expect(SEMANTIC_PROVENANCE.PROCEDURE).toBe("OWNER_DECLARED");
    expect(SEMANTIC_PROVENANCE.PROOF).toBe("HOST_PROJECTED_FROM_OWNER_CONTENT");
    expect(SEMANTIC_PROVENANCE.REASONING).toBe("HOST_PROJECTED_FROM_OWNER_CONTENT");
  });

  it("every rendered field is materialized by a GOVERNED_BODY_FETCH", () => {
    expect(MATERIALIZATION_PROVENANCE).toBe("GOVERNED_BODY_FETCH");
    const proof = deriveIndexEntry({ handle: "@ctx/proof/x", kind: "proof" }, { body: { statement: "s" }, binding: {} });
    const procedure = deriveIndexEntry({ handle: "@ctx/procedure/p/0", kind: "procedure" }, { body: { applicability: ["a"], limitations: ["l"] }, binding: {} });
    for (const field of [...proof.fields, ...procedure.fields]) {
      expect(field.materializationProvenance).toBe(MATERIALIZATION_PROVENANCE);
    }
    expect(proof.fields[0].semanticProvenance).toBe(SEMANTIC_PROVENANCE.PROOF);
    expect(procedure.fields[0].semanticProvenance).toBe(SEMANTIC_PROVENANCE.PROCEDURE);
  });

  it("§11 the Procedure ruling is P-A: applicability + limitations only, no method-body preview", () => {
    expect(PROCEDURE_RULING).toBe("P-A");
    const procedure = deriveIndexEntry({ handle: "@ctx/procedure/p/0", kind: "procedure" }, { body: { applicability: ["a"], limitations: ["l"], steps: [{ instruction: "SECRET METHOD STEP" }], title: "t" }, binding: {} });
    const names = procedure.fields.map((field: any) => field.name);
    expect(names).toEqual(["Applicability", "Limitations"]);
    expect(JSON.stringify(procedure)).not.toContain("SECRET METHOD STEP");
  });
});

/* ================================================================ §14 no full body rendered */

describe("R2-M §14 — a preview never reproduces the complete capital body", () => {
  const capital = deriveCapital();

  it("the real Scenario C and D statements are longer than the budget, so they really truncate", () => {
    for (const id of ["C", "D"] as const) {
      expect([...capital[id].proof.statement].length).toBeGreaterThan(PREVIEW_BUDGET.proof);
      expect([...capital[id].reasoning.statement].length).toBeGreaterThan(PREVIEW_BUDGET.reasoning);
    }
  });

  it("the rendered M1 index does not contain either complete capital statement", () => {
    for (const id of ["C", "D"] as const) {
      const entry = capital[id];
      const entries = [
        deriveIndexEntry({ handle: "@ctx/proof/pc-1", kind: "proof" }, { body: { statement: entry.proof.statement }, binding: { standing_at_compile: "SUPPORTED", freshness_at_compile: "fresh" } }),
        deriveIndexEntry({ handle: "@ctx/reasoning/cell-1/cl-1", kind: "reasoning" }, { body: { statement: entry.reasoning.statement }, binding: { active_at_compile: true } }),
      ];
      const rendered = renderIndexMetadata(PRODUCTION_INDEX, entries);
      expect(rendered).not.toContain(entry.proof.statement);
      expect(rendered).not.toContain(entry.reasoning.statement);
      expect(previewLeakage({ previewText: rendered, sourceField: entry.proof.statement, forbidden: [] }).leaked).toBe(false);
    }
  });

  it("the leakage check DOES fire when a preview reproduces its source field", () => {
    const source = "a complete owner field that is long enough to matter";
    expect(previewLeakage({ previewText: source, sourceField: source, forbidden: [] }).leaked).toBe(true);
    expect(previewLeakage({ previewText: source.slice(0, 10), sourceField: source, forbidden: [] }).leaked).toBe(false);
  });
});

/* ================================================================ §14 the preview manifest */

describe("R2-M §14 — the preview manifest proves boundedness without carrying the body", () => {
  it("records handle, kind, both provenances, digests, lengths and truncation", () => {
    const entry = deriveIndexEntry({ handle: "@ctx/proof/pc-1", kind: "proof" }, { body: { statement: "x".repeat(400) }, binding: { standing_at_compile: "SUPPORTED", freshness_at_compile: "fresh" } });
    const manifest = manifestEntry(entry);
    expect(manifest.length).toBe(1);
    const row = manifest[0];
    expect(row.handle).toBe("@ctx/proof/pc-1");
    expect(row.kind).toBe("proof");
    expect(row.semanticProvenance).toBe(SEMANTIC_PROVENANCE.PROOF);
    expect(row.materializationProvenance).toBe(MATERIALIZATION_PROVENANCE);
    expect(row.truncated).toBe(true);
    expect(row.renderedCodePoints).toBe(161);
    expect(row.sourceDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(row.renderedPreviewDigest).toMatch(/^[0-9a-f]{64}$/u);
    // The manifest carries no body text: only digests and lengths.
    expect(JSON.stringify(row)).not.toContain("x".repeat(50));
  });
});

/* ================================================================ §21 the frozen schedule */

describe("R2-M §21 — the schedule is frozen before any trial", () => {
  it("is exactly 2 scenarios × 2 conditions × 5 repetitions = 20", () => {
    expect(trialPlan().length).toBe(EXPECTED_TRIALS);
    expect(EXPECTED_TRIALS).toBe(20);
  });

  it("every randomized block contains exactly M0 and M1", () => {
    for (const scenarioId of ["C", "D"]) {
      for (const block of blockOrder(5, scenarioId)) {
        expect([...block.order].sort().join(",")).toBe([...CONDITIONS].sort().join(","));
      }
    }
  });

  it("the order derives from ONE frozen seed and is not the same permutation every block", () => {
    expect(PROTOCOL_SEED).toBe(0x52_4d_03_01);
    expect(new Set(blockOrder(5, "C").map((block) => block.order.join(","))).size).toBeGreaterThan(1);
  });

  it("interleaves the arms rather than grouping them", () => {
    const plan = trialPlan();
    const firstCondition = plan[0]!.condition;
    expect(plan.slice(0, 4).some((trial) => trial.condition !== firstCondition)).toBe(true);
  });
});

/* ================================================================ §26 the verdict */

describe("R2-M §26 — the verdict is computed from the frozen criteria", () => {
  const arm = (pulledTrials: number, analysed = 5) => ({ ...armSummary([]), analysed, pulledTrials, pullRate: analysed === 0 ? 0 : pulledTrials / analysed, treatmentNotApplied: 0 });

  it("REPLICATED requires BOTH scenarios to improve AND a real M1 pull in each", () => {
    const verdict = analyseDecisionRelevance({
      C: { m0: arm(1), m1: arm(3) },
      D: { m0: arm(0), m1: arm(2) },
    });
    expect(verdict.verdict).toBe(DECISION_RELEVANCE_VERDICTS.REPLICATED);
  });

  it("does NOT replicate when an arm improves but never actually pulls", () => {
    const verdict = analyseDecisionRelevance({
      C: { m0: arm(0), m1: arm(0) },
      D: { m0: arm(0), m1: arm(0) },
    });
    expect(verdict.verdict).toBe(DECISION_RELEVANCE_VERDICTS.NOT_IMPROVED);
  });

  it("PARTIAL when exactly one scenario improves", () => {
    const verdict = analyseDecisionRelevance({
      C: { m0: arm(0), m1: arm(2) },
      D: { m0: arm(2), m1: arm(0) },
    });
    expect(verdict.verdict).toBe(DECISION_RELEVANCE_VERDICTS.PARTIAL);
  });

  it("NOT_IMPROVED when neither scenario increases voluntary uptake", () => {
    const verdict = analyseDecisionRelevance({
      C: { m0: arm(2), m1: arm(1) },
      D: { m0: arm(1), m1: arm(1) },
    });
    expect(verdict.verdict).toBe(DECISION_RELEVANCE_VERDICTS.NOT_IMPROVED);
  });

  it("does not treat a rate increase as replication when the treatment was not applied", () => {
    const verdict = analyseDecisionRelevance({
      C: { m0: arm(0), m1: { ...arm(3), treatmentNotApplied: 1 } },
      D: { m0: arm(0), m1: { ...arm(3), treatmentNotApplied: 1 } },
    });
    expect(verdict.verdict).not.toBe(DECISION_RELEVANCE_VERDICTS.REPLICATED);
  });
});

/* ================================================================ §19 the isolation check */

describe("R2-M §19 — the isolation check protects the treatment", () => {
  /** The prompt component digests, as a named object so an override replaces the whole block cleanly. */
  const promptFor = (condition: string, overrides: Record<string, unknown> = {}) => ({
    ordinaryTaskDigest: "T",
    indexPresentationDigest: condition === "M0" ? "P" : "I",
    productionIndexDigest: "P",
    toolCatalogDigest: "C",
    pullToolDescriptionDigest: "D",
    capabilitySetDigest: "S",
    handlesInPayload: ["proof:@ctx/proof/x"],
    indexHandleCount: 1,
    ...overrides,
  });

  const base = (condition: string, overrides: Record<string, unknown> = {}) => normalizeTrial({
    trialId: `C-${condition}-b0r0`,
    scenario: "C_REPLAY_SAFE_REDUCER",
    condition,
    block: 0,
    repetition: 0,
    worker: { pulledHandles: [], pulledKinds: [] },
    prompt: promptFor(condition),
    pairedState: {},
    pullAccounting: { derivationPullOffset: 0, consistent: true },
    treatmentApplied: condition === "M1",
    ...overrides,
  });

  it("a clean pair is not confounded", () => {
    const blocks = isolationCheck([base("M0"), base("M1")]);
    expect(blocks[0]!.confounded).toBe(false);
  });

  it("flags a pair whose ARMS DID NOT DIFFER", () => {
    const blocks = isolationCheck([base("M0"), base("M1", { prompt: promptFor("M1", { indexPresentationDigest: "P" }) })]);
    expect(blocks[0]!.confounded).toBe(true);
    expect(blocks[0]!.differences.join(" ")).toMatch(/identical across conditions/u);
  });

  it("flags a pair whose ordinary task text differs (the treatment must not touch it)", () => {
    const blocks = isolationCheck([base("M0"), base("M1", { prompt: promptFor("M1", { ordinaryTaskDigest: "OTHER" }) })]);
    expect(blocks[0]!.confounded).toBe(true);
    expect(blocks[0]!.differences.join(" ")).toMatch(/ordinary task text/u);
  });

  it("flags a pair whose tool catalog or pull-tool description differs", () => {
    expect(isolationCheck([base("M0"), base("M1", { prompt: promptFor("M1", { toolCatalogDigest: "OTHER" }) })])[0]!.confounded).toBe(true);
    expect(isolationCheck([base("M0"), base("M1", { prompt: promptFor("M1", { pullToolDescriptionDigest: "OTHER" }) })])[0]!.confounded).toBe(true);
  });

  it("flags a pair whose M0 index is not byte-identical to production", () => {
    const blocks = isolationCheck([base("M0", { prompt: promptFor("M0", { indexPresentationDigest: "X" }) }), base("M1")]);
    expect(blocks[0]!.confounded).toBe(true);
    expect(blocks[0]!.differences.join(" ")).toMatch(/not byte-identical/u);
  });

  it("flags a pair whose pull accounting is inconsistent", () => {
    const blocks = isolationCheck([base("M0"), base("M1", { pullAccounting: { derivationPullOffset: 3, consistent: false } })]);
    expect(blocks[0]!.confounded).toBe(true);
    expect(blocks[0]!.differences.join(" ")).toMatch(/pull accounting/u);
  });

  it("flags an M1 trial whose treatment was not applied", () => {
    const blocks = isolationCheck([base("M0"), base("M1", { treatmentApplied: false })]);
    expect(blocks[0]!.confounded).toBe(true);
    expect(blocks[0]!.differences.join(" ")).toMatch(/did not derive every selected handle/u);
  });
});

/* ================================================================ §22/§23 normalization */

describe("R2-M §22/§23 — normalization reads the pull facts and the per-kind outcomes", () => {
  it("derives the pulled kinds from the handle namespace, never from a body", () => {
    const trial = normalizeTrial({
      trialId: "C-M1-b0r0",
      scenario: "C_REPLAY_SAFE_REDUCER",
      condition: "M1",
      block: 0,
      repetition: 0,
      worker: { pulledHandles: ["@ctx/proof/pc-1", "@ctx/procedure/prc-1/0"], pulledKinds: ["proof", "procedure"] },
      prompt: {},
      pairedState: {},
    });
    expect(trial.pulledAny).toBe(true);
    expect(trial.pulledCount).toBe(2);
    expect(trial.proofPulled).toBe(true);
    expect(trial.procedurePulled).toBe(true);
    expect(trial.reasoningPulled).toBe(false);
  });

  it("records a trial with no pull as no pull, not as UNKNOWN", () => {
    const trial = normalizeTrial({ trialId: "D-M0-b0r0", scenario: "D_INCREMENTAL_CACHE_INVALIDATION", condition: "M0", block: 0, repetition: 0, worker: { pulledHandles: [] }, prompt: {}, pairedState: {} });
    expect(trial.pulledAny).toBe(false);
    expect(trial.pulledCount).toBe(0);
  });

  it("keeps task outcomes SECONDARY: they are recorded but the verdict never reads them", () => {
    const verdict = analyseDecisionRelevance({
      C: { m0: { ...armSummary([]), analysed: 5, pulledTrials: 0, pullRate: 0, treatmentNotApplied: 0 }, m1: { ...armSummary([]), analysed: 5, pulledTrials: 3, pullRate: 0.6, treatmentNotApplied: 0 } },
      D: { m0: { ...armSummary([]), analysed: 5, pulledTrials: 0, pullRate: 0, treatmentNotApplied: 0 }, m1: { ...armSummary([]), analysed: 5, pulledTrials: 1, pullRate: 0.2, treatmentNotApplied: 0 } },
    });
    expect(verdict.verdict).toBe(DECISION_RELEVANCE_VERDICTS.REPLICATED);
    // The verdict object carries no task-success field at all.
    expect(JSON.stringify(verdict)).not.toMatch(/solve|acceptance/iu);
  });
});
